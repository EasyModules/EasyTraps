import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { readdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { Collection, world } from './helpers/foundry.mjs';

let env = world();
const bootEnv = env;
await import('../scripts/main.mjs');
const { runtime } = await import('../scripts/core/runtime-state.mjs');
const initialRuntime = structuredClone(runtime);
const state = await import('../scripts/core/trap-state.mjs');
const { executeConfiguredTrap } = await import('../scripts/core/trap-runtime.mjs');
const { executeMattTrap } = await import('../scripts/triggers/tile-trigger.mjs');
const { activateTrapFromTriggerSource } = await import('../scripts/triggers/source-runtime.mjs');
const dnd = await import('../scripts/integrations/dnd5e.mjs');
const targets = await import('../scripts/integrations/targeting.mjs');
const { createTrapTriggerTile } = await import('../scripts/core/trap-documents.mjs');
const { createDoorTrapController } = await import('../scripts/triggers/door-trigger.mjs');
const lifecycle = await import('../scripts/core/trap-lifecycle.mjs');
const { collectCustomZoneTargetIds } = await import('../scripts/core/target-selection.mjs');
const authority = await import('../scripts/core/authority.mjs');
const contract = JSON.parse(await readFile(new URL('./fixtures/stage1-contract.json', import.meta.url)));
const sha = text => createHash('sha256').update(text).digest('hex');
const scripts = new URL('../scripts/', import.meta.url);
const files = (await readdir(scripts, { recursive: true })).filter(file => file.endsWith('.mjs')).map(file => file.replaceAll('\\', '/'));
beforeEach(() => { env = world(); Object.assign(runtime, structuredClone(initialRuntime)); });

test('all 409 extracted function bodies match the original release exactly', async () => {
  const entries = [];
  for (const file of files.filter(file => file.includes('/') && file !== 'core/presentation.mjs')) {
    const namespace = await import(new URL(file, scripts));
    for (const [name, value] of Object.entries(namespace)) if (typeof value === 'function') entries.push([name, value.toString().replaceAll('\r\n', '\n')]);
  }
  entries.sort(([a], [b]) => a.localeCompare(b));
  assert.equal(entries.length, contract.functionCount);
  assert.equal(new Set(entries.map(([name]) => name)).size, entries.length, 'no duplicated implementations');
  assert.equal(sha(JSON.stringify(entries)), contract.functionsSha256);
});

test('hooks and constant/runtime declarations retain their original source', async () => {
  const { registerHooks } = await import('../scripts/bootstrap.mjs');
  const body = registerHooks.toString().replaceAll('\r\n', '\n').replace(/^function registerHooks\(\) \{\n/, '').replace(/\n\}$/, '').trim();
  assert.equal(sha(body), contract.hooksSha256);
  for (const file of ['core/constants.mjs', 'core/runtime-state.mjs']) {
    const text = (await readFile(new URL(file, scripts), 'utf8')).replaceAll('\r\n', '\n');
    for (const part of text.split(/^export /m).slice(1)) {
      const name = part.match(/^const (\w+)/)[1];
      assert.equal(sha(part.trim()), contract.declarations[name], name);
    }
  }
});

test('every module links; imports are acyclic and core never imports UI', async () => {
  const graph = new Map();
  for (const file of files) {
    const url = new URL(file, scripts);
    await import(url);
    const source = await readFile(url, 'utf8');
    const imports = [...source.matchAll(/^import\s+[\s\S]*?\sfrom\s+['"]([^'"]+)['"]/gm)].map(match => new URL(match[1], url));
    if (file.startsWith('core/')) assert.ok(imports.every(url => !url.pathname.includes('/ui/')), file);
    graph.set(url.href, imports.map(url => url.href));
  }
  const active = new Set(), done = new Set();
  function visit(id) {
    assert.ok(!active.has(id), `Circular import: ${id}`);
    if (done.has(id)) return;
    active.add(id);
    for (const dependency of graph.get(id) ?? []) visit(dependency);
    active.delete(id); done.add(id);
  }
  for (const id of graph.keys()) visit(id);
});

test('entry preserves settings/API and avoids duplicate hook/socket subscriptions', async () => {
  assert.deepEqual([...bootEnv.once.keys()], ['init', 'ready']);
  bootEnv.once.get('init')();
  assert.deepEqual([...env.settings.keys()], ['spellCompendiums', 'favoriteSpells', 'lastSpellSaveDc', 'lastSpellAttackBonus', 'defaultPauseOnTrigger', 'defaultDisarmAfterTrigger', 'triggerTexture', 'originTexture', 'discoveryDefaults']);
  assert.equal(game.easyTraps, game.modules.get('easy-traps').api);
  assert.equal(game.easyTraps.openWizard, game.easyTraps.openSpellWizard);
  assert.equal(game.easyTraps.version, '1.0.0');
  for (const name of ['setupTileActions', 'dnd5e.preUseActivity', 'canvasTearDown']) assert.equal(env.listeners.get(name).length, 1);
  for (const callbacks of env.listeners.values()) assert.equal(new Set(callbacks).size, callbacks.length);
  const { setupDisarmSocket } = await import('../scripts/core/disarm-runtime.mjs');
  let installs = 0; game.socket.on = () => installs++;
  setupDisarmSocket(); setupDisarmSocket();
  assert.equal(installs, 1);
});

test('Tile, Door and Item Pile controllers preserve flags, visibility and MATT arming', async () => {
  for (const triggerType of ['tile', 'door', 'item-pile']) {
    const tile = await createTrapTriggerTile({ name: 'Alarm' }, { x: 150, y: 150 }, { trapType: 'alarm', triggerType });
    assert.equal(tile.flags['easy-traps'].armed, false);
    assert.equal(tile.flags['easy-traps'].kind, 'alarm-grid');
    assert.equal(tile.hidden, true);
    assert.equal(tile.flags['monks-active-tiles'].active, false);
    await state.setTrapEnabled(tile, true);
    assert.equal(tile.flags['monks-active-tiles'].active, triggerType === 'tile');
    await state.setTrapDiscovered(tile, true);
    assert.equal(tile.hidden, triggerType !== 'tile');
  }
});

test('Door creation links the source and controller; missing sources prevent rearm', async () => {
  const tile = await createDoorTrapController({ name: 'Door alarm' }, { x: 100, y: 100 }, { x: 200, y: 100 }, { trapType: 'alarm' });
  const trap = tile.flags['easy-traps'];
  assert.equal(trap.triggerType, 'door');
  assert.ok(env.scene.walls.has(trap.triggerSourceId));
  assert.equal(state.trapCanArm(tile), true);
  env.scene.walls.delete(trap.triggerSourceId);
  assert.match(state.trapArmBlockReason(tile), /missing/);
});

test('rearming clears disarm history only when requested', async () => {
  const tile = env.trap({ disarmAttempts: { actor: 1 } });
  await state.setTrapEnabled(tile, true, { resetDisarmAttempts: false });
  assert.deepEqual(tile.flags['easy-traps'].disarmAttempts, { actor: 1 });
  await state.setTrapEnabled(tile, true);
  assert.equal(tile.flags['easy-traps'].disarmAttempts, undefined);
});

test('single-use alarm dispatches through MATT and remains disarmed', async () => {
  const tile = env.trap(); let completed;
  const result = await executeMattTrap(tile, [], { onComplete: value => { completed = value; } });
  assert.equal(result.continue, true);
  assert.equal(result.workflow, 'alarm');
  assert.equal(completed, result);
  assert.equal(tile.flags['easy-traps'].armed, false);
  assert.equal(env.trace.sounds.length, 1);
  assert.equal(runtime.triggering.size, 0);
  assert.equal((await executeMattTrap(tile, [])).reason, 'disarmed');
});

test('repeatable alarm rearms, preserves history and blocks cooldown reentry', async () => {
  const tile = env.trap({ disarmAfterTrigger: false, disarmAttempts: { actor: 1 }, alarm: { chat: { mode: 'off' }, cooldownSeconds: 30 } });
  await executeConfiguredTrap(tile, []);
  assert.equal(tile.flags['easy-traps'].armed, true);
  assert.deepEqual(tile.flags['easy-traps'].disarmAttempts, { actor: 1 });
  assert.equal((await executeConfiguredTrap(tile, [])).reason, 'cooldown');
  assert.equal(env.trace.sounds.length, 1);
});

test('overlapping MATT callbacks are rejected until the first operation completes', async () => {
  const tile = env.trap(); const update = tile.update.bind(tile); let release;
  tile.update = async (...args) => { await new Promise(resolve => { release = resolve; }); return update(...args); };
  const first = executeMattTrap(tile, []);
  assert.equal((await executeMattTrap(tile, [])).reason, 'already-running');
  release(); await first;
  assert.equal(runtime.triggering.size, 0);
});

test('execution failure releases the MATT lock and permits retry', async () => {
  const tile = env.trap(); const update = tile.update.bind(tile);
  tile.update = async () => { throw Error('document failure'); };
  await assert.rejects(executeMattTrap(tile, []), /document failure/);
  assert.equal(runtime.triggering.size, 0);
  tile.update = update;
  assert.equal((await executeMattTrap(tile, [])).continue, true);
});

test('audio failure does not roll back a successful single-use activation', async () => {
  const tile = env.trap(); canvas.sounds.emitAtPosition = () => { throw Error('audio unavailable'); };
  const result = await executeConfiguredTrap(tile, []);
  assert.equal(result.continue, true);
  assert.equal(result.soundDispatched, false);
  assert.equal(tile.flags['easy-traps'].armed, false);
});

test('external-source alarm uses the shared payload and releases its lock', async () => {
  const tile = env.trap({ triggerType: 'door' });
  await activateTrapFromTriggerSource(tile, { triggerType: 'door' });
  assert.equal(env.trace.sounds.length, 1);
  assert.equal(tile.flags['easy-traps'].armed, false);
  assert.equal(runtime.triggering.size, 0);
});

test('native single-Activity spell preserves upcast and disabled resource consumption', async () => {
  let used;
  const activity = { id: 'cast', type: 'save', use: async () => {} };
  const spell = { name: 'Fireball', system: { level: 3, activities: [activity] }, use: async (...args) => { used = args; return 'used'; } };
  assert.equal(await dnd.useOriginalSpellItem(spell, { activityId: 'cast', castLevel: 5 }), 'used');
  assert.equal(used[0].consume, false);
  assert.equal(used[0].scaling, 2);
  assert.equal(used[0].spell.slot, 'spell5');
});

test('multi-Activity spell invokes the saved Activity without reopening chooser', async () => {
  let used = false;
  const activity = { id: 'cast', type: 'save', use: async () => { used = true; return 'used'; } };
  const spell = { name: 'Spell', system: { level: 1, activities: [activity, { id: 'other', type: 'attack', use: async () => {} }] }, use: () => { throw Error('chooser reopened'); } };
  assert.equal(await dnd.useOriginalSpellItem(spell, { activityId: 'cast' }), 'used');
  assert.equal(used, true);
});

test('targeting preserves successful targets but restores cancelled and failed casts', async () => {
  env.token('old'); env.token('new');
  await game.user.updateTokenTargets(['old']);
  await targets.withNativeSpellTargets(['new'], async () => null, { preserveOnSuccess: true });
  assert.deepEqual(targets.currentTargetIds(), ['old']);
  await assert.rejects(targets.withNativeSpellTargets(['new'], async () => { throw Error('cancel'); }), /cancel/);
  assert.deepEqual(targets.currentTargetIds(), ['old']);
  await targets.withNativeSpellTargets(['new'], async () => true, { preserveOnSuccess: true });
  assert.deepEqual(targets.currentTargetIds(), ['new']);
});

test('custom-zone targeting excludes touching neighbors and technical origins', () => {
  env.token('inside', 0); env.token('border', 100);
  env.token('runtime', 0, { flags: { 'easy-traps': { runtimeOrigin: { triggerTileId: 'trap' } } } });
  assert.deepEqual(collectCustomZoneTargetIds({ x: 0, y: 0, width: 100, height: 100 }), ['inside']);
  assert.deepEqual(targets.filterRuntimeOriginTargetIds(['inside', 'inside', 'runtime']), ['inside']);
});

test('primary GM authority remains deterministic across multiple clients', () => {
  assert.equal(authority.isPrimaryGM(), true);
  game.users.set('a', { id: 'a', active: true, isGM: true });
  assert.equal(authority.isPrimaryGM(), false);
  game.user = game.users.get('a');
  assert.equal(authority.isPrimaryGM(), true);
  game.user.isGM = false;
  assert.equal(authority.isPrimaryGM(), false);
});

test('orphan cleanup retains live trap origins and ordinary tokens', async () => {
  const tile = env.trap();
  env.token('live', 0, { flags: { 'easy-traps': { runtimeOrigin: { triggerTileUuid: tile.uuid } } } });
  env.token('orphan', 0, { flags: { 'easy-traps': { runtimeOrigin: { triggerTileUuid: 'missing' } } } });
  env.token('ordinary');
  await lifecycle.cleanupOrphanedRuntimeDocuments();
  assert.equal(env.scene.tokens.has('orphan'), false);
  assert.equal(env.scene.tokens.has('live'), true);
  assert.equal(env.scene.tokens.has('ordinary'), true);
});

test('canvas teardown cancels placement and clears scene-scoped state', () => {
  bootEnv.once.get('init')();
  let cancelled = false; runtime.cancelPlacement = () => { cancelled = true; };
  runtime.alarmCooldownUntil.set('trap', Date.now()); runtime.sourceLinkRepairs.add('trap');
  env.listeners.get('canvasTearDown')[0]();
  assert.equal(cancelled, true);
  assert.equal(runtime.alarmCooldownUntil.size, 0);
  assert.equal(runtime.sourceLinkRepairs.size, 0);
});

function nativeSpellFixture(result = 'cast') {
  const data = { _id: 'source', name: 'Test spell', type: 'spell', system: {
    level: 1, method: 'innate', activities: { cast: { _id: 'cast', type: 'save', save: { dc: { calculation: 'spellcasting' } } } }
  } };
  function item(source) {
    const value = structuredClone(source);
    const activities = Object.values(value.system.activities).map(entry => ({ ...entry, id: entry._id, use: async () => result }));
    return { ...value, system: { ...value.system, activities }, uuid: 'Item.source',
      toObject: () => structuredClone(source), getFlag: (module, key) => source.flags?.[module]?.[key],
      use: async (...args) => { env.trace.events.push(['item.use', args]); return result; }
    };
  }
  const source = item(data), token = env.token('caster');
  token.actor.items = new Collection();
  token.actor.createEmbeddedDocuments = async (type, entries) => {
    assert.equal(type, 'Item');
    return entries.map(entry => { const copy = item(entry); token.actor.items.set('copy', copy); return copy; });
  };
  globalThis.fromUuid = async uuid => uuid === source.uuid ? source : null;
  const tile = env.trap({ kind: 'spell-grid', spellUuid: source.uuid, activityId: 'cast',
    originMode: 'triggering-token', targetMode: 'triggering-token', spellSaveDc: 17, castLevel: 3 });
  return { source, token, tile, data };
}

test('spell payload creates a stable runtime copy and delegates native use without mutating source', async () => {
  const { source, token, tile, data } = nativeSpellFixture();
  const before = source.toObject();
  const result = await executeMattTrap(tile, [token]);
  assert.equal(result.continue, true);
  assert.equal(tile.flags['easy-traps'].armed, false);
  assert.deepEqual(source.toObject(), before);
  assert.equal(data.system.method, 'innate');
  const copy = token.actor.items.get('copy');
  assert.equal(copy.system.method, 'spell');
  assert.equal(copy.system.activities[0].save.dc.formula, '17');
  assert.equal(copy.system.activities[0].consumption.spellSlot, false);
  assert.equal(copy.flags['easy-traps'].runtimeSpell.triggerTileUuid, tile.uuid);
  assert.equal(env.trace.events.filter(([event]) => event === 'item.use').length, 1);
  assert.deepEqual(targets.currentTargetIds(), [token.id]);
});

test('cancelled native spell rearms and restores previous targets', async () => {
  const { token, tile } = nativeSpellFixture(null);
  env.token('old'); await game.user.updateTokenTargets(['old']);
  await assert.rejects(executeMattTrap(tile, [token]), /cancelled/);
  assert.equal(tile.flags['easy-traps'].armed, true);
  assert.equal(runtime.triggering.size, 0);
  assert.deepEqual(targets.currentTargetIds(), ['old']);
});

test('source revision changes reject a spell before creating runtime documents', async () => {
  const { source, token, tile } = nativeSpellFixture();
  source._stats = { modifiedTime: 20 }; tile.flags['easy-traps'].sourceModifiedTime = 10;
  await assert.rejects(executeMattTrap(tile, [token]), /changed after/);
  assert.equal(token.actor.items.size, 0);
  assert.equal(tile.flags['easy-traps'].armed, true);
});

test('passive discovery respects LOS, reveals once, pauses and releases discovery locks', async () => {
  const { evaluateMovedTokenDiscovery } = await import('../scripts/core/trap-discovery.mjs');
  const tile = env.trap({ discovery: { enabled: true } }), token = env.token('observer', 100);
  token.actor.hasPlayerOwner = true; token.actor.system = { skills: { prc: { passive: 18 } } };
  foundry.canvas = { geometry: { ClockwiseSweepPolygon: { testCollision: () => true } } };
  assert.equal((await evaluateMovedTokenDiscovery(token)).length, 0);
  foundry.canvas.geometry.ClockwiseSweepPolygon.testCollision = () => false;
  assert.equal((await evaluateMovedTokenDiscovery(token)).length, 1);
  assert.equal(tile.hidden, false);
  assert.equal(tile.flags['easy-traps'].discovered, true);
  assert.equal(game.paused, true);
  assert.equal(runtime.discovering.size, 0);
  assert.equal((await evaluateMovedTokenDiscovery(token)).length, 0);
});

async function disarmFixture(disarm = {}) {
  const api = await import('../scripts/core/disarm-runtime.mjs');
  const tile = env.trap({ discovered: true, discovery: { enabled: true, disarm } });
  tile.hidden = false;
  const token = env.token('rogue', 100);
  token.actor.testUserPermission = () => true;
  game.users.set('player', { id: 'player', isGM: false, active: true });
  const message = { requestId: 'request', userId: 'player', sceneId: env.scene.id,
    tileId: tile.id, tokenId: token.id, actorId: token.actor.id, skill: 'slt' };
  return { api, tile, token, message };
}

test('GM disarm validates ownership and range before accepting a player request', async () => {
  const { api, token, message } = await disarmFixture();
  assert.equal(api.gmDisarmContext(message).ok, true, api.gmDisarmContext(message).error);
  token.actor.testUserPermission = () => false;
  assert.match(api.gmDisarmContext(message).error, /own/);
  token.actor.testUserPermission = () => true; token.x = 1500;
  assert.equal(api.gmDisarmContext(message).reason, 'out-of-range');
});

test('successful disarm persists history, disables the trap and releases reservation', async () => {
  const { api, tile, message } = await disarmFixture();
  const lock = api.acquireGmDisarmInteractionLock(message);
  try {
    assert.equal(api.acquireGmDisarmInteractionLock(message).ok, false);
    await api.resolveGmDisarmRequest({ ...message, lockId: lock.lockId, total: 20, naturalD20: 15 });
    assert.equal(tile.flags['easy-traps'].armed, false);
    assert.ok(tile.flags['easy-traps'].disarmAttempts);
    assert.equal(runtime.disarmInteractionLocks.size, 0);
    assert.equal(runtime.disarmGmLocks.size, 0);
  } finally { api.releaseGmDisarmInteractionLock({ ...message, lockId: lock.lockId }); }
});

test('dangerous disarm failure activates the alarm and keeps the one-attempt record', async () => {
  const { api, tile, message } = await disarmFixture({ dangerousFailure: true, dangerousThreshold: 5 });
  const lock = api.acquireGmDisarmInteractionLock(message);
  try {
    await api.resolveGmDisarmRequest({ ...message, lockId: lock.lockId, total: 5, naturalD20: 5 });
    assert.equal(env.trace.sounds.length, 1);
    assert.equal(tile.flags['easy-traps'].armed, false);
    assert.ok(tile.flags['easy-traps'].disarmAttempts);
    assert.equal(runtime.disarmInteractionLocks.size, 0);
  } finally { api.releaseGmDisarmInteractionLock({ ...message, lockId: lock.lockId }); }
});

test('Item Pile creation uses the optional API and deletion falls back to native documents', async () => {
  const { createItemPileTrapController } = await import('../scripts/triggers/item-pile-trigger.mjs');
  const { deleteItemPileDocument } = await import('../scripts/integrations/item-piles.mjs');
  await assert.rejects(createItemPileTrapController({}, { x: 0, y: 0 }, {}), /must be active/);
  const pile = env.token('pile');
  game.modules.set('item-piles', { active: true });
  game.itempiles = { API: { createItemPile: async () => ({ tokenUuid: pile.uuid }) } };
  globalThis.fromUuid = async uuid => uuid === pile.uuid ? pile : null;
  const tile = await createItemPileTrapController({ name: 'Pile' }, { x: 0, y: 0 }, { trapType: 'alarm' });
  assert.equal(tile.flags['easy-traps'].triggerSourceUuid, pile.uuid);
  assert.equal(tile.flags['easy-traps'].triggerType, 'item-pile');
  assert.equal(await deleteItemPileDocument(pile), true);
  assert.equal(env.scene.tokens.has(pile.id), false);
});

test('presentation boundary forwards synchronously and rejects incomplete or repeated binding', async () => {
  const bridge = await import('../scripts/core/presentation.mjs?boundary-test');
  assert.throws(() => bridge.bindPresentation({}), /missing/);
  const order = [], handlers = {};
  for (const name of Object.keys(bridge).filter(name => name !== 'bindPresentation')) {
    handlers[name] = (...args) => { order.push([name, args]); return args[0]; };
  }
  bridge.bindPresentation(handlers);
  const marker = {};
  assert.equal(bridge.refreshTriggerOverlays(marker), marker);
  assert.deepEqual(order, [['refreshTriggerOverlays', [marker]]]);
  assert.throws(() => bridge.bindPresentation(handlers), /already bound/);
});

test('saved native template replay creates the saved geometry and cleans documents/hooks on failure', async () => {
  const { withSavedNativeTemplatePlacement } = await import('../scripts/integrations/dnd5e-templates.mjs');
  const tile = env.trap(), removedHooks = [];
  Hooks.off = (...args) => removedHooks.push(args);
  const activity = { id: 'cast', type: 'save', use: async () => {} };
  const spell = { uuid: 'Item.spell', system: { activities: [activity] } };
  activity.item = spell;
  const trap = { templates: [{ binding: 'origin-linked', offsetX: 20, offsetY: 30, data: { direction: 45 } }] };
  async function cast() {
    const data = { t: 'circle', distance: 10 };
    const preview = { document: { toObject: () => structuredClone(data), updateSource: changes => Object.assign(data, changes) } };
    env.listeners.get('dnd5e.createActivityTemplate').at(-1)(activity, [preview]);
    await preview.drawPreview();
    return 'cast';
  }
  const context = { spell, activityId: 'cast', trap, originPoint: { x: 100, y: 200 }, triggerTile: tile };
  const replay = await withSavedNativeTemplatePlacement(context, cast);
  assert.equal(replay.templates[0].x, 120);
  assert.equal(replay.templates[0].y, 230);
  assert.equal(replay.templates[0].direction, 45);
  assert.equal(removedHooks.length, 1);
  await assert.rejects(withSavedNativeTemplatePlacement(context, async () => { await cast(); throw Error('cancelled'); }), /cancelled/);
  assert.equal(env.scene.templates.size, 1, 'failed replay removes only its own template');
  assert.equal(removedHooks.length, 2);
});
