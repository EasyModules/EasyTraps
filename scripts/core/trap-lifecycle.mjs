import { ALARM_AUDIBILITY_MODES, normalizeAlarmConfig } from "../alarm.mjs";
import { isPrimaryGM } from "./authority.mjs";
import { tileCenterPoint } from "./canvas-geometry.mjs";
import {
  DEFAULT_TRIGGER_TEXTURE,
  INSTANT_TEMPLATE_CLEANUP_MS,
  INTERNAL_CASTER_CR,
  INTERNAL_CASTER_INTELLIGENCE,
  INTERNAL_CASTER_NAME,
  INTERNAL_CASTER_SCHEMA,
  INTERNAL_CASTER_SPELLCASTING_ABILITY,
  MODULE_ID,
  ORIGIN_MODES,
  RUNTIME_ORIGIN_NAME,
  RUNTIME_ORIGIN_VFX_SWEEP_DELAYS_MS,
  TRANSPARENT_TOKEN_TEXTURE,
  VERSION
} from "./constants.mjs";
import { refreshTriggerOverlays } from "./presentation.mjs";
import { makeRuntimeOriginNonInteractive } from "./runtime-tokens.mjs";
import {
  isAlarmTrap,
  normalizeOriginMode,
  originData,
  resolveOriginTile,
  runtimeOriginFlag,
  runtimeSpellFlag,
  trapData
} from "./trap-model.mjs";
import { deleteTriggerSourceForController } from "./trigger-links.mjs";
import { sceneGridPixelDimensions } from "../document-geometry.mjs";
import { deleteMeasuredTemplates } from "../integrations/dnd5e-templates.mjs";
import { cleanupPersistentRuntimeOriginVisuals } from "../integrations/sequencer.mjs";
import { isExternalTriggerType } from "../trigger-sources.mjs";

export async function collapseNonSpatialAlarmOrigin(tile, trap = trapData(tile), config = normalizeAlarmConfig(trap?.alarm)) {
  if (!tile || !trap || !isAlarmTrap(trap)) return false;
  if (config.audibility.mode === ALARM_AUDIBILITY_MODES.SPATIAL) return false;
  if (normalizeOriginMode(trap.originMode) !== ORIGIN_MODES.SEPARATE_TILE) return false;

  const scene = tile.parent ?? canvas.scene;
  const origin = resolveOriginTile(tile, trap, ORIGIN_MODES.SEPARATE_TILE);
  if (origin && scene?.tiles?.has?.(origin.id)) {
    try {
      await scene.deleteEmbeddedDocuments("Tile", [origin.id], {
        easyTrapsInternal: true,
        easyTrapsDetachOrigin: true
      });
    } catch (error) {
      console.warn(`${MODULE_ID} | Could not remove obsolete non-spatial Alarm origin`, error);
    }
  }

  await tile.update({
    [`flags.${MODULE_ID}.originMode`]: ORIGIN_MODES.TRIGGER_TILE,
    [`flags.${MODULE_ID}.originTileId`]: null,
    [`flags.${MODULE_ID}.originTileUuid`]: null
  }, { easyTrapsInternal: true });
  return true;
}

export async function cleanupNonSpatialAlarmOrigins(scene = canvas.scene) {
  if (!scene) return;
  for (const tile of scene.tiles ?? []) {
    const trap = trapData(tile);
    if (!isAlarmTrap(trap)) continue;
    const config = normalizeAlarmConfig(trap.alarm);
    if (config.audibility.mode === ALARM_AUDIBILITY_MODES.SPATIAL) continue;
    if (normalizeOriginMode(trap.originMode) !== ORIGIN_MODES.SEPARATE_TILE) continue;
    await collapseNonSpatialAlarmOrigin(tile, trap, config);
  }
}

export async function deleteCreatedTrapDocuments(triggerTile, originTile) {
  const scene = triggerTile?.parent ?? originTile?.parent ?? canvas.scene;
  const ids = [triggerTile?.id, originTile?.id].filter(Boolean);
  if (!scene || !ids.length) return;
  try {
    if (triggerTile) await deleteTriggerSourceForController(triggerTile);
    const existing = ids.filter(id => scene.tiles?.has?.(id));
    if (existing.length) await scene.deleteEmbeddedDocuments("Tile", existing, { easyTrapsInternal: true });
  } catch (error) {
    console.warn(`${MODULE_ID} | Could not clean up cancelled trap creation`, error);
  }
}

export function scheduleRuntimeOriginVisualCleanup(tokenDocument) {
  if (!tokenDocument || !runtimeOriginFlag(tokenDocument)) return;
  // Automated Animations / Sequencer may register a persistent effect either
  // immediately or shortly after the D&D5e activity resolves. Sweep quickly
  // first so an instantaneous trap does not leave a caster marker behind,
  // then repeat defensively for delayed module hooks.
  for (const delay of RUNTIME_ORIGIN_VFX_SWEEP_DELAYS_MS) {
    setTimeout(() => cleanupPersistentRuntimeOriginVisuals(tokenDocument), delay);
  }
}

export function scheduleMeasuredTemplateCleanup(documents) {
  const refs = [...(documents ?? [])];
  setTimeout(() => deleteMeasuredTemplates(refs), INSTANT_TEMPLATE_CLEANUP_MS);
}

export async function ensureInternalCaster() {
  let actor = game.actors.find(entry => entry.getFlag(MODULE_ID, "internalCaster") === true);
  if (actor) {
    const updates = {};
    if (actor.name !== INTERNAL_CASTER_NAME) updates.name = INTERNAL_CASTER_NAME;
    if (actor.prototypeToken?.name !== RUNTIME_ORIGIN_NAME) updates["prototypeToken.name"] = RUNTIME_ORIGIN_NAME;
    if (actor.prototypeToken?.texture?.src !== TRANSPARENT_TOKEN_TEXTURE) updates["prototypeToken.texture.src"] = TRANSPARENT_TOKEN_TEXTURE;
    if (Number(actor.prototypeToken?.alpha) !== 0) updates["prototypeToken.alpha"] = 0;
    if (actor.prototypeToken?.hidden !== true) updates["prototypeToken.hidden"] = true;
    if (actor.prototypeToken?.locked !== true) updates["prototypeToken.locked"] = true;
    if (Number(actor.prototypeToken?.displayName) !== 0) updates["prototypeToken.displayName"] = 0;
    if (Number(actor.prototypeToken?.displayBars) !== 0) updates["prototypeToken.displayBars"] = 0;
    if (actor.getFlag(MODULE_ID, "version") !== VERSION) updates[`flags.${MODULE_ID}.version`] = VERSION;
    if (Number(actor.getFlag(MODULE_ID, "casterSchema")) < INTERNAL_CASTER_SCHEMA) {
      updates["system.details.cr"] = INTERNAL_CASTER_CR;
      updates["system.attributes.spellcasting"] = INTERNAL_CASTER_SPELLCASTING_ABILITY;
      updates["system.abilities.int.value"] = INTERNAL_CASTER_INTELLIGENCE;
      updates[`flags.${MODULE_ID}.casterSchema`] = INTERNAL_CASTER_SCHEMA;
    }
    if (Object.keys(updates).length) await actor.update(updates);
    return actor;
  }

  actor = await Actor.create({
    name: INTERNAL_CASTER_NAME,
    type: "npc",
    img: DEFAULT_TRIGGER_TEXTURE,
    system: {
      details: { cr: INTERNAL_CASTER_CR },
      attributes: { spellcasting: INTERNAL_CASTER_SPELLCASTING_ABILITY },
      abilities: { int: { value: INTERNAL_CASTER_INTELLIGENCE } }
    },
    flags: { [MODULE_ID]: { internalCaster: true, version: VERSION, casterSchema: INTERNAL_CASTER_SCHEMA } },
    ownership: { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE },
    prototypeToken: {
      name: RUNTIME_ORIGIN_NAME,
      actorLink: false,
      width: 0.5,
      height: 0.5,
      disposition: CONST.TOKEN_DISPOSITIONS?.NEUTRAL ?? 0,
      displayName: 0,
      displayBars: 0,
      alpha: 0,
      hidden: true,
      locked: true,
      sight: { enabled: false },
      texture: { src: TRANSPARENT_TOKEN_TEXTURE, scaleX: 1, scaleY: 1 }
    }
  }, { renderSheet: false });
  queueMicrotask(() => {
    try { ui.actors?.render?.(); } catch (_error) { /* directory may not be open */ }
  });
  return actor;
}

export async function ensureRuntimeOriginToken(originTile, triggerTile) {
  const baseActor = await ensureInternalCaster();
  const scene = triggerTile.parent ?? canvas.scene;
  const point = tileCenterPoint(originTile);
  const activeGrid = canvas.scene?.id === scene?.id ? canvas.grid : null;
  const gridPixels = sceneGridPixelDimensions(scene, { activeGrid });
  const width = 0.5;
  const height = 0.5;
  let token = scene.tokens.find(entry => {
    const flag = runtimeOriginFlag(entry);
    return flag?.triggerTileUuid === triggerTile.uuid || flag?.triggerTileId === triggerTile.id;
  });
  const position = {
    x: point.x - gridPixels.width * width / 2,
    y: point.y - gridPixels.height * height / 2,
    elevation: point.elevation,
    hidden: true,
    alpha: 0,
    locked: true,
    displayName: 0,
    displayBars: 0
  };
  if (token) {
    await token.update({ ...position, name: RUNTIME_ORIGIN_NAME }, { easyTrapsInternal: true });
    queueMicrotask(() => makeRuntimeOriginNonInteractive(token.object));
    return token;
  }
  [token] = await scene.createEmbeddedDocuments("Token", [{
    name: RUNTIME_ORIGIN_NAME,
    actorId: baseActor.id,
    actorLink: false,
    ...position,
    width,
    height,
    disposition: CONST.TOKEN_DISPOSITIONS?.NEUTRAL ?? 0,
    displayName: 0,
    displayBars: 0,
    locked: true,
    sight: { enabled: false },
    detectionModes: [],
    texture: { src: TRANSPARENT_TOKEN_TEXTURE, scaleX: 1, scaleY: 1 },
    flags: {
      [MODULE_ID]: {
        runtimeOrigin: {
          triggerTileId: triggerTile.id,
          triggerTileUuid: triggerTile.uuid,
          version: VERSION
        }
      }
    }
  }], { renderSheet: false });
  if (!token) throw new Error("EasyTraps could not create its stable origin token.");
  queueMicrotask(() => makeRuntimeOriginNonInteractive(token.object));
  return token;
}

export async function protectRuntimeOriginTokens() {
  if (!isPrimaryGM() || !canvas.scene) return;
  const documents = (canvas.scene.tokens ?? []).filter(token => runtimeOriginFlag(token));
  const updates = documents.map(token => ({
    _id: token.id,
    hidden: true,
    alpha: 0,
    locked: true,
    displayName: 0,
    displayBars: 0,
    name: RUNTIME_ORIGIN_NAME
  }));
  if (updates.length) {
    try { await canvas.scene.updateEmbeddedDocuments("Token", updates, { easyTrapsInternal: true }); }
    catch (error) { console.warn(`${MODULE_ID} | Technical caster protection update failed`, error); }
  }
  // Keep the technical token visually inert, but do not delete Actor effects.
  // Concentration and other caster-side effects may legitimately belong to the
  // native spell workflow. Harmful self-targeting is prevented at the target
  // selection layer instead of suppressing every ActiveEffect on the caster.
  for (const token of canvas.tokens?.placeables ?? []) makeRuntimeOriginNonInteractive(token);
}

export async function cleanupTemporaryOriginTokens() {
  if (!isPrimaryGM() || !canvas.scene) return;
  const ids = canvas.scene.tokens
    .filter(token => token.getFlag(MODULE_ID, "temporaryOrigin") === true)
    .map(token => token.id);
  if (!ids.length) return;
  try { await canvas.scene.deleteEmbeddedDocuments("Token", ids); }
  catch (error) { console.warn(`${MODULE_ID} | Legacy temporary origin cleanup failed`, error); }
}

export function allTrapUuids() {
  const uuids = new Set();
  for (const scene of game.scenes ?? []) {
    for (const tile of scene.tiles ?? []) if (trapData(tile)) uuids.add(tile.uuid);
  }
  return uuids;
}

export function allRuntimeActors() {
  const actors = new Map();
  const addActor = actor => {
    if (!actor?.items) return;
    const key = actor.uuid ?? `${actor.documentName ?? "Actor"}.${actor.id}`;
    if (key) actors.set(key, actor);
  };
  for (const actor of game.actors ?? []) addActor(actor);
  for (const scene of game.scenes ?? []) {
    for (const token of scene.tokens ?? []) addActor(token.actor);
  }
  return [...actors.values()];
}

export async function cleanupOrphanedRuntimeDocuments() {
  if (!isPrimaryGM()) return;
  const trapUuids = allTrapUuids();
  for (const scene of game.scenes ?? []) {
    const ids = (scene.tokens ?? []).filter(token => {
      const flag = runtimeOriginFlag(token);
      return flag && !trapUuids.has(flag.triggerTileUuid);
    }).map(token => token.id);
    if (ids.length) {
      try { await scene.deleteEmbeddedDocuments("Token", ids); }
      catch (error) { console.warn(`${MODULE_ID} | Orphaned runtime origin cleanup failed`, error); }
    }
  }
  for (const actor of allRuntimeActors()) {
    const ids = (actor.items ?? []).filter(item => {
      const flag = runtimeSpellFlag(item);
      const legacyTemporarySpell = item?.getFlag?.(MODULE_ID, "temporarySpell") === true
        || item?.flags?.[MODULE_ID]?.temporarySpell === true;
      return legacyTemporarySpell || (flag && !trapUuids.has(flag.triggerTileUuid));
    }).map(item => item.id);
    if (ids.length) {
      try { await actor.deleteEmbeddedDocuments("Item", ids); }
      catch (error) { console.warn(`${MODULE_ID} | Orphaned runtime spell cleanup failed`, error); }
    }
  }
}

export async function cleanupRuntimeDocumentsForTrap(triggerTile) {
  if (!isPrimaryGM() || !triggerTile) return;
  const triggerUuid = triggerTile.uuid;
  const triggerId = triggerTile.id;
  const scene = triggerTile.parent;
  const tokenIds = (scene?.tokens ?? []).filter(token => {
    const flag = runtimeOriginFlag(token);
    return flag?.triggerTileUuid === triggerUuid || flag?.triggerTileId === triggerId;
  }).map(token => token.id);
  if (tokenIds.length) {
    try { await scene.deleteEmbeddedDocuments("Token", tokenIds); }
    catch (error) { console.warn(`${MODULE_ID} | Runtime origin cleanup failed`, error); }
  }
  for (const actor of allRuntimeActors()) {
    const itemIds = (actor.items ?? []).filter(item => {
      const flag = runtimeSpellFlag(item);
      return flag?.triggerTileUuid === triggerUuid || flag?.triggerTileId === triggerId;
    }).map(item => item.id);
    if (itemIds.length) {
      try { await actor.deleteEmbeddedDocuments("Item", itemIds); }
      catch (error) { console.warn(`${MODULE_ID} | Runtime spell cleanup failed`, error); }
    }
  }
}

export function onDeleteTile(tileDocument, options = {}) {
  queueMicrotask(refreshTriggerOverlays);
  if (!isPrimaryGM()) return;
  const scene = tileDocument.parent;
  const trap = trapData(tileDocument);
  const origin = originData(tileDocument);
  if (origin && options?.easyTrapsDetachOrigin) return;
  if (trap) {
    queueMicrotask(() => cleanupRuntimeDocumentsForTrap(tileDocument));
    if (isExternalTriggerType(trap.triggerType)) queueMicrotask(() => deleteTriggerSourceForController(tileDocument));
  }

  if (trap?.originMode === ORIGIN_MODES.SEPARATE_TILE && trap.originTileId) {
    queueMicrotask(async () => {
      const linkedOrigin = scene?.tiles?.get?.(trap.originTileId);
      if (!linkedOrigin) return;
      try { await scene.deleteEmbeddedDocuments("Tile", [linkedOrigin.id]); }
      catch (error) { console.warn(`${MODULE_ID} | Linked origin Tile cleanup failed`, error); }
    });
    return;
  }

  if (origin?.triggerTileId || origin?.triggerTileUuid) {
    queueMicrotask(async () => {
      const trigger = scene?.tiles?.get?.(origin.triggerTileId)
        ?? scene?.tiles?.find?.(entry => entry.uuid === origin.triggerTileUuid)
        ?? null;
      if (!trigger || !trapData(trigger)) return;
      try {
        // A separate Origin Tile is part of the trap, not a detachable marker.
        // Deleting it therefore deletes the controller as well. The controller's
        // normal delete lifecycle then removes runtime documents, its paired
        // origin (already gone here), and any EasyTraps-owned Door / Item Pile.
        await scene.deleteEmbeddedDocuments("Tile", [trigger.id], { easyTrapsInternal: true });
      } catch (error) {
        console.warn(`${MODULE_ID} | Could not delete trap after linked origin deletion`, error);
      }
    });
  }
}
