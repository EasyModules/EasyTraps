import { templatePreviewGeometry } from "./area-geometry.mjs";
import { sceneGridPixelDimensions, tokenDocumentCanvasRectangle } from "./document-geometry.mjs";
import { convertConfiguredLength, sceneDistanceBetweenPoints, squareGridCellCenterRectangle } from "./length-units.mjs";
import {
  absoluteTriggerCells,
  baseCellFromMarker,
  clampBaseCell,
  clampCellCount,
  legacyAnchoredBaseCellFromMarker,
  legacyBaseCellFromMarker003,
  markerDataForBaseCell,
  markerTopLeft,
  rectangleOffsets,
  sceneCellFromPoint
} from "./grid-trigger.mjs";
import { createEasyTrapsConfigurationMenuType, openEasyTrapsConfiguration } from "./config.mjs";
import { openTrapAdvancedSettings } from "./advanced.mjs";
import {
  DEFAULT_DISCOVERY_CONFIG,
  actorEffectivePassivePerception,
  actorHasRequiredItem,
  closestPointsBetweenRectangleAndSegment,
  closestPointsBetweenRectangles,
  detectionSkillLabel,
  discoverySummary,
  evaluatePassiveDiscovery,
  isPassiveDiscoveryCandidate,
  isUnmodifiedV036DiscoveryDefaults,
  isUnmodifiedV040DiscoveryDefaults,
  isUnmodifiedV041DiscoveryDefaults,
  isUnmodifiedV043DiscoveryDefaults,
  migrateDiscoveryConfig,
  normalizeDiscoveryConfig,
  rectangleLosSamplePoints,
  testSightCollision
} from "./discovery.mjs";
import {
  isPlayerTrapInteractionCandidate,
  playerTrapAtPoint,
  visibleTokenAtPoint
} from "./player-interaction.mjs";
import {
  disarmDcFromTrap,
  evaluateDisarmAttempt,
  evaluateDisarmEligibility,
  firstUsableDisarmRoll,
  naturalD20FromRoll,
  normalizeDisarmAttempts,
  recordDisarmAttempt
} from "./disarm.mjs";
import {
  buildCantripCasterLevelOptions,
  buildCantripCountActor,
  cantripScalingIncrease,
  installCantripRollDataScaling,
  normalizeCantripCasterLevel
} from "./cantrip-scaling.mjs";
import { defaultSpellCompendiumIds, resolveSelectedSpellCompendiumIds } from "./spell-sources.mjs";
import {
  ALARM_AUDIBILITY_MODES,
  ALARM_CHAT_MODES,
  ALARM_PLAYBACK_MODES,
  DEFAULT_ALARM_CONFIG,
  DEFAULT_ALARM_SOUND,
  alarmAudibilityLabel,
  alarmChatLabel,
  alarmPlaybackLabel,
  alarmRangePixelRadius,
  alarmSoundLabel,
  startSpatialAlarm,
  hasSupportedAudioExtension,
  normalizeAlarmConfig,
  playAlarmLocally
} from "./alarm.mjs";
import {
  TRIGGER_TYPES,
  TRIGGER_SOURCE_OWNERSHIP,
  createDoorInteractionContextData,
  validateDoorInteractionContext,
  isExternalTriggerType,
  normalizeTriggerType,
  normalizeTriggerSourceOwnership,
  sourceLinkFlag,
  sourceLinkFromDocument,
  doorControllerTileGeometry,
  trapDiscoveryState,
  trapRequiresTriggeringToken,
  trapMatchesTriggerSource,
  triggerTypeLabel
} from "./trigger-sources.mjs";

const MODULE_ID = "easy-traps";
const VERSION = "1.0.0";
const TRIGGER_SCHEMA = 31;
const MACRO_NAME = "EasyTraps — Create Spell Trap";
const ALARM_MACRO_NAME = "EasyTraps — Create Alarm Trap";
const DEFAULT_TRIGGER_TEXTURE = `modules/${MODULE_ID}/assets/trigger-floor.svg`;
const DEFAULT_ORIGIN_TEXTURE = `modules/${MODULE_ID}/assets/trigger-floor.svg`;
const INTERNAL_CASTER_NAME = "EasyTraps";
const RUNTIME_ORIGIN_NAME = "EasyTraps";
const INSTANT_TEMPLATE_CLEANUP_MS = 8000;
const INTERNAL_CASTER_SCHEMA = 2;
const INTERNAL_CASTER_CR = 5;
const INTERNAL_CASTER_SPELLCASTING_ABILITY = "int";
const INTERNAL_CASTER_INTELLIGENCE = 18;
const RUNTIME_SPELL_SCHEMA = 5;
const DEFAULT_SPELL_SAVE_DC = 13;
const DEFAULT_SPELL_ATTACK_BONUS = 4;
const DEFAULT_PAUSE_ON_TRIGGER = true;
const DEFAULT_DISARM_AFTER_TRIGGER = true;
const TRANSPARENT_TOKEN_TEXTURE = `modules/${MODULE_ID}/assets/transparent.svg`;
const SOCKET_CHANNEL = `module.${MODULE_ID}`;
const DISARM_PREFLIGHT_TIMEOUT_MS = 15000;
const DISARM_RESOLUTION_TIMEOUT_MS = 120000;
const DISARM_MAX_DISTANCE_FT = 5;
const DISARM_INTERACTION_LOCK_TIMEOUT_MS = 120000;
const DISARM_CANCELLED_PREFLIGHT_TTL_MS = 5 * 60 * 1000;
const DISCOVERY_VISION_RECHECK_DELAY_MS = 80;
const DOOR_TRIGGER_ACTIVATION_DELAY_MS = 350;
const ITEM_PILE_INTERACTION_DEDUPE_MS = 3000;
const ITEM_PILE_INTERACTION_DEDUPE_WINDOW_MS = 1500;
const CANVAS_PAN_DURATION_MS = 350;
const PLAYER_TRAP_HOVER_FADE_MS = 90;
const PLAYER_TRAP_PULSE_MS = 110;
const SETUP_TARGET_RESTORE_DELAY_MS = 150;
const PLACEMENT_POINTER_RELEASE_TIMEOUT_MS = 5000;
const DOOR_SOURCE_BAND_GRID_RATIO = 0.10;
const RANGE_EPSILON_FT = 0.05;
const DOOR_SOURCE_BAND_MIN_PX = 8;
const DOOR_SOURCE_BAND_MAX_PX = 18;
const DOOR_LOS_FACE_OFFSET_GRID_RATIO = 0.035;
const DOOR_LOS_FACE_OFFSET_MIN_PX = 2;
const DOOR_LOS_FACE_OFFSET_MAX_PX = 6;
const RUNTIME_ORIGIN_VFX_SWEEP_DELAYS_MS = Object.freeze([50, 250, 750, 1800, 6000]);
const DISARM_ATTEMPT_SOUND = `modules/${MODULE_ID}/assets/audio/disarm-attempt-key-lock.ogg`;
const ALARM_TRAP_NAME = "Alarm Trap";
const SETTINGS = Object.freeze({
  SPELL_COMPENDIUMS: "spellCompendiums",
  FAVORITE_SPELLS: "favoriteSpells",
  LAST_SPELL_SAVE_DC: "lastSpellSaveDc",
  LAST_SPELL_ATTACK_BONUS: "lastSpellAttackBonus",
  DEFAULT_PAUSE_ON_TRIGGER: "defaultPauseOnTrigger",
  DEFAULT_DISARM_AFTER_TRIGGER: "defaultDisarmAfterTrigger",
  TRIGGER_TEXTURE: "triggerTexture",
  ORIGIN_TEXTURE: "originTexture",
  DISCOVERY_DEFAULTS: "discoveryDefaults"
});
const DEFAULT_FAVORITE_SPELL_NAMES = Object.freeze([
  "Burning Hands",
  "Web",
  "Fireball",
  "Magic Missile",
  "Lightning Bolt",
  "Cone of Cold"
]);
const ORIGIN_MODES = Object.freeze({
  TRIGGER_TILE: "trigger-tile",
  SEPARATE_TILE: "separate-tile",
  TRIGGERING_TOKEN: "triggering-token"
});
const TARGET_MODES = Object.freeze({
  TRIGGERING_TOKEN: "triggering-token",
  SPELL_AREA: "spell-area",
  CUSTOM_ZONE: "custom-zone",
  NONE: "none"
});
const TARGETING_PROFILES = Object.freeze({
  NATIVE_AREA: "native-area",
  DIRECT: "direct-target",
  SELF: "self",
  NONE: "no-target",
  INTERACTIVE: "native-interactive"
});
const TEMPLATE_BINDINGS = Object.freeze({
  ORIGIN_LINKED: "origin-linked",
  SCENE_FIXED: "scene-fixed"
});
const AREA_MODES = Object.freeze({
  PREPLACED: "preplaced",
  ON_TRIGGER: "on-trigger",
  NONE: "none"
});
const WORKFLOW_MODES = Object.freeze({
  NATIVE_SPELL: "native-spell",
  UNSUPPORTED: "unsupported"
});
const runtime = {
  triggering: new Set(),
  discovering: new Set(),
  placing: false,
  overlays: new Map(),
  areaOverlays: new Map(),
  cancelPlacement: null,
  spellPackCache: null,
  sceneManager: null,
  playerTrapInteraction: {
    installed: false,
    hoveredTileId: null,
    overlay: null,
    disarmControl: null,
    disarmControlTileId: null,
    disarmControlHovered: false,
    disarmControlHideTimer: null,
    lastPointerPoint: null,
    moveHandler: null,
    disarmBusy: false,
    pendingRequestId: null,
    activeLockId: null,
    activeLockTileId: null,
    activeLockSceneId: null,
    lockedTrapIds: new Set()
  },
  disarmSocketInstalled: false,
  pendingDisarmRequests: new Map(),
  pendingDisarmPreflights: new Map(),
  disarmGmLocks: new Set(),
  disarmInteractionLocks: new Map(),
  cancelledDisarmPreflights: new Map(),
  gmAuthorityResumeInstalled: false,
  discoveryVisionRecheckTimer: null,
  discoveryVisionRecheckRunning: false,
  discoveryVisionRecheckAgain: false,
  itemPileHookInstalled: false,
  itemPileInteractionDedupe: new Map(),
  sourceLinkRepairs: new Set(),
  pendingSourceDeletions: new Map(),
  unitWarnings: new Set(),
  alarmCooldownUntil: new Map(),
  gmAlarmRangePreview: {
    installed: false,
    hoveredTileId: null,
    moveHandler: null
  }
};

Hooks.once("init", () => {
  game.settings.register(MODULE_ID, SETTINGS.SPELL_COMPENDIUMS, {
    name: "EasyTraps Spell Compendiums",
    hint: "Compendiums whose spell Items are shown in the EasyTraps creation wizard.",
    scope: "world",
    config: false,
    type: Object,
    default: { configured: false, selected: [] }
  });
  game.settings.register(MODULE_ID, SETTINGS.FAVORITE_SPELLS, {
    name: "EasyTraps Favorite Spells",
    hint: "Spell UUIDs shown in the compact favorites panel of the trap creator.",
    scope: "client",
    config: false,
    type: Object,
    default: { customized: false, selected: [] }
  });
  game.settings.register(MODULE_ID, SETTINGS.LAST_SPELL_SAVE_DC, {
    name: "Last spell save DC",
    hint: "The save DC prefilled for the next trap created by this client.",
    scope: "client",
    config: false,
    type: Number,
    default: DEFAULT_SPELL_SAVE_DC
  });
  game.settings.register(MODULE_ID, SETTINGS.LAST_SPELL_ATTACK_BONUS, {
    name: "Last spell attack bonus",
    hint: "The spell attack modifier prefilled for the next trap created by this client.",
    scope: "client",
    config: false,
    type: Number,
    default: DEFAULT_SPELL_ATTACK_BONUS
  });
  game.settings.register(MODULE_ID, SETTINGS.DEFAULT_PAUSE_ON_TRIGGER, {
    name: "Pause new traps by default",
    hint: "New traps begin with the pause-on-trigger option enabled.",
    scope: "client",
    config: false,
    type: Boolean,
    default: DEFAULT_PAUSE_ON_TRIGGER
  });
  game.settings.register(MODULE_ID, SETTINGS.DEFAULT_DISARM_AFTER_TRIGGER, {
    name: "Disarm new traps after triggering",
    hint: "New traps are single-use by default, but this can be disabled per trap.",
    scope: "client",
    config: false,
    type: Boolean,
    default: DEFAULT_DISARM_AFTER_TRIGGER
  });
  game.settings.register(MODULE_ID, SETTINGS.TRIGGER_TEXTURE, {
    name: "Trigger Tile image",
    hint: "Image used by newly created trap trigger Tiles.",
    scope: "world",
    config: false,
    type: String,
    default: DEFAULT_TRIGGER_TEXTURE
  });
  game.settings.register(MODULE_ID, SETTINGS.ORIGIN_TEXTURE, {
    name: "Origin Tile image",
    hint: "Image used by newly created separate-origin Tiles.",
    scope: "world",
    config: false,
    type: String,
    default: DEFAULT_ORIGIN_TEXTURE
  });
  game.settings.register(MODULE_ID, SETTINGS.DISCOVERY_DEFAULTS, {
    name: "Discovery and disarming defaults",
    hint: "Default discovery and disarming rules copied into newly created traps.",
    scope: "world",
    config: false,
    type: Object,
    default: foundry.utils.deepClone(DEFAULT_DISCOVERY_CONFIG)
  });

  if (typeof game.settings.registerMenu === "function") {
    game.settings.registerMenu(MODULE_ID, "configuration", {
      name: "EasyTraps Configuration",
      label: "Open EasyTraps Configuration",
      hint: "Configure spell sources, technical Tile artwork, creation defaults, discovery, and disarming.",
      icon: "fa-solid fa-dungeon",
      type: createEasyTrapsConfigurationMenuType(configurationServices()),
      restricted: true
    });
  }

  const api = Object.freeze({
    openWizard,
    openSpellWizard: openWizard,
    openAlarmWizard,
    start: openWizard,
    open: openWizard,
    openConfiguration,
    openConfig: openConfiguration,
    configure: openConfiguration,
    resetSettings,
    restoreDefaults: resetSettings,
    getSelectedCompendiums,
    getFavoriteSpells,
    actorHasRequiredItem,
    openSceneManager: openSceneTrapManager,
    manageScene: openSceneTrapManager,
    triggerTypes: TRIGGER_TYPES,
    version: VERSION
  });
  const module = game.modules.get(MODULE_ID);
  if (module) module.api = api;
  game.easyTraps = api;
  Hooks.on("setupTileActions", registerMattActions);
  Hooks.on("preUpdateToken", onPreUpdateToken);
  Hooks.on("moveToken", onMoveTokenDiscovery);
  Hooks.on("sightRefresh", onSightRefreshDiscovery);
  Hooks.on("createWall", scheduleVisionDiscoveryRecheck);
  Hooks.on("preUpdateWall", onPreUpdateDoorTriggerSource);
  Hooks.on("updateWall", onUpdateDoorTriggerSource);
  Hooks.on("updateWall", scheduleVisionDiscoveryRecheck);
  Hooks.on("preDeleteWall", onPreDeleteTriggerSourceWall);
  Hooks.on("deleteWall", onDeleteTriggerSourceWall);
  Hooks.on("deleteWall", scheduleVisionDiscoveryRecheck);
  Hooks.on("updateToken", onTokenVisionChangedDiscovery);
  Hooks.on("updateToken", onUpdateItemPileTriggerSource);
  Hooks.on("preDeleteToken", onPreDeleteItemPileTriggerSource);
  Hooks.on("deleteToken", onDeleteItemPileTriggerSource);
  Hooks.on("preUpdateTile", onPreUpdateTile);
  Hooks.on("drawToken", token => queueMicrotask(() => {
    makeRuntimeOriginNonInteractive(token);
    syncVisibleItemPileController(token);
  }));
  Hooks.on("refreshToken", token => queueMicrotask(() => {
    makeRuntimeOriginNonInteractive(token);
    syncVisibleItemPileController(token);
  }));
  Hooks.on("controlToken", onControlRuntimeOriginToken);
  Hooks.on("targetToken", onTargetRuntimeOriginToken);
  Hooks.on("renderTokenHUD", closeRuntimeOriginTokenHud);
  Hooks.on("midi-qol.preambleComplete", stripRuntimeOriginFromMidiWorkflow);
  Hooks.on("midi-qol.targetingComplete", stripRuntimeOriginFromMidiWorkflow);
  Hooks.on("midi-qol.preCheckSaves", stripRuntimeOriginFromMidiWorkflow);
  Hooks.on("midi-qol.preApplyDynamicEffects", stripRuntimeOriginFromMidiWorkflow);
  Hooks.on("dnd5e.preUseActivity", applyRuntimeCantripCasterLevel);
  Hooks.on("renderTileHUD", renderTrapTileHud);
  Hooks.on("getSceneControlButtons", registerSceneControlButtons);
  Hooks.on("createTile", () => queueMicrotask(() => {
    refreshTriggerOverlays();
    refreshOpenSceneTrapManager();
    refreshPlayerTrapInteractionState();
  }));
  Hooks.on("updateTile", () => queueMicrotask(() => {
    refreshTriggerOverlays();
    refreshOpenSceneTrapManager();
    refreshPlayerTrapInteractionState();
  }));
  Hooks.on("controlTile", () => queueMicrotask(refreshAreaOverlays));
  Hooks.on("hoverTile", () => queueMicrotask(refreshAreaOverlays));
  Hooks.on("hoverToken", () => queueMicrotask(refreshAreaOverlays));
  Hooks.on("hoverWall", () => queueMicrotask(refreshAreaOverlays));
  Hooks.on("canvasPan", () => queueMicrotask(repositionPlayerDisarmControl));
  Hooks.on("deleteTile", onDeleteTile);
  Hooks.on("renderActorDirectory", (_application, html) => queueMicrotask(() => hideInternalCasterEntries(html)));
  Hooks.on("renderActorSheet", (application, html) => queueMicrotask(() => hideRuntimeSpellEntries(application, html)));
  Hooks.on("renderActorSheet5e", (application, html) => queueMicrotask(() => hideRuntimeSpellEntries(application, html)));
  Hooks.on("createActiveEffect", effect => queueMicrotask(() => refreshRuntimeOriginActorDecorations(effect?.parent)));
  Hooks.on("updateActiveEffect", effect => queueMicrotask(() => refreshRuntimeOriginActorDecorations(effect?.parent)));
  Hooks.on("deleteActiveEffect", effect => queueMicrotask(() => refreshRuntimeOriginActorDecorations(effect?.parent)));
  Hooks.on("renderApplicationV2", (application, html) => queueMicrotask(() => {
    hideRuntimeSpellEntries(application, html);
    if (application?.constructor?.name === "TileHUD") renderTrapTileHud(application, html);
    if (application?.constructor?.name === "TokenHUD") closeRuntimeOriginTokenHud(application);
  }));
  Hooks.on("canvasReady", () => queueMicrotask(async () => {
    await cleanupTemporaryOriginTokens();
    await cleanupOrphanedRuntimeDocuments();
    await migrateLegacyTriggers();
    await cleanupNonSpatialAlarmOrigins(canvas.scene);
    await repairExternalTriggerSourceLinks(canvas.scene);
    await protectRuntimeOriginTokens();
    refreshTriggerOverlays();
    setupPlayerTrapInteraction();
    setupGmAlarmRangePreview();
  }));
  Hooks.on("canvasTearDown", () => {
    runtime.cancelPlacement?.();
    if (runtime.discoveryVisionRecheckTimer) clearTimeout(runtime.discoveryVisionRecheckTimer);
    runtime.discoveryVisionRecheckTimer = null;
    teardownPlayerTrapInteraction();
    teardownGmAlarmRangePreview();
    runtime.pendingSourceDeletions.clear();
    runtime.sourceLinkRepairs.clear();
    runtime.itemPileInteractionDedupe.clear();
    runtime.alarmCooldownUntil.clear();
    clearTriggerOverlays();
    clearAreaOverlays();
    closeSceneManagerForCanvasTearDown();
  });
  console.info(`${MODULE_ID} | ${VERSION} initialized`);
});

Hooks.once("ready", async () => {
  registerWithEasyModules();
  setupDisarmSocket();
  setupTriggerSourceHooks();
  Hooks.callAll("easyTrapsReady", game.easyTraps);
  if (!game.user.isGM) return;
  setupGmAuthorityResumeHandling();
  if (game.system.id !== "dnd5e") {
    ui.notifications.error(`EasyTraps ${VERSION} requires the D&D 5e system.`);
    return;
  }
  const missing = ["monks-active-tiles"].filter(id => !game.modules.get(id)?.active);
  if (missing.length) {
    ui.notifications.error(`EasyTraps ${VERSION} requires Monk's Active Tile Triggers. Missing: ${missing.join(", ")}`);
    return;
  }
  warnAboutOptionalIntegrationCompatibility();
  await migrateDiscoveryDefaultsSetting();
  await ensureMacro();
  await ensureAlarmMacro();
  await removeLegacyDevelopmentMacros();
  await cleanupTemporaryOriginTokens();
  await cleanupOrphanedRuntimeDocuments();
  await migrateLegacyTriggers();
  await cleanupNonSpatialAlarmOrigins(canvas.scene);
  await repairExternalTriggerSourceLinks(canvas.scene);
  refreshTriggerOverlays();
  queueMicrotask(() => hideInternalCasterEntries(ui.actors?.element));
});

async function ensureMacro() {
  const existing = game.macros.find(macro => macro.getFlag(MODULE_ID, "createWizard") === true);
  if (existing) {
    const changes = {};
    if (existing.name !== MACRO_NAME) changes.name = MACRO_NAME;
    if (existing.command !== macroCommand()) changes.command = macroCommand();
    if (Object.keys(changes).length) await existing.update(changes);
    return existing;
  }
  return Macro.create({
    name: MACRO_NAME,
    type: "script",
    img: "icons/magic/symbols/runes-star-pentagon-magenta.webp",
    command: macroCommand(),
    flags: { [MODULE_ID]: { createWizard: true } },
    ownership: { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE }
  }, { renderSheet: false });
}

function macroCommand() {
  return `game.modules.get("${MODULE_ID}")?.api?.openWizard();`;
}

async function ensureAlarmMacro() {
  const existing = game.macros.find(macro => macro.getFlag(MODULE_ID, "createAlarmWizard") === true);
  if (existing) {
    const changes = {};
    if (existing.name !== ALARM_MACRO_NAME) changes.name = ALARM_MACRO_NAME;
    if (existing.command !== alarmMacroCommand()) changes.command = alarmMacroCommand();
    if (Object.keys(changes).length) await existing.update(changes);
    return existing;
  }
  return Macro.create({
    name: ALARM_MACRO_NAME,
    type: "script",
    img: `modules/${MODULE_ID}/assets/trigger-floor.svg`,
    command: alarmMacroCommand(),
    flags: { [MODULE_ID]: { createAlarmWizard: true } },
    ownership: { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE }
  }, { renderSheet: false });
}

function alarmMacroCommand() {
  return `game.modules.get("${MODULE_ID}")?.api?.openAlarmWizard();`;
}

async function removeLegacyDevelopmentMacros() {
  const legacy = game.macros.filter(macro => macro.getFlag(MODULE_ID, "selfTest") === true);
  for (const macro of legacy) {
    try { await macro.delete(); }
    catch (error) { console.warn(`${MODULE_ID} | Could not remove legacy development macro`, error); }
  }
}

async function openWizard() {
  if (!game.user.isGM) return ui.notifications.warn("Only a GM can create spell traps.");
  if (!canvas.ready || !canvas.scene) return ui.notifications.warn("Open a scene before creating a trap.");
  if (runtime.placing) return ui.notifications.warn("Finish the current trigger placement first.");

  const catalog = await loadSpellCatalog();
  if (!catalog.length) return ui.notifications.error("No spells were found in the selected compendiums.");
  return openCreationWizard(catalog, getFavoriteSpellUuids(catalog));
}

async function openAlarmWizard() {
  if (!game.user.isGM) return ui.notifications.warn("Only a GM can create alarm traps.");
  if (!canvas.ready || !canvas.scene) return ui.notifications.warn("Open a scene before creating a trap.");
  if (runtime.placing) return ui.notifications.warn("Finish the current trigger placement first.");
  return openAlarmCreationWizard();
}

async function loadSpellCatalog() {
  const availablePacks = await spellCompendiumPacks();
  const selectedIds = new Set(getSelectedCompendiumIds(availablePacks));
  const packs = availablePacks
    .filter(pack => selectedIds.has(pack.collection))
    .sort((a, b) => packPriority(a) - packPriority(b) || packLabel(a).localeCompare(packLabel(b)));
  const rows = [];
  const seen = new Set();

  for (const pack of packs) {
    let index;
    try {
      index = await pack.getIndex({ fields: ["name", "img", "system.level", "system.school", "type"] });
    } catch (error) {
      console.warn(`${MODULE_ID} | Could not index ${pack.collection}`, error);
      continue;
    }
    for (const entry of index) {
      if (entry.type !== "spell") continue;
      const uuid = entry.uuid ?? `Compendium.${pack.collection}.Item.${entry._id}`;
      if (seen.has(uuid)) continue;
      seen.add(uuid);
      rows.push({
        id: entry._id,
        uuid,
        name: entry.name,
        img: entry.img,
        level: Number(foundry.utils.getProperty(entry, "system.level")) || 0,
        school: String(foundry.utils.getProperty(entry, "system.school") ?? ""),
        source: packLabel(pack)
      });
    }
  }
  return rows.sort((a, b) => a.level - b.level || a.name.localeCompare(b.name) || a.source.localeCompare(b.source));
}


function readFavoriteSpellSetting() {
  let setting;
  try { setting = game.settings.get(MODULE_ID, SETTINGS.FAVORITE_SPELLS); }
  catch (_error) { setting = null; }
  return {
    customized: setting?.customized === true,
    selected: Array.isArray(setting?.selected) ? [...new Set(setting.selected.filter(Boolean))] : []
  };
}

function favoriteSpellSourcePriority(spell) {
  const uuid = String(spell?.uuid ?? "");
  if (uuid.startsWith("Compendium.dnd5e.spells24.")) return 0;
  if (uuid.startsWith("Compendium.dnd5e.spells.")) return 1;
  return 2;
}

function defaultFavoriteSpellUuids(catalog = []) {
  const result = [];
  for (const name of DEFAULT_FAVORITE_SPELL_NAMES) {
    const normalizedName = normalize(name);
    const spell = catalog
      .filter(entry => normalize(entry.name) === normalizedName)
      .sort((a, b) => favoriteSpellSourcePriority(a) - favoriteSpellSourcePriority(b))[0];
    if (spell && !result.includes(spell.uuid)) result.push(spell.uuid);
  }
  return result;
}

function getFavoriteSpellUuids(catalog = []) {
  const setting = readFavoriteSpellSetting();
  const selected = setting.customized ? setting.selected : defaultFavoriteSpellUuids(catalog);
  const available = new Set(catalog.map(spell => spell.uuid));
  return selected.filter(uuid => available.has(uuid));
}

async function getFavoriteSpells() {
  const catalog = await loadSpellCatalog();
  const favoriteIds = new Set(getFavoriteSpellUuids(catalog));
  return catalog.filter(spell => favoriteIds.has(spell.uuid));
}

async function toggleFavoriteSpell(spellUuid, catalog = []) {
  const setting = readFavoriteSpellSetting();
  const selected = new Set(setting.customized ? setting.selected : defaultFavoriteSpellUuids(catalog));
  if (selected.has(spellUuid)) selected.delete(spellUuid);
  else selected.add(spellUuid);
  await game.settings.set(MODULE_ID, SETTINGS.FAVORITE_SPELLS, {
    customized: true,
    selected: [...selected]
  });
  return getFavoriteSpellUuids(catalog);
}

async function restoreDefaultFavoriteSpells() {
  await game.settings.set(MODULE_ID, SETTINGS.FAVORITE_SPELLS, { customized: false, selected: [] });
}

function packPriority(pack) {
  if (pack.collection === "dnd5e.spells24") return 0;
  if (pack.collection === "dnd5e.spells") return 1;
  return 2;
}

function packLabel(pack) {
  return String(pack.metadata?.label ?? pack.title ?? pack.collection ?? "Compendium");
}

function itemCompendiumPacks() {
  return Array.from(game.packs)
    .filter(pack => pack.documentName === "Item" || pack.metadata?.type === "Item")
    .sort((a, b) => packPriority(a) - packPriority(b) || packLabel(a).localeCompare(packLabel(b)));
}

async function spellCompendiumPacks({ refresh = false } = {}) {
  if (!refresh && runtime.spellPackCache) return runtime.spellPackCache;
  const task = (async () => {
    const result = [];
    for (const pack of itemCompendiumPacks()) {
      try {
        const index = await pack.getIndex({ fields: ["type"] });
        if (Array.from(index).some(entry => entry.type === "spell")) result.push(pack);
      } catch (error) {
        console.warn(`${MODULE_ID} | Could not inspect ${pack.collection}`, error);
      }
    }
    return result.sort((a, b) => packPriority(a) - packPriority(b) || packLabel(a).localeCompare(packLabel(b)));
  })();
  runtime.spellPackCache = task;
  try { return await task; }
  catch (error) {
    runtime.spellPackCache = null;
    throw error;
  }
}

function getSelectedCompendiumIds(packs = []) {
  let setting;
  try { setting = game.settings.get(MODULE_ID, SETTINGS.SPELL_COMPENDIUMS); }
  catch (_error) { setting = null; }
  return resolveSelectedSpellCompendiumIds(packs, setting);
}

async function getSelectedCompendiums() {
  const packs = await spellCompendiumPacks();
  const selected = new Set(getSelectedCompendiumIds(packs));
  return packs
    .filter(pack => selected.has(pack.collection))
    .map(pack => ({ id: pack.collection, label: packLabel(pack), package: pack.metadata?.packageName ?? pack.metadata?.package ?? "" }));
}

function configuredImageSetting(key, fallback) {
  try {
    const value = String(game.settings.get(MODULE_ID, key) ?? "").trim();
    return value || fallback;
  } catch (_error) {
    return fallback;
  }
}

function configuredTriggerTexture() {
  return configuredImageSetting(SETTINGS.TRIGGER_TEXTURE, DEFAULT_TRIGGER_TEXTURE);
}

function configuredOriginTexture() {
  return configuredImageSetting(SETTINGS.ORIGIN_TEXTURE, DEFAULT_ORIGIN_TEXTURE);
}

function getDiscoveryDefaults() {
  try { return normalizeDiscoveryConfig(game.settings.get(MODULE_ID, SETTINGS.DISCOVERY_DEFAULTS)); }
  catch (_error) { return normalizeDiscoveryConfig(DEFAULT_DISCOVERY_CONFIG); }
}

async function migrateDiscoveryDefaultsSetting() {
  let raw;
  try { raw = game.settings.get(MODULE_ID, SETTINGS.DISCOVERY_DEFAULTS); }
  catch (_error) { return; }

  const retiredToolProficiencyGate = Boolean(raw?.disarm && Object.hasOwn(raw.disarm, "requireToolProficiency"));
  const legacyDraft = Boolean(raw?.detection && Object.hasOwn(raw.detection, "requireProficiency"))
    || Boolean(raw?.disarm && !Object.hasOwn(raw.disarm, "naturalOneTriggers"))
    || Boolean(raw?.disarm && !Object.hasOwn(raw.disarm, "alwaysDisarmOnCritical"));
  if (retiredToolProficiencyGate) {
    await game.settings.set(MODULE_ID, SETTINGS.DISCOVERY_DEFAULTS, normalizeDiscoveryConfig(raw));
    return;
  }
  if (legacyDraft) {
    const migrated = migrateDiscoveryConfig(raw, { fromSchema: 23 });
    await game.settings.set(
      MODULE_ID,
      SETTINGS.DISCOVERY_DEFAULTS,
      isUnmodifiedV036DiscoveryDefaults(migrated)
        ? foundry.utils.deepClone(DEFAULT_DISCOVERY_CONFIG)
        : migrated
    );
    return;
  }

  // Move untouched historical factory defaults to the current rules-facing
  // baseline without overwriting a GM's customized defaults.
  if (isUnmodifiedV036DiscoveryDefaults(raw) || isUnmodifiedV040DiscoveryDefaults(raw) || isUnmodifiedV041DiscoveryDefaults(raw) || isUnmodifiedV043DiscoveryDefaults(raw)) {
    await game.settings.set(MODULE_ID, SETTINGS.DISCOVERY_DEFAULTS, foundry.utils.deepClone(DEFAULT_DISCOVERY_CONFIG));
  }
}

async function resolveItemReference(uuid) {
  const id = String(uuid ?? "").trim();
  if (!id) return null;
  try {
    const document = await fromUuid(id);
    return document?.documentName === "Item" ? document : null;
  } catch (_error) {
    return null;
  }
}

function getCreationDefaults() {
  let spellSaveDc = DEFAULT_SPELL_SAVE_DC;
  let spellAttackBonus = DEFAULT_SPELL_ATTACK_BONUS;
  let pauseOnTrigger = DEFAULT_PAUSE_ON_TRIGGER;
  let disarmAfterTrigger = DEFAULT_DISARM_AFTER_TRIGGER;
  let discovery = normalizeDiscoveryConfig(DEFAULT_DISCOVERY_CONFIG);
  try { spellSaveDc = normalizeSpellSaveDc(game.settings.get(MODULE_ID, SETTINGS.LAST_SPELL_SAVE_DC)); }
  catch (_error) { /* setting may not be registered during early initialization */ }
  try { spellAttackBonus = normalizeSpellAttackBonus(game.settings.get(MODULE_ID, SETTINGS.LAST_SPELL_ATTACK_BONUS)); }
  catch (_error) { /* setting may not be registered during early initialization */ }
  try { pauseOnTrigger = Boolean(game.settings.get(MODULE_ID, SETTINGS.DEFAULT_PAUSE_ON_TRIGGER)); }
  catch (_error) { /* setting may not be registered during early initialization */ }
  try { disarmAfterTrigger = Boolean(game.settings.get(MODULE_ID, SETTINGS.DEFAULT_DISARM_AFTER_TRIGGER)); }
  catch (_error) { /* setting may not be registered during early initialization */ }
  try { discovery = getDiscoveryDefaults(); }
  catch (_error) { /* setting may not be registered during early initialization */ }
  return {
    spellSaveDc,
    spellAttackBonus,
    pauseOnTrigger,
    disarmAfterTrigger,
    discovery,
    triggerTexture: configuredTriggerTexture(),
    originTexture: configuredOriginTexture()
  };
}

async function rememberCreationDefaults(selection = {}) {
  const spellSaveDc = normalizeSpellSaveDc(selection.spellSaveDc);
  const spellAttackBonus = normalizeSpellAttackBonus(selection.spellAttackBonus);
  const tasks = [];
  try {
    if (game.settings.get(MODULE_ID, SETTINGS.LAST_SPELL_SAVE_DC) !== spellSaveDc) {
      tasks.push(game.settings.set(MODULE_ID, SETTINGS.LAST_SPELL_SAVE_DC, spellSaveDc));
    }
  } catch (_error) { /* no registered setting */ }
  try {
    if (game.settings.get(MODULE_ID, SETTINGS.LAST_SPELL_ATTACK_BONUS) !== spellAttackBonus) {
      tasks.push(game.settings.set(MODULE_ID, SETTINGS.LAST_SPELL_ATTACK_BONUS, spellAttackBonus));
    }
  } catch (_error) { /* no registered setting */ }
  if (tasks.length) await Promise.all(tasks);
}

async function loadConfigurationData() {
  const packs = await spellCompendiumPacks();
  const selectedIds = new Set(getSelectedCompendiumIds(packs));
  const defaultIds = new Set(defaultSpellCompendiumIds(packs));
  const defaults = getCreationDefaults();
  return {
    version: VERSION,
    packCount: packs.length,
    hasSpellPacks: packs.length > 0,
    selectedPackCount: packs.filter(pack => selectedIds.has(pack.collection)).length,
    noSelectedSpellPacks: packs.length > 0 && !packs.some(pack => selectedIds.has(pack.collection)),
    packs: packs.map(pack => {
      const id = pack.collection;
      const label = packLabel(pack);
      const packageLabel = String(pack.metadata?.packageName ?? pack.metadata?.package ?? pack.metadata?.packageType ?? "");
      return {
        id,
        label,
        packageLabel,
        selected: selectedIds.has(id),
        isDefault: defaultIds.has(id),
        search: normalize(`${label} ${id} ${packageLabel}`)
      };
    }),
    spellSaveDc: normalizeSpellSaveDc(defaults.spellSaveDc),
    spellAttackBonus: formatSignedModifier(defaults.spellAttackBonus),
    pauseOnTrigger: Boolean(defaults.pauseOnTrigger),
    disarmAfterTrigger: Boolean(defaults.disarmAfterTrigger),
    discovery: normalizeDiscoveryConfig(defaults.discovery),
    triggerTexture: defaults.triggerTexture || DEFAULT_TRIGGER_TEXTURE,
    originTexture: defaults.originTexture || DEFAULT_ORIGIN_TEXTURE,
    defaultTriggerTexture: DEFAULT_TRIGGER_TEXTURE,
    defaultOriginTexture: DEFAULT_ORIGIN_TEXTURE
  };
}

async function saveConfigurationData(values = {}) {
  const availablePacks = await spellCompendiumPacks();
  const availableIds = new Set(availablePacks.map(pack => pack.collection));
  const compendiums = Array.isArray(values.compendiums)
    ? [...new Set(values.compendiums.filter(id => availableIds.has(id)))]
    : [];

  const spellSaveDc = normalizeSpellSaveDc(values.spellSaveDc);
  const spellAttackBonus = normalizeSpellAttackBonus(values.spellAttackBonus);
  const triggerTexture = String(values.triggerTexture ?? "").trim() || DEFAULT_TRIGGER_TEXTURE;
  const originTexture = String(values.originTexture ?? "").trim() || DEFAULT_ORIGIN_TEXTURE;
  const discovery = normalizeDiscoveryConfig(values.discovery ?? DEFAULT_DISCOVERY_CONFIG);

  const settingWrites = [
    game.settings.set(MODULE_ID, SETTINGS.LAST_SPELL_SAVE_DC, spellSaveDc),
    game.settings.set(MODULE_ID, SETTINGS.LAST_SPELL_ATTACK_BONUS, spellAttackBonus),
    game.settings.set(MODULE_ID, SETTINGS.DEFAULT_PAUSE_ON_TRIGGER, Boolean(values.pauseOnTrigger)),
    game.settings.set(MODULE_ID, SETTINGS.DEFAULT_DISARM_AFTER_TRIGGER, Boolean(values.disarmAfterTrigger)),
    game.settings.set(MODULE_ID, SETTINGS.DISCOVERY_DEFAULTS, discovery),
    game.settings.set(MODULE_ID, SETTINGS.TRIGGER_TEXTURE, triggerTexture),
    game.settings.set(MODULE_ID, SETTINGS.ORIGIN_TEXTURE, originTexture)
  ];
  // If no spell packs exist, the Spell Sources tab has no controls. Saving an
  // unrelated setting must not silently convert the world into an intentional
  // "no sources" configuration. When packs are present, an empty selection is
  // deliberate and is persisted normally.
  if (values.spellSourcesEditable !== false) {
    settingWrites.unshift(game.settings.set(MODULE_ID, SETTINGS.SPELL_COMPENDIUMS, { configured: true, selected: compendiums }));
  }
  await Promise.all(settingWrites);
  runtime.spellPackCache = null;
  return true;
}

function configurationServices() {
  return {
    load: loadConfigurationData,
    save: saveConfigurationData,
    reset: () => resetSettings({ notify: false })
  };
}

async function openConfiguration() {
  if (!game.user?.isGM) return ui.notifications.warn("Only a GM can configure EasyTraps.");
  return openEasyTrapsConfiguration(configurationServices());
}

async function resetSettings({ notify = true } = {}) {
  if (!game.user?.isGM) return ui.notifications.warn("Only a GM can restore settings.");
  await Promise.all([
    game.settings.set(MODULE_ID, SETTINGS.SPELL_COMPENDIUMS, { configured: false, selected: [] }),
    game.settings.set(MODULE_ID, SETTINGS.LAST_SPELL_SAVE_DC, DEFAULT_SPELL_SAVE_DC),
    game.settings.set(MODULE_ID, SETTINGS.LAST_SPELL_ATTACK_BONUS, DEFAULT_SPELL_ATTACK_BONUS),
    game.settings.set(MODULE_ID, SETTINGS.DEFAULT_PAUSE_ON_TRIGGER, DEFAULT_PAUSE_ON_TRIGGER),
    game.settings.set(MODULE_ID, SETTINGS.DEFAULT_DISARM_AFTER_TRIGGER, DEFAULT_DISARM_AFTER_TRIGGER),
    game.settings.set(MODULE_ID, SETTINGS.DISCOVERY_DEFAULTS, foundry.utils.deepClone(DEFAULT_DISCOVERY_CONFIG)),
    game.settings.set(MODULE_ID, SETTINGS.TRIGGER_TEXTURE, DEFAULT_TRIGGER_TEXTURE),
    game.settings.set(MODULE_ID, SETTINGS.ORIGIN_TEXTURE, DEFAULT_ORIGIN_TEXTURE)
  ]);
  await restoreDefaultFavoriteSpells();
  runtime.spellPackCache = null;
  if (notify) ui.notifications.info("Factory defaults restored.");
  return true;
}

function registerWithEasyModules() {
  const hub = game.easyModules;
  if (typeof hub?.register !== "function") return false;
  hub.register({
    id: MODULE_ID,
    moduleId: MODULE_ID,
    moduleIds: [MODULE_ID],
    globalApis: ["easyTraps"],
    title: "EasyTraps",
    description: "Create Spell Traps and Alarm Traps with Tile, Door, and Item Pile trigger sources.",
    actionLabel: "Create Spell Trap",
    configLabel: "Configure",
    resetLabel: "Restore Defaults",
    iconClass: "fas fa-dungeon",
    status: "available",
    order: 30,
    onClick: openWizard,
    onConfigure: openConfiguration,
    onReset: resetSettings
  });
  return true;
}


function registerSceneControlButtons(controls) {
  if (!game.user?.isGM || !controls?.tiles?.tools) return;
  controls.tiles.tools.easyTrapsManager = {
    name: "easyTrapsManager",
    title: "EasyTraps Scene Manager",
    icon: "fa-solid fa-dungeon",
    order: Object.keys(controls.tiles.tools).length,
    button: true,
    visible: true,
    onChange: () => openSceneTrapManager()
  };
}

function sceneTrapDocuments(scene = canvas.scene) {
  if (!scene?.tiles) return [];
  return Array.from(scene.tiles)
    .filter(tile => Boolean(trapData(tile)))
    .sort((a, b) => {
      const armedA = trapData(a)?.armed !== false ? 0 : 1;
      const armedB = trapData(b)?.armed !== false ? 0 : 1;
      return armedA - armedB || String(a.name ?? "").localeCompare(String(b.name ?? ""));
    });
}

function trapArmBlockReason(tile, trap = trapData(tile)) {
  if (!tile || !trap) return "The trap no longer exists.";
  if (trap.requiresReconfiguration) return "This legacy trap must be recreated before it can be rearmed.";
  if (isExternalTriggerType(trap.triggerType) && !linkedSourceDocumentForTrap(tile, trap)) {
    return `The linked ${triggerTypeLabel(trap.triggerType)} source is missing.`;
  }
  if (normalizeOriginMode(trap.originMode) === ORIGIN_MODES.SEPARATE_TILE
      && !resolveOriginTile(tile, trap, ORIGIN_MODES.SEPARATE_TILE)) {
    return "The linked origin Tile is missing.";
  }
  return null;
}

function trapCanArm(tile, trap = trapData(tile)) {
  return trapArmBlockReason(tile, trap) == null;
}

function trapIsDiscovered(tile, trap = trapData(tile)) {
  return trapDiscoveryState(tile, trap);
}

async function setTrapDiscovered(tile, discovered) {
  const trap = trapData(tile);
  if (!tile || !trap) return false;
  const next = Boolean(discovered);
  const triggerType = normalizeTriggerType(trap.triggerType);
  const update = {
    [`flags.${MODULE_ID}.discovered`]: next,
    [`flags.${MODULE_ID}.schema`]: TRIGGER_SCHEMA,
    [`flags.${MODULE_ID}.version`]: VERSION
  };
  // Legacy/ordinary Tile triggers continue using Foundry visibility as their
  // visible state. External sources (Door / Item Pile) keep their controller
  // Tile permanently hidden and store discovery explicitly.
  if (triggerType === TRIGGER_TYPES.TILE) update.hidden = !next;
  else update.hidden = true;
  await tile.update(update, { easyTrapsDiscovery: true });
  refreshTriggerOverlays();
  refreshAreaOverlays();
  refreshOpenSceneTrapManager();
  refreshPlayerTrapInteractionState();
  return next;
}

async function applyAdvancedSettingsToAllTraps(value, meta = {}, scene = canvas.scene) {
  if (!game.user?.isGM || !scene) return false;
  const normalized = normalizeDiscoveryConfig(value);
  const pauseOnTrigger = meta.pauseOnTrigger === true;
  const traps = sceneTrapDocuments(scene);
  const updates = traps.map(tile => ({
    _id: tile.id,
    [`flags.${MODULE_ID}.discovery`]: foundry.utils.deepClone(normalized),
    [`flags.${MODULE_ID}.pauseOnTrigger`]: pauseOnTrigger,
    [`flags.${MODULE_ID}.schema`]: TRIGGER_SCHEMA,
    [`flags.${MODULE_ID}.version`]: VERSION
  }));

  const tasks = [
    game.settings.set(MODULE_ID, SETTINGS.DISCOVERY_DEFAULTS, foundry.utils.deepClone(normalized)),
    game.settings.set(MODULE_ID, SETTINGS.DEFAULT_PAUSE_ON_TRIGGER, pauseOnTrigger)
  ];
  if (updates.length) tasks.unshift(scene.updateEmbeddedDocuments("Tile", updates));
  await Promise.all(tasks);
  refreshOpenSceneTrapManager();
  ui.notifications.info(`Advanced settings applied to ${traps.length} trap${traps.length === 1 ? "" : "s"} and saved as the defaults for new traps.`);
  return { count: traps.length };
}

function disarmHistoryView(trap) {
  const history = normalizeDisarmAttempts(trap?.disarmAttempts);
  return Object.entries(history)
    .map(([actorId, record]) => {
      const worldActor = game.actors?.get?.(actorId);
      const sceneToken = Array.from(canvas?.scene?.tokens ?? []).find(token => String(token?.actor?.id ?? token?.actorId ?? "") === String(actorId));
      const actorName = worldActor?.name ?? sceneToken?.actor?.name ?? `Actor ${actorId.slice(0, 6)}`;
      return {
        actorId,
        actorName,
        count: record.count,
        total: record.lastTotal,
        naturalD20: record.lastNatural,
        success: record.lastSuccess,
        triggered: record.lastTriggered,
        status: record.lastSuccess ? "Success" : record.lastTriggered ? "Triggered" : "Failed"
      };
    })
    .sort((a, b) => a.actorName.localeCompare(b.actorName));
}

async function openAdvancedSettingsForTile(tile) {
  const trap = trapData(tile);
  if (!tile || !trap) return null;
  const displayName = trapDisplayName(trap, tile);
  return openTrapAdvancedSettings({
    value: normalizeDiscoveryConfig(trap.discovery),
    title: `Advanced — ${displayName}`,
    subtitle: isAlarmTrap(trap) ? "Alarm trap" : "Spell trap",
    pauseOnTrigger: trap.pauseOnTrigger === true,
    normalize: normalizeDiscoveryConfig,
    resolveItem: resolveItemReference,
    history: disarmHistoryView(trap),
    onClearHistory: async () => {
      await tile.update({ [`flags.${MODULE_ID}.-=disarmAttempts`]: null });
      refreshOpenSceneTrapManager();
      ui.notifications.info(`${displayName} disarm attempt history cleared.`);
    },
    onSave: async (value, meta = {}) => {
      const update = { [`flags.${MODULE_ID}.discovery`]: normalizeDiscoveryConfig(value) };
      if (typeof meta.pauseOnTrigger === "boolean") update[`flags.${MODULE_ID}.pauseOnTrigger`] = meta.pauseOnTrigger;
      await tile.update(update);
      refreshOpenSceneTrapManager();
      ui.notifications.info(`${displayName} advanced settings saved.`);
    },
    // Apply every editable setting on this page. Attempt history is state, not
    // configuration, so it is deliberately never copied between traps.
    onApplyAll: async (value, meta) => applyAdvancedSettingsToAllTraps(value, meta)
  });
}

function updateWizardAdvancedSummary(form) {
  const value = normalizeDiscoveryConfig(form?._easyTrapsDiscovery ?? getDiscoveryDefaults());
  const summary = form?.querySelector?.("[data-wizard-advanced-summary]");
  if (summary) summary.textContent = discoverySummary(value);
  const button = form?.querySelector?.("[data-wizard-action='advanced']");
  button?.classList?.toggle("is-enabled", value.enabled);
}

function openAdvancedSettingsForWizard(form) {
  const value = normalizeDiscoveryConfig(form?._easyTrapsDiscovery ?? getDiscoveryDefaults());
  return openTrapAdvancedSettings({
    value,
    title: "Advanced Trap Settings",
    subtitle: "New trap",
    normalize: normalizeDiscoveryConfig,
    resolveItem: resolveItemReference,
    onSave: async next => {
      form._easyTrapsDiscovery = normalizeDiscoveryConfig(next);
      updateWizardAdvancedSummary(form);
    }
  });
}

function templateBindingSummary(trap) {
  if (trap?.selectionZone) return "Custom creature target zone";
  const bindings = new Set((Array.isArray(trap?.templates) ? trap.templates : []).map(template => template?.binding).filter(Boolean));
  if (bindings.has(TEMPLATE_BINDINGS.SCENE_FIXED) && bindings.has(TEMPLATE_BINDINGS.ORIGIN_LINKED)) return "Mixed saved areas";
  if (bindings.has(TEMPLATE_BINDINGS.SCENE_FIXED)) return "Fixed spell area";
  if (bindings.has(TEMPLATE_BINDINGS.ORIGIN_LINKED)) return "Area linked to origin";
  return normalizeAreaMode(trap?.areaMode) === AREA_MODES.ON_TRIGGER ? "Area placed on trigger" : "No saved area";
}

function buildSceneTrapManagerInner(scene = canvas.scene) {
  const traps = sceneTrapDocuments(scene);
  const armedCount = traps.filter(tile => trapData(tile)?.armed !== false && !trapData(tile)?.requiresReconfiguration).length;
  const disarmedCount = traps.length - armedCount;
  const discoveredCount = traps.filter(tile => trapIsDiscovered(tile, trapData(tile))).length;
  const hiddenCount = traps.length - discoveredCount;
  const armableCount = traps.filter(tile => trapData(tile)?.armed === false && trapCanArm(tile, trapData(tile))).length;
  const spellCount = traps.filter(tile => !isAlarmTrap(trapData(tile))).length;
  const alarmCount = traps.length - spellCount;

  const rows = traps.map(tile => {
    const trap = trapData(tile);
    const alarmTrap = isAlarmTrap(trap);
    const type = alarmTrap ? "alarm" : "spell";
    const displayName = trapDisplayName(trap, tile);
    const needsReconfiguration = Boolean(trap?.requiresReconfiguration);
    const armed = trap?.armed !== false && !needsReconfiguration;
    const discovered = trapIsDiscovered(tile, trap);
    const canArm = trapCanArm(tile, trap);
    const origin = originModeLabel(trap?.originMode).replace(/^origin:\s*/i, "");
    const triggerType = normalizeTriggerType(trap?.triggerType);
    const size = triggerType === TRIGGER_TYPES.TILE
      ? `${Number(trap?.triggerWidth) || 1}×${Number(trap?.triggerHeight) || 1}`
      : triggerTypeLabel(triggerType);
    const pause = trap?.pauseOnTrigger ? "Yes" : "No";
    const oneShot = trap?.disarmAfterTrigger !== false ? "Yes" : "No";
    const discovery = normalizeDiscoveryConfig(trap?.discovery);
    const discoveryEnabled = discovery.enabled;
    const detection = `${detectionSkillLabel(discovery.detection.skill)} DC ${discovery.detection.dc}`;
    const disarmRule = `Sleight of Hand DC ${discovery.disarm.dc}`;
    const icon = alarmTrap
      ? '<i class="fa-solid fa-bell" aria-hidden="true"></i>'
      : `<img src="${escapeHtml(trapDisplayImage(trap))}" alt="${escapeHtml(displayName)}">`;
    const chips = alarmTrap
      ? (() => {
          const config = normalizeAlarmConfig(trap.alarm);
          const audibility = config.audibility.mode === ALARM_AUDIBILITY_MODES.SPATIAL
            ? `${alarmAudibilityLabel(config.audibility.mode)} · ${config.audibility.radius} ${sceneDistanceUnits()}`
            : alarmAudibilityLabel(config.audibility.mode);
          return `<span class="et-stat-chip et-level-chip"><i class="fa-solid fa-volume-high"></i><strong>${escapeHtml(alarmSoundLabel(config))}</strong></span>
            <span class="et-stat-chip"><i class="fa-solid fa-ear-listen"></i><strong>${escapeHtml(audibility)}</strong></span>
            <span class="et-stat-chip"><i class="fa-solid fa-gauge"></i><strong>${Math.round(config.sound.volume * 100)}%</strong></span>`;
        })()
      : `<span class="et-stat-chip et-level-chip"><i class="fa-solid fa-arrow-up-right-dots"></i><strong>${escapeHtml(trapExecutionLevelLabel(trap))}</strong></span>
          <span class="et-stat-chip"><b>DC</b><strong>${normalizeSpellSaveDc(trap?.spellSaveDc)}</strong></span>
          <span class="et-stat-chip"><i class="fa-solid fa-crosshairs"></i><strong>${escapeHtml(formatSignedModifier(trap?.spellAttackBonus))}</strong></span>`;
    const details = alarmTrap
      ? (() => {
          const config = normalizeAlarmConfig(trap.alarm);
          const audibility = config.audibility.mode === ALARM_AUDIBILITY_MODES.SPATIAL
            ? `${alarmAudibilityLabel(config.audibility.mode)} · ${config.audibility.radius} ${sceneDistanceUnits()}${config.audibility.walls ? " · walls" : ""}`
            : alarmAudibilityLabel(config.audibility.mode);
          const originDetail = config.audibility.mode === ALARM_AUDIBILITY_MODES.SPATIAL
            ? `<span><small>Origin</small><b>${escapeHtml(origin)}</b></span>`
            : "";
          return `<span><small>Payload</small><b>Alarm</b></span>
            <span><small>Trigger</small><b>${escapeHtml(size)}${triggerType === TRIGGER_TYPES.TILE ? " cells" : ""}</b></span>
            ${originDetail}
            <span><small>Sound</small><b>${escapeHtml(alarmSoundLabel(config))}</b></span>
            <span><small>Audibility</small><b>${escapeHtml(audibility)}</b></span>
            <span><small>Playback</small><b>${escapeHtml(alarmPlaybackLabel(config))}</b></span>
            <span><small>Chat</small><b>${escapeHtml(alarmChatLabel(config.chat.mode))}</b></span>
            <span><small>Visibility</small><b>${discovered ? "Discovered by players" : "Hidden from players"}</b></span>
            <span><small>Pause</small><b>${pause}</b></span>
            <span><small>Disarm after trigger</small><b>${oneShot}</b></span>
            ${trap?.disarmAfterTrigger === false ? `<span><small>Repeat cooldown</small><b>${config.cooldownSeconds}s</b></span>` : ""}
            <span><small>Discovery</small><b>${discoveryEnabled ? escapeHtml(detection) : "Disabled"}</b></span>
            <span><small>Disarm check</small><b>${discoveryEnabled ? escapeHtml(disarmRule) : "Disabled"}</b></span>`;
        })()
      : (() => {
          const target = targetModeLabel(trap?.targetMode);
          const area = templateBindingSummary(trap);
          const activity = String(trap?.activityLabel ?? trap?.activityType ?? "Activity");
          return `<span><small>Activity</small><b>${escapeHtml(activity)}</b></span>
            <span><small>Trigger</small><b>${escapeHtml(size)}${triggerType === TRIGGER_TYPES.TILE ? " cells" : ""}</b></span>
            <span><small>Origin</small><b>${escapeHtml(origin)}</b></span>
            <span><small>Targets</small><b>${escapeHtml(target)}</b></span>
            <span><small>Area</small><b>${escapeHtml(area)}</b></span>
            <span><small>Visibility</small><b>${discovered ? "Discovered by players" : "Hidden from players"}</b></span>
            <span><small>Pause</small><b>${pause}</b></span>
            <span><small>Disarm after trigger</small><b>${oneShot}</b></span>
            <span><small>Discovery</small><b>${discoveryEnabled ? escapeHtml(detection) : "Disabled"}</b></span>
            <span><small>Disarm check</small><b>${discoveryEnabled ? escapeHtml(disarmRule) : "Disabled"}</b></span>`;
        })();

    return `<article class="et-manager-row ${armed ? "is-armed" : "is-disarmed"} ${discovered ? "is-discovered" : "is-hidden"} is-${type}" data-trap-id="${escapeHtml(tile.id)}" data-trap-type="${type}">
      <div class="et-manager-main">
      <div class="et-manager-icon ${alarmTrap ? "is-alarm" : "is-spell"}">${icon}</div>
      <div class="et-manager-copy">
        <div class="et-manager-title">
          <b>${escapeHtml(displayName)}</b>
          <span class="et-manager-badges">
            <span class="et-manager-type is-${type}">${alarmTrap ? "Alarm" : "Spell"}</span>
            <span class="et-manager-status ${needsReconfiguration ? "is-invalid" : armed ? "is-armed" : "is-disarmed"}">${needsReconfiguration ? "Recreate" : armed ? "Armed" : "Disarmed"}</span>
            <span class="et-manager-visibility ${discovered ? "is-discovered" : "is-hidden"}"><i class="fa-solid ${discovered ? "fa-eye" : "fa-eye-slash"}"></i>${discovered ? "Discovered" : "Hidden"}</span>
          </span>
        </div>
        <div class="et-manager-chips">${chips}</div>
        <div class="et-manager-secondary">
          <button type="button" class="et-manager-more" data-trap-action="details" data-trap-id="${escapeHtml(tile.id)}" aria-expanded="false"><i class="fa-solid fa-chevron-right"></i><span>More information</span></button>
          <button type="button" class="et-manager-advanced ${discoveryEnabled ? "is-enabled" : ""}" data-trap-action="advanced" data-trap-id="${escapeHtml(tile.id)}" title="Discovery & disarming settings"><i class="fa-solid fa-sliders"></i><span>Advanced</span></button>
        </div>
      </div>
      <div class="et-manager-actions">
        <button type="button" data-trap-action="locate" data-trap-id="${escapeHtml(tile.id)}" title="Locate and select this trap"><i class="fa-solid fa-location-crosshairs"></i><span>Locate</span></button>
        <button type="button" data-trap-action="edit" data-trap-id="${escapeHtml(tile.id)}" title="Edit safe trap settings"><i class="fa-solid fa-pen-to-square"></i><span>Edit</span></button>
        <button type="button" data-trap-action="visibility" data-trap-id="${escapeHtml(tile.id)}" class="et-visibility-action ${discovered ? "is-discovered" : "is-hidden"}" title="${discovered ? "Hide this trap from players" : "Reveal this trap to players"}"><i class="fa-solid ${discovered ? "fa-eye-slash" : "fa-eye"}"></i><span>${discovered ? "Hide" : "Reveal"}</span></button>
        <button type="button" data-trap-action="toggle" data-trap-id="${escapeHtml(tile.id)}" class="${armed ? "et-danger" : "et-primary"}" ${!armed && !canArm ? "disabled" : ""} title="${armed ? "Disarm this trap" : canArm ? "Rearm this trap" : escapeHtml(trapArmBlockReason(tile, trap) ?? "This trap cannot be rearmed.")}"><i class="fa-solid ${armed ? "fa-power-off" : "fa-rotate-right"}"></i><span>${armed ? "Disarm" : "Rearm"}</span></button>
      </div>
      </div>
      <div class="et-manager-details-panel" data-trap-details="${escapeHtml(tile.id)}" hidden>${details}</div>
    </article>`;
  }).join("");

  const createButtons = `<button type="button" data-manager-action="create-spell" class="et-primary"><i class="fa-solid fa-wand-magic-sparkles"></i> Spell trap</button><button type="button" data-manager-action="create-alarm"><i class="fa-solid fa-bell"></i> Alarm trap</button>`;

  return `<header class="et-manager-header">
    <div><small>Current scene</small><b>${escapeHtml(scene?.name ?? "Scene")}</b><span>${traps.length} trap${traps.length === 1 ? "" : "s"} · ${armedCount} armed · ${disarmedCount} disarmed · ${hiddenCount} hidden · ${discoveredCount} discovered</span></div>
    <div class="et-manager-header-actions"><button type="button" data-manager-action="refresh" title="Refresh"><i class="fa-solid fa-arrows-rotate"></i></button>${createButtons}</div>
  </header>
  <div class="et-manager-filterbar" data-manager-filterbar>
    <button type="button" data-manager-action="filter" data-trap-filter="all" class="is-active">All <em>${traps.length}</em></button>
    <button type="button" data-manager-action="filter" data-trap-filter="spell"><i class="fa-solid fa-wand-magic-sparkles"></i> Spell <em>${spellCount}</em></button>
    <button type="button" data-manager-action="filter" data-trap-filter="alarm"><i class="fa-solid fa-bell"></i> Alarm <em>${alarmCount}</em></button>
  </div>
  <div class="et-manager-bulkbar">
    <span><i class="fa-solid fa-layer-group"></i><b>Scene controls</b><small>Arm or disarm every valid trap in this scene.</small></span>
    <div>
      <button type="button" data-manager-action="arm-all" class="et-bulk-arm" ${armableCount ? "" : "disabled"}><i class="fa-solid fa-rotate-right"></i><span>Rearm all</span><em>${armableCount}</em></button>
      <button type="button" data-manager-action="disarm-all" class="et-bulk-disarm" ${armedCount ? "" : "disabled"}><i class="fa-solid fa-power-off"></i><span>Disarm all</span><em>${armedCount}</em></button>
    </div>
  </div>
  <div class="et-manager-list">${rows || `<div class="et-manager-empty"><i class="fa-solid fa-dungeon"></i><b>No traps in this scene</b><small>Create a Spell Trap or Alarm Trap to begin managing it here.</small><div class="et-manager-empty-actions">${createButtons}</div></div>`}</div>
  <footer class="et-manager-footer"><button type="button" data-manager-action="close"><i class="fa-solid fa-xmark"></i> Close</button></footer>`;
}
function closeSceneManagerForCanvasTearDown() {
  const manager = runtime.sceneManager;
  runtime.sceneManager = null;
  if (!manager?.dialog?.close) return;
  try {
    const result = manager.dialog.close();
    if (result?.catch) result.catch(() => {});
  } catch (_error) { /* the dialog may already be closing with the old canvas */ }
}

function buildSceneTrapManagerContent(scene = canvas.scene) {
  return `<form class="easy-traps-manager"><div data-manager-content>${buildSceneTrapManagerInner(scene)}</div></form>`;
}

function refreshOpenSceneTrapManager() {
  const manager = runtime.sceneManager;
  if (!manager?.root?.isConnected || manager.sceneId !== canvas.scene?.id) return;
  const filter = manager.root.dataset.trapFilter || "all";
  const content = manager.root.querySelector("[data-manager-content]");
  if (content) content.innerHTML = buildSceneTrapManagerInner(canvas.scene);
  applySceneManagerFilter(manager.root, filter);
}

function applySceneManagerFilter(form, filter = "all") {
  if (!form) return;
  const normalized = ["spell", "alarm"].includes(filter) ? filter : "all";
  form.dataset.trapFilter = normalized;
  for (const button of form.querySelectorAll?.("[data-manager-action='filter']") ?? []) {
    button.classList.toggle("is-active", button.dataset.trapFilter === normalized);
  }
  for (const row of form.querySelectorAll?.("[data-trap-type]") ?? []) {
    row.hidden = normalized !== "all" && row.dataset.trapType !== normalized;
  }
}

async function locateSceneTrap(tile) {
  if (!tile || tile.parent?.id !== canvas.scene?.id) return;
  try { await canvas.tiles?.activate?.(); } catch (_error) { /* layer activation is best effort */ }
  const point = tileCenterPoint(tile);
  const scale = Math.max(0.8, Math.min(1.35, Number(canvas.stage?.scale?.x) || 1));
  if (canvas.animatePan instanceof Function) await canvas.animatePan({ x: point.x, y: point.y, scale, duration: CANVAS_PAN_DURATION_MS });
  else canvas.pan?.({ x: point.x, y: point.y, scale });
  tile.object?.control?.({ releaseOthers: true });
  refreshTriggerOverlays();
  refreshAreaOverlays();
}

async function setSceneTrapsEnabled(tiles, enabled) {
  const scene = canvas.scene;
  const documents = (tiles ?? []).filter(tile => tile?.parent?.id === scene?.id && trapData(tile));
  if (!scene || !documents.length) return 0;
  const updates = documents.map(tile => ({
    _id: tile.id,
    [`flags.${MODULE_ID}.armed`]: Boolean(enabled),
    ...(enabled ? { [`flags.${MODULE_ID}.-=disarmAttempts`]: null } : {}),
    "flags.monks-active-tiles.active": mattActiveForTrap(trapData(tile), enabled)
  }));
  await scene.updateEmbeddedDocuments("Tile", updates);
  refreshTriggerOverlays();
  refreshAreaOverlays();
  return updates.length;
}

function activateSceneTrapManager(root, dialog) {
  const form = root?.matches?.("form.easy-traps-manager") ? root : root?.querySelector?.("form.easy-traps-manager");
  if (!form || form.dataset.activated === "true") return;
  form.dataset.activated = "true";
  runtime.sceneManager = { dialog, root: form, sceneId: canvas.scene?.id };
  form.addEventListener("submit", event => event.preventDefault());
  form.addEventListener("click", async event => {
    const managerAction = event.target?.closest?.("[data-manager-action]")?.dataset.managerAction;
    if (managerAction === "close") {
      await dialog.close();
      return;
    }
    if (managerAction === "refresh") {
      refreshOpenSceneTrapManager();
      return;
    }
    if (managerAction === "filter") {
      applySceneManagerFilter(form, event.target?.closest?.("[data-trap-filter]")?.dataset.trapFilter);
      return;
    }
    if (managerAction === "arm-all") {
      const all = sceneTrapDocuments(canvas.scene);
      const candidates = all.filter(tile => trapData(tile)?.armed === false && trapCanArm(tile, trapData(tile)));
      const skipped = all.filter(tile => trapData(tile)?.armed === false && !trapCanArm(tile, trapData(tile))).length;
      const count = await setSceneTrapsEnabled(candidates, true);
      if (count || skipped) ui.notifications.info(`${count} trap${count === 1 ? "" : "s"} rearmed${skipped ? ` · ${skipped} skipped` : ""}.`);
      refreshOpenSceneTrapManager();
      return;
    }
    if (managerAction === "disarm-all") {
      const candidates = sceneTrapDocuments(canvas.scene).filter(tile => trapData(tile)?.armed !== false);
      const count = await setSceneTrapsEnabled(candidates, false);
      if (count) ui.notifications.info(`${count} trap${count === 1 ? "" : "s"} disarmed.`);
      refreshOpenSceneTrapManager();
      return;
    }
    if (managerAction === "create-spell") {
      await dialog.close();
      await openWizard();
      return;
    }
    if (managerAction === "create-alarm") {
      await dialog.close();
      await openAlarmWizard();
      return;
    }
    const actionButton = event.target?.closest?.("[data-trap-action]");
    if (!actionButton) return;
    if (actionButton.dataset.trapAction === "details") {
      const row = actionButton.closest?.(".et-manager-row");
      const panel = row?.querySelector?.("[data-trap-details]");
      if (!panel) return;
      const open = panel.hidden;
      panel.hidden = !open;
      actionButton.setAttribute("aria-expanded", String(open));
      return;
    }
    const tile = canvas.scene?.tiles?.get?.(actionButton.dataset.trapId);
    const trap = trapData(tile);
    if (!tile || !trap) {
      ui.notifications.warn("That trap could not be found in the current scene.");
      refreshOpenSceneTrapManager();
      return;
    }
    if (actionButton.dataset.trapAction === "locate") {
      await locateSceneTrap(tile);
      return;
    }
    if (actionButton.dataset.trapAction === "edit") {
      await openTrapQuickEditor(tile);
      refreshOpenSceneTrapManager();
      return;
    }
    if (actionButton.dataset.trapAction === "advanced") {
      openAdvancedSettingsForTile(tile);
      return;
    }
    if (actionButton.dataset.trapAction === "visibility") {
      const discovered = !trapIsDiscovered(tile, trap);
      await setTrapDiscovered(tile, discovered);
      ui.notifications.info(`${trapDisplayName(trap, tile)} ${discovered ? "revealed to players" : "hidden from players"}.`);
      return;
    }
    if (actionButton.dataset.trapAction === "toggle") {
      const nextArmed = trap.armed === false;
      if (trap.requiresReconfiguration) return ui.notifications.warn("This legacy trap cannot be rearmed because its spell is not compatible with the selected Activity workflow. Recreate it.");
      if (nextArmed && !trapCanArm(tile, trap)) return ui.notifications.warn(trapArmBlockReason(tile, trap) ?? "This trap cannot be rearmed.");
      await setTrapEnabled(tile, nextArmed);
      ui.notifications.info(`${trapDisplayName(trap, tile)} ${nextArmed ? "rearmed" : "disarmed"}.`);
      refreshOpenSceneTrapManager();
    }
  });
}


async function openAlarmTrapQuickEditor(tile, trap = trapData(tile)) {
  if (!tile || !trap || !isAlarmTrap(trap) || !globalThis.Dialog) return null;
  const config = normalizeAlarmConfig(trap.alarm);
  const customSound = config.sound.custom && config.sound.path !== DEFAULT_ALARM_SOUND;
  const canArm = trapCanArm(tile, trap);
  const content = `<form class="easy-traps-context et-trap-editor easy-traps-alarm-editor">
    <div class="et-editor-heading et-alarm-editor-heading"><span class="et-editor-alarm-icon"><i class="fa-solid fa-bell"></i></span><span><small>Editing trap</small><b>${escapeHtml(trapDisplayName(trap, tile))}</b><em>${escapeHtml(alarmSoundLabel(config))} · ${escapeHtml(alarmAudibilityLabel(config.audibility.mode))}</em></span></div>

    <fieldset class="et-alarm-fieldset">
      <legend>Alarm sound</legend>
      <div class="et-alarm-choice-grid">
        <label class="et-origin-option"><input type="radio" name="alarmSoundMode" value="default" ${customSound ? "" : "checked"}><span><i class="fa-solid fa-clock"></i><b>Clock Alarm</b><small>Bundled EasyTraps sound.</small></span></label>
        <label class="et-origin-option"><input type="radio" name="alarmSoundMode" value="custom" ${customSound ? "checked" : ""}><span><i class="fa-solid fa-file-audio"></i><b>Custom Sound</b><small>Use any supported Foundry audio path.</small></span></label>
      </div>
      <div class="et-alarm-file-row" data-alarm-custom-row ${customSound ? "" : "hidden"}>
        <label><span>Custom audio path</span><div class="et-alarm-file-control"><input type="text" name="alarmSoundPath" value="${escapeHtml(customSound ? config.sound.path : "")}" placeholder="sounds/alarm.ogg"><button type="button" data-alarm-action="browse" title="Browse audio"><i class="fa-solid fa-folder-open"></i></button></div></label>
      </div>
      <div class="et-alarm-audio-controls">
        <label><span>Volume</span><div class="et-number-suffix"><input type="number" name="alarmVolume" min="0" max="1" step="0.05" value="${config.sound.volume}"><b>0–1</b></div></label>
        <button type="button" class="et-alarm-preview" data-alarm-action="preview"><i class="fa-solid fa-play"></i><span>Preview locally</span></button>
      </div>
    </fieldset>

    <fieldset class="et-alarm-fieldset">
      <legend>Who can hear it?</legend>
      <div class="et-alarm-choice-grid et-alarm-three-grid">
        <label class="et-origin-option"><input type="radio" name="alarmAudibility" value="${ALARM_AUDIBILITY_MODES.SPATIAL}" ${config.audibility.mode === ALARM_AUDIBILITY_MODES.SPATIAL ? "checked" : ""}><span><i class="fa-solid fa-volume-high"></i><b>Spatial</b><small>Radius, distance fade, and walls.</small></span></label>
        <label class="et-origin-option"><input type="radio" name="alarmAudibility" value="${ALARM_AUDIBILITY_MODES.SCENE}" ${config.audibility.mode === ALARM_AUDIBILITY_MODES.SCENE ? "checked" : ""}><span><i class="fa-solid fa-users"></i><b>Entire Scene</b><small>Everyone viewing this Scene.</small></span></label>
        <label class="et-origin-option"><input type="radio" name="alarmAudibility" value="${ALARM_AUDIBILITY_MODES.GM_ONLY}" ${config.audibility.mode === ALARM_AUDIBILITY_MODES.GM_ONLY ? "checked" : ""}><span><i class="fa-solid fa-user-secret"></i><b>GM Only</b><small>Silent alarm for players.</small></span></label>
      </div>
      <div class="et-alarm-spatial-options" data-alarm-spatial-options ${config.audibility.mode === ALARM_AUDIBILITY_MODES.SPATIAL ? "" : "hidden"}>
        <div class="et-trigger-size-grid"><label><span>Hearing radius</span><div class="et-number-suffix"><input type="number" name="alarmRadius" min="1" max="9999" step="1" value="${config.audibility.radius}"><b>${escapeHtml(sceneDistanceUnits())}</b></div></label></div>
        <div class="et-activation-option-grid">
          <label class="et-pause-option"><input type="checkbox" name="alarmEasing" ${config.audibility.easing ? "checked" : ""}><span><i class="fa-solid fa-wave-square"></i><b>Fade with distance</b><small>Reduce volume toward the edge.</small></span></label>
          <label class="et-pause-option"><input type="checkbox" name="alarmWalls" ${config.audibility.walls ? "checked" : ""}><span><i class="fa-solid fa-wall-brick"></i><b>Constrained by walls</b><small>Use Foundry sound propagation.</small></span></label>
          <label class="et-pause-option"><input type="checkbox" name="alarmGmAlways" ${config.audibility.gmAlways ? "checked" : ""}><span><i class="fa-solid fa-headphones"></i><b>GM always hears</b><small>Ignore listener position for GMs.</small></span></label>
        </div>
      </div>
    </fieldset>

    <fieldset class="et-alarm-fieldset">
      <legend>Playback & notification</legend>
      <div class="et-alarm-choice-grid">
        <label class="et-origin-option"><input type="radio" name="alarmPlayback" value="${ALARM_PLAYBACK_MODES.ONCE}" ${config.playback.mode === ALARM_PLAYBACK_MODES.ONCE ? "checked" : ""}><span><i class="fa-solid fa-play"></i><b>Play once</b><small>Play one complete alarm sound.</small></span></label>
        <label class="et-origin-option"><input type="radio" name="alarmPlayback" value="${ALARM_PLAYBACK_MODES.SUSTAINED}" ${config.playback.mode === ALARM_PLAYBACK_MODES.SUSTAINED ? "checked" : ""}><span><i class="fa-solid fa-repeat"></i><b>Repeat for a Duration</b><small>Repeats until the configured duration expires.</small></span></label>
      </div>
      <div class="et-trigger-size-grid" data-alarm-duration-row ${config.playback.mode === ALARM_PLAYBACK_MODES.SUSTAINED ? "" : "hidden"}><label><span>Duration</span><div class="et-number-suffix"><input type="number" name="alarmDuration" min="1" max="300" step="1" value="${config.playback.duration}"><b>seconds</b></div></label></div>
      <div class="et-alarm-choice-grid et-alarm-three-grid et-alarm-chat-grid">
        <label class="et-origin-option"><input type="radio" name="alarmChat" value="${ALARM_CHAT_MODES.OFF}" ${config.chat.mode === ALARM_CHAT_MODES.OFF ? "checked" : ""}><span><i class="fa-solid fa-comment-slash"></i><b>Chat Off</b></span></label>
        <label class="et-origin-option"><input type="radio" name="alarmChat" value="${ALARM_CHAT_MODES.GM_ONLY}" ${config.chat.mode === ALARM_CHAT_MODES.GM_ONLY ? "checked" : ""}><span><i class="fa-solid fa-eye"></i><b>GM Only</b></span></label>
        <label class="et-origin-option"><input type="radio" name="alarmChat" value="${ALARM_CHAT_MODES.EVERYONE}" ${config.chat.mode === ALARM_CHAT_MODES.EVERYONE ? "checked" : ""}><span><i class="fa-solid fa-comments"></i><b>Everyone</b></span></label>
      </div>
    </fieldset>

    <div class="et-editor-toggles">
      <label><input type="checkbox" name="pauseOnTrigger" ${trap.pauseOnTrigger ? "checked" : ""}><span><i class="fa-solid fa-pause"></i><b>Pause when triggered</b><small>The GM resumes the game manually.</small></span></label>
      <label><input type="checkbox" name="disarmAfterTrigger" ${trap.disarmAfterTrigger !== false ? "checked" : ""}><span><i class="fa-solid fa-power-off"></i><b>Disarm after triggering</b><small>Disable this for a repeatable alarm.</small></span></label>
      <label><input type="checkbox" name="armed" ${trap.armed !== false && !trap.requiresReconfiguration ? "checked" : ""} ${trap.requiresReconfiguration || !canArm ? "disabled" : ""}><span><i class="fa-solid fa-shield-halved"></i><b>Armed</b><small>${trap.requiresReconfiguration ? "This trap must be recreated." : !canArm ? escapeHtml(trapArmBlockReason(tile, trap) ?? "This trap cannot be armed.") : "Ready to activate in the scene."}</small></span></label>
    </div>
    <div class="et-trigger-size-grid" data-alarm-cooldown-row ${trap.disarmAfterTrigger === false ? "" : "hidden"}><label><span>Repeat cooldown</span><div class="et-number-suffix"><input type="number" name="alarmCooldown" min="0" max="300" step="1" value="${config.cooldownSeconds}"><b>seconds</b></div></label></div>
  </form>`;

  const result = await new Promise(resolve => {
    let settled = false;
    const finish = value => { if (!settled) { settled = true; resolve(value ?? null); } };
    const dialog = new Dialog({
      title: `Edit trap — ${trapDisplayName(trap, tile)}`,
      content,
      buttons: {
        cancel: { label: "Cancel", callback: () => finish(null) },
        save: { icon: '<i class="fa-solid fa-floppy-disk"></i>', label: "Save changes", callback: html => {
          const root = html?.[0] ?? html;
          const custom = root?.querySelector?.('input[name="alarmSoundMode"]:checked')?.value === "custom";
          const rawPath = String(root?.querySelector?.('input[name="alarmSoundPath"]')?.value ?? "").trim();
          if (custom && !rawPath) {
            ui.notifications.warn("Choose a custom alarm sound file first.");
            return false;
          }
          const nextAlarm = readAlarmConfigFromForm(root);
          if (!hasSupportedAudioExtension(nextAlarm.sound.path)) {
            ui.notifications.warn("Choose a supported alarm audio file before saving.");
            return false;
          }
          finish({
            alarm: nextAlarm,
            pauseOnTrigger: root?.querySelector?.('input[name="pauseOnTrigger"]')?.checked === true,
            disarmAfterTrigger: root?.querySelector?.('input[name="disarmAfterTrigger"]')?.checked === true,
            armed: root?.querySelector?.('input[name="armed"]')?.checked === true
          });
        } }
      },
      default: "save",
      render: html => {
        const root = html?.[0] ?? html;
        updateAlarmWizardConditionalFields(root);
        root?.addEventListener?.("change", event => {
          if (event.target?.matches?.('input[name="alarmSoundMode"], input[name="alarmAudibility"], input[name="alarmPlayback"], input[name="disarmAfterTrigger"]')) {
            updateAlarmWizardConditionalFields(root);
          }
        });
        root?.addEventListener?.("click", async event => {
          const action = event.target?.closest?.("[data-alarm-action]")?.dataset.alarmAction;
          if (!action) return;
          event.preventDefault();
          if (action === "browse") await browseAlarmSound(root);
          else if (action === "preview") await previewAlarmFromForm(root);
        });
      },
      close: () => finish(null)
    }, { width: 700, resizable: true });
    dialog.render(true);
  });
  if (!result) return null;
  if (result.armed && !trapCanArm(tile, trap)) return ui.notifications.warn(trapArmBlockReason(tile, trap) ?? "This trap cannot be armed.");
  await tile.update({
    [`flags.${MODULE_ID}.alarm`]: normalizeAlarmConfig(result.alarm),
    [`flags.${MODULE_ID}.pauseOnTrigger`]: result.pauseOnTrigger,
    [`flags.${MODULE_ID}.disarmAfterTrigger`]: result.disarmAfterTrigger,
    [`flags.${MODULE_ID}.armed`]: result.armed,
    ...(result.armed && trap.armed === false ? { [`flags.${MODULE_ID}.-=disarmAttempts`]: null } : {}),
    "flags.monks-active-tiles.active": mattActiveForTrap(trap, result.armed)
  });
  await collapseNonSpatialAlarmOrigin(tile, { ...trap, alarm: result.alarm }, normalizeAlarmConfig(result.alarm));
  if (result.disarmAfterTrigger !== false) setAlarmCooldown(tile, 0);
  refreshTriggerOverlays();
  refreshAreaOverlays();
  ui.notifications.info(`${trapDisplayName(trap, tile)} updated.`);
  return result;
}

async function openTrapQuickEditor(tile) {
  const trap = trapData(tile);
  if (!tile || !trap || !globalThis.Dialog) return null;
  if (isAlarmTrap(trap)) return openAlarmTrapQuickEditor(tile, trap);
  let spell = null;
  try { spell = trap.spellUuid ? await fromUuid(trap.spellUuid) : null; }
  catch (_error) { /* the editor can still expose stored values */ }
  const baseLevel = normalizeSpellBaseLevel(spell?.system?.level ?? trap.castLevel);
  const isCantrip = baseLevel === 0;
  const selectedCastLevel = normalizeCastLevel(trap.castLevel, baseLevel);
  const selectedCantripCasterLevel = normalizeCantripCasterLevel(trap.cantripCasterLevel, 1);
  const activity = spell ? findActivity(spell, trap.activityId) : null;
  const activityName = String(trap.activityLabel ?? (activity ? activityLabel(activity) : trap.activityType ?? "Activity"));
  const canArm = trapCanArm(tile, trap);
  const content = `<form class="easy-traps-context et-trap-editor">
    <div class="et-editor-heading"><img src="${escapeHtml(spell?.img || DEFAULT_TRIGGER_TEXTURE)}" alt=""><span><small>Editing trap</small><b>${escapeHtml(trap.spellName ?? spell?.name ?? "Spell trap")}</b><em>${escapeHtml(activityName)}</em></span></div>
    <div class="et-editor-grid">
      <label><span>${isCantrip ? "Caster Level" : "Spell slot"}</span><div class="et-number-suffix ${isCantrip ? "is-no-suffix" : ""}"><select name="castLevel" ${!isCantrip && baseLevel >= 9 ? "disabled" : ""}>${isCantrip ? buildCantripCasterLevelOptions(selectedCantripCasterLevel) : buildCastLevelOptions(baseLevel, selectedCastLevel)}</select><b ${isCantrip ? "hidden" : ""}>slot</b></div>${isCantrip ? '<small class="et-level-hint">Determines cantrip scaling.</small>' : ""}</label>
      <label><span>Spell save DC</span><div class="et-number-suffix"><input type="number" name="spellSaveDc" min="1" max="99" step="1" value="${normalizeSpellSaveDc(trap.spellSaveDc)}"><b>DC</b></div></label>
      <label><span>Spell attack bonus</span><div class="et-number-suffix"><input type="text" inputmode="numeric" name="spellAttackBonus" value="${escapeHtml(formatSignedModifier(trap.spellAttackBonus))}"><b>to hit</b></div></label>
    </div>
    <div class="et-editor-toggles">
      <label><input type="checkbox" name="pauseOnTrigger" ${trap.pauseOnTrigger ? "checked" : ""}><span><i class="fa-solid fa-pause"></i><b>Pause when triggered</b><small>The GM resumes the game manually.</small></span></label>
      <label><input type="checkbox" name="disarmAfterTrigger" ${trap.disarmAfterTrigger !== false ? "checked" : ""}><span><i class="fa-solid fa-power-off"></i><b>Disarm after triggering</b><small>Disable this for a repeatable trap.</small></span></label>
      <label><input type="checkbox" name="armed" ${trap.armed !== false && !trap.requiresReconfiguration ? "checked" : ""} ${trap.requiresReconfiguration || !canArm ? "disabled" : ""}><span><i class="fa-solid fa-shield-halved"></i><b>Armed</b><small>${trap.requiresReconfiguration ? "This trap must be recreated." : !canArm ? escapeHtml(trapArmBlockReason(tile, trap) ?? "This trap cannot be armed.") : "Ready to activate in the scene."}</small></span></label>
    </div>
  </form>`;

  const result = await new Promise(resolve => {
    let settled = false;
    const finish = value => { if (!settled) { settled = true; resolve(value ?? null); } };
    const dialog = new Dialog({
      title: `Edit trap — ${trap.spellName ?? "Spell"}`,
      content,
      buttons: {
        cancel: { label: "Cancel", callback: () => finish(null) },
        save: { icon: '<i class="fa-solid fa-floppy-disk"></i>', label: "Save changes", callback: html => {
          const root = html?.[0] ?? html;
          const selectedLevelValue = root?.querySelector?.('select[name="castLevel"]')?.value;
          finish({
            castLevel: isCantrip ? 0 : normalizeCastLevel(selectedLevelValue ?? selectedCastLevel, baseLevel),
            cantripCasterLevel: isCantrip ? normalizeCantripCasterLevel(selectedLevelValue ?? selectedCantripCasterLevel, 1) : null,
            spellSaveDc: normalizeSpellSaveDc(root?.querySelector?.('input[name="spellSaveDc"]')?.value),
            spellAttackBonus: normalizeSpellAttackBonus(root?.querySelector?.('input[name="spellAttackBonus"]')?.value),
            pauseOnTrigger: root?.querySelector?.('input[name="pauseOnTrigger"]')?.checked === true,
            disarmAfterTrigger: root?.querySelector?.('input[name="disarmAfterTrigger"]')?.checked === true,
            armed: root?.querySelector?.('input[name="armed"]')?.checked === true
          });
        } }
      },
      default: "save",
      close: () => finish(null)
    }, { width: 560, resizable: true });
    dialog.render(true);
  });
  if (!result) return null;
  if (result.armed && !trapCanArm(tile, trap)) return ui.notifications.warn(trapArmBlockReason(tile, trap) ?? "This trap cannot be armed.");
  await tile.update({
    [`flags.${MODULE_ID}.castLevel`]: result.castLevel,
    [`flags.${MODULE_ID}.cantripCasterLevel`]: result.cantripCasterLevel,
    [`flags.${MODULE_ID}.scaling`]: isCantrip
      ? cantripScalingIncrease(result.cantripCasterLevel)
      : castScaling(result.castLevel, baseLevel),
    [`flags.${MODULE_ID}.spellSaveDc`]: result.spellSaveDc,
    [`flags.${MODULE_ID}.spellAttackBonus`]: result.spellAttackBonus,
    [`flags.${MODULE_ID}.pauseOnTrigger`]: result.pauseOnTrigger,
    [`flags.${MODULE_ID}.disarmAfterTrigger`]: result.disarmAfterTrigger,
    [`flags.${MODULE_ID}.armed`]: result.armed,
    ...(result.armed && trap.armed === false ? { [`flags.${MODULE_ID}.-=disarmAttempts`]: null } : {}),
    "flags.monks-active-tiles.active": mattActiveForTrap(trap, result.armed)
  });
  // Runtime spell copies are fingerprinted by source revision, Activity, save DC,
  // attack bonus, target capacity, and Scene units. Let ensureRuntimeSpell()
  // create a new compatible copy when needed so an older Item can remain valid
  // for concentration, effects, summons, macros, or chat references.
  refreshTriggerOverlays();
  refreshAreaOverlays();
  ui.notifications.info(`${trap.spellName ?? "Trap"} updated.`);
  return result;
}

async function openSceneTrapManager() {
  if (!game.user?.isGM) return ui.notifications.warn("Only a GM can manage traps.");
  if (!canvas.ready || !canvas.scene) return ui.notifications.warn("Open a scene before managing traps.");
  if (runtime.sceneManager?.dialog) {
    try { await runtime.sceneManager.dialog.close(); } catch (_error) { /* stale dialog */ }
    runtime.sceneManager = null;
  }
  if (!globalThis.Dialog) return ui.notifications.error("The scene manager could not open because the Foundry Dialog API is unavailable.");
  const dialog = new Dialog({
    title: "EasyTraps — Scene Manager",
    content: buildSceneTrapManagerContent(canvas.scene),
    buttons: {},
    render: html => {
      const root = html?.[0] ?? html;
      const appElement = dialog?.element?.[0] ?? root?.closest?.(".app, .application, .window-app");
      appElement?.classList?.add("easy-traps-manager-window");
      root?.closest?.(".window-content")?.classList?.add("easy-traps-manager-content");
      activateSceneTrapManager(root, dialog);
    },
    close: () => {
      if (runtime.sceneManager?.dialog === dialog) runtime.sceneManager = null;
    }
  }, {
    width: Math.min(1080, Math.max(820, window.innerWidth - 120)),
    height: Math.min(820, window.innerHeight - 80),
    resizable: true
  });
  dialog.render(true);
  return dialog;
}

function normalizeSpellBaseLevel(value) {
  const level = Math.trunc(Number(value));
  return Number.isFinite(level) ? Math.min(9, Math.max(0, level)) : 0;
}

function normalizeCastLevel(value, baseLevel = 0) {
  const base = normalizeSpellBaseLevel(baseLevel);
  if (base === 0) return 0;
  const requested = Math.trunc(Number(value));
  return Math.min(9, Math.max(base, Number.isFinite(requested) ? requested : base));
}

function castScaling(castLevel, baseLevel = 0) {
  const base = normalizeSpellBaseLevel(baseLevel);
  return Math.max(0, normalizeCastLevel(castLevel, base) - base);
}

function castLevelLabel(castLevel, baseLevel = null) {
  const base = baseLevel == null ? null : normalizeSpellBaseLevel(baseLevel);
  const level = normalizeCastLevel(castLevel, base ?? castLevel);
  if (level === 0) return "Cantrip";
  const increase = base == null ? 0 : Math.max(0, level - base);
  return increase ? `Level ${level} (upcast +${increase})` : `Level ${level}`;
}

function cantripCasterLevelLabel(casterLevel) {
  return `Caster Level ${normalizeCantripCasterLevel(casterLevel, 1)}`;
}

function trapExecutionLevelLabel(trap) {
  const castLevel = normalizeSpellBaseLevel(trap?.castLevel);
  return castLevel === 0
    ? cantripCasterLevelLabel(trap?.cantripCasterLevel)
    : castLevelLabel(castLevel);
}

function buildCastLevelOptions(baseLevel, selectedLevel = baseLevel) {
  const base = normalizeSpellBaseLevel(baseLevel);
  const selected = normalizeCastLevel(selectedLevel, base);
  if (base === 0) return buildCantripCasterLevelOptions(selectedLevel);
  return Array.from({ length: 10 - base }, (_entry, index) => base + index)
    .map(level => `<option value="${level}" ${level === selected ? "selected" : ""}>${level === base ? `Level ${level} (base)` : `Level ${level}`}</option>`)
    .join("");
}

function updateWizardCastLevel(form, catalog) {
  const input = form?.querySelector?.("select[name='castLevel']");
  if (!input) return;
  const selectedUuid = form.querySelector("input[name='spellUuid']:checked")?.value ?? null;
  const spell = catalog.find(entry => entry.uuid === selectedUuid);
  const base = normalizeSpellBaseLevel(spell?.level);
  const cantrip = base === 0;
  const label = form.querySelector("[data-spell-level-label]");
  const suffix = form.querySelector("[data-spell-level-suffix]");
  const wrapper = form.querySelector("[data-spell-level-wrapper]");
  const hint = form.querySelector("[data-spell-level-hint]");

  input.innerHTML = cantrip
    ? buildCantripCasterLevelOptions(1)
    : buildCastLevelOptions(base, base);
  input.disabled = !cantrip && base >= 9;
  input.dataset.baseLevel = String(base);
  input.dataset.levelMode = cantrip ? "caster" : "slot";
  if (label) label.textContent = cantrip ? "Caster Level" : "Spell slot";
  if (suffix) suffix.hidden = cantrip;
  wrapper?.classList?.toggle("is-no-suffix", cantrip);
  if (hint) {
    hint.hidden = !cantrip;
    hint.textContent = cantrip ? "Determines cantrip scaling." : "";
  }
  input.title = cantrip
    ? `Choose the caster level used to scale ${spell?.name ?? "this cantrip"}.`
    : base >= 9
      ? "This spell is already level 9."
      : `Cast ${spell?.name ?? "the spell"} using a level ${base}–9 slot.`;
}

function spellDisplayMeta(spell) {
  if (!spell) return "";
  const level = spell.level === 0 ? "Cantrip" : `Level ${spell.level}`;
  return `${level}${spell.school ? ` · ${spell.school}` : ""} · ${spell.source}`;
}

function buildSpellRow(spell, index, { selectedUuid, favoriteUuids, wizardId }) {
  const details = spellDisplayMeta(spell);
  const search = normalize(`${spell.name} ${details}`);
  const inputId = `${wizardId}-spell-${index}`;
  const favorite = favoriteUuids.has(spell.uuid);
  return `<div class="et-spell-option" data-spell-row data-search="${escapeHtml(search)}">
    <input id="${inputId}" type="radio" name="spellUuid" value="${escapeHtml(spell.uuid)}" ${spell.uuid === selectedUuid ? "checked" : ""}>
    <label class="et-spell-card" for="${inputId}">
      <img src="${escapeHtml(spell.img || DEFAULT_TRIGGER_TEXTURE)}" alt="">
      <span class="et-spell-copy"><b>${escapeHtml(spell.name)}</b><small>${escapeHtml(details)}</small></span>
      <i class="fa-solid fa-check et-spell-check" aria-hidden="true"></i>
    </label>
    <button type="button" class="et-favorite-toggle ${favorite ? "is-favorite" : ""}" data-favorite-toggle="${escapeHtml(spell.uuid)}" title="${favorite ? "Remove from favorites" : "Add to favorites"}" aria-label="${favorite ? "Remove from favorites" : "Add to favorites"}">
      <i class="${favorite ? "fa-solid" : "fa-regular"} fa-star"></i>
    </button>
  </div>`;
}

function buildFavoriteCards(catalog, favoriteUuids, selectedUuid) {
  const byUuid = new Map(catalog.map(spell => [spell.uuid, spell]));
  const spells = favoriteUuids.map(uuid => byUuid.get(uuid)).filter(Boolean);
  if (!spells.length) {
    return `<div class="et-favorites-empty"><i class="fa-regular fa-star"></i><span><b>No favorites yet</b><small>Use the star beside any spell below.</small></span></div>`;
  }
  return spells.map(spell => `<div class="et-favorite-item ${spell.uuid === selectedUuid ? "is-selected" : ""}">
    <button type="button" class="et-favorite-select" data-favorite-select="${escapeHtml(spell.uuid)}" title="Select ${escapeHtml(spell.name)}">
      <img src="${escapeHtml(spell.img || DEFAULT_TRIGGER_TEXTURE)}" alt="">
      <span><b>${escapeHtml(spell.name)}</b><small>${escapeHtml(spell.level === 0 ? "Cantrip" : `Level ${spell.level}`)}</small></span>
      <i class="fa-solid fa-check"></i>
    </button>
    <button type="button" class="et-favorite-remove" data-favorite-toggle="${escapeHtml(spell.uuid)}" title="Remove from favorites" aria-label="Remove ${escapeHtml(spell.name)} from favorites"><i class="fa-solid fa-star"></i></button>
  </div>`).join("");
}

function buildWizardContent(catalog, favoriteUuids = [], creationDefaults = getCreationDefaults()) {
  const favorites = new Set(favoriteUuids);
  const wizardId = `et-${foundry.utils.randomID?.(8) ?? Math.random().toString(36).slice(2, 10)}`;
  const selectedUuid = favoriteUuids.find(uuid => catalog.some(spell => spell.uuid === uuid)) ?? catalog[0]?.uuid ?? null;
  const selectedSpell = catalog.find(spell => spell.uuid === selectedUuid) ?? catalog[0];
  const rows = catalog.map((spell, index) => buildSpellRow(spell, index, { selectedUuid, favoriteUuids: favorites, wizardId })).join("");

  return `<form class="easy-traps-wizard">
    <section class="et-wizard-setup" data-wizard-stage="setup">
      <div class="et-wizard-scroll" data-wizard-scroll>
      <div class="et-note">
        <i class="fa-solid fa-wand-sparkles"></i>
        <span><b>Native spell trap</b><small>Select a spell, its origin, and the trigger size. EasyTraps loads it only after Place trigger. When a spell has multiple usable Activities, you choose the exact one before placement.</small></span>
      </div>

      <section class="et-favorites-panel">
        <header><span><i class="fa-solid fa-star"></i><b>Favorites</b><small data-favorite-count>${favoriteUuids.length} saved</small></span><button type="button" data-favorite-action="defaults" title="Restore the default SRD favorites"><i class="fa-solid fa-rotate-left"></i></button></header>
        <div class="et-favorite-list" data-favorite-list>${buildFavoriteCards(catalog, favoriteUuids, selectedUuid)}</div>
      </section>

      <div class="et-spell-browser">
        <label class="et-spell-search"><span>All spells</span><span class="et-search-control"><i class="fa-solid fa-magnifying-glass"></i><input type="search" name="search" placeholder="Name, level, school, or compendium"></span></label>
        <div class="et-spell-list" role="listbox">${rows}</div>
        <p class="et-spell-list-count" data-spell-count></p>
      </div>

      <fieldset class="et-origin-fieldset">
        <legend>Where does the spell originate?</legend>
        <div class="et-origin-grid">
          <label class="et-origin-option">
            <input type="radio" name="originMode" value="${ORIGIN_MODES.SEPARATE_TILE}" checked>
            <span><i class="fa-solid fa-location-dot"></i><b>From another point</b><small>Place a second movable Tile as the origin.</small></span>
          </label>
          <label class="et-origin-option">
            <input type="radio" name="originMode" value="${ORIGIN_MODES.TRIGGER_TILE}">
            <span><i class="fa-solid fa-bullseye"></i><b class="et-origin-label">From the trap <i class="fa-solid fa-circle-info et-origin-info" data-tooltip="Animations may fail or show warnings when the target and spell origin occupy the same point (zero distance)." title="Animations may fail or show warnings when the target and spell origin occupy the same point (zero distance)." aria-label="Zero-distance animation warning"></i></b><small>The trigger Tile itself is the spell origin.</small></span>
          </label>
          <label class="et-origin-option">
            <input type="radio" name="originMode" value="${ORIGIN_MODES.TRIGGERING_TOKEN}">
            <span><i class="fa-solid fa-person-rays"></i><b>From the creature</b><small>The creature that activates the trap uses the spell.</small></span>
          </label>
        </div>
      </fieldset>

      <div class="et-trigger-size-grid">
        <label><span>Trigger width</span><div class="et-number-suffix"><input type="number" name="widthCells" min="1" max="20" step="1" value="1"><b>cells</b></div></label>
        <label><span>Trigger height</span><div class="et-number-suffix"><input type="number" name="heightCells" min="1" max="20" step="1" value="1"><b>cells</b></div></label>
      </div>
      <div class="et-trigger-size-grid et-spell-stat-grid">
        <label data-spell-level-control><span data-spell-level-label>${normalizeSpellBaseLevel(selectedSpell?.level) === 0 ? "Caster Level" : "Spell slot"}</span><div class="et-number-suffix ${normalizeSpellBaseLevel(selectedSpell?.level) === 0 ? "is-no-suffix" : ""}" data-spell-level-wrapper><select name="castLevel" aria-label="Spell execution level">${normalizeSpellBaseLevel(selectedSpell?.level) === 0 ? buildCantripCasterLevelOptions(1) : buildCastLevelOptions(selectedSpell?.level ?? 0)}</select><b data-spell-level-suffix ${normalizeSpellBaseLevel(selectedSpell?.level) === 0 ? "hidden" : ""}>slot</b></div><small class="et-level-hint" data-spell-level-hint ${normalizeSpellBaseLevel(selectedSpell?.level) === 0 ? "" : "hidden"}>${normalizeSpellBaseLevel(selectedSpell?.level) === 0 ? "Determines cantrip scaling." : ""}</small></label>
        <label><span>Spell save DC</span><div class="et-number-suffix"><input type="number" name="spellSaveDc" min="1" max="99" step="1" value="${normalizeSpellSaveDc(creationDefaults.spellSaveDc)}"><b>DC</b></div></label>
        <label><span>Spell attack bonus</span><div class="et-number-suffix"><input type="text" inputmode="numeric" name="spellAttackBonus" value="${formatSignedModifier(creationDefaults.spellAttackBonus)}" aria-label="Spell attack bonus"><b>to hit</b></div></label>
      </div>
      <div class="et-activation-option-grid">
        <label class="et-pause-option">
          <input type="checkbox" name="pauseOnTrigger" ${creationDefaults.pauseOnTrigger ? "checked" : ""}>
          <span><i class="fa-solid fa-pause"></i><b>Pause the game when triggered</b><small>The game remains paused until the GM resumes it.</small></span>
        </label>
        <label class="et-pause-option">
          <input type="checkbox" name="disarmAfterTrigger" ${creationDefaults.disarmAfterTrigger ? "checked" : ""}>
          <span><i class="fa-solid fa-power-off"></i><b>Disarm after triggering</b><small>Disable this to keep the trap repeatable.</small></span>
        </label>
      </div>
      <button type="button" class="et-wizard-advanced ${creationDefaults.discovery?.enabled ? "is-enabled" : ""}" data-wizard-action="advanced">
        <span><i class="fa-solid fa-sliders"></i><span><b>Advanced settings</b><small data-wizard-advanced-summary>${escapeHtml(discoverySummary(creationDefaults.discovery))}</small></span></span>
        <i class="fa-solid fa-chevron-right"></i>
      </button>
      </div>
      <footer class="et-wizard-actions">
        <button type="button" data-wizard-action="cancel">Cancel</button>
        <button type="button" data-wizard-action="place" class="et-primary"><i class="fa-solid fa-location-crosshairs"></i> Place trigger</button>
      </footer>
    </section>

    <section class="et-wizard-placement" data-wizard-stage="placement" hidden>
      <div class="et-wizard-scroll et-placement-scroll" data-wizard-scroll>
      <div class="et-selected-spell" data-selected-spell>
        <img data-selected-img src="${escapeHtml(selectedSpell?.img || DEFAULT_TRIGGER_TEXTURE)}" alt="">
        <span><small>Selected spell</small><b data-selected-name>${escapeHtml(selectedSpell?.name ?? "Spell")}</b><em data-selected-meta></em></span>
        <i class="fa-solid fa-check-circle"></i>
      </div>
      <div class="et-trigger-type-picker" data-trigger-type-picker>
        <button type="button" class="is-selected" data-trigger-type="tile"><i class="fa-solid fa-border-all"></i><span><b>Tile</b><small>Floor / area trigger</small></span></button>
        <button type="button" data-trigger-type="door"><i class="fa-solid fa-door-open"></i><span><b>Door</b><small>Create a Foundry door</small></span></button>
        <button type="button" data-trigger-type="item-pile"><i class="fa-solid fa-box-open"></i><span><b>Item Pile</b><small>Create an Item Pile</small></span></button>
      </div>
      <div class="et-placement-step" data-placement-step>
        <i class="fa-solid fa-location-crosshairs" data-placement-icon></i>
        <span><small data-placement-kicker>Place trigger</small><b data-placement-title>Choose the trigger cells on the scene</b><em data-placement-instruction>Click the top-left grid cell. Press Esc to return.</em></span>
      </div>
      <div class="et-placement-facts">
        <span><small>Execution</small><b data-placement-execution>Original spell item</b></span>
        <span><small>Trigger</small><b data-placement-size>Tile · 1×1 cells</b></span>
        <span><small>Origin</small><b data-placement-origin>From another point</b></span>
        <span><small>Target</small><b data-placement-target>Triggering creature</b></span>
        <span><small>Area</small><b data-placement-area>Positioned during creation</b></span>
        <span><small data-placement-level-label>${normalizeSpellBaseLevel(selectedSpell?.level) === 0 ? "Caster Level" : "Spell slot"}</small><b data-placement-cast-level>${normalizeSpellBaseLevel(selectedSpell?.level) === 0 ? cantripCasterLevelLabel(1) : castLevelLabel(selectedSpell?.level ?? 0, selectedSpell?.level ?? 0)}</b></span>
        <span><small>Save DC</small><b data-placement-dc>${normalizeSpellSaveDc(creationDefaults.spellSaveDc)}</b></span>
        <span><small>Spell attack</small><b data-placement-attack>${formatSignedModifier(creationDefaults.spellAttackBonus)}</b></span>
        <span><small>Pause</small><b data-placement-pause>${creationDefaults.pauseOnTrigger ? "Yes" : "No"}</b></span>
        <span><small>Disarm after trigger</small><b data-placement-disarm>${creationDefaults.disarmAfterTrigger ? "Yes" : "No"}</b></span>
        <span><small>Discovery</small><b data-placement-discovery>${escapeHtml(discoverySummary(creationDefaults.discovery))}</b></span>
      </div>
      </div>
      <footer class="et-wizard-actions et-placement-actions">
        <button type="button" data-wizard-action="cancel-placement"><i class="fa-solid fa-arrow-left"></i> Cancel placement</button>
      </footer>
    </section>
  </form>`;
}

function readWizardSelection(form) {
  return {
    spellUuid: form.querySelector("input[name='spellUuid']:checked")?.value ?? null,
    activityId: null,
    triggerType: TRIGGER_TYPES.TILE,
    widthCells: clampCellCount(form.querySelector("input[name='widthCells']")?.value),
    heightCells: clampCellCount(form.querySelector("input[name='heightCells']")?.value),
    originMode: normalizeOriginMode(form.querySelector("input[name='originMode']:checked")?.value),
    targetMode: TARGET_MODES.NONE,
    areaMode: AREA_MODES.NONE,
    targetingProfile: null,
    effectiveTarget: null,
    selectionZoneWidth: 1,
    selectionZoneHeight: 1,
    requiresNativeInteraction: false,
    castLevel: Math.trunc(Number(form.querySelector("select[name='castLevel']")?.value)) || 0,
    cantripCasterLevel: Math.trunc(Number(form.querySelector("select[name='castLevel']")?.value)) || 1,
    scaling: 0,
    spellSaveDc: normalizeSpellSaveDc(form.querySelector("input[name='spellSaveDc']")?.value),
    spellAttackBonus: normalizeSpellAttackBonus(form.querySelector("input[name='spellAttackBonus']")?.value),
    pauseOnTrigger: form.querySelector("input[name='pauseOnTrigger']")?.checked === true,
    disarmAfterTrigger: form.querySelector("input[name='disarmAfterTrigger']")?.checked === true,
    discovery: normalizeDiscoveryConfig(form._easyTrapsDiscovery ?? getDiscoveryDefaults())
  };
}

function selectedSpellMeta(spell) {
  return spellDisplayMeta(spell);
}

function updateWizardTriggerTypeControls(form, selection) {
  const type = normalizeTriggerType(selection?.triggerType);
  for (const button of form?.querySelectorAll?.("[data-trigger-type]") ?? []) {
    const buttonType = normalizeTriggerType(button.dataset.triggerType);
    const requiresItemPiles = buttonType === TRIGGER_TYPES.ITEM_PILE;
    const itemPilesAvailable = game.modules.get("item-piles")?.active === true && typeof game.itempiles?.API?.createItemPile === "function";
    button.disabled = requiresItemPiles && !itemPilesAvailable;
    button.classList.toggle("is-selected", buttonType === type);
    if (requiresItemPiles && !itemPilesAvailable) {
      button.title = "Requires the Item Piles module.";
      button.dataset.tooltip = button.title;
    } else {
      button.removeAttribute("title");
      delete button.dataset.tooltip;
    }
  }
  const size = form?.querySelector?.("[data-placement-size]");
  if (size) {
    size.textContent = type === TRIGGER_TYPES.TILE
      ? `Tile · ${selection.widthCells}×${selection.heightCells} cells`
      : triggerTypeLabel(type);
  }
}

function setWizardPlacementState(form, spell, selection, phase = "trigger") {
  const setup = form.querySelector("[data-wizard-stage='setup']");
  const placement = form.querySelector("[data-wizard-stage='placement']");
  if (setup) setup.hidden = true;
  if (placement) placement.hidden = false;
  form.classList.add("et-placement-active");
  const img = form.querySelector("[data-selected-img]");
  if (img) img.src = spell.img || DEFAULT_TRIGGER_TEXTURE;
  const name = form.querySelector("[data-selected-name]");
  if (name) name.textContent = spell.name;
  const meta = form.querySelector("[data-selected-meta]");
  if (meta) meta.textContent = selectedSpellMeta(spell);
  const execution = form.querySelector("[data-placement-execution]");
  if (execution) execution.textContent = "Original spell item";
  updateWizardTriggerTypeControls(form, selection);
  const origin = form.querySelector("[data-placement-origin]");
  if (origin) origin.textContent = originModeLabel(selection.originMode).replace(/^origin:\s*/i, "");
  const target = form.querySelector("[data-placement-target]");
  if (target) target.textContent = targetModeLabel(selection.targetMode);
  const area = form.querySelector("[data-placement-area]");
  if (area) area.textContent = areaModeLabel(selection.areaMode);
  const castLevel = form.querySelector("[data-placement-cast-level]");
  const placementLevelLabel = form.querySelector("[data-placement-level-label]");
  const cantrip = normalizeSpellBaseLevel(spell.level) === 0;
  if (placementLevelLabel) placementLevelLabel.textContent = cantrip ? "Caster Level" : "Spell slot";
  if (castLevel) castLevel.textContent = cantrip
    ? cantripCasterLevelLabel(selection.cantripCasterLevel)
    : castLevelLabel(selection.castLevel, spell.level);
  const saveDc = form.querySelector("[data-placement-dc]");
  if (saveDc) saveDc.textContent = String(normalizeSpellSaveDc(selection.spellSaveDc));
  const attack = form.querySelector("[data-placement-attack]");
  if (attack) attack.textContent = formatSignedModifier(selection.spellAttackBonus);
  const pause = form.querySelector("[data-placement-pause]");
  if (pause) pause.textContent = selection.pauseOnTrigger ? "Yes" : "No";
  const disarm = form.querySelector("[data-placement-disarm]");
  if (disarm) disarm.textContent = selection.disarmAfterTrigger ? "Yes" : "No";
  const discovery = form.querySelector("[data-placement-discovery]");
  if (discovery) discovery.textContent = discoverySummary(selection.discovery);
  updateWizardPlacementPhase(form, spell, selection, phase);
}

function updateWizardPlacementPhase(form, spell, selection, phase) {
  const isOrigin = phase === "origin";
  const isArea = phase === "area";
  const isTargets = phase === "targets";
  form.classList.toggle("et-origin-placement", isOrigin);
  form.classList.toggle("et-area-placement", isArea);
  form.classList.toggle("et-target-placement", isTargets);
  const kicker = form.querySelector("[data-placement-kicker]");
  const title = form.querySelector("[data-placement-title]");
  const instruction = form.querySelector("[data-placement-instruction]");
  const icon = form.querySelector("[data-placement-icon]");
  if (isArea) {
    if (kicker) kicker.textContent = "Place spell area";
    if (title) title.textContent = `Position the original ${spell.name} template`;
    if (instruction) instruction.textContent = "Move and rotate the D&D5e template. Left-click to confirm; right-click or Esc to return.";
    if (icon) icon.className = "fa-solid fa-draw-polygon";
    return;
  }
  if (isTargets) {
    if (kicker) kicker.textContent = "Place target zone";
    if (title) title.textContent = `Choose the ${selection.selectionZoneWidth}×${selection.selectionZoneHeight} creature-selection zone`;
    if (instruction) instruction.textContent = "Click its top-left grid cell. Creatures occupying the selected cells will be targeted; merely touching an outer edge does not count.";
    if (icon) icon.className = "fa-solid fa-crosshairs";
    return;
  }
  if (kicker) kicker.textContent = isOrigin ? "Place spell origin" : "Place trigger";
  if (isOrigin) {
    if (title) title.textContent = `Choose where ${spell.name} originates`;
    if (instruction) instruction.textContent = "Click one grid cell for the separate origin. Press Esc to return.";
    if (icon) icon.className = "fa-solid fa-location-dot";
    return;
  }
  const triggerType = normalizeTriggerType(selection.triggerType);
  updateWizardTriggerTypeControls(form, selection);
  if (triggerType === TRIGGER_TYPES.DOOR) {
    if (title) title.textContent = "Draw the trapped door";
    if (instruction) instruction.textContent = "Click the first endpoint, then click the second endpoint. The door itself becomes the trigger.";
    if (icon) icon.className = "fa-solid fa-door-open";
  } else if (triggerType === TRIGGER_TYPES.ITEM_PILE) {
    if (title) title.textContent = "Place the trapped Item Pile";
    if (instruction) instruction.textContent = "Click one grid cell. EasyTraps creates a real Item Pile there.";
    if (icon) icon.className = "fa-solid fa-box-open";
  } else {
    if (title) title.textContent = `Choose the ${selection.widthCells}×${selection.heightCells} trigger area`;
    if (instruction) instruction.textContent = "Click the top-left grid cell. Press Esc to return.";
    if (icon) icon.className = "fa-solid fa-location-crosshairs";
  }
}

function restoreWizardSetup(form) {
  const setup = form.querySelector("[data-wizard-stage='setup']");
  const placement = form.querySelector("[data-wizard-stage='placement']");
  if (setup) setup.hidden = false;
  if (placement) placement.hidden = true;
  form.classList.remove("et-placement-active", "et-origin-placement", "et-area-placement", "et-target-placement");
  form._easyTrapsPlacementSelection = null;
  form._easyTrapsPlacementSpell = null;
}

function setWizardWindowPosition(dialog, compact) {
  if (typeof dialog?.setPosition !== "function") return;
  if (compact) {
    dialog.setPosition({
      width: 470,
      height: "auto",
      top: 72,
      left: Math.max(18, Math.min(120, window.innerWidth - 490))
    });
  } else {
    const width = Math.min(720, Math.max(600, window.innerWidth - 160));
    dialog.setPosition({
      width,
      height: Math.min(760, window.innerHeight - 90),
      top: 45,
      left: Math.max(18, Math.round((window.innerWidth - width) / 2))
    });
  }
}

function activateCreationWizard(root, catalog, { dialog, finish, isClosed }) {
  const form = root?.matches?.("form.easy-traps-wizard") ? root : root?.querySelector?.("form.easy-traps-wizard");
  if (!form || form.dataset.activated === "true") return;
  form.dataset.activated = "true";
  const appElement = dialog?.element?.[0] ?? form.closest?.(".app, .application, .window-app");
  form._easyTrapsDiscovery = normalizeDiscoveryConfig(getDiscoveryDefaults());
  appElement?.classList?.add("easy-traps-wizard-window");
  form.closest?.(".window-content")?.classList?.add("easy-traps-wizard-content");
  const search = form.querySelector("input[name='search']");
  const rows = [...form.querySelectorAll("[data-spell-row]")];
  const count = form.querySelector("[data-spell-count]");
  const renderFavorites = () => {
    const favoriteUuids = getFavoriteSpellUuids(catalog);
    const selectedUuid = form.querySelector("input[name='spellUuid']:checked")?.value ?? null;
    const favoriteList = form.querySelector("[data-favorite-list]");
    if (favoriteList) favoriteList.innerHTML = buildFavoriteCards(catalog, favoriteUuids, selectedUuid);
    const favoriteCount = form.querySelector("[data-favorite-count]");
    if (favoriteCount) favoriteCount.textContent = `${favoriteUuids.length} saved`;
    const favoriteSet = new Set(favoriteUuids);
    form.querySelectorAll("[data-favorite-toggle]").forEach(button => {
      if (!button.closest("[data-spell-row]")) return;
      const favorite = favoriteSet.has(button.dataset.favoriteToggle);
      button.classList.toggle("is-favorite", favorite);
      button.title = favorite ? "Remove from favorites" : "Add to favorites";
      button.setAttribute("aria-label", button.title);
      const icon = button.querySelector("i");
      if (icon) icon.className = `${favorite ? "fa-solid" : "fa-regular"} fa-star`;
    });
  };

  const updateFilter = () => {
    const term = normalize(search?.value);
    let visible = 0;
    for (const row of rows) {
      row.hidden = Boolean(term) && !row.dataset.search.includes(term);
      if (!row.hidden) visible += 1;
    }
    if (count) count.textContent = `${visible} spell${visible === 1 ? "" : "s"} shown`;
  };


  form.addEventListener("click", async event => {
    const triggerTypeButton = event.target?.closest?.("[data-trigger-type]");
    if (triggerTypeButton) {
      event.preventDefault();
      if (triggerTypeButton.disabled) return ui.notifications.warn("Item Piles must be active to place an Item Pile trigger.");
      const selection = form._easyTrapsPlacementSelection;
      if (!selection) return;
      selection.triggerType = normalizeTriggerType(triggerTypeButton.dataset.triggerType);
      updateWizardPlacementPhase(form, form._easyTrapsPlacementSpell ?? { name: "Spell" }, selection, "trigger");
      return;
    }
    const toggle = event.target?.closest?.("[data-favorite-toggle]");
    if (toggle) {
      event.preventDefault();
      event.stopPropagation();
      await toggleFavoriteSpell(toggle.dataset.favoriteToggle, catalog);
      renderFavorites();
      return;
    }
    const favoriteSelect = event.target?.closest?.("[data-favorite-select]");
    if (favoriteSelect) {
      const input = [...form.querySelectorAll("input[name='spellUuid']")].find(entry => entry.value === favoriteSelect.dataset.favoriteSelect);
      if (input) {
        input.checked = true;
        input.dispatchEvent(new Event("change", { bubbles: true }));
        renderFavorites();
      }
      return;
    }
    const favoriteAction = event.target?.closest?.("[data-favorite-action]");
    if (favoriteAction?.dataset.favoriteAction === "defaults") {
      await restoreDefaultFavoriteSpells();
      renderFavorites();
      ui.notifications.info("Favorite spells restored to the SRD defaults.");
    }
  });
  search?.addEventListener("input", updateFilter);
  form.addEventListener("change", event => {
    if (event.target?.matches?.("input[name='spellUuid']")) {
      renderFavorites();
      updateWizardCastLevel(form, catalog);
    }
  });
  updateFilter();
  renderFavorites();
  updateWizardCastLevel(form, catalog);
  updateWizardAdvancedSummary(form);
  form.addEventListener("submit", event => event.preventDefault());

  form.querySelector("[data-wizard-action='cancel']")?.addEventListener("click", () => dialog.close());
  form.querySelector("[data-wizard-action='cancel-placement']")?.addEventListener("click", () => runtime.cancelPlacement?.());
  form.querySelector("[data-wizard-action='advanced']")?.addEventListener("click", () => openAdvancedSettingsForWizard(form));
  form.querySelector("[data-wizard-action='place']")?.addEventListener("click", async event => {
    const button = event.currentTarget;
    if (button.disabled || runtime.placing) return;
    const selection = readWizardSelection(form);
    if (!selection.spellUuid) return ui.notifications.warn("Select a spell first.");
    const catalogSpell = catalog.find(entry => entry.uuid === selection.spellUuid);
    button.disabled = true;
    button.setAttribute("aria-busy", "true");
    let spell;
    let analyzed;
    try {
      spell = await fromUuid(selection.spellUuid);
      if (!spell || spell.type !== "spell") return ui.notifications.error("The selected spell could not be loaded.");
      const baseLevel = normalizeSpellBaseLevel(spell.system?.level);
      if (baseLevel === 0) {
        selection.cantripCasterLevel = normalizeCantripCasterLevel(selection.cantripCasterLevel ?? selection.castLevel, 1);
        selection.castLevel = 0;
        selection.scaling = cantripScalingIncrease(selection.cantripCasterLevel);
      } else {
        selection.castLevel = normalizeCastLevel(selection.castLevel, baseLevel);
        selection.cantripCasterLevel = null;
        selection.scaling = castScaling(selection.castLevel, baseLevel);
      }
      analyzed = await analyzeSpellAfterPlaceClick(spell);
      if (!analyzed) return;
      Object.assign(selection, analyzed);
      if (selection.originMode !== ORIGIN_MODES.TRIGGERING_TOKEN) await ensureInternalCaster();
    } finally {
      button.disabled = false;
      button.removeAttribute("aria-busy");
    }

    button.setAttribute("aria-busy", "true");
    form._easyTrapsPlacementSelection = selection;
    form._easyTrapsPlacementSpell = { ...catalogSpell, name: spell.name, img: spell.img };
    setWizardPlacementState(form, form._easyTrapsPlacementSpell, selection, "trigger");
    setWizardWindowPosition(dialog, true);
    const placementUi = {
      setPhase: phase => updateWizardPlacementPhase(form, { ...catalogSpell, name: spell.name, img: spell.img }, selection, phase)
    };
    let trigger = null;
    try {
      trigger = await placeFloorTrigger(spell, selection, placementUi);
    } finally {
      button.removeAttribute("aria-busy");
    }
    if (trigger) {
      finish(trigger);
      await dialog.close();
      return;
    }
    if (!isClosed()) {
      restoreWizardSetup(form);
      setWizardWindowPosition(dialog, false);
    }
  });
}

function openCreationWizard(catalog, favoriteUuids = getFavoriteSpellUuids(catalog)) {
  if (!globalThis.Dialog) {
    ui.notifications.error("The trap creator could not open because the Foundry Dialog API is unavailable.");
    return null;
  }
  const content = buildWizardContent(catalog, favoriteUuids);
  return new Promise(resolve => {
    let settled = false;
    let closed = false;
    const finish = value => {
      if (settled) return;
      settled = true;
      resolve(value ?? null);
    };
    const dialog = new Dialog({
      title: "EasyTraps — Spell Trap",
      content,
      buttons: {},
      render: html => {
        const root = html?.[0] ?? html;
        activateCreationWizard(root, catalog, { dialog, finish, isClosed: () => closed });
        setWizardWindowPosition(dialog, false);
      },
      close: () => {
        closed = true;
        runtime.cancelPlacement?.();
        finish(null);
      }
    }, {
      width: Math.min(720, Math.max(600, window.innerWidth - 160)),
      height: Math.min(760, window.innerHeight - 90),
      resizable: true
    });
    dialog.render(true);
  });
}


function buildAlarmWizardContent() {
  const discovery = normalizeDiscoveryConfig(getDiscoveryDefaults());
  const alarm = normalizeAlarmConfig(DEFAULT_ALARM_CONFIG);
  return `<form class="easy-traps-wizard easy-traps-alarm-wizard">
    <section class="et-wizard-setup" data-wizard-stage="setup">
      <div class="et-wizard-scroll" data-wizard-scroll>
        <div class="et-note et-alarm-note">
          <i class="fa-solid fa-bell"></i>
          <span><b>Alarm trap</b><small>Choose how the alarm sounds, where it can be heard, its origin, and the trigger. Discovery, disarming, Door, and Item Pile behavior use the same EasyTraps infrastructure as Spell Traps.</small></span>
        </div>

        <fieldset class="et-alarm-fieldset">
          <legend>Alarm sound</legend>
          <div class="et-alarm-choice-grid">
            <label class="et-origin-option">
              <input type="radio" name="alarmSoundMode" value="default" checked>
              <span><i class="fa-solid fa-clock"></i><b>Clock Alarm</b><small>Bundled EasyTraps alarm sound.</small></span>
            </label>
            <label class="et-origin-option">
              <input type="radio" name="alarmSoundMode" value="custom">
              <span><i class="fa-solid fa-file-audio"></i><b>Custom Sound</b><small>Choose any supported audio file available to Foundry.</small></span>
            </label>
          </div>
          <div class="et-alarm-file-row" data-alarm-custom-row hidden>
            <label><span>Custom audio path</span><div class="et-alarm-file-control"><input type="text" name="alarmSoundPath" placeholder="sounds/alarm.ogg"><button type="button" data-alarm-action="browse" title="Browse audio"><i class="fa-solid fa-folder-open"></i></button></div></label>
          </div>
          <div class="et-alarm-audio-controls">
            <label><span>Volume</span><div class="et-number-suffix"><input type="number" name="alarmVolume" min="0" max="1" step="0.05" value="${alarm.sound.volume}"><b>0–1</b></div></label>
            <button type="button" class="et-alarm-preview" data-alarm-action="preview"><i class="fa-solid fa-play"></i><span>Preview locally</span></button>
          </div>
        </fieldset>

        <fieldset class="et-alarm-fieldset">
          <legend>Who can hear it?</legend>
          <div class="et-alarm-choice-grid et-alarm-three-grid">
            <label class="et-origin-option">
              <input type="radio" name="alarmAudibility" value="${ALARM_AUDIBILITY_MODES.SPATIAL}" checked>
              <span><i class="fa-solid fa-volume-high"></i><b>Spatial</b><small>Native positional sound with radius and walls.</small></span>
            </label>
            <label class="et-origin-option">
              <input type="radio" name="alarmAudibility" value="${ALARM_AUDIBILITY_MODES.SCENE}">
              <span><i class="fa-solid fa-users"></i><b>Entire Scene</b><small>Every connected user viewing this Scene hears it.</small></span>
            </label>
            <label class="et-origin-option">
              <input type="radio" name="alarmAudibility" value="${ALARM_AUDIBILITY_MODES.GM_ONLY}">
              <span><i class="fa-solid fa-user-secret"></i><b>GM Only</b><small>Silent alarm for players.</small></span>
            </label>
          </div>
          <div class="et-alarm-spatial-options" data-alarm-spatial-options>
            <div class="et-trigger-size-grid">
              <label><span>Hearing radius</span><div class="et-number-suffix"><input type="number" name="alarmRadius" min="1" max="9999" step="1" value="${alarm.audibility.radius}"><b>${escapeHtml(sceneDistanceUnits())}</b></div></label>
            </div>
            <div class="et-activation-option-grid">
              <label class="et-pause-option"><input type="checkbox" name="alarmEasing" checked><span><i class="fa-solid fa-wave-square"></i><b>Fade with distance</b><small>Volume decreases toward the edge of the radius.</small></span></label>
              <label class="et-pause-option"><input type="checkbox" name="alarmWalls" checked><span><i class="fa-solid fa-wall-brick"></i><b>Constrained by walls</b><small>Use Foundry's native sound propagation through walls and surfaces.</small></span></label>
              <label class="et-pause-option"><input type="checkbox" name="alarmGmAlways" checked><span><i class="fa-solid fa-headphones"></i><b>GM always hears</b><small>GM clients hear the positional alarm regardless of listener position.</small></span></label>
            </div>
          </div>
        </fieldset>

        <fieldset class="et-alarm-fieldset">
          <legend>Playback</legend>
          <div class="et-alarm-choice-grid">
            <label class="et-origin-option"><input type="radio" name="alarmPlayback" value="${ALARM_PLAYBACK_MODES.ONCE}" checked><span><i class="fa-solid fa-play"></i><b>Play once</b><small>Play the sound file a single time.</small></span></label>
            <label class="et-origin-option"><input type="radio" name="alarmPlayback" value="${ALARM_PLAYBACK_MODES.SUSTAINED}"><span><i class="fa-solid fa-repeat"></i><b>Repeat for a Duration</b><small>Repeats until the configured duration expires.</small></span></label>
          </div>
          <div class="et-trigger-size-grid" data-alarm-duration-row hidden>
            <label><span>Duration</span><div class="et-number-suffix"><input type="number" name="alarmDuration" min="1" max="300" step="1" value="${alarm.playback.duration}"><b>seconds</b></div></label>
          </div>
        </fieldset>

        <fieldset class="et-origin-fieldset" data-alarm-origin-options>
          <legend>Where does the alarm originate?</legend>
          <div class="et-origin-grid">
            <label class="et-origin-option"><input type="radio" name="originMode" value="${ORIGIN_MODES.TRIGGER_TILE}" checked><span><i class="fa-solid fa-bullseye"></i><b>From the trigger</b><small>Sound originates from the Tile, Door, or Item Pile itself.</small></span></label>
            <label class="et-origin-option"><input type="radio" name="originMode" value="${ORIGIN_MODES.SEPARATE_TILE}"><span><i class="fa-solid fa-location-dot"></i><b>From another point</b><small>Place a separate movable Origin Tile.</small></span></label>
          </div>
        </fieldset>

        <div class="et-trigger-size-grid">
          <label><span>Trigger width</span><div class="et-number-suffix"><input type="number" name="widthCells" min="1" max="20" step="1" value="1"><b>cells</b></div></label>
          <label><span>Trigger height</span><div class="et-number-suffix"><input type="number" name="heightCells" min="1" max="20" step="1" value="1"><b>cells</b></div></label>
        </div>

        <fieldset class="et-alarm-fieldset">
          <legend>Chat notification</legend>
          <div class="et-alarm-choice-grid et-alarm-three-grid">
            <label class="et-origin-option"><input type="radio" name="alarmChat" value="${ALARM_CHAT_MODES.OFF}"><span><i class="fa-solid fa-comment-slash"></i><b>Off</b><small>No alarm message.</small></span></label>
            <label class="et-origin-option"><input type="radio" name="alarmChat" value="${ALARM_CHAT_MODES.GM_ONLY}" checked><span><i class="fa-solid fa-eye"></i><b>GM Only</b><small>Private confirmation for GMs.</small></span></label>
            <label class="et-origin-option"><input type="radio" name="alarmChat" value="${ALARM_CHAT_MODES.EVERYONE}"><span><i class="fa-solid fa-comments"></i><b>Everyone</b><small>Post the alarm to public chat.</small></span></label>
          </div>
        </fieldset>

        <div class="et-activation-option-grid">
          <label class="et-pause-option"><input type="checkbox" name="pauseOnTrigger"><span><i class="fa-solid fa-pause"></i><b>Pause the game when triggered</b><small>Off by default for alarms.</small></span></label>
          <label class="et-pause-option"><input type="checkbox" name="disarmAfterTrigger" checked><span><i class="fa-solid fa-power-off"></i><b>Disarm after triggering</b><small>Disable this to keep the alarm repeatable.</small></span></label>
        </div>
        <div class="et-trigger-size-grid" data-alarm-cooldown-row hidden>
          <label><span>Repeat cooldown</span><div class="et-number-suffix"><input type="number" name="alarmCooldown" min="0" max="300" step="1" value="${alarm.cooldownSeconds}"><b>seconds</b></div><small class="et-level-hint">Prevents repeated activations from spamming audio.</small></label>
        </div>

        <button type="button" class="et-wizard-advanced ${discovery.enabled ? "is-enabled" : ""}" data-wizard-action="advanced"><span><i class="fa-solid fa-sliders"></i><span><b>Advanced settings</b><small data-wizard-advanced-summary>${escapeHtml(discoverySummary(discovery))}</small></span></span><i class="fa-solid fa-chevron-right"></i></button>
      </div>
      <footer class="et-wizard-actions"><button type="button" data-wizard-action="cancel">Cancel</button><button type="button" data-wizard-action="place" class="et-primary"><i class="fa-solid fa-location-crosshairs"></i> Place trigger</button></footer>
    </section>

    <section class="et-wizard-placement" data-wizard-stage="placement" hidden>
      <div class="et-wizard-scroll et-placement-scroll" data-wizard-scroll>
        <div class="et-selected-spell et-selected-alarm"><div class="et-alarm-selected-icon"><i class="fa-solid fa-bell"></i></div><span><small>Alarm Trap</small><b data-selected-name>Clock Alarm</b><em data-selected-meta>Spatial alarm</em></span><i class="fa-solid fa-check-circle"></i></div>
        <div class="et-trigger-type-picker" data-trigger-type-picker>
          <button type="button" class="is-selected" data-trigger-type="tile"><i class="fa-solid fa-border-all"></i><span><b>Tile</b><small>Floor / area trigger</small></span></button>
          <button type="button" data-trigger-type="door"><i class="fa-solid fa-door-open"></i><span><b>Door</b><small>Create a Foundry door</small></span></button>
          <button type="button" data-trigger-type="item-pile"><i class="fa-solid fa-box-open"></i><span><b>Item Pile</b><small>Create an Item Pile</small></span></button>
        </div>
        <div class="et-placement-step" data-placement-step><i class="fa-solid fa-location-crosshairs" data-placement-icon></i><span><small data-placement-kicker>Place trigger</small><b data-placement-title>Choose the trigger cells on the scene</b><em data-placement-instruction>Click the top-left grid cell. Press Esc to return.</em></span></div>
        <div class="et-placement-facts">
          <span><small>Sound</small><b data-placement-alarm-sound>Clock Alarm</b></span>
          <span><small>Audibility</small><b data-placement-alarm-audibility>Spatial · 60 ${escapeHtml(sceneDistanceUnits())}</b></span>
          <span><small>Playback</small><b data-placement-alarm-playback>Play once</b></span>
          <span><small>Trigger</small><b data-placement-size>Tile · 1×1 cells</b></span>
          <span><small>Origin</small><b data-placement-origin>From the trigger</b></span>
          <span><small>Pause</small><b data-placement-pause>No</b></span>
          <span><small>After trigger</small><b data-placement-disarm>Disarm</b></span>
          <span><small>Chat</small><b data-placement-alarm-chat>GM Only</b></span>
          <span><small>Discovery</small><b data-placement-discovery>${escapeHtml(discoverySummary(discovery))}</b></span>
        </div>
      </div>
      <footer class="et-wizard-actions et-placement-actions"><button type="button" data-wizard-action="cancel-placement"><i class="fa-solid fa-arrow-left"></i> Cancel placement</button></footer>
    </section>
  </form>`;
}

function readAlarmConfigFromForm(form) {
  const custom = form.querySelector('input[name="alarmSoundMode"]:checked')?.value === "custom";
  const customPath = String(form.querySelector('input[name="alarmSoundPath"]')?.value ?? "").trim();
  return normalizeAlarmConfig({
    sound: {
      path: custom ? customPath : DEFAULT_ALARM_SOUND,
      custom,
      volume: form.querySelector('input[name="alarmVolume"]')?.value
    },
    audibility: {
      mode: form.querySelector('input[name="alarmAudibility"]:checked')?.value,
      radius: form.querySelector('input[name="alarmRadius"]')?.value,
      easing: form.querySelector('input[name="alarmEasing"]')?.checked === true,
      walls: form.querySelector('input[name="alarmWalls"]')?.checked === true,
      gmAlways: form.querySelector('input[name="alarmGmAlways"]')?.checked === true
    },
    playback: {
      mode: form.querySelector('input[name="alarmPlayback"]:checked')?.value,
      duration: form.querySelector('input[name="alarmDuration"]')?.value
    },
    chat: { mode: form.querySelector('input[name="alarmChat"]:checked')?.value },
    cooldownSeconds: form.querySelector('input[name="alarmCooldown"]')?.value
  });
}

function readAlarmWizardSelection(form) {
  const alarm = readAlarmConfigFromForm(form);
  const spatial = alarm.audibility.mode === ALARM_AUDIBILITY_MODES.SPATIAL;
  return {
    trapType: "alarm",
    triggerType: TRIGGER_TYPES.TILE,
    widthCells: clampCellCount(form.querySelector('input[name="widthCells"]')?.value),
    heightCells: clampCellCount(form.querySelector('input[name="heightCells"]')?.value),
    originMode: spatial
      ? normalizeOriginMode(form.querySelector('input[name="originMode"]:checked')?.value)
      : ORIGIN_MODES.TRIGGER_TILE,
    targetMode: TARGET_MODES.NONE,
    areaMode: AREA_MODES.NONE,
    alarm,
    pauseOnTrigger: form.querySelector('input[name="pauseOnTrigger"]')?.checked === true,
    disarmAfterTrigger: form.querySelector('input[name="disarmAfterTrigger"]')?.checked === true,
    discovery: normalizeDiscoveryConfig(form._easyTrapsDiscovery ?? getDiscoveryDefaults())
  };
}

function updateAlarmWizardConditionalFields(form) {
  const custom = form.querySelector('input[name="alarmSoundMode"]:checked')?.value === "custom";
  const customRow = form.querySelector('[data-alarm-custom-row]');
  if (customRow) customRow.hidden = !custom;
  const spatial = form.querySelector('input[name="alarmAudibility"]:checked')?.value === ALARM_AUDIBILITY_MODES.SPATIAL;
  const spatialOptions = form.querySelector('[data-alarm-spatial-options]');
  if (spatialOptions) spatialOptions.hidden = !spatial;
  const originOptions = form.querySelector('[data-alarm-origin-options]');
  if (originOptions) originOptions.hidden = !spatial;
  if (!spatial) {
    const triggerOrigin = form.querySelector(`input[name="originMode"][value="${ORIGIN_MODES.TRIGGER_TILE}"]`);
    if (triggerOrigin) triggerOrigin.checked = true;
  }
  const sustained = form.querySelector('input[name="alarmPlayback"]:checked')?.value === ALARM_PLAYBACK_MODES.SUSTAINED;
  const durationRow = form.querySelector('[data-alarm-duration-row]');
  if (durationRow) durationRow.hidden = !sustained;
  const repeatable = form.querySelector('input[name="disarmAfterTrigger"]')?.checked !== true;
  const cooldownRow = form.querySelector('[data-alarm-cooldown-row]');
  if (cooldownRow) cooldownRow.hidden = !repeatable;
}

async function browseAlarmSound(form) {
  const input = form?.querySelector?.('input[name="alarmSoundPath"]');
  if (!input) return false;
  const FilePickerClass = foundry?.applications?.apps?.FilePicker?.implementation
    ?? foundry?.applications?.apps?.FilePicker
    ?? globalThis.FilePicker;
  if (!FilePickerClass) return ui.notifications.warn("Foundry's audio browser is unavailable.");
  try {
    const picker = new FilePickerClass({
      type: "audio",
      current: input.value || "",
      callback: path => {
        input.value = String(path ?? "");
        const custom = form.querySelector('input[name="alarmSoundMode"][value="custom"]');
        if (custom) custom.checked = true;
        updateAlarmWizardConditionalFields(form);
      }
    });
    picker.render?.(true);
    return true;
  } catch (error) {
    console.warn(`${MODULE_ID} | Could not open Foundry audio browser`, error);
    ui.notifications.warn("The audio browser could not be opened.");
    return false;
  }
}

async function previewAlarmFromForm(form) {
  const config = readAlarmConfigFromForm(form);
  if (!hasSupportedAudioExtension(config.sound.path)) return ui.notifications.warn("Choose a supported alarm audio file first.");
  try {
    await playAlarmLocally(config, { forceOnce: true });
    return true;
  } catch (error) {
    console.warn(`${MODULE_ID} | Alarm preview failed`, error);
    ui.notifications.warn(`The alarm preview could not be played: ${error?.message ?? error}`);
    return false;
  }
}

function setAlarmWizardPlacementState(form, selection, phase = "trigger") {
  const setup = form.querySelector('[data-wizard-stage="setup"]');
  const placement = form.querySelector('[data-wizard-stage="placement"]');
  if (setup) setup.hidden = true;
  if (placement) placement.hidden = false;
  form.classList.add("et-placement-active");
  updateWizardTriggerTypeControls(form, selection);
  const config = normalizeAlarmConfig(selection.alarm);
  const name = form.querySelector('[data-selected-name]');
  if (name) name.textContent = alarmSoundLabel(config);
  const meta = form.querySelector('[data-selected-meta]');
  if (meta) meta.textContent = `${alarmAudibilityLabel(config.audibility.mode)} · ${alarmPlaybackLabel(config)}`;
  const sound = form.querySelector('[data-placement-alarm-sound]');
  if (sound) sound.textContent = alarmSoundLabel(config);
  const audibility = form.querySelector('[data-placement-alarm-audibility]');
  if (audibility) audibility.textContent = config.audibility.mode === ALARM_AUDIBILITY_MODES.SPATIAL
    ? `Spatial · ${config.audibility.radius} ${sceneDistanceUnits()}`
    : alarmAudibilityLabel(config.audibility.mode);
  const playback = form.querySelector('[data-placement-alarm-playback]');
  if (playback) playback.textContent = alarmPlaybackLabel(config);
  const origin = form.querySelector('[data-placement-origin]');
  if (origin) {
    const spatial = config.audibility.mode === ALARM_AUDIBILITY_MODES.SPATIAL;
    const row = origin.closest("span");
    if (row) row.hidden = !spatial;
    origin.textContent = selection.originMode === ORIGIN_MODES.SEPARATE_TILE ? "From another point" : "From the trigger";
  }
  const pause = form.querySelector('[data-placement-pause]');
  if (pause) pause.textContent = selection.pauseOnTrigger ? "Yes" : "No";
  const disarm = form.querySelector('[data-placement-disarm]');
  if (disarm) disarm.textContent = selection.disarmAfterTrigger ? "Disarm" : `Stay armed · ${config.cooldownSeconds}s cooldown`;
  const chat = form.querySelector('[data-placement-alarm-chat]');
  if (chat) chat.textContent = alarmChatLabel(config.chat.mode);
  const discovery = form.querySelector('[data-placement-discovery]');
  if (discovery) discovery.textContent = discoverySummary(selection.discovery);
  updateAlarmWizardPlacementPhase(form, selection, phase);
}

function updateAlarmWizardPlacementPhase(form, selection, phase) {
  const isOrigin = phase === "origin";
  form.classList.toggle("et-origin-placement", isOrigin);
  form.classList.remove("et-area-placement", "et-target-placement");
  const kicker = form.querySelector('[data-placement-kicker]');
  const title = form.querySelector('[data-placement-title]');
  const instruction = form.querySelector('[data-placement-instruction]');
  const icon = form.querySelector('[data-placement-icon]');
  if (kicker) kicker.textContent = isOrigin ? "Place alarm origin" : "Place trigger";
  if (isOrigin) {
    if (title) title.textContent = "Choose where the alarm originates";
    if (instruction) instruction.textContent = "Click one grid cell for the separate origin. Press Esc to return.";
    if (icon) icon.className = "fa-solid fa-volume-high";
    return;
  }
  updateWizardTriggerTypeControls(form, selection);
  const type = normalizeTriggerType(selection.triggerType);
  if (type === TRIGGER_TYPES.DOOR) {
    if (title) title.textContent = "Draw the alarmed door";
    if (instruction) instruction.textContent = "Click the first endpoint, then the second. Opening this Door activates the alarm.";
    if (icon) icon.className = "fa-solid fa-door-open";
  } else if (type === TRIGGER_TYPES.ITEM_PILE) {
    if (title) title.textContent = "Place the alarmed Item Pile";
    if (instruction) instruction.textContent = "Click one grid cell. EasyTraps creates a real Item Pile there.";
    if (icon) icon.className = "fa-solid fa-box-open";
  } else {
    if (title) title.textContent = `Choose the ${selection.widthCells}×${selection.heightCells} trigger area`;
    if (instruction) instruction.textContent = "Click the top-left grid cell. Press Esc to return.";
    if (icon) icon.className = "fa-solid fa-location-crosshairs";
  }
}

function activateAlarmCreationWizard(root, { dialog, finish, isClosed }) {
  const form = root?.matches?.("form.easy-traps-alarm-wizard") ? root : root?.querySelector?.("form.easy-traps-alarm-wizard");
  if (!form || form.dataset.activated === "true") return;
  form.dataset.activated = "true";
  const appElement = dialog?.element?.[0] ?? form.closest?.(".app, .application, .window-app");
  form._easyTrapsDiscovery = normalizeDiscoveryConfig(getDiscoveryDefaults());
  appElement?.classList?.add("easy-traps-wizard-window", "easy-traps-alarm-wizard-window");
  form.closest?.(".window-content")?.classList?.add("easy-traps-wizard-content");
  form.addEventListener("submit", event => event.preventDefault());
  form.addEventListener("change", event => {
    if (event.target?.matches?.('input[name="alarmSoundMode"], input[name="alarmAudibility"], input[name="alarmPlayback"], input[name="disarmAfterTrigger"]')) {
      updateAlarmWizardConditionalFields(form);
    }
  });
  form.addEventListener("click", async event => {
    const triggerTypeButton = event.target?.closest?.("[data-trigger-type]");
    if (triggerTypeButton) {
      event.preventDefault();
      if (triggerTypeButton.disabled) return ui.notifications.warn("Item Piles must be active to place an Item Pile trigger.");
      const selection = form._easyTrapsPlacementSelection;
      if (!selection) return;
      selection.triggerType = normalizeTriggerType(triggerTypeButton.dataset.triggerType);
      updateAlarmWizardPlacementPhase(form, selection, "trigger");
      return;
    }
    const alarmAction = event.target?.closest?.("[data-alarm-action]")?.dataset.alarmAction;
    if (alarmAction === "browse") {
      event.preventDefault();
      await browseAlarmSound(form);
      return;
    }
    if (alarmAction === "preview") {
      event.preventDefault();
      await previewAlarmFromForm(form);
    }
  });
  updateAlarmWizardConditionalFields(form);
  updateWizardAdvancedSummary(form);
  form.querySelector('[data-wizard-action="cancel"]')?.addEventListener("click", () => dialog.close());
  form.querySelector('[data-wizard-action="cancel-placement"]')?.addEventListener("click", () => runtime.cancelPlacement?.());
  form.querySelector('[data-wizard-action="advanced"]')?.addEventListener("click", () => openAdvancedSettingsForWizard(form));
  form.querySelector('[data-wizard-action="place"]')?.addEventListener("click", async event => {
    const button = event.currentTarget;
    if (button.disabled || runtime.placing) return;
    const rawCustom = form.querySelector('input[name="alarmSoundMode"]:checked')?.value === "custom";
    const rawPath = String(form.querySelector('input[name="alarmSoundPath"]')?.value ?? "").trim();
    if (rawCustom && !rawPath) return ui.notifications.warn("Choose a custom alarm sound file first.");
    const selection = readAlarmWizardSelection(form);
    if (!hasSupportedAudioExtension(selection.alarm.sound.path)) return ui.notifications.warn("Choose a supported alarm audio file before placing the trap.");
    button.disabled = true;
    button.setAttribute("aria-busy", "true");
    form._easyTrapsPlacementSelection = selection;
    setAlarmWizardPlacementState(form, selection, "trigger");
    setWizardWindowPosition(dialog, true);
    const placementUi = { setPhase: phase => updateAlarmWizardPlacementPhase(form, selection, phase) };
    let trigger = null;
    try {
      trigger = await placeAlarmTrap(selection, placementUi);
    } finally {
      button.disabled = false;
      button.removeAttribute("aria-busy");
    }
    if (trigger) {
      finish(trigger);
      await dialog.close();
      return;
    }
    if (!isClosed()) {
      restoreWizardSetup(form);
      setWizardWindowPosition(dialog, false);
    }
  });
}

function openAlarmCreationWizard() {
  if (!globalThis.Dialog) {
    ui.notifications.error("The alarm trap creator could not open because the Foundry Dialog API is unavailable.");
    return null;
  }
  const content = buildAlarmWizardContent();
  return new Promise(resolve => {
    let settled = false;
    let closed = false;
    const finish = value => {
      if (settled) return;
      settled = true;
      resolve(value ?? null);
    };
    const dialog = new Dialog({
      title: "EasyTraps — Alarm Trap",
      content,
      buttons: {},
      render: html => {
        const root = html?.[0] ?? html;
        activateAlarmCreationWizard(root, { dialog, finish, isClosed: () => closed });
        setWizardWindowPosition(dialog, false);
      },
      close: () => {
        closed = true;
        runtime.cancelPlacement?.();
        finish(null);
      }
    }, {
      width: Math.min(720, Math.max(600, window.innerWidth - 160)),
      height: Math.min(760, window.innerHeight - 90),
      resizable: true
    });
    dialog.render(true);
  });
}

function snapGridVertex(point) {
  const size = Number(canvas.grid?.size ?? canvas.scene?.grid?.size) || 100;
  const d = canvas.dimensions;
  return {
    x: d.sceneX + Math.round((Number(point.x) - d.sceneX) / size) * size,
    y: d.sceneY + Math.round((Number(point.y) - d.sceneY) / size) * size
  };
}

function controllerPointForDoor(start, end) {
  return snapCell({ x: (Number(start.x) + Number(end.x)) / 2, y: (Number(start.y) + Number(end.y)) / 2 });
}

function doorControllerGeometryForWall(wallDocument, scene = wallDocument?.parent ?? canvas.scene) {
  const segment = segmentFromDoorDocument(wallDocument);
  if (!segment) return null;
  return doorControllerTileGeometry(segment.start, segment.end, {
    thickness: doorSourceBandHalfWidth(scene) * 2,
    minLength: 1
  });
}

function triggerSourceOwnershipForTrap(trap) {
  if (!trap || !isExternalTriggerType(trap.triggerType)) return null;
  return normalizeTriggerSourceOwnership(trap.triggerSourceOwnership, TRIGGER_SOURCE_OWNERSHIP.CREATED);
}

async function linkTriggerSourceDocument(sourceDocument, controllerTile, triggerType) {
  if (!sourceDocument || !controllerTile) return;
  const trap = trapData(controllerTile);
  const existing = sourceLinkFromDocument(sourceDocument, MODULE_ID);
  const ownership = normalizeTriggerSourceOwnership(
    trap?.triggerSourceOwnership ?? existing?.ownership,
    TRIGGER_SOURCE_OWNERSHIP.CREATED
  );
  const payload = sourceLinkFlag({
    type: triggerType,
    controllerTileId: controllerTile.id,
    controllerTileUuid: controllerTile.uuid,
    ownership
  });
  await sourceDocument.update({ [`flags.${MODULE_ID}.triggerSource`]: payload }, { easyTrapsInternal: true });
}

async function deleteItemPileDocument(tokenDocument) {
  if (!tokenDocument) return false;
  const api = game.modules.get("item-piles")?.active === true ? game.itempiles?.API : null;
  if (typeof api?.deleteItemPile === "function") {
    try {
      await api.deleteItemPile(tokenDocument);
      return true;
    } catch (error) {
      console.warn(`${MODULE_ID} | Item Piles API deletion failed; falling back to Token deletion`, error);
    }
  }
  if (tokenDocument?.parent?.tokens?.has?.(tokenDocument.id)) {
    await tokenDocument.parent.deleteEmbeddedDocuments("Token", [tokenDocument.id], { easyTrapsInternal: true });
    return true;
  }
  return false;
}

async function deleteTriggerSourceForController(controllerTile) {
  const trap = trapData(controllerTile);
  if (!trap || !isExternalTriggerType(trap.triggerType)) return;
  const uuid = String(trap.triggerSourceUuid ?? "").trim();
  if (!uuid) return;
  try {
    const source = await fromUuid(uuid);
    if (!source) return;
    const sourceLink = sourceLinkFromDocument(source, MODULE_ID);
    const ownership = normalizeTriggerSourceOwnership(
      trap.triggerSourceOwnership ?? sourceLink?.ownership,
      TRIGGER_SOURCE_OWNERSHIP.CREATED
    );
    if (ownership !== TRIGGER_SOURCE_OWNERSHIP.CREATED) {
      if (source.unsetFlag instanceof Function) await source.unsetFlag(MODULE_ID, "triggerSource");
      return;
    }
    if (source.documentName === "Wall") await source.parent?.deleteEmbeddedDocuments?.("Wall", [source.id], { easyTrapsInternal: true });
    else if (source.documentName === "Token" && normalizeTriggerType(trap.triggerType) === TRIGGER_TYPES.ITEM_PILE) await deleteItemPileDocument(source);
    else if (source.documentName === "Token") await source.parent?.deleteEmbeddedDocuments?.("Token", [source.id], { easyTrapsInternal: true });
    else if (source.delete instanceof Function) await source.delete({ easyTrapsInternal: true });
  } catch (error) {
    console.warn(`${MODULE_ID} | Could not clean linked trigger source`, error);
  }
}

async function createDoorTrapController(subject, start, end, controllerOptions) {
  const scene = canvas.scene;
  const doorType = CONST?.WALL_DOOR_TYPES?.DOOR ?? 1;
  const closedState = CONST?.WALL_DOOR_STATES?.CLOSED ?? 0;
  const normal = CONST?.WALL_RESTRICTION_TYPES?.NORMAL ?? 20;
  const [wall] = await scene.createEmbeddedDocuments("Wall", [{
    c: [start.x, start.y, end.x, end.y],
    move: normal,
    sight: normal,
    light: normal,
    sound: normal,
    door: doorType,
    ds: closedState
  }], { easyTrapsInternal: true });
  if (!wall) throw new Error("Foundry did not create the Door Wall.");

  let controller = null;
  try {
    controller = await createTrapTriggerTile(subject, controllerPointForDoor(start, end), {
      ...controllerOptions,
      widthCells: 1,
      heightCells: 1,
      triggerType: TRIGGER_TYPES.DOOR,
      triggerSourceId: wall.id,
      triggerSourceUuid: wall.uuid,
      triggerSourceOwnership: TRIGGER_SOURCE_OWNERSHIP.CREATED
    });
    await linkTriggerSourceDocument(wall, controller, TRIGGER_TYPES.DOOR);
    await syncDoorControllerToSource(wall, controller);
    return controller;
  } catch (error) {
    if (wall?.parent?.walls?.has?.(wall.id)) await wall.parent.deleteEmbeddedDocuments("Wall", [wall.id], { easyTrapsInternal: true }).catch(() => {});
    if (controller?.parent?.tiles?.has?.(controller.id)) await controller.parent.deleteEmbeddedDocuments("Tile", [controller.id], { easyTrapsInternal: true }).catch(() => {});
    throw error;
  }
}

async function createItemPileTrapController(subject, point, controllerOptions) {
  const api = game.itempiles?.API;
  if (!game.modules.get("item-piles")?.active || typeof api?.createItemPile !== "function") {
    throw new Error("Item Piles must be active to create an Item Pile trigger.");
  }
  const scene = canvas.scene;
  const position = snapCell(point);
  const created = await api.createItemPile({ position, sceneId: scene.id });
  // Item Piles versions have returned either the created Token UUID directly
  // or a small result object. Accept both public shapes without depending on
  // private implementation details.
  const tokenUuid = String(typeof created === "string" ? created : (created?.tokenUuid ?? created?.uuid ?? "")).trim();
  const source = tokenUuid ? await fromUuid(tokenUuid) : null;
  const tokenDocument = source?.document ?? source;
  if (!tokenDocument || tokenDocument.documentName !== "Token") throw new Error("Item Piles did not return the created Token document.");

  let controller = null;
  try {
    controller = await createTrapTriggerTile(subject, { x: Number(tokenDocument.x), y: Number(tokenDocument.y) }, {
      ...controllerOptions,
      widthCells: 1,
      heightCells: 1,
      triggerType: TRIGGER_TYPES.ITEM_PILE,
      triggerSourceId: tokenDocument.id,
      triggerSourceUuid: tokenDocument.uuid,
      triggerSourceOwnership: TRIGGER_SOURCE_OWNERSHIP.CREATED
    });
    await linkTriggerSourceDocument(tokenDocument, controller, TRIGGER_TYPES.ITEM_PILE);
    await syncItemPileControllerToSource(tokenDocument, controller);
    return controller;
  } catch (error) {
    await deleteItemPileDocument(tokenDocument).catch(() => {});
    if (controller?.parent?.tiles?.has?.(controller.id)) await controller.parent.deleteEmbeddedDocuments("Tile", [controller.id], { easyTrapsInternal: true }).catch(() => {});
    throw error;
  }
}

/**
 * Trigger-source placement seam. The visible source can be an ordinary Tile, a
 * Foundry Door Wall, or a real Item Pile Token. Door and Item Pile traps retain
 * a hidden controller Tile so trap configuration, discovery/disarm, origin
 * state, and Scene Manager behavior stay on one authoritative trap document.
 */
async function placeTrapTriggerSource(subject, selection, controllerOptions) {
  if (runtime.placing) return null;
  const stage = canvas.stage;
  if (!stage?.on) throw new Error("The canvas is not ready for trigger placement.");
  runtime.placing = true;
  const preview = globalThis.PIXI?.Graphics ? new PIXI.Graphics() : null;
  const host = overlayHost();
  if (preview && host?.addChild) {
    preview.eventMode = "none";
    preview.zIndex = 1300;
    host.addChild(preview);
  }
  const previousCursor = (canvas.app?.canvas ?? canvas.app?.view)?.style?.cursor ?? "";
  const cursorTarget = canvas.app?.canvas ?? canvas.app?.view;
  if (cursorTarget?.style) cursorTarget.style.cursor = "crosshair";

  return new Promise(resolve => {
    let finished = false;
    let doorStart = null;
    const cleanup = result => {
      if (finished) return;
      finished = true;
      stage.off("pointermove", onPointerMove);
      stage.off("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown, true);
      try { preview?.destroy?.({ children: true }); } catch {}
      if (cursorTarget?.style) cursorTarget.style.cursor = previousCursor;
      runtime.placing = false;
      if (runtime.cancelPlacement === cancelPlacement) runtime.cancelPlacement = null;
      resolve(result ?? null);
    };
    const cancelPlacement = () => cleanup(null);
    runtime.cancelPlacement = cancelPlacement;
    const onKeyDown = event => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      cancelPlacement();
    };
    const onPointerMove = event => {
      if (finished || !preview) return;
      const point = pointerToCanvas(event);
      preview.clear();
      if (!point || !isPointInScene(point)) return;
      const type = normalizeTriggerType(selection.triggerType);
      if (type !== TRIGGER_TYPES.DOOR) doorStart = null;
      if (type === TRIGGER_TYPES.DOOR) {
        const current = snapGridVertex(point);
        if (doorStart) drawOverlayLine(preview, doorStart.x, doorStart.y, current.x, current.y, 0xe0b867, 0.95, 4);
        else drawOverlayCircle(preview, current.x, current.y, 8, 0xe0b867, 0.95, 0.12);
        return;
      }
      const geometry = sceneGeometry();
      const width = type === TRIGGER_TYPES.TILE ? clampCellCount(selection.widthCells) : 1;
      const height = type === TRIGGER_TYPES.TILE ? clampCellCount(selection.heightCells) : 1;
      const offsets = rectangleOffsets(width, height);
      const baseCell = clampBaseCell(sceneCellFromPoint(point, geometry), offsets, geometry);
      drawGridCells(preview, absoluteTriggerCells(baseCell, offsets), geometry, { preview: true, armed: true, origin: false });
    };
    const onPointerDown = async event => {
      if (finished || event.button !== 0) return;
      event.stopPropagation?.();
      const point = pointerToCanvas(event);
      if (!point || !isPointInScene(point)) return;
      const type = normalizeTriggerType(selection.triggerType);
      if (type !== TRIGGER_TYPES.DOOR) doorStart = null;
      if (type === TRIGGER_TYPES.DOOR && !doorStart) {
        doorStart = snapGridVertex(point);
        ui.notifications.info("Door start selected. Click the second endpoint.");
        return;
      }
      const pointerReleased = waitForPlacementPointerRelease(event);
      try {
        let controller;
        if (type === TRIGGER_TYPES.DOOR) {
          const end = snapGridVertex(point);
          if (Math.hypot(end.x - doorStart.x, end.y - doorStart.y) < 1) {
            ui.notifications.warn("Choose a different second point for the Door.");
            return;
          }
          controller = await createDoorTrapController(subject, doorStart, end, controllerOptions);
        } else if (type === TRIGGER_TYPES.ITEM_PILE) {
          controller = await createItemPileTrapController(subject, point, controllerOptions);
        } else {
          controller = await createTrapTriggerTile(subject, snapCell(point), {
            ...controllerOptions,
            widthCells: clampCellCount(selection.widthCells),
            heightCells: clampCellCount(selection.heightCells),
            triggerType: TRIGGER_TYPES.TILE
          });
        }
        await pointerReleased;
        await waitForCanvasFrames(2);
        cleanup(controller);
      } catch (error) {
        console.error(`${MODULE_ID} | Trigger-source placement failed`, error);
        ui.notifications.error(`The trigger could not be created: ${error?.message ?? String(error ?? "Unknown error")}`);
        cleanup(null);
      }
    };
    stage.on("pointermove", onPointerMove);
    stage.on("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown, true);
  });
}

async function placeFloorTrigger(spell, selection, placementUi = null) {
  const normalizedOrigin = normalizeOriginMode(selection.originMode);
  const normalizedTarget = normalizeTargetMode(selection.targetMode);
  const normalizedArea = normalizeAreaMode(selection.areaMode);
  const targetingProfile = normalizeTargetingProfile(selection.targetingProfile);
  placementUi?.setPhase?.("trigger");
  const controllerOptions = {
    originMode: normalizedOrigin,
    activityId: selection.activityId,
    targetMode: normalizedTarget,
    areaMode: normalizedArea,
    targetingProfile,
    effectiveTarget: selection.effectiveTarget,
    requiresNativeInteraction: selection.requiresNativeInteraction,
    activityType: selection.activityType,
    activityLabel: selection.activityLabel,
    activityCount: selection.activityCount,
    sourceModifiedTime: selection.sourceModifiedTime,
    castLevel: selection.castLevel,
    cantripCasterLevel: selection.cantripCasterLevel,
    scaling: selection.scaling,
    spellSaveDc: selection.spellSaveDc,
    spellAttackBonus: selection.spellAttackBonus,
    pauseOnTrigger: selection.pauseOnTrigger,
    disarmAfterTrigger: selection.disarmAfterTrigger,
    discovery: selection.discovery
  };
  const triggerTile = await placeTrapTriggerSource(spell, selection, controllerOptions);
  if (!triggerTile) return null;

  let originTile = null;
  if (normalizedOrigin === ORIGIN_MODES.SEPARATE_TILE) {
    placementUi?.setPhase?.("origin");
    originTile = await placeSeparateTrapOriginTile(spell, triggerTile);
    if (!originTile) {
      await deleteCreatedTrapDocuments(triggerTile, null);
      return null;
    }
    await triggerTile.update({
      [`flags.${MODULE_ID}.originTileId`]: originTile.id,
      [`flags.${MODULE_ID}.originTileUuid`]: originTile.uuid
    });
  }


  if (normalizedTarget === TARGET_MODES.CUSTOM_ZONE) {
    placementUi?.setPhase?.("targets");
    const selectionZone = await placeCustomTargetZone({
      widthCells: selection.selectionZoneWidth,
      heightCells: selection.selectionZoneHeight
    });
    if (!selectionZone) {
      await deleteCreatedTrapDocuments(triggerTile, originTile);
      return null;
    }
    await triggerTile.update({ [`flags.${MODULE_ID}.selectionZone`]: selectionZone });
  }

  if (normalizedArea === AREA_MODES.PREPLACED) {
    placementUi?.setPhase?.("area");
    const referencePoint = setupTemplateReferencePoint(triggerTile, originTile, normalizedOrigin);
    const templates = await capturePreplacedTemplates(spell, selection.activityId, referencePoint, selection.effectiveTarget);
    if (!templates?.length) {
      await deleteCreatedTrapDocuments(triggerTile, originTile);
      return null;
    }
    await triggerTile.update({ [`flags.${MODULE_ID}.templates`]: templates });
  }

  await setTrapEnabled(triggerTile, true);
  await rememberCreationDefaults(selection);
  refreshTriggerOverlays();
  return triggerTile;
}

async function placeAlarmTrap(selection, placementUi = null) {
  const alarm = normalizeAlarmConfig(selection.alarm);
  const normalizedOrigin = alarm.audibility.mode === ALARM_AUDIBILITY_MODES.SPATIAL
    ? normalizeOriginMode(selection.originMode)
    : ORIGIN_MODES.TRIGGER_TILE;
  const subject = { name: ALARM_TRAP_NAME, img: DEFAULT_TRIGGER_TEXTURE };
  placementUi?.setPhase?.("trigger");
  const controllerOptions = {
    trapType: "alarm",
    originMode: normalizedOrigin,
    alarm,
    pauseOnTrigger: selection.pauseOnTrigger,
    disarmAfterTrigger: selection.disarmAfterTrigger,
    discovery: selection.discovery
  };
  const triggerTile = await placeTrapTriggerSource(subject, selection, controllerOptions);
  if (!triggerTile) return null;

  let originTile = null;
  if (normalizedOrigin === ORIGIN_MODES.SEPARATE_TILE) {
    placementUi?.setPhase?.("origin");
    originTile = await placeSeparateTrapOriginTile(subject, triggerTile);
    if (!originTile) {
      await deleteCreatedTrapDocuments(triggerTile, null);
      return null;
    }
    await triggerTile.update({
      [`flags.${MODULE_ID}.originTileId`]: originTile.id,
      [`flags.${MODULE_ID}.originTileUuid`]: originTile.uuid
    });
  }

  await setTrapEnabled(triggerTile, true);
  refreshTriggerOverlays();
  refreshAreaOverlays();
  return triggerTile;
}

async function collapseNonSpatialAlarmOrigin(tile, trap = trapData(tile), config = normalizeAlarmConfig(trap?.alarm)) {
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

async function cleanupNonSpatialAlarmOrigins(scene = canvas.scene) {
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

async function deleteCreatedTrapDocuments(triggerTile, originTile) {
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

async function placeSeparateTrapOriginTile(subject, triggerTile) {
  return placeGridDocument({
    width: 1,
    height: 1,
    originPreview: true,
    createDocument: point => createTrapOriginTile(subject, triggerTile, point)
  });
}

async function placeCustomTargetZone({ widthCells = 1, heightCells = 1 } = {}) {
  const width = clampCellCount(widthCells);
  const height = clampCellCount(heightCells);
  return placeGridDocument({
    width,
    height,
    createDocument: async point => {
      const geometry = sceneGeometry();
      const offsets = rectangleOffsets(width, height);
      const baseCell = clampBaseCell(sceneCellFromPoint(point, geometry), offsets, geometry);
      const marker = markerDataForBaseCell(baseCell, offsets, geometry);
      return {
        x: marker.x,
        y: marker.y,
        width: marker.width,
        height: marker.height,
        widthCells: width,
        heightCells: height
      };
    }
  });
}

async function placeGridDocument({ width = 1, height = 1, createDocument, originPreview = false }) {
  if (runtime.placing) return ui.notifications.warn("Finish the current placement first.");
  runtime.placing = true;
  try { await canvas.tiles?.activate?.(); } catch (_error) { /* layer activation is optional */ }

  const stage = canvas.stage;
  const previousCursor = stage.cursor;
  stage.cursor = "crosshair";
  stage.eventMode = stage.eventMode === "none" ? "static" : stage.eventMode;
  const preview = createPlacementPreview();

  return new Promise(resolve => {
    let finished = false;
    const cleanup = result => {
      if (finished) return;
      finished = true;
      stage.off("pointerdown", onPointerDown);
      stage.off("pointermove", onPointerMove);
      window.removeEventListener("keydown", onKeyDown, true);
      try { preview?.destroy({ children: true }); } catch (_error) { /* already destroyed */ }
      stage.cursor = previousCursor;
      runtime.placing = false;
      if (runtime.cancelPlacement === cancelPlacement) runtime.cancelPlacement = null;
      resolve(result ?? null);
    };
    const cancelPlacement = () => cleanup(null);
    runtime.cancelPlacement = cancelPlacement;
    const onKeyDown = event => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      cancelPlacement();
    };
    const onPointerMove = event => {
      if (finished || !preview) return;
      const point = pointerToCanvas(event);
      preview.clear();
      if (!point || !isPointInScene(point)) return;
      const geometry = sceneGeometry();
      const offsets = rectangleOffsets(width, height);
      const baseCell = clampBaseCell(sceneCellFromPoint(point, geometry), offsets, geometry);
      drawGridCells(preview, absoluteTriggerCells(baseCell, offsets), geometry, {
        preview: true,
        armed: true,
        origin: originPreview
      });
    };
    const onPointerDown = async event => {
      if (finished || event.button !== 0) return;
      event.stopPropagation?.();
      const point = pointerToCanvas(event);
      if (!point || !isPointInScene(point)) return;
      // Start listening before document creation so a fast pointer-up cannot be missed.
      const pointerReleased = waitForPlacementPointerRelease(event);
      const snapped = snapCell(point);
      try {
        const document = await createDocument(snapped);
        // Do not let the click that placed this Tile confirm the next D&D5e template preview.
        await pointerReleased;
        await waitForCanvasFrames(2);
        cleanup(document);
      } catch (error) {
        console.error(`${MODULE_ID} | Placement failed`, error);
        ui.notifications.error(`The placement could not be completed: ${error?.message ?? String(error ?? "Unknown error")}`);
        cleanup(null);
      }
    };
    stage.on("pointermove", onPointerMove);
    stage.on("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown, true);
  });
}

function originModeLabel(mode) {
  const normalized = normalizeOriginMode(mode);
  if (normalized === ORIGIN_MODES.SEPARATE_TILE) return "origin: another point";
  if (normalized === ORIGIN_MODES.TRIGGERING_TOKEN) return "origin: triggering creature";
  return "origin: the trap";
}

function pointerToCanvas(event) {
  const global = event.global ?? event.data?.global;
  if (global && canvas.stage?.toLocal) return canvas.stage.toLocal(global);
  const native = event.nativeEvent ?? event.data?.originalEvent;
  if (native && typeof canvas.canvasCoordinatesFromClient === "function") {
    return canvas.canvasCoordinatesFromClient({ x: native.clientX, y: native.clientY });
  }
  return null;
}

function isPointInScene(point) {
  const d = canvas.dimensions;
  return point.x >= d.sceneX && point.x <= d.sceneX + d.sceneWidth
    && point.y >= d.sceneY && point.y <= d.sceneY + d.sceneHeight;
}

function snapCell(point) {
  const size = canvas.grid.size;
  const d = canvas.dimensions;
  return {
    x: d.sceneX + Math.floor((point.x - d.sceneX) / size) * size,
    y: d.sceneY + Math.floor((point.y - d.sceneY) / size) * size
  };
}

function waitForPlacementPointerRelease(event, timeoutMs = PLACEMENT_POINTER_RELEASE_TIMEOUT_MS) {
  const native = event?.nativeEvent ?? event?.data?.originalEvent ?? event;
  const pointerId = Number.isFinite(Number(native?.pointerId)) ? Number(native.pointerId) : null;
  return new Promise(resolve => {
    let settled = false;
    let timer = null;
    const targets = [window, canvas?.app?.view].filter(Boolean);
    const stage = canvas?.stage;
    const finish = () => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      for (const target of targets) {
        target.removeEventListener?.("pointerup", onRelease, true);
        target.removeEventListener?.("pointercancel", onRelease, true);
        target.removeEventListener?.("mouseup", onRelease, true);
        target.removeEventListener?.("touchend", onRelease, true);
        target.removeEventListener?.("touchcancel", onRelease, true);
      }
      stage?.off?.("pointerup", onRelease);
      stage?.off?.("pointerupoutside", onRelease);
      stage?.off?.("pointercancel", onRelease);
      resolve();
    };
    const onRelease = releaseEvent => {
      if (pointerId !== null && Number.isFinite(Number(releaseEvent?.pointerId)) && Number(releaseEvent.pointerId) !== pointerId) return;
      finish();
    };
    for (const target of targets) {
      target.addEventListener?.("pointerup", onRelease, true);
      target.addEventListener?.("pointercancel", onRelease, true);
      target.addEventListener?.("mouseup", onRelease, true);
      target.addEventListener?.("touchend", onRelease, true);
      target.addEventListener?.("touchcancel", onRelease, true);
    }
    stage?.on?.("pointerup", onRelease);
    stage?.on?.("pointerupoutside", onRelease);
    stage?.on?.("pointercancel", onRelease);
    timer = setTimeout(finish, timeoutMs);
  });
}

async function waitForCanvasFrames(count = 1) {
  const frames = Math.max(1, Number(count) || 1);
  for (let index = 0; index < frames; index += 1) {
    await new Promise(resolve => requestAnimationFrame(() => resolve()));
  }
}

async function createTrapTriggerTile(subject, point, {
  trapType = "spell",
  widthCells = 1,
  heightCells = 1,
  originMode = ORIGIN_MODES.TRIGGER_TILE,
  activityId = null,
  targetMode = TARGET_MODES.NONE,
  areaMode = AREA_MODES.NONE,
  targetingProfile = TARGETING_PROFILES.NONE,
  effectiveTarget = null,
  requiresNativeInteraction = false,
  activityType = null,
  activityLabel = null,
  activityCount = 1,
  sourceModifiedTime = null,
  castLevel = null,
  cantripCasterLevel = null,
  scaling = null,
  spellSaveDc = DEFAULT_SPELL_SAVE_DC,
  spellAttackBonus = DEFAULT_SPELL_ATTACK_BONUS,
  alarm = DEFAULT_ALARM_CONFIG,
  pauseOnTrigger = DEFAULT_PAUSE_ON_TRIGGER,
  disarmAfterTrigger = DEFAULT_DISARM_AFTER_TRIGGER,
  discovery = DEFAULT_DISCOVERY_CONFIG,
  triggerType = TRIGGER_TYPES.TILE,
  triggerSourceId = null,
  triggerSourceUuid = null,
  triggerSourceOwnership = null
} = {}) {
  const geometry = sceneGeometry();
  const width = clampCellCount(widthCells);
  const height = clampCellCount(heightCells);
  const triggerCells = rectangleOffsets(width, height);
  const baseCell = clampBaseCell(sceneCellFromPoint(point, geometry), triggerCells, geometry);
  const marker = markerDataForBaseCell(baseCell, triggerCells, geometry);
  const normalizedOrigin = normalizeOriginMode(originMode);
  const normalizedTriggerType = normalizeTriggerType(triggerType);
  const externalController = isExternalTriggerType(normalizedTriggerType);
  const normalizedTrapType = trapType === "alarm" ? "alarm" : "spell";
  const displayName = String(subject?.name ?? (normalizedTrapType === "alarm" ? "Alarm" : "Spell")).trim() || "Trap";

  const commonFlags = {
    schema: TRIGGER_SCHEMA,
    version: VERSION,
    kind: `${normalizedTrapType}-grid`,
    trapType: normalizedTrapType,
    triggerType: normalizedTriggerType,
    triggerSourceId: triggerSourceId ? String(triggerSourceId) : null,
    triggerSourceUuid: triggerSourceUuid ? String(triggerSourceUuid) : null,
    triggerSourceOwnership: externalController
      ? normalizeTriggerSourceOwnership(triggerSourceOwnership, TRIGGER_SOURCE_OWNERSHIP.CREATED)
      : null,
    discovered: false,
    internalController: externalController,
    armed: false,
    pauseOnTrigger: Boolean(pauseOnTrigger),
    disarmAfterTrigger: Boolean(disarmAfterTrigger),
    discovery: normalizeDiscoveryConfig(discovery),
    requiresReconfiguration: false,
    triggerCells,
    triggerWidth: width,
    triggerHeight: height,
    originMode: normalizedOrigin,
    originTileId: null,
    originTileUuid: null,
    targetMode: normalizedTrapType === "alarm" ? TARGET_MODES.NONE : normalizeTargetMode(targetMode),
    targetingProfile: normalizedTrapType === "alarm" ? TARGETING_PROFILES.NONE : normalizeTargetingProfile(targetingProfile),
    effectiveTarget: normalizedTrapType === "alarm" ? {} : foundry.utils.deepClone(effectiveTarget ?? {}),
    requiresNativeInteraction: normalizedTrapType === "alarm" ? false : Boolean(requiresNativeInteraction),
    areaMode: normalizedTrapType === "alarm" ? AREA_MODES.NONE : normalizeAreaMode(areaMode),
    selectionZone: null,
    templates: []
  };

  if (normalizedTrapType === "alarm") {
    commonFlags.alarmName = displayName;
    commonFlags.alarmImg = String(subject?.img ?? DEFAULT_TRIGGER_TEXTURE) || DEFAULT_TRIGGER_TEXTURE;
    commonFlags.alarm = normalizeAlarmConfig(alarm);
    commonFlags.backend = "matt-alarm";
    commonFlags.workflow = { mode: "alarm", supported: true, reason: "native-foundry-audio" };
  } else {
    const spell = subject;
    commonFlags.spellUuid = spell?.uuid ?? null;
    commonFlags.spellName = displayName;
    commonFlags.spellImg = spell?.img || DEFAULT_TRIGGER_TEXTURE;
    commonFlags.activityId = activityId;
    commonFlags.activityType = String(activityType ?? "activity");
    commonFlags.activityLabel = String(activityLabel ?? activityType ?? "Activity");
    commonFlags.activityCount = Number(activityCount) || 1;
    commonFlags.sourceModifiedTime = sourceModifiedTime;
    commonFlags.castLevel = normalizeCastLevel(castLevel, spell?.system?.level);
    commonFlags.cantripCasterLevel = normalizeSpellBaseLevel(spell?.system?.level) === 0
      ? normalizeCantripCasterLevel(cantripCasterLevel, 1)
      : null;
    commonFlags.scaling = Number.isFinite(Number(scaling))
      ? Math.max(0, Math.trunc(Number(scaling)))
      : normalizeSpellBaseLevel(spell?.system?.level) === 0
        ? cantripScalingIncrease(cantripCasterLevel)
        : castScaling(castLevel, spell?.system?.level);
    commonFlags.spellSaveDc = normalizeSpellSaveDc(spellSaveDc);
    commonFlags.spellAttackBonus = normalizeSpellAttackBonus(spellAttackBonus);
    commonFlags.backend = "matt-native-spell";
    commonFlags.workflow = planSpellWorkflow(spell, activityId);
  }

  const [tile] = await canvas.scene.createEmbeddedDocuments("Tile", [{
    name: `EasyTraps · ${displayName} · ${width}×${height}`,
    x: marker.x,
    y: marker.y,
    width: marker.width,
    height: marker.height,
    rotation: 0,
    alpha: externalController ? 0 : 0.48,
    hidden: true,
    overhead: false,
    texture: { src: configuredTriggerTexture(), fit: "fill", anchorX: 0, anchorY: 0 },
    flags: {
      [MODULE_ID]: commonFlags,
      "monks-active-tiles": buildMattTriggerFlags()
    }
  }]);
  refreshTriggerOverlays();
  return tile;
}

async function createTrapOriginTile(subject, triggerTile, point) {
  const geometry = sceneGeometry();
  const offsets = rectangleOffsets(1, 1);
  const baseCell = clampBaseCell(sceneCellFromPoint(point, geometry), offsets, geometry);
  const marker = markerDataForBaseCell(baseCell, offsets, geometry);
  const trap = trapData(triggerTile);
  const type = trapTypeOf(trap);
  const displayName = trapDisplayName(trap, triggerTile) || String(subject?.name ?? "Trap");
  const [tile] = await canvas.scene.createEmbeddedDocuments("Tile", [{
    name: `EasyTraps · ${displayName}`,
    x: marker.x,
    y: marker.y,
    width: marker.width,
    height: marker.height,
    rotation: 0,
    alpha: 0.52,
    hidden: true,
    overhead: false,
    texture: (() => {
      const src = configuredOriginTexture();
      return {
        src,
        fit: "fill",
        anchorX: 0,
        anchorY: 0,
        ...(src === DEFAULT_ORIGIN_TEXTURE ? { tint: "#67b7ff" } : {})
      };
    })(),
    flags: {
      [MODULE_ID]: {
        schema: TRIGGER_SCHEMA,
        version: VERSION,
        kind: `${type}-origin`,
        trapType: type,
        triggerTileId: triggerTile.id,
        triggerTileUuid: triggerTile.uuid,
        trapName: displayName
      }
    }
  }]);
  return tile;
}


function isRuntimeOriginToken(document) {
  return Boolean(runtimeOriginFlag(document?.document ?? document));
}

function makeRuntimeOriginNonInteractive(token) {
  const document = token?.document ?? token;
  if (!isRuntimeOriginToken(document)) return;
  try {
    token.eventMode = "none";
    token.interactive = false;
    token.interactiveChildren = false;
    token.buttonMode = false;
    token.cursor = "default";

    // Token alpha does not hide every canvas decoration from a GM. In
    // particular, Active Effect icons are rendered by their own container and
    // can remain visible over an otherwise transparent technical caster.
    // Preserve the effects mechanically, but hide their token decorations.
    // Foundry v14 exposes targetArrows (this User) and targetPips (other
    // Users) separately. Hide those public decorations directly and avoid the
    for (const decoration of [token.effects, token.nameplate, token.bars, token.tooltip, token.targetArrows, token.targetPips]) {
      if (!decoration) continue;
      decoration.visible = false;
      decoration.renderable = false;
      decoration.eventMode = "none";
    }
  } catch (_error) { /* rendering safety only */ }
}

function refreshRuntimeOriginActorDecorations(actor) {
  if (!actor) return;
  const tokenDocument = actorRuntimeOriginTokenDocument(actor);
  if (!tokenDocument) return;
  makeRuntimeOriginNonInteractive(tokenDocument.object);
}

function actorRuntimeOriginTokenDocument(actor) {
  const direct = actor?.token?.document ?? actor?.token ?? null;
  if (direct && runtimeOriginFlag(direct)) return direct;
  for (const token of canvas?.scene?.tokens ?? []) {
    if (!runtimeOriginFlag(token)) continue;
    if (token.actor === actor || token.actor?.id === actor?.id) return token;
  }
  return null;
}

function stripRuntimeOriginFromTokenSet(value) {
  if (!(value instanceof Set)) return 0;
  let removed = 0;
  for (const token of [...value]) {
    const document = token?.document ?? token;
    if (!runtimeOriginFlag(document)) continue;
    value.delete(token);
    removed += 1;
  }
  return removed;
}

function stripRuntimeOriginFromMidiWorkflow(workflow) {
  if (!workflow) return;
  const runtimeSpell = runtimeSpellFlag(workflow.item);
  const runtimeCaster = actorRuntimeOriginTokenDocument(workflow.actor);
  if (!runtimeSpell && !runtimeCaster) return;

  for (const key of ["targets", "hitTargets", "hitTargetsEC", "saves", "failedSaves", "superSavers", "semiSuperSavers"]) {
    stripRuntimeOriginFromTokenSet(workflow[key]);
  }

  // Midi auto-targeting can add the invisible caster to the user's target set
  // after a template is placed. Remove only EasyTraps technical origins.
  for (const token of Array.from(game.user?.targets ?? [])) {
    if (!runtimeOriginFlag(token?.document ?? token)) continue;
    try { token.setTarget?.(false, { user: game.user, releaseOthers: false, groupSelection: true }); }
    catch (_error) { /* target cleanup is best effort */ }
  }
}

function onTargetRuntimeOriginToken(user, token, targeted) {
  if (!targeted || !isRuntimeOriginToken(token)) return;
  queueMicrotask(() => {
    try { token.setTarget?.(false, { user, releaseOthers: false, groupSelection: true }); }
    catch (_error) { /* technical origins must never remain targeted */ }
  });
}

function onControlRuntimeOriginToken(token, controlled) {
  if (!isRuntimeOriginToken(token) || !controlled) return;
  queueMicrotask(() => {
    try { token.release?.(); }
    catch (_error) { /* the token may already be released */ }
  });
}

function closeRuntimeOriginTokenHud(hud) {
  if (!isRuntimeOriginToken(hud?.object)) return;
  queueMicrotask(() => hud?.close?.());
}

function removeOriginalTileImageHudAction(root) {
  if (!root?.querySelectorAll) return;
  for (const element of root.querySelectorAll(".control-icon, [title], [data-tooltip], [aria-label]")) {
    const label = [element.getAttribute("title"), element.getAttribute("data-tooltip"), element.getAttribute("aria-label"), element.textContent].filter(Boolean).join(" ");
    if (/(original.*(image|object|tile)|(image|object|tile).*original)/i.test(label)) (element.closest(".control-icon") ?? element).remove();
  }
}

function removeNativeTileVisibilityHudAction(root) {
  if (!root?.querySelectorAll) return;
  const candidates = root.querySelectorAll(".control-icon, [data-action], [data-control], [title], [data-tooltip], [aria-label]");
  for (const element of candidates) {
    if (element.closest?.("[data-easy-traps-hud-controls]")) continue;
    const action = String(element.getAttribute?.("data-action") ?? element.getAttribute?.("data-control") ?? "").toLowerCase();
    const label = [
      element.getAttribute?.("title"),
      element.getAttribute?.("data-tooltip"),
      element.getAttribute?.("aria-label"),
      element.textContent
    ].filter(Boolean).join(" ");
    const icon = element.querySelector?.("i");
    const eyeIcon = Boolean(icon?.classList?.contains("fa-eye") || icon?.classList?.contains("fa-eye-slash"));
    const visibilityAction = ["visibility", "hidden", "togglevisibility", "toggle-visibility"].includes(action);
    const visibilityLabel = /(visibility|visible|hidden|show|hide)/i.test(label);
    if (visibilityAction || (eyeIcon && visibilityLabel)) {
      (element.closest?.(".control-icon") ?? element).remove();
      return;
    }
  }
}

function htmlRoot(root) {
  if (root instanceof HTMLElement) return root;
  if (root?.[0] instanceof HTMLElement) return root[0];
  if (root?.element instanceof HTMLElement) return root.element;
  if (root?.element?.[0] instanceof HTMLElement) return root.element[0];
  return null;
}

function renderTrapTileHud(hud, html) {
  if (!game.user?.isGM) return;
  const tile = hud?.object?.document ?? hud?.object;
  const trap = trapData(tile);
  const origin = originData(tile);
  if (!trap && !origin) return;
  const root = htmlRoot(html) ?? html?.[0] ?? html;
  if (!root?.querySelector) return;

  // Keep trap visuals in EasyTraps Configuration instead of exposing MATT's
  // original-image shortcut on either trigger or separate-origin Tile HUDs.
  // Run once immediately and once after the current render cycle so later HUD
  // hooks are covered.
  removeOriginalTileImageHudAction(root);
  removeNativeTileVisibilityHudAction(root);
  queueMicrotask(() => {
    removeOriginalTileImageHudAction(root);
    removeNativeTileVisibilityHudAction(root);
  });

  // Origin Tiles only need the MATT visual shortcut removed. Armed/Advanced
  // controls belong exclusively to the trigger Tile.
  if (!trap) return;
  if (root.querySelector("[data-easy-traps-hud-controls]")) return;
  const column = root.querySelector(".col.right") ?? root.querySelector(".col.left") ?? root;
  const controls = document.createElement("div");
  controls.className = "easy-traps-hud-controls";
  controls.dataset.easyTrapsHudControls = "true";

  const discovered = trapIsDiscovered(tile, trap);
  const visibilityControl = document.createElement("div");
  visibilityControl.className = `control-icon easy-traps-hud-visibility ${discovered ? "is-discovered" : "is-hidden"}`;
  visibilityControl.dataset.easyTrapsHudToggle = "visibility";
  visibilityControl.title = discovered ? "Hide trap from players" : "Reveal trap to players";
  visibilityControl.setAttribute("aria-label", visibilityControl.title);
  visibilityControl.dataset.tooltip = visibilityControl.title;
  visibilityControl.innerHTML = `<i class="fa-solid ${discovered ? "fa-eye" : "fa-eye-slash"}"></i>`;
  visibilityControl.addEventListener("click", async event => {
    event.preventDefault();
    event.stopPropagation();
    const current = trapData(tile);
    if (!current) return;
    await setTrapDiscovered(tile, !trapIsDiscovered(tile, current));
    try { hud?.render?.(); } catch (_error) { /* HUD refresh is best effort */ }
  });

  const armed = trap.armed !== false && !trap.requiresReconfiguration;
  const armedControl = document.createElement("div");
  armedControl.className = `control-icon easy-traps-hud-toggle ${armed ? "is-armed" : "is-disarmed"}`;
  armedControl.dataset.easyTrapsHudToggle = "armed";
  armedControl.title = trap.requiresReconfiguration ? "This trap must be recreated" : armed ? "Disarm trap" : "Rearm trap";
  armedControl.setAttribute("aria-label", armedControl.title);
  armedControl.dataset.tooltip = armedControl.title;
  armedControl.innerHTML = `<i class="fa-solid ${armed ? "fa-shield-halved" : "fa-rotate-right"}"></i>`;
  if (trap.requiresReconfiguration || (!armed && !trapCanArm(tile, trap))) armedControl.classList.add("disabled");
  armedControl.addEventListener("click", async event => {
    event.preventDefault();
    event.stopPropagation();
    if (armedControl.classList.contains("disabled")) return;
    const current = trapData(tile);
    const next = current?.armed === false;
    if (next && !trapCanArm(tile, current)) return ui.notifications.warn(trapArmBlockReason(tile, current) ?? "This trap cannot be rearmed.");
    await setTrapEnabled(tile, next);
    try { hud?.render?.(); } catch (_error) { /* HUD refresh is best effort */ }
    refreshTriggerOverlays();
    refreshOpenSceneTrapManager();
  });

  const editControl = document.createElement("div");
  editControl.className = "control-icon easy-traps-hud-edit";
  editControl.dataset.easyTrapsHudToggle = "edit";
  editControl.title = "Edit trap";
  editControl.setAttribute("aria-label", editControl.title);
  editControl.dataset.tooltip = editControl.title;
  editControl.innerHTML = '<i class="fa-solid fa-pen-to-square"></i>';
  editControl.addEventListener("click", event => {
    event.preventDefault();
    event.stopPropagation();
    openTrapQuickEditor(tile);
  });

  const advancedControl = document.createElement("div");
  advancedControl.className = `control-icon easy-traps-hud-advanced ${normalizeDiscoveryConfig(trap.discovery).enabled ? "is-enabled" : ""}`;
  advancedControl.dataset.easyTrapsHudToggle = "advanced";
  advancedControl.title = "Discovery & disarming settings";
  advancedControl.setAttribute("aria-label", advancedControl.title);
  advancedControl.dataset.tooltip = advancedControl.title;
  advancedControl.innerHTML = '<i class="fa-solid fa-sliders"></i>';
  advancedControl.addEventListener("click", event => {
    event.preventDefault();
    event.stopPropagation();
    openAdvancedSettingsForTile(tile);
  });

  // Keep EasyTraps controls together and ordered by intent: edit/configuration
  // first, then visibility/state toggles. Native Foundry/MATT controls remain
  // untouched above this group.
  controls.append(editControl, advancedControl, visibilityControl, armedControl);
  column.append(controls);
}

function onPreUpdateToken(tokenDocument, changes, options = {}) {
  if (!runtimeOriginFlag(tokenDocument)) return;
  if (options?.easyTrapsInternal) return;
  const protectedFields = ["x", "y", "elevation", "rotation", "width", "height", "hidden", "alpha", "displayName", "displayBars", "locked"];
  if (protectedFields.some(path => hasChange(changes, path))) return false;
}


/**
 * Passive discovery can become newly valid without token movement: a door can
 * open, a wall can move/change sight restriction, or a Token vision source can
 * be refreshed. Foundry's sightRefresh hook is the broad signal; Wall hooks
 * and vision-relevant Token updates are retained as reliable document seams.
 * Rechecks are throttled and always resolved by the primary GM.
 */
function onSightRefreshDiscovery() {
  scheduleVisionDiscoveryRecheck();
}

function onTokenVisionChangedDiscovery(tokenDocument, changes = {}) {
  if (!tokenDocument?.actor?.hasPlayerOwner || runtimeOriginFlag(tokenDocument)) return;
  const relevant = ["x", "y", "elevation", "width", "height", "hidden", "sight", "detectionModes"]
    .some(path => hasChange(changes, path));
  if (relevant) scheduleVisionDiscoveryRecheck();
}

function scheduleVisionDiscoveryRecheck() {
  if (!isPrimaryGM() || !canvas.ready || !canvas.scene) return;
  if (runtime.discoveryVisionRecheckRunning) {
    runtime.discoveryVisionRecheckAgain = true;
    return;
  }
  if (runtime.discoveryVisionRecheckTimer) return;
  runtime.discoveryVisionRecheckTimer = setTimeout(() => {
    runtime.discoveryVisionRecheckTimer = null;
    reevaluatePassiveDiscoveryForScene().catch(error => {
      console.error(`${MODULE_ID} | Vision-change passive discovery recheck failed`, error);
    });
  }, DISCOVERY_VISION_RECHECK_DELAY_MS);
}

async function reevaluatePassiveDiscoveryForScene() {
  if (!isPrimaryGM() || !canvas.ready || !canvas.scene) return [];
  if (runtime.discoveryVisionRecheckRunning) {
    runtime.discoveryVisionRecheckAgain = true;
    return [];
  }
  runtime.discoveryVisionRecheckRunning = true;
  const found = [];
  try {
    const tokens = Array.from(canvas.scene.tokens ?? []).filter(token =>
      token?.actor?.hasPlayerOwner && token.hidden !== true && !runtimeOriginFlag(token)
    );
    for (const token of tokens) {
      const discovered = await evaluateMovedTokenDiscovery(token);
      if (discovered?.length) found.push(...discovered);
    }
    return found;
  } finally {
    runtime.discoveryVisionRecheckRunning = false;
    if (runtime.discoveryVisionRecheckAgain) {
      runtime.discoveryVisionRecheckAgain = false;
      scheduleVisionDiscoveryRecheck();
    }
  }
}

/**
 * Movement remains an immediate discovery signal. sightRefresh also covers it,
 * but retaining moveToken avoids waiting for the throttled broad recheck.
 */
function onMoveTokenDiscovery(tokenDocument) {
  if (!isPrimaryGM()) return;
  if (!canvas.ready || tokenDocument?.parent?.id !== canvas.scene?.id) return;
  if (runtimeOriginFlag(tokenDocument)) return;
  if (!tokenDocument?.actor?.hasPlayerOwner) return;

  queueMicrotask(() => {
    evaluateMovedTokenDiscovery(tokenDocument).catch(error => {
      console.error(`${MODULE_ID} | Passive discovery failed`, error);
    });
  });
}

async function evaluateMovedTokenDiscovery(tokenDocument) {
  const scene = canvas.scene;
  const actor = tokenDocument?.actor;
  if (!scene || !actor?.hasPlayerOwner) return [];

  const candidates = sceneTrapDocuments(scene).filter(tile => isPassiveDiscoveryCandidate({
    trap: trapData(tile),
    hidden: !trapIsDiscovered(tile, trapData(tile)),
    busy: runtime.discovering.has(tile.id)
  }));
  if (!candidates.length) return [];

  const discoveries = [];
  for (const tile of candidates) {
    const trap = trapData(tile);
    const config = normalizeDiscoveryConfig(trap.discovery);
    const distance = measureTokenToTrapDistance(tokenDocument, tile);

    // Distance is intentionally evaluated before any wall collision work.
    if (!isWithinTrapRange(distance, config.detection.distance)) continue;

    const hasLOS = !config.detection.requireLOS || trapHasLineOfSightFromToken(tokenDocument, tile);
    const result = evaluatePassiveDiscovery({ actor, config, distance, hasLOS });
    if (!result.discovered) continue;

    runtime.discovering.add(tile.id);
    discoveries.push({ tile, trap, config, result });
  }
  if (!discoveries.length) return [];

  try {
    const updates = discoveries.map(({ tile, trap }) => ({
      _id: tile.id,
      [`flags.${MODULE_ID}.discovered`]: true,
      hidden: normalizeTriggerType(trap.triggerType) === TRIGGER_TYPES.TILE ? false : true
    }));
    await scene.updateEmbeddedDocuments("Tile", updates, { easyTrapsDiscovery: true });

    refreshTriggerOverlays();
    refreshAreaOverlays();
    refreshOpenSceneTrapManager();

    if (discoveries.some(entry => entry.config.detection.pauseOnDiscovery) && !game.paused) {
      game.togglePause(true, { broadcast: true });
    }

    try {
      const discoverer = escapeHtml(actor?.name ?? tokenDocument?.name ?? "A character");
      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker?.({ actor, token: tokenDocument }) ?? {},
        content: discoveries.length === 1
          ? `<p><strong>${discoverer}</strong> discovered a hidden trap.</p>`
          : `<p><strong>${discoverer}</strong> discovered hidden traps.</p>`
      });
    } catch (error) {
      console.warn(`${MODULE_ID} | Could not create discovery chat message`, error);
    }

    Hooks.callAll("easyTrapsTrapDiscovered", {
      token: tokenDocument,
      actor,
      passivePerception: actorEffectivePassivePerception(actor),
      traps: discoveries.map(entry => entry.tile)
    });
    return discoveries;
  } finally {
    for (const { tile } of discoveries) runtime.discovering.delete(tile.id);
  }
}

function tokenCanvasRectangle(tokenDocument, scene = tokenDocument?.parent ?? canvas.scene) {
  const activeGrid = canvas.scene?.id === scene?.id ? canvas.grid : null;
  return tokenDocumentCanvasRectangle(tokenDocument, { scene, activeGrid });
}

function trapCanvasRectangle(tile) {
  return {
    x: Number(tile?.x) || 0,
    y: Number(tile?.y) || 0,
    width: Math.max(0, Number(tile?.width) || 0),
    height: Math.max(0, Number(tile?.height) || 0)
  };
}

function sceneDistanceUnits(scene = canvas.scene) {
  return String(scene?.grid?.units ?? "").trim() || "ft";
}

function convertLengthUnits(value, fromUnits, toUnits, { fallback = null } = {}) {
  const movementUnits = globalThis.dnd5e?.config?.movementUnits
    ?? globalThis.game?.dnd5e?.config?.movementUnits
    ?? globalThis.CONFIG?.DND5E?.movementUnits
    ?? {};
  const result = convertConfiguredLength(value, fromUnits, toUnits, movementUnits, { fallback });
  if (result.supported) return result.value;

  const warningKey = `${String(result.from || fromUnits || "").trim()}->${String(result.to || toUnits || "").trim()}:${result.reason}`;
  if (!runtime.unitWarnings.has(warningKey)) {
    runtime.unitWarnings.add(warningKey);
    console.warn(
      `${MODULE_ID} | Unsupported D&D5e length conversion ${result.from || fromUnits || "(blank)"} -> ${result.to || toUnits || "(blank)"}; preserving the numeric value.`
    );
  }
  return result.value;
}

function feetFromSceneLength(value, scene = canvas.scene) {
  return convertLengthUnits(value, sceneDistanceUnits(scene), "ft", { fallback: value });
}

function doorSourceBandHalfWidth(scene = canvas.scene) {
  const gridSize = Number(scene?.grid?.size ?? canvas.grid?.size) || 100;
  return Math.min(
    DOOR_SOURCE_BAND_MAX_PX,
    Math.max(DOOR_SOURCE_BAND_MIN_PX, gridSize * DOOR_SOURCE_BAND_GRID_RATIO)
  );
}

function doorLosFaceOffset(scene = canvas.scene) {
  const gridSize = Number(scene?.grid?.size ?? canvas.grid?.size) || 100;
  return Math.min(
    DOOR_LOS_FACE_OFFSET_MAX_PX,
    Math.max(DOOR_LOS_FACE_OFFSET_MIN_PX, gridSize * DOOR_LOS_FACE_OFFSET_GRID_RATIO)
  );
}

function segmentFromDoorDocument(document) {
  const c = Array.from(document?.c ?? []);
  if (c.length < 4 || !c.slice(0, 4).every(value => Number.isFinite(Number(value)))) return null;
  return {
    start: { x: Number(c[0]), y: Number(c[1]) },
    end: { x: Number(c[2]), y: Number(c[3]) }
  };
}

function segmentBandPolygon(start, end, halfWidth) {
  const ax = Number(start?.x) || 0;
  const ay = Number(start?.y) || 0;
  const bx = Number(end?.x) || 0;
  const by = Number(end?.y) || 0;
  const dx = bx - ax;
  const dy = by - ay;
  const length = Math.hypot(dx, dy);
  if (length <= Number.EPSILON) {
    const pad = Math.max(1, Number(halfWidth) || 1);
    return [
      { x: ax - pad, y: ay - pad },
      { x: ax + pad, y: ay - pad },
      { x: ax + pad, y: ay + pad },
      { x: ax - pad, y: ay + pad }
    ];
  }
  const nx = -dy / length;
  const ny = dx / length;
  const pad = Math.max(1, Number(halfWidth) || 1);
  return [
    { x: ax + nx * pad, y: ay + ny * pad },
    { x: bx + nx * pad, y: by + ny * pad },
    { x: bx - nx * pad, y: by - ny * pad },
    { x: ax - nx * pad, y: ay - ny * pad }
  ];
}

function pointToSegmentDistance(point, start, end) {
  const px = Number(point?.x) || 0;
  const py = Number(point?.y) || 0;
  const ax = Number(start?.x) || 0;
  const ay = Number(start?.y) || 0;
  const bx = Number(end?.x) || 0;
  const by = Number(end?.y) || 0;
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSquared = (dx * dx) + (dy * dy);
  if (lengthSquared <= Number.EPSILON) return Math.hypot(px - ax, py - ay);
  const t = Math.min(1, Math.max(0, (((px - ax) * dx) + ((py - ay) * dy)) / lengthSquared));
  return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
}

function trapInteractionGeometry(tile, trap = trapData(tile)) {
  if (!tile || !trap) return null;
  const type = normalizeTriggerType(trap.triggerType);
  const sourceDocument = isExternalTriggerType(type) ? linkedSourceDocumentForTrap(tile, trap) : null;
  if (isExternalTriggerType(type) && !sourceDocument) return null;

  if (type === TRIGGER_TYPES.ITEM_PILE && sourceDocument) {
    return {
      type: "rect",
      rect: tokenCanvasRectangle(sourceDocument),
      elevation: Number(sourceDocument.elevation) || 0,
      sourceDocument,
      triggerType: type
    };
  }

  if (type === TRIGGER_TYPES.DOOR && sourceDocument) {
    const segment = segmentFromDoorDocument(sourceDocument);
    if (!segment) return null;
    return {
      type: "segment",
      ...segment,
      halfWidth: doorSourceBandHalfWidth(tile.parent ?? canvas.scene),
      elevation: 0,
      sourceDocument,
      triggerType: type
    };
  }

  return {
    type: "rect",
    rect: trapCanvasRectangle(tile),
    elevation: Number(tile?.elevation) || 0,
    sourceDocument: tile,
    triggerType: type
  };
}

function pointInsideTrapInteractionGeometry(point, geometry) {
  if (!point || !geometry) return false;
  if (geometry.type === "segment") {
    return pointToSegmentDistance(point, geometry.start, geometry.end) <= Math.max(1, Number(geometry.halfWidth) || 1);
  }
  const rect = geometry.rect;
  if (!rect) return false;
  return point.x >= rect.x && point.x <= rect.x + rect.width
    && point.y >= rect.y && point.y <= rect.y + rect.height;
}

function distanceGeometryForTrap(tokenDocument, tile) {
  const tokenRect = tokenCanvasRectangle(tokenDocument);
  const trap = trapData(tile);
  const geometry = trapInteractionGeometry(tile, trap);
  if (!geometry) return null;

  if (geometry.type === "segment") {
    return {
      points: closestPointsBetweenRectangleAndSegment(tokenRect, geometry.start, geometry.end),
      targetElevation: Number(geometry.elevation) || 0,
      sourceDocument: geometry.sourceDocument
    };
  }

  const targetRect = geometry.rect;
  return {
    points: closestPointsBetweenRectangles(tokenRect, targetRect),
    targetElevation: Number(geometry.elevation) || 0,
    sourceDocument: geometry.sourceDocument
  };
}

function measureTokenToTrapDistance(tokenDocument, tile, scene = tokenDocument?.parent ?? tile?.parent ?? canvas.scene) {
  const geometry = distanceGeometryForTrap(tokenDocument, tile);
  if (!geometry?.points?.source || !geometry?.points?.target) return Number.POSITIVE_INFINITY;
  const source = { ...geometry.points.source, elevation: Number(tokenDocument?.elevation) || 0 };
  const target = { ...geometry.points.target, elevation: Number(geometry.targetElevation) || 0 };
  if (Math.abs(source.x - target.x) < 0.001
    && Math.abs(source.y - target.y) < 0.001
    && Math.abs(source.elevation - target.elevation) < 0.001) return 0;

  // Discovery/disarm are physical proximity checks, not movement-path checks.
  // Keep them independent from diagonal movement-cost rules so the same saved
  // Scene geometry has one deterministic meaning on every client. GM-window
  // background throttling is handled separately by the authority handshake.
  const sceneDistance = sceneDistanceBetweenPoints(source, target, {
    gridSize: Number(scene?.grid?.size) || 100,
    gridDistance: Number(scene?.grid?.distance) || 5
  });
  return feetFromSceneLength(sceneDistance, scene);
}

/**
 * Disarm uses a stricter interaction distance than passive discovery. Discovery
 * measures simple edge proximity; disarm must also distinguish "adjacent to the
 * source" from "an entire empty grid-space away". This prevents Door traps from
 * being disarmed from visually distant squares while still accepting a
 * character standing next to a slightly off-grid Item Pile.
 */
function disarmDistanceGeometryForTrap(tokenDocument, tile, scene = tokenDocument?.parent ?? tile?.parent ?? canvas.scene) {
  const gridSize = Number(scene?.grid?.size) || 100;
  const tokenCenters = squareGridCellCenterRectangle(tokenCanvasRectangle(tokenDocument), { gridSize });
  const trap = trapData(tile);
  const geometry = trapInteractionGeometry(tile, trap);
  if (!geometry) return null;

  if (geometry.type === "segment") {
    return {
      points: closestPointsBetweenRectangleAndSegment(tokenCenters, geometry.start, geometry.end),
      targetElevation: Number(geometry.elevation) || 0,
      sourceDocument: geometry.sourceDocument
    };
  }

  const sourceCenters = squareGridCellCenterRectangle(geometry.rect, { gridSize });
  return {
    points: closestPointsBetweenRectangles(tokenCenters, sourceCenters),
    targetElevation: Number(geometry.elevation) || 0,
    sourceDocument: geometry.sourceDocument
  };
}

function measureTokenToTrapDisarmDistance(tokenDocument, tile, scene = tokenDocument?.parent ?? tile?.parent ?? canvas.scene) {
  const geometry = disarmDistanceGeometryForTrap(tokenDocument, tile, scene);
  if (!geometry?.points?.source || !geometry?.points?.target) return Number.POSITIVE_INFINITY;
  const source = { ...geometry.points.source, elevation: Number(tokenDocument?.elevation) || 0 };
  const target = { ...geometry.points.target, elevation: Number(geometry.targetElevation) || 0 };
  if (Math.abs(source.x - target.x) < 0.001
    && Math.abs(source.y - target.y) < 0.001
    && Math.abs(source.elevation - target.elevation) < 0.001) return 0;

  const sceneDistance = sceneDistanceBetweenPoints(source, target, {
    gridSize: Number(scene?.grid?.size) || 100,
    gridDistance: Number(scene?.grid?.distance) || 5
  });
  return feetFromSceneLength(sceneDistance, scene);
}

function isWithinTrapRange(distance, limitFeet) {
  const value = Number(distance);
  const limit = Number(limitFeet);
  return Number.isFinite(value) && Number.isFinite(limit) && value <= limit + RANGE_EPSILON_FT;
}

function trapHasLineOfSightFromToken(tokenDocument, tile) {
  const PolygonClass = foundry?.canvas?.geometry?.ClockwiseSweepPolygon;
  if (typeof PolygonClass?.testCollision !== "function") return false;

  const tokenRect = tokenCanvasRectangle(tokenDocument);
  const trap = trapData(tile);
  const geometry = trapInteractionGeometry(tile, trap);
  const origin = {
    x: tokenRect.x + tokenRect.width / 2,
    y: tokenRect.y + tokenRect.height / 2,
    elevation: Number(tokenDocument?.elevation) || 0
  };

  let samples = [];
  const targetElevation = Number(geometry?.elevation) || 0;

  if (geometry?.type === "segment") {
    const { start, end } = geometry;
    const midpoint = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const length = Math.hypot(dx, dy);
    let nx = length > Number.EPSILON ? -dy / length : 1;
    let ny = length > Number.EPSILON ? dx / length : 0;
    if (((origin.x - midpoint.x) * nx) + ((origin.y - midpoint.y) * ny) < 0) {
      nx *= -1;
      ny *= -1;
    }
    const offset = doorLosFaceOffset(tile?.parent ?? canvas.scene);
    const points = [
      closestPointsBetweenRectangleAndSegment(tokenRect, start, end).target,
      { x: start.x + dx * 0.18, y: start.y + dy * 0.18 },
      midpoint,
      { x: start.x + dx * 0.82, y: start.y + dy * 0.82 }
    ];
    samples = points.map(point => ({
      x: point.x + nx * offset,
      y: point.y + ny * offset
    }));
  } else {
    const trapRect = geometry?.rect ?? trapCanvasRectangle(tile);
    const closest = closestPointsBetweenRectangles(tokenRect, trapRect).target;
    samples = [closest, ...rectangleLosSamplePoints(trapRect, { inset: 2 })];
  }

  const seen = new Set();
  for (const point of samples) {
    const key = `${Number(point.x).toFixed(3)}:${Number(point.y).toFixed(3)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const destination = {
      x: Number(point.x) || 0,
      y: Number(point.y) || 0,
      elevation: targetElevation
    };
    try {
      const collision = testSightCollision(PolygonClass, origin, destination);
      if (!collision) return true;
    } catch (error) {
      console.warn(`${MODULE_ID} | Could not test passive discovery line of sight`, error);
      return false;
    }
  }
  return false;
}


function trapData(tile) {
  const data = tile?.flags?.[MODULE_ID];
  return ["spell-grid", "spell-floor", "alarm-grid"].includes(data?.kind) ? data : null;
}

function trapTypeOf(trap) {
  if (trap?.trapType === "alarm" || trap?.kind === "alarm-grid") return "alarm";
  return "spell";
}

function isAlarmTrap(trap) {
  return trapTypeOf(trap) === "alarm";
}

function trapDisplayName(trap, tile = null) {
  if (!trap) return tile?.name ?? "Trap";
  if (isAlarmTrap(trap)) return String(trap.alarmName ?? "Alarm Trap");
  return String(trap.spellName ?? tile?.name ?? "Spell Trap");
}

function trapDisplayImage(trap) {
  return String(isAlarmTrap(trap) ? trap?.alarmImg : trap?.spellImg).trim() || DEFAULT_TRIGGER_TEXTURE;
}

function mattActiveForTrap(trap, enabled) {
  return normalizeTriggerType(trap?.triggerType) === TRIGGER_TYPES.TILE && Boolean(enabled);
}

function localTriggeringTokenDocument() {
  const controlled = Array.from(canvas.tokens?.controlled ?? []).filter(token => {
    const document = token?.document;
    const actor = token?.actor;
    return document && actor?.isOwner === true && document.hidden !== true && !runtimeOriginFlag(document);
  });
  return controlled.length === 1 ? controlled[0].document : null;
}

function createDoorInteractionContext(wallDocument, userId, tokenDocument = null) {
  return createDoorInteractionContextData({
    interactionId: foundry.utils.randomID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    sceneId: wallDocument?.parent?.id,
    wallId: wallDocument?.id,
    userId: userId ?? game.user?.id,
    tokenId: tokenDocument?.id
  });
}

function doorInteractionContextForUpdate(wallDocument, options = {}, userId = null) {
  return validateDoorInteractionContext(options?.easyTrapsDoorContext, {
    sceneId: wallDocument?.parent?.id,
    wallId: wallDocument?.id,
    userId
  });
}

function triggerTypeForSourceDocument(sourceDocument) {
  const name = String(sourceDocument?.documentName ?? sourceDocument?.constructor?.documentName ?? "");
  if (name === "Wall") return TRIGGER_TYPES.DOOR;
  if (name === "Token") return TRIGGER_TYPES.ITEM_PILE;
  return null;
}

function queueTriggerSourceLinkRepair(sourceDocument, controllerTile, triggerType) {
  if (!isPrimaryGM() || !sourceDocument || !controllerTile) return;
  const key = `${String(sourceDocument.uuid ?? sourceDocument.id ?? "")}:${String(controllerTile.uuid ?? controllerTile.id ?? "")}`;
  if (runtime.sourceLinkRepairs.has(key)) return;
  runtime.sourceLinkRepairs.add(key);
  queueMicrotask(async () => {
    try {
      await linkTriggerSourceDocument(sourceDocument, controllerTile, triggerType);
    } catch (error) {
      console.warn(`${MODULE_ID} | Could not repair trigger-source back-link`, error);
    } finally {
      runtime.sourceLinkRepairs.delete(key);
    }
  });
}

function controllerTileFromSource(scene, sourceDocument, expectedType = null) {
  if (!scene || !sourceDocument) return null;
  const inferredType = expectedType ?? triggerTypeForSourceDocument(sourceDocument);
  if (!inferredType || !isExternalTriggerType(inferredType)) return null;

  const link = sourceLinkFromDocument(sourceDocument, MODULE_ID);
  if (link?.controllerTileId) {
    const linkedTile = scene.tiles?.get?.(link.controllerTileId) ?? null;
    const linkedTrap = trapData(linkedTile);
    if (linkedTrap && trapMatchesTriggerSource(linkedTrap, sourceDocument, inferredType)) {
      if (link.type !== inferredType || link.controllerTileUuid !== String(linkedTile.uuid ?? "")) {
        queueTriggerSourceLinkRepair(sourceDocument, linkedTile, inferredType);
      }
      return linkedTile;
    }
  }

  // Item Piles can rewrite Token data during its own lifecycle. The controller
  // keeps the authoritative source id/uuid, so recover from that relationship
  // even when the source-side EasyTraps flag was lost or became stale.
  const recovered = Array.from(scene.tiles ?? []).find(tile => {
    const trap = trapData(tile);
    return trap && trapMatchesTriggerSource(trap, sourceDocument, inferredType);
  }) ?? null;
  if (recovered) queueTriggerSourceLinkRepair(sourceDocument, recovered, inferredType);
  return recovered;
}

function linkedSourceDocumentForTrap(tile, trap = trapData(tile)) {
  if (!tile || !trap || !isExternalTriggerType(trap.triggerType)) return null;
  const scene = tile.parent;
  const sourceId = String(trap.triggerSourceId ?? "");
  if (!scene || !sourceId) return null;
  const type = normalizeTriggerType(trap.triggerType);
  if (type === TRIGGER_TYPES.DOOR) return scene.walls?.get?.(sourceId) ?? null;
  if (type === TRIGGER_TYPES.ITEM_PILE) return scene.tokens?.get?.(sourceId) ?? null;
  return null;
}

async function activateTrapFromTriggerSource(tile, triggeringToken = null, { sourceType = null, sourceDocument = null } = {}) {
  const trap = trapData(tile);
  if (!tile || !trap || trap.armed === false || trap.requiresReconfiguration === true) return false;
  const tokenDocument = triggeringToken?.document ?? triggeringToken ?? null;
  const needsToken = trapRequiresTriggeringToken(trap, {
    triggeringOrigin: ORIGIN_MODES.TRIGGERING_TOKEN,
    triggeringTarget: TARGET_MODES.TRIGGERING_TOKEN
  });
  if (needsToken && !tokenDocument) {
    if (isPrimaryGM()) ui.notifications.warn(`${triggerTypeLabel(sourceType ?? trap.triggerType)} trap needs a triggering creature. Have the player control exactly one owned token while interacting with it.`);
    return false;
  }
  const key = tile.uuid;
  if (runtime.triggering.has(key)) return false;
  runtime.triggering.add(key);
  try {
    await executeConfiguredTrap(tile, tokenDocument ? [tokenDocument] : []);
    Hooks.callAll("easyTrapsTriggerSourceActivated", {
      tile,
      trap,
      triggerType: normalizeTriggerType(sourceType ?? trap.triggerType),
      sourceDocument: sourceDocument ?? linkedSourceDocumentForTrap(tile, trap),
      triggeringToken: tokenDocument
    });
    return true;
  } catch (error) {
    console.error(`${MODULE_ID} | ${triggerTypeLabel(sourceType ?? trap.triggerType)} trap failed`, error);
    ui.notifications.error(error?.message ?? String(error ?? "The trap could not be activated."));
    return false;
  } finally {
    runtime.triggering.delete(key);
  }
}

function onPreUpdateDoorTriggerSource(wallDocument, changes, options = {}, userId = game.user?.id) {
  if (options?.easyTrapsInternal) return;
  const tile = controllerTileFromSource(wallDocument?.parent, wallDocument, TRIGGER_TYPES.DOOR);
  if (!tile) return;
  if (!Object.hasOwn(changes ?? {}, "ds")) return;
  const openState = CONST?.WALL_DOOR_STATES?.OPEN ?? 1;
  if (Number(changes.ds) !== Number(openState)) return;

  // Foundry v14 preserves custom Document update options from the client that
  // initiates preUpdateWall through to updateWall on the authoritative GM.
  // Capture the triggering token at the exact Door interaction seam instead of
  // reconstructing it later from socket timing or long-lived control history.
  const token = localTriggeringTokenDocument();
  options.easyTrapsDoorContext = createDoorInteractionContext(wallDocument, userId, token);
}

function onUpdateDoorTriggerSource(wallDocument, changes, options = {}, userId = null) {
  const controller = controllerTileFromSource(wallDocument?.parent, wallDocument, TRIGGER_TYPES.DOOR);
  if (!controller) return;
  if (Array.isArray(changes?.c) && isPrimaryGM()) queueMicrotask(() => syncDoorControllerToSource(wallDocument, controller));
  if (!Object.hasOwn(changes ?? {}, "ds")) return;
  const openState = CONST?.WALL_DOOR_STATES?.OPEN ?? 1;
  if (Number(changes.ds) !== Number(openState) || !isPrimaryGM()) return;

  // Resolve and validate the interaction context synchronously before the
  // short activation delay. The delay remains only to let the Door document
  // finish its native open transition; it is no longer part of token identity.
  const context = doorInteractionContextForUpdate(wallDocument, options, userId);
  const contextTokenId = String(context?.tokenId ?? "");
  const contextUserId = String(context?.userId ?? userId ?? "");

  setTimeout(async () => {
    const scene = wallDocument.parent;
    const tile = controllerTileFromSource(scene, wallDocument, TRIGGER_TYPES.DOOR);
    if (!tile) return;

    let token = contextTokenId ? scene.tokens?.get?.(contextTokenId) ?? null : null;
    const user = contextUserId ? game.users.get?.(contextUserId) ?? null : null;
    if (token?.actor && user && !user.isGM && !token.actor.testUserPermission?.(user, "OWNER")) token = null;

    await activateTrapFromTriggerSource(tile, token, {
      sourceType: TRIGGER_TYPES.DOOR,
      sourceDocument: wallDocument
    });
  }, DOOR_TRIGGER_ACTIVATION_DELAY_MS);
}

async function syncDoorControllerToSource(wallDocument, controllerTile = null) {
  const tile = controllerTile ?? controllerTileFromSource(wallDocument?.parent, wallDocument, TRIGGER_TYPES.DOOR);
  if (!tile || !wallDocument) return false;
  const geometry = doorControllerGeometryForWall(wallDocument, wallDocument.parent ?? tile.parent ?? canvas.scene);
  if (!geometry) return false;
  const update = {
    ...geometry,
    hidden: true,
    alpha: 0,
    "texture.anchorX": 0,
    "texture.anchorY": 0
  };
  const differs = ["x", "y", "width", "height", "rotation", "alpha"].some(key => Math.abs(Number(tile[key]) - Number(update[key])) > 0.001)
    || tile.hidden !== true
    || Number(tile.texture?.anchorX ?? 0) !== 0
    || Number(tile.texture?.anchorY ?? 0) !== 0;
  if (differs) await tile.update(update, { easyTrapsInternal: true });
  return true;
}

function setupTriggerSourceHooks() {
  if (runtime.itemPileHookInstalled) return;
  // Item Piles exposes two useful families of public hooks. The dedicated
  // openItemPile hooks are the strongest seam because they provide the real
  // pile TokenDocument plus the interacting TokenDocument. The interface hooks
  // cover ordinary inventory UI opens. All are deduped into one EasyTraps
  // activation so a single click can never cast twice.
  Hooks.on("item-piles-preOpenItemPile", (source, interactingToken) => onItemPileTriggerInteraction(source, interactingToken));
  Hooks.on("item-piles-openItemPile", (source, interactingToken) => onItemPileTriggerInteraction(source, interactingToken));
  Hooks.on("item-piles-preOpenInterface", (source, recipient) => onItemPileTriggerInteraction(source, recipient));
  Hooks.on("item-piles-openInterface", (_app, source, recipient) => onItemPileTriggerInteraction(source, recipient));
  Hooks.on("item-piles-preOpenItemPileInventory", onItemPileTriggerInteraction);

  // Item Piles can update its Token through its own API. Mirror that movement
  // immediately in addition to Foundry's ordinary updateToken hook so the
  // invisible controller always follows the visible pile.
  Hooks.on("item-piles-updateItemPile", source => {
    if (!isPrimaryGM()) return;
    const tokenDocument = source?.document ?? source;
    queueMicrotask(() => syncItemPileControllerToSource(tokenDocument).catch(error => console.warn(`${MODULE_ID} | Could not sync Item Pile controller from Item Piles hook`, error)));
  });
  runtime.itemPileHookInstalled = true;
}

function itemPileTokenDocumentFromContext(value, scene = canvas.scene, { requireSourceLink = false } = {}) {
  const isAcceptedSourceToken = token => {
    if (!token) return false;
    if (!requireSourceLink) return true;
    return Boolean(controllerTileFromSource(scene, token, TRIGGER_TYPES.ITEM_PILE));
  };

  const direct = value?.document ?? value ?? null;
  const directName = String(direct?.documentName ?? direct?.constructor?.documentName ?? "");
  if (directName === "Token" && isAcceptedSourceToken(direct)) return direct;

  const actor = directName === "Actor" ? direct : (direct?.actor ?? null);
  const syntheticToken = actor?.token?.document ?? actor?.token ?? null;
  const syntheticName = String(syntheticToken?.documentName ?? syntheticToken?.constructor?.documentName ?? "");
  if (syntheticName === "Token" && isAcceptedSourceToken(syntheticToken)) return syntheticToken;

  const actorId = actor?.id ?? direct?.actorId ?? direct?.actor?.id ?? null;
  if (!scene || !actorId) return null;
  const candidates = Array.from(scene.tokens ?? []).filter(token => {
    if (token?.actor?.id !== actorId) return false;
    return isAcceptedSourceToken(token);
  });
  if (candidates.length === 1) return candidates[0];

  if (!requireSourceLink) {
    const controlled = Array.from(canvas.tokens?.controlled ?? [])
      .map(token => token?.document ?? token)
      .filter(token => token?.actor?.id === actorId && token?.actor?.isOwner === true && token?.hidden !== true && !runtimeOriginFlag(token));
    if (controlled.length === 1) return controlled[0];
  }
  return null;
}

function itemPileInteractionIsDuplicate(source, userId = game.user?.id) {
  const key = `${String(source?.parent?.id ?? canvas.scene?.id ?? "")}:${String(source?.id ?? "")}:${String(userId ?? "")}`;
  const now = Date.now();
  const previous = Number(runtime.itemPileInteractionDedupe.get(key)) || 0;
  runtime.itemPileInteractionDedupe.set(key, now);
  for (const [entry, at] of runtime.itemPileInteractionDedupe) {
    if (now - Number(at) > ITEM_PILE_INTERACTION_DEDUPE_MS) runtime.itemPileInteractionDedupe.delete(entry);
  }
  return previous > 0 && now - previous < ITEM_PILE_INTERACTION_DEDUPE_WINDOW_MS;
}

function onItemPileTriggerInteraction(itemPileSource, interactingSource) {
  const scene = canvas.scene;
  const source = itemPileTokenDocumentFromContext(itemPileSource, scene, { requireSourceLink: true });
  if (!source) return;
  const sourceScene = source.parent ?? scene;
  if (!sourceScene || itemPileInteractionIsDuplicate(source)) return;

  let tokenDocument = itemPileTokenDocumentFromContext(interactingSource, sourceScene);
  // Current Item Piles can provide only the recipient Actor to its interface
  // hook. When that Actor has multiple Scene tokens, never guess; exactly one
  // locally controlled owned token is the same safety rule used by Door traps.
  if (!tokenDocument) tokenDocument = localTriggeringTokenDocument();

  if (isPrimaryGM()) {
    const tile = controllerTileFromSource(sourceScene, source, TRIGGER_TYPES.ITEM_PILE);
    if (tile) queueMicrotask(() => activateTrapFromTriggerSource(tile, tokenDocument, { sourceType: TRIGGER_TYPES.ITEM_PILE, sourceDocument: source }));
    return;
  }
  if (!game.user?.isGM && game.socket?.emit) {
    game.socket.emit(SOCKET_CHANNEL, {
      type: "trigger-source-activate",
      sourceType: TRIGGER_TYPES.ITEM_PILE,
      sceneId: sourceScene.id,
      sourceId: source.id,
      userId: game.user.id,
      tokenId: tokenDocument?.id ?? ""
    });
  }
}

async function resolveGmItemPileTriggerActivation(message) {
  if (!isPrimaryGM()) return;
  const scene = game.scenes.get?.(message?.sceneId);
  const user = game.users.get?.(message?.userId);
  if (!scene || !user || user.isGM) return;
  const type = normalizeTriggerType(message?.sourceType);
  if (type !== TRIGGER_TYPES.ITEM_PILE) return;
  const source = scene.tokens?.get?.(message?.sourceId) ?? null;
  const tile = source ? controllerTileFromSource(scene, source, TRIGGER_TYPES.ITEM_PILE) : null;
  if (!source || !tile) return;
  const token = message?.tokenId ? scene.tokens?.get?.(message.tokenId) ?? null : null;
  if (token?.actor && !token.actor.testUserPermission?.(user, "OWNER")) return;
  await activateTrapFromTriggerSource(tile, token, { sourceType: type, sourceDocument: source });
}

function syncVisibleItemPileController(token) {
  if (!isPrimaryGM()) return;
  const tokenDocument = token?.document ?? token;
  if (!tokenDocument || String(tokenDocument.documentName ?? "") !== "Token") return;
  const link = sourceLinkFromDocument(tokenDocument, MODULE_ID);
  if (link?.type !== TRIGGER_TYPES.ITEM_PILE) return;
  const tile = controllerTileFromSource(tokenDocument.parent, tokenDocument, TRIGGER_TYPES.ITEM_PILE);
  if (!tile) return;
  void syncItemPileControllerToSource(tokenDocument, tile).catch(error => console.warn(`${MODULE_ID} | Could not keep Item Pile controller attached`, error));
}

async function syncItemPileControllerToSource(tokenDocument, controllerTile = null) {
  const tile = controllerTile ?? controllerTileFromSource(tokenDocument?.parent, tokenDocument, TRIGGER_TYPES.ITEM_PILE);
  if (!tile || !tokenDocument) return false;
  const rect = tokenCanvasRectangle(tokenDocument, tokenDocument.parent ?? canvas.scene);
  const update = {
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
    rotation: Number(tokenDocument.rotation) || 0,
    elevation: Number(tokenDocument.elevation) || 0,
    hidden: true,
    alpha: 0
  };
  const differs = ["x", "y", "width", "height", "rotation", "elevation", "alpha"].some(key => Number(tile[key]) !== Number(update[key]))
    || tile.hidden !== true;
  if (differs) await tile.update(update, { easyTrapsInternal: true });
  return true;
}

function onUpdateItemPileTriggerSource(tokenDocument, changes, options = {}) {
  if (options?.easyTrapsInternal || !isPrimaryGM()) return;
  const tile = controllerTileFromSource(tokenDocument?.parent, tokenDocument, TRIGGER_TYPES.ITEM_PILE);
  if (!tile) return;
  if (!["x", "y", "width", "height", "rotation", "elevation"].some(key => Object.hasOwn(changes ?? {}, key))) return;
  queueMicrotask(() => syncItemPileControllerToSource(tokenDocument, tile).catch(error => console.warn(`${MODULE_ID} | Could not sync Item Pile controller`, error)));
}

function triggerSourceDeletionKey(sourceDocument) {
  const sceneId = String(sourceDocument?.parent?.id ?? "");
  const documentName = String(sourceDocument?.documentName ?? sourceDocument?.constructor?.documentName ?? "");
  const sourceId = String(sourceDocument?.id ?? "");
  return sceneId && documentName && sourceId ? `${sceneId}:${documentName}:${sourceId}` : null;
}

function rememberTriggerSourceControllerBeforeDelete(sourceDocument, triggerType, options = {}) {
  if (options?.easyTrapsInternal || !isPrimaryGM()) return;
  const key = triggerSourceDeletionKey(sourceDocument);
  if (!key) return;
  const tile = controllerTileFromSource(sourceDocument?.parent, sourceDocument, triggerType);
  if (!tile) return;
  runtime.pendingSourceDeletions.set(key, {
    scene: tile.parent ?? sourceDocument?.parent ?? null,
    controllerTileId: tile.id,
    controllerTileUuid: String(tile.uuid ?? ""),
    triggerType: normalizeTriggerType(triggerType)
  });
}

function consumeRememberedTriggerSourceController(sourceDocument, triggerType) {
  const key = triggerSourceDeletionKey(sourceDocument);
  if (!key) return null;
  const remembered = runtime.pendingSourceDeletions.get(key) ?? null;
  runtime.pendingSourceDeletions.delete(key);
  if (!remembered || remembered.triggerType !== normalizeTriggerType(triggerType)) return null;
  return remembered;
}

function onPreDeleteTriggerSourceWall(wallDocument, options = {}) {
  rememberTriggerSourceControllerBeforeDelete(wallDocument, TRIGGER_TYPES.DOOR, options);
}

function onPreDeleteItemPileTriggerSource(tokenDocument, options = {}) {
  rememberTriggerSourceControllerBeforeDelete(tokenDocument, TRIGGER_TYPES.ITEM_PILE, options);
}

function deleteRememberedTriggerController(sourceDocument, triggerType, options = {}) {
  if (options?.easyTrapsInternal || !isPrimaryGM()) return;
  const remembered = consumeRememberedTriggerSourceController(sourceDocument, triggerType);
  const fallbackTile = controllerTileFromSource(sourceDocument?.parent, sourceDocument, triggerType);
  const scene = remembered?.scene ?? fallbackTile?.parent ?? sourceDocument?.parent ?? null;
  const controllerTileId = remembered?.controllerTileId ?? fallbackTile?.id ?? null;
  if (!scene || !controllerTileId) return;
  queueMicrotask(async () => {
    const controller = scene.tiles?.get?.(controllerTileId) ?? null;
    if (!controller) return;
    try {
      await scene.deleteEmbeddedDocuments("Tile", [controller.id], { easyTrapsInternal: true });
    } catch (error) {
      console.warn(`${MODULE_ID} | Could not delete ${triggerTypeLabel(triggerType)} trigger controller`, error);
    }
  });
}

function onDeleteTriggerSourceWall(wallDocument, options = {}) {
  deleteRememberedTriggerController(wallDocument, TRIGGER_TYPES.DOOR, options);
}

function onDeleteItemPileTriggerSource(tokenDocument, options = {}) {
  deleteRememberedTriggerController(tokenDocument, TRIGGER_TYPES.ITEM_PILE, options);
}

async function repairExternalTriggerSourceLinks(scene = canvas.scene) {
  if (!isPrimaryGM() || !scene) return { repaired: 0, synced: 0 };
  let repaired = 0;
  let synced = 0;
  for (const tile of scene.tiles ?? []) {
    const trap = trapData(tile);
    if (!trap || !isExternalTriggerType(trap.triggerType)) continue;
    const source = linkedSourceDocumentForTrap(tile, trap);
    if (!source) continue;
    const type = normalizeTriggerType(trap.triggerType);
    const link = sourceLinkFromDocument(source, MODULE_ID);
    const ownership = triggerSourceOwnershipForTrap(trap);
    if (!link || link.type !== type || link.controllerTileId !== tile.id || link.controllerTileUuid !== String(tile.uuid ?? "") || link.ownership !== ownership) {
      try {
        await linkTriggerSourceDocument(source, tile, type);
        repaired += 1;
      } catch (error) {
        console.warn(`${MODULE_ID} | Could not restore ${triggerTypeLabel(type)} source link`, error);
      }
    }
    try {
      if (type === TRIGGER_TYPES.DOOR) await syncDoorControllerToSource(source, tile);
      else if (type === TRIGGER_TYPES.ITEM_PILE) await syncItemPileControllerToSource(source, tile);
      synced += 1;
    } catch (error) {
      console.warn(`${MODULE_ID} | Could not synchronize ${triggerTypeLabel(type)} controller`, error);
    }
  }
  return { repaired, synced };
}

function originData(tile) {
  const data = tile?.flags?.[MODULE_ID];
  return ["spell-origin", "alarm-origin"].includes(data?.kind) ? data : null;
}

function normalizeOriginMode(value) {
  return Object.values(ORIGIN_MODES).includes(value) ? value : ORIGIN_MODES.TRIGGER_TILE;
}

function normalizeTargetMode(value) {
  if (value === "original") return TARGET_MODES.NONE;
  return Object.values(TARGET_MODES).includes(value) ? value : TARGET_MODES.NONE;
}

function normalizeTargetingProfile(value) {
  return Object.values(TARGETING_PROFILES).includes(value) ? value : TARGETING_PROFILES.NONE;
}

function normalizeAreaMode(value) {
  if (value === "original") return AREA_MODES.ON_TRIGGER;
  return Object.values(AREA_MODES).includes(value) ? value : AREA_MODES.NONE;
}

function normalizeSpellSaveDc(value) {
  if (value === null || value === undefined || String(value).trim() === "") return DEFAULT_SPELL_SAVE_DC;
  const parsed = Math.trunc(Number(value));
  if (!Number.isFinite(parsed)) return DEFAULT_SPELL_SAVE_DC;
  return Math.min(99, Math.max(1, parsed));
}

function normalizeSpellAttackBonus(value) {
  const text = String(value ?? "").replace(/\s+/g, "");
  if (!text) return DEFAULT_SPELL_ATTACK_BONUS;
  const parsed = Math.trunc(Number(text));
  if (!Number.isFinite(parsed)) return DEFAULT_SPELL_ATTACK_BONUS;
  return Math.min(99, Math.max(-99, parsed));
}

function formatSignedModifier(value) {
  const normalized = normalizeSpellAttackBonus(value);
  return normalized >= 0 ? `+${normalized}` : String(normalized);
}

function normalizeOptionalTargetCapacity(value) {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const parsed = Math.trunc(Number(value));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function targetModeLabel(mode) {
  const normalized = normalizeTargetMode(mode);
  if (normalized === TARGET_MODES.SPELL_AREA) return "Creatures in native spell area";
  if (normalized === TARGET_MODES.CUSTOM_ZONE) return "Creatures in custom target zone";
  if (normalized === TARGET_MODES.NONE) return "Native spell targeting";
  return "Triggering creature";
}

function areaModeLabel(mode) {
  const normalized = normalizeAreaMode(mode);
  if (normalized === AREA_MODES.PREPLACED) return "Native area saved during creation";
  if (normalized === AREA_MODES.ON_TRIGGER) return "Native placement when triggered";
  return "No spell template";
}


function usableActivityList(spell) {
  return activityList(spell)
    .filter(activity => activity && activity.use instanceof Function && activity.canUse !== false);
}

function resolveActivitySelection(spell, activityId = null) {
  const activities = usableActivityList(spell);
  if (!activities.length) {
    return { supported: false, reason: "missing-activity", activityCount: 0, activity: null, activities };
  }
  if (activityId) {
    const activity = activities.find(candidate => candidate.id === activityId) ?? null;
    return activity
      ? { supported: true, reason: "selected-native-activity", activityCount: activities.length, activity, activities }
      : { supported: false, reason: "activity-changed", activityCount: activities.length, activity: null, activities };
  }
  if (activities.length === 1) {
    return { supported: true, reason: "single-native-activity", activityCount: 1, activity: activities[0], activities };
  }
  return { supported: false, reason: "activity-choice-required", activityCount: activities.length, activity: null, activities };
}

function findActivity(spell, activityId) {
  if (!activityId) return null;
  return usableActivityList(spell).find(activity => activity.id === activityId) ?? null;
}

function activityLabel(activity) {
  const name = String(activity?.name ?? "").trim();
  const type = String(activity?.type ?? "activity");
  return name || type.charAt(0).toUpperCase() + type.slice(1);
}

function plainData(value) {
  if (!value) return {};
  try { return foundry.utils.deepClone(value.toObject?.() ?? value); }
  catch (_error) { return {}; }
}

function targetFieldHasValue(value) {
  if (value === 0 || value === false) return true;
  if (Array.isArray(value)) return value.length > 0;
  if (value && typeof value === "object") return Object.values(value).some(targetFieldHasValue);
  return value !== null && value !== undefined && String(value).trim() !== "";
}

function fillMissingTargetFields(target, prepared) {
  const output = foundry.utils.deepClone(target ?? {});
  for (const key of ["affects", "template"]) {
    output[key] ??= {};
    const fallback = prepared?.[key] ?? {};
    for (const [field, value] of Object.entries(fallback)) {
      if (!targetFieldHasValue(output[key]?.[field]) && targetFieldHasValue(value)) {
        output[key][field] = foundry.utils.deepClone(value);
      }
    }
  }
  return output;
}

function resolveEffectiveTarget(spell, activity) {
  const itemTarget = plainData(spell?.system?.target);
  const preparedTarget = plainData(activity?.target);
  const sourceTarget = plainData(activity?.toObject?.()?.target ?? activity?.target);
  if (sourceTarget.override === true) return sourceTarget;
  // With override disabled, D&D5e inherits targeting from the Item. Activity target source data mostly contains
  // defaults plus its own prompt flag, so it must not overwrite a populated Item template with blank defaults.
  const effective = fillMissingTargetFields(itemTarget, preparedTarget);
  effective.override = false;
  effective.prompt = sourceTarget.prompt ?? preparedTarget.prompt ?? itemTarget.prompt ?? true;
  return effective;
}

function effectiveTemplateShape(target) {
  const type = String(target?.template?.type ?? "").trim();
  if (!type) return null;
  const config = globalThis.dnd5e?.config ?? game.dnd5e?.config ?? CONFIG.DND5E;
  return config?.areaTargetTypes?.[type]?.template ?? null;
}


function activityHasPromptedTemplate(activity, spell = activity?.item, effectiveTarget = null) {
  const target = effectiveTarget ?? resolveEffectiveTarget(spell, activity);
  return Boolean(effectiveTemplateShape(target)) && target.prompt !== false;
}

function creatureTargetType(target) {
  return ["creature", "willing", "creatureOrObject", "any", "ally", "enemy"]
    .includes(String(target?.affects?.type ?? "").trim());
}

function templateSuppliesCreatureTargets(target) {
  const affects = String(target?.affects?.type ?? "").trim();
  return !["object", "space", "self"].includes(affects);
}

function activityNeedsNativeConfiguration(activity, targetingProfile) {
  const type = String(activity?.type ?? "").trim();
  return targetingProfile === TARGETING_PROFILES.INTERACTIVE
    || ["summon", "enchant", "transform", "forward", "cast"].includes(type);
}

function classifyTargetingProfile(target, activity = null) {
  const affects = String(target?.affects?.type ?? "").trim();
  const activityType = String(activity?.type ?? "").trim();
  if (effectiveTemplateShape(target) && target.prompt !== false) return TARGETING_PROFILES.NATIVE_AREA;
  if (creatureTargetType(target)) return TARGETING_PROFILES.DIRECT;
  // A D&D5e attack Activity consumes selected token targets even when an imported Item left affects.type blank.
  // This follows the Activity contract; it does not infer a spell rule from the spell name or description.
  if (!affects && activityType === "attack") return TARGETING_PROFILES.DIRECT;
  if (affects === "self") return TARGETING_PROFILES.SELF;
  if (["object", "space"].includes(affects)) return TARGETING_PROFILES.INTERACTIVE;
  if (["summon", "enchant", "transform", "forward", "cast"].includes(activityType)) {
    return TARGETING_PROFILES.INTERACTIVE;
  }
  return TARGETING_PROFILES.NONE;
}

function activitySelectionErrorMessage(spell, resolution) {
  if (resolution?.reason === "activity-changed") return `${spell.name}'s saved Activity no longer exists or cannot currently be used. Recreate the trap.`;
  if (resolution?.reason === "activity-choice-required") return `${spell.name} has more than one usable Activity and requires a choice.`;
  return `${spell.name} has no usable D&D5e Activity.`;
}

function activityChoiceDetails(activity) {
  const type = String(activity?.type ?? "activity");
  const activation = String(activity?.activation?.type ?? "").trim();
  const target = plainData(activity?.target);
  const targetType = String(target?.template?.type ?? target?.affects?.type ?? "").trim();
  return [type, activation && activation !== "none" ? activation : null, targetType || null]
    .filter(Boolean)
    .join(" · ");
}

async function chooseSpellActivity(spell, activities) {
  if (!Array.isArray(activities) || !activities.length) return null;
  if (activities.length === 1) return activities[0];
  if (!globalThis.Dialog) return null;
  const rows = activities.map((activity, index) => `<label class="et-choice-option">
    <input type="radio" name="activityId" value="${escapeHtml(activity.id)}" ${index === 0 ? "checked" : ""}>
    <span><b>${escapeHtml(activityLabel(activity))}</b><small>${escapeHtml(activityChoiceDetails(activity) || "D&D5e Activity")}</small></span>
  </label>`).join("");
  return new Promise(resolve => {
    let settled = false;
    const finish = value => { if (!settled) { settled = true; resolve(value ?? null); } };
    const dialog = new Dialog({
      title: `${spell.name} — choose Activity`,
      content: `<form class="easy-traps-context"><div class="et-note"><i class="fa-solid fa-list-check"></i><span><b>${escapeHtml(spell.name)} has ${activities.length} usable Activities</b><small>Choose the exact native Activity this trap should use. EasyTraps will still execute the original spell Item through D&D5e.</small></span></div><fieldset class="et-choice-fieldset"><legend>Activity</legend>${rows}</fieldset></form>`,
      buttons: {
        cancel: { label: "Cancel", callback: () => finish(null) },
        continue: { label: "Continue", callback: html => {
          const root = html?.[0] ?? html;
          const id = root?.querySelector?.("input[name='activityId']:checked")?.value;
          finish(activities.find(activity => activity.id === id) ?? null);
        } }
      },
      default: "continue",
      close: () => finish(null)
    }, { width: 540 });
    dialog.render(true);
  });
}

async function chooseDirectTargetPolicy(spell) {
  if (!globalThis.Dialog) return { targetMode: TARGET_MODES.TRIGGERING_TOKEN, selectionZoneWidth: 1, selectionZoneHeight: 1 };
  return new Promise(resolve => {
    let settled = false;
    const finish = value => { if (!settled) { settled = true; resolve(value ?? null); } };
    const dialog = new Dialog({
      title: `${spell.name} — target selection`,
      content: `<form class="easy-traps-context et-target-policy">
        <div class="et-target-policy-heading">
          <span class="et-target-policy-icon"><i class="fa-solid fa-crosshairs"></i></span>
          <span><small>Targeting</small><b>How should this trap choose creatures?</b><em>${escapeHtml(spell.name)} needs one or more creature targets.</em></span>
        </div>
        <div class="et-target-policy-options" role="radiogroup" aria-label="Trap target mode">
          <label class="et-target-policy-option">
            <input type="radio" name="targetMode" value="${TARGET_MODES.TRIGGERING_TOKEN}" checked>
            <span><i class="fa-solid fa-person-walking-arrow-right"></i><span><b>Triggering creature</b><small>Target only the creature that activates the trap.</small></span><i class="fa-solid fa-circle-check et-target-policy-check"></i></span>
          </label>
          <label class="et-target-policy-option">
            <input type="radio" name="targetMode" value="${TARGET_MODES.CUSTOM_ZONE}">
            <span><i class="fa-solid fa-vector-square"></i><span><b>Creatures in a zone</b><small>Place a rectangular zone and target every creature currently inside it.</small></span><i class="fa-solid fa-circle-check et-target-policy-check"></i></span>
          </label>
        </div>
        <section class="et-target-zone-settings" data-target-zone-settings hidden>
          <header><span><b>Target zone size</b><small>You will place this zone on the scene after Continue.</small></span></header>
          <div class="et-target-zone-grid">
            <label><span>Width</span><div class="et-number-suffix"><input type="number" name="zoneWidth" min="1" max="20" step="1" value="1"><b>cells</b></div></label>
            <label><span>Height</span><div class="et-number-suffix"><input type="number" name="zoneHeight" min="1" max="20" step="1" value="1"><b>cells</b></div></label>
          </div>
        </section>
      </form>`,
      buttons: {
        cancel: { label: "Cancel", callback: () => finish(null) },
        continue: { label: "Continue", callback: html => {
          const root = html?.[0] ?? html;
          const mode = normalizeTargetMode(root?.querySelector?.("input[name='targetMode']:checked")?.value);
          finish({
            targetMode: mode,
            selectionZoneWidth: clampCellCount(root?.querySelector?.("input[name='zoneWidth']")?.value),
            selectionZoneHeight: clampCellCount(root?.querySelector?.("input[name='zoneHeight']")?.value)
          });
        } }
      },
      default: "continue",
      render: html => {
        const root = html?.[0] ?? html;
        const zone = root?.querySelector?.("[data-target-zone-settings]");
        const sync = () => {
          const mode = normalizeTargetMode(root?.querySelector?.("input[name='targetMode']:checked")?.value);
          const showZone = mode === TARGET_MODES.CUSTOM_ZONE;
          if (zone) zone.hidden = !showZone;
          for (const input of zone?.querySelectorAll?.("input") ?? []) input.disabled = !showZone;
        };
        root?.querySelectorAll?.("input[name='targetMode']")?.forEach(input => input.addEventListener("change", sync));
        sync();
      },
      close: () => finish(null)
    }, { width: 600, resizable: false });
    dialog.render(true);
  });
}

async function analyzeSpellAfterPlaceClick(spell) {
  const activities = usableActivityList(spell);
  if (!activities.length) {
    ui.notifications.warn(activitySelectionErrorMessage(spell, { reason: "missing-activity", activityCount: 0 }));
    return null;
  }
  const activity = await chooseSpellActivity(spell, activities);
  if (!activity) return null;
  const effectiveTarget = resolveEffectiveTarget(spell, activity);
  const targetingProfile = classifyTargetingProfile(effectiveTarget, activity);
  const promptedTemplate = activityHasPromptedTemplate(activity, spell, effectiveTarget);
  const plan = {
    activityId: activity.id,
    activityLabel: activityLabel(activity),
    activityType: String(activity.type ?? "activity"),
    activityCount: activities.length,
    effectiveTarget,
    targetingProfile,
    targetMode: TARGET_MODES.NONE,
    areaMode: AREA_MODES.NONE,
    selectionZoneWidth: 1,
    selectionZoneHeight: 1,
    requiresNativeInteraction: activityNeedsNativeConfiguration(activity, targetingProfile),
    sourceModifiedTime: Number(spell?._stats?.modifiedTime ?? spell?.toObject?.()?._stats?.modifiedTime) || null
  };
  if (promptedTemplate) {
    plan.areaMode = AREA_MODES.PREPLACED;
    plan.targetMode = templateSuppliesCreatureTargets(effectiveTarget) ? TARGET_MODES.SPELL_AREA : TARGET_MODES.NONE;
  } else if (targetingProfile === TARGETING_PROFILES.DIRECT) {
    const targetPolicy = await chooseDirectTargetPolicy(spell);
    if (!targetPolicy) return null;
    Object.assign(plan, targetPolicy);
  }
  return plan;
}

function sceneGeometry() {
  const d = canvas.dimensions;
  const gridSize = Number(canvas.grid?.size ?? canvas.scene?.grid?.size) || 100;
  return {
    sceneX: Number(d.sceneX) || 0,
    sceneY: Number(d.sceneY) || 0,
    gridSize,
    columns: Math.ceil(Number(d.sceneWidth) / gridSize),
    rows: Math.ceil(Number(d.sceneHeight) / gridSize)
  };
}

function normalizeExternalControllerTileUpdate(tileDocument, trap, changes, options = {}) {
  const type = normalizeTriggerType(trap?.triggerType);
  if (!isExternalTriggerType(type)) return false;

  // Foundry's native Tile visibility toggle represents discovery for EasyTraps,
  // not the technical controller's actual hidden state. Keep the controller
  // permanently invisible while mirroring an explicit GM visibility request
  // into the shared discovered flag. EasyTraps' own discovery updates already
  // carry that flag and bypass this compatibility translation.
  if (!options?.easyTrapsInternal && !options?.easyTrapsDiscovery && hasChange(changes, "hidden")) {
    const requestedHidden = Boolean(changedValue(changes, "hidden", tileDocument.hidden));
    changes[`flags.${MODULE_ID}.discovered`] = !requestedHidden;
  }

  const source = linkedSourceDocumentForTrap(tileDocument, trap);
  if (type === TRIGGER_TYPES.DOOR && source) {
    const geometry = doorControllerGeometryForWall(source, source.parent ?? tileDocument.parent ?? canvas.scene);
    if (geometry) Object.assign(changes, geometry);
  } else if (type === TRIGGER_TYPES.ITEM_PILE && source) {
    const rect = tokenCanvasRectangle(source, source.parent ?? tileDocument.parent ?? canvas.scene);
    Object.assign(changes, {
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
      rotation: Number(source.rotation) || 0,
      elevation: Number(source.elevation) || 0
    });
  }

  changes.hidden = true;
  changes.alpha = 0;
  changes[`flags.${MODULE_ID}.schema`] = TRIGGER_SCHEMA;
  changes[`flags.${MODULE_ID}.version`] = VERSION;
  return true;
}

function onPreUpdateTile(tileDocument, changes, options = {}) {
  if (!game.user?.isGM) return;
  const trap = trapData(tileDocument);
  const origin = originData(tileDocument);
  if (!trap && !origin) return;

  if (origin) {
    normalizeOriginTileUpdate(tileDocument, changes);
    return;
  }

  // Door and Item Pile controllers follow their real source geometry. They must
  // never be snapped back to the ordinary square-grid trigger model.
  if (normalizeExternalControllerTileUpdate(tileDocument, trap, changes, options)) return;

  const geometry = sceneGeometry();
  const proposed = proposedTileState(tileDocument, changes);
  const currentBounds = triggerDimensions(trap);
  const widthChanged = hasChange(changes, "width");
  const heightChanged = hasChange(changes, "height");
  const widthCells = widthChanged ? clampCellCount(proposed.width / geometry.gridSize) : currentBounds.width;
  const heightCells = heightChanged ? clampCellCount(proposed.height / geometry.gridSize) : currentBounds.height;
  const offsets = rectangleOffsets(widthCells, heightCells);

  let proposedTopLeft = markerTopLeft(proposed);
  if ((widthChanged || heightChanged) && !hasChange(changes, "x") && !hasChange(changes, "y")) {
    proposedTopLeft = markerTopLeft(tileDocument);
  }
  const requestedBaseCell = {
    column: Math.round((proposedTopLeft.x - geometry.sceneX) / geometry.gridSize),
    row: Math.round((proposedTopLeft.y - geometry.sceneY) / geometry.gridSize)
  };
  const baseCell = clampBaseCell(requestedBaseCell, offsets, geometry);
  const anchor = { x: 0, y: 0 };
  const marker = markerDataForBaseCell(baseCell, offsets, geometry);

  changes.x = marker.x;
  changes.y = marker.y;
  changes.width = marker.width;
  changes.height = marker.height;
  changes.rotation = 0;
  foundry.utils.setProperty(changes, "texture.anchorX", anchor.x);
  foundry.utils.setProperty(changes, "texture.anchorY", anchor.y);
  changes[`flags.${MODULE_ID}.schema`] = TRIGGER_SCHEMA;
  changes[`flags.${MODULE_ID}.version`] = VERSION;
  changes[`flags.${MODULE_ID}.triggerCells`] = offsets;
  changes[`flags.${MODULE_ID}.triggerWidth`] = widthCells;
  changes[`flags.${MODULE_ID}.triggerHeight`] = heightCells;
}

function normalizeOriginTileUpdate(tileDocument, changes) {
  const geometry = sceneGeometry();
  const proposed = proposedTileState(tileDocument, changes);
  let proposedTopLeft = markerTopLeft(proposed);
  if ((hasChange(changes, "width") || hasChange(changes, "height"))
    && !hasChange(changes, "x") && !hasChange(changes, "y")) {
    proposedTopLeft = markerTopLeft(tileDocument);
  }
  const offsets = rectangleOffsets(1, 1);
  const requestedBaseCell = {
    column: Math.round((proposedTopLeft.x - geometry.sceneX) / geometry.gridSize),
    row: Math.round((proposedTopLeft.y - geometry.sceneY) / geometry.gridSize)
  };
  const baseCell = clampBaseCell(requestedBaseCell, offsets, geometry);
  const anchor = { x: 0, y: 0 };
  const marker = markerDataForBaseCell(baseCell, offsets, geometry);

  changes.x = marker.x;
  changes.y = marker.y;
  changes.width = marker.width;
  changes.height = marker.height;
  changes.rotation = 0;
  foundry.utils.setProperty(changes, "texture.anchorX", anchor.x);
  foundry.utils.setProperty(changes, "texture.anchorY", anchor.y);
  changes[`flags.${MODULE_ID}.schema`] = TRIGGER_SCHEMA;
  changes[`flags.${MODULE_ID}.version`] = VERSION;
}

function proposedTileState(tileDocument, changes) {
  const texture = {
    anchorX: changedValue(changes, "texture.anchorX", tileDocument.texture?.anchorX ?? 0),
    anchorY: changedValue(changes, "texture.anchorY", tileDocument.texture?.anchorY ?? 0)
  };
  return {
    x: Number(changedValue(changes, "x", tileDocument.x)),
    y: Number(changedValue(changes, "y", tileDocument.y)),
    width: Math.max(1, Number(changedValue(changes, "width", tileDocument.width))),
    height: Math.max(1, Number(changedValue(changes, "height", tileDocument.height))),
    texture
  };
}

function hasChange(changes, path) {
  return Object.hasOwn(changes, path) || foundry.utils.hasProperty(changes, path);
}

function changedValue(changes, path, fallback) {
  if (Object.hasOwn(changes, path)) return changes[path];
  return foundry.utils.hasProperty(changes, path) ? foundry.utils.getProperty(changes, path) : fallback;
}

function triggerDimensions(trap) {
  const offsets = Array.isArray(trap?.triggerCells) && trap.triggerCells.length
    ? trap.triggerCells
    : rectangleOffsets(trap?.triggerWidth, trap?.triggerHeight);
  const width = Math.max(...offsets.map(cell => Number(cell?.dx) || 0)) + 1;
  const height = Math.max(...offsets.map(cell => Number(cell?.dy) || 0)) + 1;
  return { width: clampCellCount(width), height: clampCellCount(height) };
}

async function migrateLegacyTriggers() {
  if (!canvas.scene || !isPrimaryGM()) return;
  const geometry = sceneGeometry();
  const updates = [];
  let invalidCount = 0;
  for (const tile of canvas.scene.tiles) {
    const trap = trapData(tile);
    if (!trap || Number(trap.schema) >= TRIGGER_SCHEMA) continue;

    const dimensions = triggerDimensions(trap);
    const offsets = rectangleOffsets(dimensions.width, dimensions.height);
    const recoveredCell = Number(trap.schema) < 3
      ? legacyBaseCellFromMarker003(tile, geometry)
      : Number(trap.schema) < 9
        ? legacyAnchoredBaseCellFromMarker(tile, geometry)
        : baseCellFromMarker(tile, geometry);
    const baseCell = clampBaseCell(recoveredCell, offsets, geometry);
    const marker = markerDataForBaseCell(baseCell, offsets, geometry);

    const originMode = normalizeOriginMode(trap.originMode ?? ORIGIN_MODES.TRIGGERING_TOKEN);
    const originTile = originMode === ORIGIN_MODES.SEPARATE_TILE
      ? canvas.scene.tiles.get(trap.originTileId) ?? canvas.scene.tiles.find(entry => entry.uuid === trap.originTileUuid)
      : null;
    const referenceOffsets = rectangleOffsets(1, 1);
    const originSchema = Number(originData(originTile)?.schema);
    const referenceMarker = originTile
      ? markerDataForBaseCell(
        clampBaseCell(
          originSchema >= 9 ? baseCellFromMarker(originTile, geometry) : legacyAnchoredBaseCellFromMarker(originTile, geometry),
          referenceOffsets,
          geometry
        ),
        referenceOffsets,
        geometry
      )
      : marker;
    const referencePoint = {
      x: referenceMarker.x + referenceMarker.width / 2,
      y: referenceMarker.y + referenceMarker.height / 2,
      elevation: Number(originTile?.elevation ?? tile.elevation) || 0
    };
    const templates = Array.isArray(trap.templates)
      ? trap.templates.map(snapshot => normalizedTemplateSnapshot(snapshot, referencePoint))
      : [];

    let compatible = false;
    let activityId = trap.activityId ?? null;
    let activityType = trap.activityType ?? null;
    let savedActivityLabel = trap.activityLabel ?? null;
    let activityCount = Number(trap.activityCount) || null;
    let sourceRevisionTime = Number(trap.sourceModifiedTime) || null;
    let spellImg = String(trap.spellImg ?? "").trim();
    let effectiveTarget = foundry.utils.deepClone(trap.effectiveTarget ?? {});
    let targetingProfile = normalizeTargetingProfile(trap.targetingProfile ?? (templates.length ? TARGETING_PROFILES.NATIVE_AREA : TARGETING_PROFILES.NONE));
    let targetMode = normalizeTargetMode(trap.targetMode ?? TARGET_MODES.NONE);
    let areaMode = normalizeAreaMode(trap.areaMode ?? (templates.length ? AREA_MODES.PREPLACED : AREA_MODES.NONE));
    let requiresNativeInteraction = Boolean(trap.requiresNativeInteraction);
    let workflow = trap.workflow;
    const spellSaveDc = normalizeSpellSaveDc(trap.spellSaveDc);
    const spellAttackBonus = normalizeSpellAttackBonus(trap.spellAttackBonus);
    let castLevel = Math.min(9, Math.max(0, Math.trunc(Number(trap.castLevel)) || 0));
    let cantripCasterLevel = trap.cantripCasterLevel == null ? null : normalizeCantripCasterLevel(trap.cantripCasterLevel, 1);
    let scaling = Math.max(0, Math.trunc(Number(trap.scaling)) || 0);

    try {
      const spell = trap.spellUuid ? await fromUuid(trap.spellUuid) : null;
      if (spell) spellImg = String(spell.img ?? spellImg ?? "").trim();
      let resolution = spell ? resolveActivitySelection(spell, activityId) : { supported: false, reason: "missing-activity", activityCount: 0 };
      if (!resolution.supported && spell && !activityId && usableActivityList(spell).length === 1) {
        resolution = resolveActivitySelection(spell, usableActivityList(spell)[0].id);
      }
      if (resolution.supported) {
        const activity = resolution.activity;
        activityId = activity.id;
        activityType = String(activity.type ?? "activity");
        savedActivityLabel = activityLabel(activity);
        activityCount = resolution.activityCount;
        sourceRevisionTime = sourceModifiedTime(spell);
        const baseLevel = normalizeSpellBaseLevel(spell.system?.level);
        if (baseLevel === 0) {
          castLevel = 0;
          cantripCasterLevel = normalizeCantripCasterLevel(trap.cantripCasterLevel, 1);
          scaling = cantripScalingIncrease(cantripCasterLevel);
        } else {
          castLevel = normalizeCastLevel(castLevel || baseLevel, baseLevel);
          cantripCasterLevel = null;
          scaling = castScaling(castLevel, baseLevel);
        }
        effectiveTarget = resolveEffectiveTarget(spell, activity);
        targetingProfile = classifyTargetingProfile(effectiveTarget, activity);
        const promptedTemplate = activityHasPromptedTemplate(activity, spell, effectiveTarget);
        areaMode = promptedTemplate ? AREA_MODES.PREPLACED : AREA_MODES.NONE;
        if (promptedTemplate) {
          targetMode = templateSuppliesCreatureTargets(effectiveTarget) ? TARGET_MODES.SPELL_AREA : TARGET_MODES.NONE;
          compatible = templates.length > 0;
        } else if (targetingProfile === TARGETING_PROFILES.DIRECT) {
          targetMode = [TARGET_MODES.TRIGGERING_TOKEN, TARGET_MODES.CUSTOM_ZONE].includes(targetMode)
            ? targetMode : TARGET_MODES.TRIGGERING_TOKEN;
          compatible = targetMode !== TARGET_MODES.CUSTOM_ZONE || Boolean(trap.selectionZone);
        } else {
          targetMode = TARGET_MODES.NONE;
          compatible = true;
        }
        requiresNativeInteraction = activityNeedsNativeConfiguration(activity, targetingProfile);
        workflow = planSpellWorkflow(spell, activity.id);
      } else {
        activityCount = resolution.activityCount;
        compatible = false;
      }
    } catch (error) {
      console.warn(`${MODULE_ID} | Could not validate legacy trap ${tile.name}`, error);
      compatible = false;
    }

    const armed = compatible && trap.armed !== false;
    if (!compatible) invalidCount += 1;
    updates.push({
      _id: tile.id,
      x: marker.x,
      y: marker.y,
      width: marker.width,
      height: marker.height,
      rotation: 0,
      hidden: Boolean(tile.hidden),
      "texture.anchorX": 0,
      "texture.anchorY": 0,
      [`flags.${MODULE_ID}.schema`]: TRIGGER_SCHEMA,
      [`flags.${MODULE_ID}.version`]: VERSION,
      [`flags.${MODULE_ID}.kind`]: "spell-grid",
      [`flags.${MODULE_ID}.spellImg`]: spellImg || DEFAULT_TRIGGER_TEXTURE,
      [`flags.${MODULE_ID}.armed`]: armed,
      [`flags.${MODULE_ID}.triggerType`]: normalizeTriggerType(trap.triggerType),
      [`flags.${MODULE_ID}.triggerSourceId`]: trap.triggerSourceId ?? null,
      [`flags.${MODULE_ID}.triggerSourceUuid`]: trap.triggerSourceUuid ?? null,
      [`flags.${MODULE_ID}.triggerSourceOwnership`]: isExternalTriggerType(trap.triggerType)
        ? normalizeTriggerSourceOwnership(trap.triggerSourceOwnership, TRIGGER_SOURCE_OWNERSHIP.CREATED)
        : null,
      [`flags.${MODULE_ID}.internalController`]: isExternalTriggerType(trap.triggerType),
      [`flags.${MODULE_ID}.discovered`]: trapDiscoveryState(tile, trap),
      [`flags.${MODULE_ID}.requiresReconfiguration`]: !compatible,
      [`flags.${MODULE_ID}.originMode`]: originMode,
      [`flags.${MODULE_ID}.originTileId`]: trap.originTileId ?? null,
      [`flags.${MODULE_ID}.originTileUuid`]: trap.originTileUuid ?? null,
      [`flags.${MODULE_ID}.activityId`]: activityId,
      [`flags.${MODULE_ID}.activityType`]: activityType,
      [`flags.${MODULE_ID}.activityLabel`]: savedActivityLabel ?? activityType ?? "Activity",
      [`flags.${MODULE_ID}.activityCount`]: activityCount,
      [`flags.${MODULE_ID}.sourceModifiedTime`]: sourceRevisionTime,
      [`flags.${MODULE_ID}.castLevel`]: castLevel,
      [`flags.${MODULE_ID}.cantripCasterLevel`]: cantripCasterLevel,
      [`flags.${MODULE_ID}.scaling`]: scaling,
      [`flags.${MODULE_ID}.spellSaveDc`]: spellSaveDc,
      [`flags.${MODULE_ID}.spellAttackBonus`]: spellAttackBonus,
      [`flags.${MODULE_ID}.pauseOnTrigger`]: Boolean(trap.pauseOnTrigger),
      [`flags.${MODULE_ID}.disarmAfterTrigger`]: trap.disarmAfterTrigger !== false,
      [`flags.${MODULE_ID}.discovery`]: migrateDiscoveryConfig(
        trap.discovery ?? { ...foundry.utils.deepClone(DEFAULT_DISCOVERY_CONFIG), enabled: false },
        { fromSchema: Number(trap.schema) || 0 }
      ),
      [`flags.${MODULE_ID}.targetMode`]: targetMode,
      [`flags.${MODULE_ID}.targetingProfile`]: targetingProfile,
      [`flags.${MODULE_ID}.effectiveTarget`]: effectiveTarget,
      [`flags.${MODULE_ID}.requiresNativeInteraction`]: requiresNativeInteraction,
      [`flags.${MODULE_ID}.areaMode`]: areaMode,
      [`flags.${MODULE_ID}.selectionZone`]: trap.selectionZone ?? null,
      [`flags.${MODULE_ID}.templates`]: templates,
      [`flags.${MODULE_ID}.backend`]: "matt-native-spell",
      [`flags.${MODULE_ID}.workflow`]: workflow,
      [`flags.${MODULE_ID}.triggerCells`]: offsets,
      [`flags.${MODULE_ID}.triggerWidth`]: dimensions.width,
      [`flags.${MODULE_ID}.triggerHeight`]: dimensions.height,
      "flags.monks-active-tiles.active": mattActiveForTrap(trap, armed)
    });
  }
  if (updates.length) await canvas.scene.updateEmbeddedDocuments("Tile", updates);

  const originUpdates = canvas.scene.tiles
    .filter(tile => originData(tile) && Number(originData(tile).schema) < TRIGGER_SCHEMA)
    .map(tile => {
      const offsets = rectangleOffsets(1, 1);
      const schema = Number(originData(tile)?.schema) || 0;
      const recoveredCell = schema >= 9 ? baseCellFromMarker(tile, geometry) : legacyAnchoredBaseCellFromMarker(tile, geometry);
      const baseCell = clampBaseCell(recoveredCell, offsets, geometry);
      const marker = markerDataForBaseCell(baseCell, offsets, geometry);
      return {
        _id: tile.id,
        x: marker.x,
        y: marker.y,
        width: marker.width,
        height: marker.height,
        rotation: 0,
        "texture.anchorX": 0,
        "texture.anchorY": 0,
        [`flags.${MODULE_ID}.schema`]: TRIGGER_SCHEMA,
        [`flags.${MODULE_ID}.version`]: VERSION
      };
    });
  if (originUpdates.length) await canvas.scene.updateEmbeddedDocuments("Tile", originUpdates);

  if (invalidCount) ui.notifications.warn(`${invalidCount} legacy trap${invalidCount === 1 ? "" : "s"} must be recreated because its saved Activity or placement data is no longer valid.`);
}


function spatialAlarmTrap(tile) {
  const trap = trapData(tile);
  if (!trap || !isAlarmTrap(trap)) return null;
  const config = normalizeAlarmConfig(trap.alarm);
  return config.audibility.mode === ALARM_AUDIBILITY_MODES.SPATIAL ? { tile, trap, config } : null;
}

function gmAlarmRangeTrapAtPoint(point) {
  const scene = canvas.scene;
  if (!scene || !point) return null;
  const tiles = Array.from(scene.tiles ?? []);

  // Item Pile triggers are represented to the GM by the visible Token, not the
  // hidden technical controller. Resolve that direct source first.
  const gridSize = Number(canvas.grid?.size ?? scene.grid?.size) || 100;
  const token = visibleTokenAtPoint(point, canvas.tokens?.placeables ?? [], gridSize);
  if (token?.document) {
    const link = sourceLinkFromDocument(token.document, MODULE_ID);
    if (link?.type === TRIGGER_TYPES.ITEM_PILE) {
      const controller = controllerTileFromSource(scene, token.document, TRIGGER_TYPES.ITEM_PILE);
      if (spatialAlarmTrap(controller)) return controller;
    }
  }

  // One reverse pass handles separate origins, Door source geometry, and normal
  // Tile triggers. This stays cheap enough for pointer hover even in trap-heavy
  // scenes and does not change any native placeable interaction state.
  for (let index = tiles.length - 1; index >= 0; index -= 1) {
    const tile = tiles[index];
    const origin = originData(tile);
    if (origin?.kind === "alarm-origin") {
      const rect = trapCanvasRectangle(tile);
      if (pointInsideTrapInteractionGeometry(point, { type: "rect", rect })) {
        const triggerTile = scene.tiles?.get?.(origin.triggerTileId)
          ?? scene.tiles?.find?.(entry => entry.uuid === origin.triggerTileUuid)
          ?? null;
        if (spatialAlarmTrap(triggerTile)) return triggerTile;
      }
      continue;
    }

    const candidate = spatialAlarmTrap(tile);
    if (!candidate) continue;
    const type = normalizeTriggerType(candidate.trap.triggerType);
    if (type === TRIGGER_TYPES.ITEM_PILE) continue;
    const geometry = trapInteractionGeometry(tile, candidate.trap);
    if (geometry && pointInsideTrapInteractionGeometry(point, geometry)) return tile;
  }
  return null;
}

function setGmAlarmRangeHover(tile) {
  const state = runtime.gmAlarmRangePreview;
  const nextId = tile?.id ?? null;
  if (state.hoveredTileId === nextId) return;
  state.hoveredTileId = nextId;
  refreshAreaOverlays();
}

function onGmAlarmRangePointerMove(event) {
  if (!game.user?.isGM || !canvas?.scene) return;
  const point = pointerToCanvas(event);
  if (!point || !isPointInScene(point)) {
    setGmAlarmRangeHover(null);
    return;
  }
  setGmAlarmRangeHover(gmAlarmRangeTrapAtPoint(point));
}

function setupGmAlarmRangePreview() {
  teardownGmAlarmRangePreview();
  if (!game.user?.isGM || !canvas?.ready || !canvas.stage?.on) return;
  const state = runtime.gmAlarmRangePreview;
  state.moveHandler = event => onGmAlarmRangePointerMove(event);
  canvas.stage.on("pointermove", state.moveHandler);
  state.installed = true;
}

function teardownGmAlarmRangePreview() {
  const state = runtime.gmAlarmRangePreview;
  if (state.moveHandler) {
    try { canvas.stage?.off?.("pointermove", state.moveHandler); } catch (_error) { /* canvas already gone */ }
  }
  state.moveHandler = null;
  state.installed = false;
  state.hoveredTileId = null;
}

/**
 * Player trap interaction
 * -----------------------
 * Foundry v14 leaves visible Tiles non-interactive for players who do not own
 * them (`eventMode: none`). We intentionally do not change source permissions
 * or PIXI interaction state. Instead, the canvas stage performs a narrow
 * hover-only source-aware hit-test: ordinary traps use the Tile, Item Piles use
 * the real Token, and Doors use a bilateral band around the real Wall segment.
 * EasyTraps never converts a source primary click into DISARM; one shared HTML
 * DISARM control owns that action, leaving native source interaction untouched.
 */
function setupPlayerTrapInteraction() {
  teardownPlayerTrapInteraction();
  if (game.user?.isGM || !canvas?.ready || !canvas.stage?.on) return;

  const state = runtime.playerTrapInteraction;
  state.moveHandler = event => onPlayerTrapPointerMove(event);
  canvas.stage.on("pointermove", state.moveHandler);
  state.installed = true;
}

function teardownPlayerTrapInteraction() {
  const state = runtime.playerTrapInteraction;
  if (state.moveHandler) {
    try { canvas.stage?.off?.("pointermove", state.moveHandler); } catch (_error) { /* canvas already gone */ }
  }
  state.moveHandler = null;
  state.installed = false;
  state.lastPointerPoint = null;
  destroyPlayerDisarmControl();
  state.disarmBusy = false;
  state.pendingRequestId = null;
  if (state.activeLockId && state.activeLockTileId) {
    releasePlayerDisarmInteractionLock({ sceneId: state.activeLockSceneId, tileId: state.activeLockTileId, lockId: state.activeLockId });
  }
  state.activeLockId = null;
  state.activeLockTileId = null;
  state.activeLockSceneId = null;
  state.lockedTrapIds.clear();
  for (const pending of runtime.pendingDisarmRequests.values()) clearTimeout(pending.timeoutId);
  runtime.pendingDisarmRequests.clear();
  for (const pending of runtime.pendingDisarmPreflights.values()) {
    clearTimeout(pending.timeoutId);
    pending.resolve?.({ ok: false, error: "Canvas closed before the disarm attempt began." });
  }
  runtime.pendingDisarmPreflights.clear();
  setPlayerTrapHover(null, { immediate: true });
}

function refreshPlayerTrapInteractionState() {
  const state = runtime.playerTrapInteraction;
  if (game.user?.isGM) {
    if (state.installed) teardownPlayerTrapInteraction();
    return;
  }
  if (!canvas?.ready || !canvas.scene) return;
  if (!state.installed) setupPlayerTrapInteraction();
  if (!state.hoveredTileId) return;
  const tile = canvas.scene.tiles.get?.(state.hoveredTileId)
    ?? canvas.scene.tiles.find?.(entry => entry.id === state.hoveredTileId);
  if (!isPlayerTrapInteractionCandidate(tile)) setPlayerTrapHover(null);
}

function playerTrapInteractionAtPoint(point) {
  const scene = canvas.scene;
  const gridSize = Number(canvas.grid?.size ?? scene?.grid?.size) || 100;
  const token = visibleTokenAtPoint(point, canvas.tokens?.placeables ?? [], gridSize);

  // A discovered trapped Item Pile is itself a Token. Resolve it back to the
  // hidden controller so the visible source owns the interaction.
  if (token?.document) {
    const link = sourceLinkFromDocument(token.document, MODULE_ID);
    const itemPileTrap = link?.type === TRIGGER_TYPES.ITEM_PILE
      ? controllerTileFromSource(scene, token.document, TRIGGER_TYPES.ITEM_PILE)
      : null;
    if (isPlayerTrapInteractionCandidate(itemPileTrap)) {
      return { tile: itemPileTrap, token, sourceDocument: token.document, triggerType: TRIGGER_TYPES.ITEM_PILE };
    }
    return { tile: null, token, sourceDocument: null, triggerType: null };
  }

  const tiles = Array.from(scene?.tiles ?? []);
  for (let index = tiles.length - 1; index >= 0; index -= 1) {
    const tile = tiles[index];
    if (!isPlayerTrapInteractionCandidate(tile)) continue;
    const trap = trapData(tile);
    if (normalizeTriggerType(trap?.triggerType) !== TRIGGER_TYPES.DOOR) continue;
    const geometry = trapInteractionGeometry(tile, trap);
    if (geometry?.type === "segment" && pointInsideTrapInteractionGeometry(point, geometry)) {
      return {
        tile,
        token: null,
        sourceDocument: geometry.sourceDocument,
        triggerType: TRIGGER_TYPES.DOOR
      };
    }
  }

  const tile = playerTrapAtPoint(point, tiles);
  return {
    tile,
    token: null,
    sourceDocument: tile,
    triggerType: tile ? TRIGGER_TYPES.TILE : null
  };
}

function onPlayerTrapPointerMove(event) {
  if (game.user?.isGM || !canvas?.scene) return;
  const state = runtime.playerTrapInteraction;
  const point = pointerToCanvas(event);
  state.lastPointerPoint = point ?? state.lastPointerPoint;
  if (!point || !isPointInScene(point)) {
    if (!state.disarmControlHovered) setPlayerTrapHover(null);
    return;
  }

  const interaction = playerTrapInteractionAtPoint(point);
  if (interaction.tile) {
    if (state.disarmControlHideTimer) {
      clearTimeout(state.disarmControlHideTimer);
      state.disarmControlHideTimer = null;
    }
    setPlayerTrapHover(interaction.tile);
    repositionPlayerDisarmControl(interaction.tile, point);
    return;
  }

  // The explicit DISARM control sits outside the source. Keep a short bridge
  // window while the pointer crosses that gap; entering the DOM control cancels
  // this timer. The source itself never becomes an EasyTraps click target.
  if (state.disarmControl && !state.disarmControlHovered) {
    if (!state.disarmControlHideTimer) {
      state.disarmControlHideTimer = setTimeout(() => {
        state.disarmControlHideTimer = null;
        if (!state.disarmControlHovered) setPlayerTrapHover(null);
      }, 260);
    }
    return;
  }

  // When the pointer is over the HTML DISARM control the canvas no longer
  // receives pointer movement. Preserve hover until the control reports leave.
  if (!state.disarmControlHovered) setPlayerTrapHover(null);
}

async function attemptPlayerTrapDisarm(tile) {

  if (!isPlayerTrapInteractionCandidate(tile) || game.user?.isGM) return;
  const state = runtime.playerTrapInteraction;
  if (state.disarmBusy) return;

  pulsePlayerTrapInteraction();
  // Keep the original hook for compatibility with early EasyTraps integrations,
  // but expose the semantically correct hook for new consumers.
  Hooks.callAll("easyTrapsPlayerTrapClick", tile, game.user);
  Hooks.callAll("easyTrapsPlayerDisarmAttempt", tile, game.user);

  const controlled = Array.from(canvas.tokens?.controlled ?? []).filter(token => {
    const actor = token?.actor;
    return actor?.isOwner === true && token.document?.hidden !== true && !runtimeOriginFlag(token.document);
  });
  if (controlled.length !== 1) {
    ui.notifications.warn(controlled.length
      ? "Select only one of your tokens before attempting to disarm the trap."
      : "Select one of your tokens before attempting to disarm the trap.");
    return;
  }

  const token = controlled[0];
  const actor = token.actor;
  if (!(actor?.rollSkill instanceof Function)) {
    ui.notifications.error("D&D5e's native Sleight of Hand roll is unavailable for this Actor.");
    return;
  }
  if (!primaryActiveGMUser()) {
    ui.notifications.warn("A GM must be connected to resolve the disarm attempt.");
    return;
  }

  const trap = trapData(tile);
  if (state.lockedTrapIds.has(tile.id)) {
    return ui.notifications.warn("Another character is already attempting to disarm this trap.");
  }
  const distance = measureTokenToTrapDisarmDistance(token.document, tile, canvas.scene);
  if (!isWithinTrapRange(distance, DISARM_MAX_DISTANCE_FT)) {
    return ui.notifications.warn(`Move within ${DISARM_MAX_DISTANCE_FT} ft of the trap to attempt to disarm it.`);
  }
  const config = normalizeDiscoveryConfig(trap?.discovery);
  if (!config.enabled) {
    refreshPlayerTrapInteractionState();
    return ui.notifications.warn("Disarming is disabled for this trap.");
  }

  // Fast local rejection for the common case. The authoritative GM preflight
  // below is still mandatory so stale player data can never open a roll that
  // the GM already knows is invalid (missing tool, prior attempt, etc.).
  const localEligibility = evaluateDisarmEligibility({
    actor,
    config,
    attempts: trap?.disarmAttempts
  });
  if (!localEligibility.allowed) return ui.notifications.warn(localEligibility.message);

  state.disarmBusy = true;
  try {
    const preflight = await requestGmDisarmPreflight({ tile, token, actor });
    if (!preflight?.ok) {
      if (preflight?.error) ui.notifications.warn(preflight.error);
      return;
    }
    const lockId = String(preflight.lockId ?? "");
    state.activeLockId = lockId || null;
    state.activeLockTileId = lockId ? tile.id : null;
    state.activeLockSceneId = lockId ? canvas.scene?.id ?? null : null;

    // A genuine attempt begins only after every non-roll gate was approved by
    // the GM. This ensures denied attempts never produce a meaningless d20.
    playDisarmAttemptSound();
    const returned = await actor.rollSkill({ skill: "slt" });
    const roll = firstUsableDisarmRoll(returned);
    if (!roll) {
      releasePlayerDisarmInteractionLock({ tileId: tile.id, lockId });
      return;
    }
    const naturalD20 = naturalD20FromRoll(roll);

    const requestId = foundry.utils.randomID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    state.pendingRequestId = requestId;

    const timeoutId = setTimeout(() => {
      const pending = runtime.pendingDisarmRequests.get(requestId);
      if (!pending) return;
      runtime.pendingDisarmRequests.delete(requestId);
      if (state.pendingRequestId === requestId) state.pendingRequestId = null;
      state.disarmBusy = false;
      releasePlayerDisarmInteractionLock({ tileId: tile.id, lockId });
      ui.notifications.warn("The GM client did not finish resolving the disarm attempt in time. Please try again.");
    }, DISARM_RESOLUTION_TIMEOUT_MS);

    runtime.pendingDisarmRequests.set(requestId, { timeoutId, tileId: tile.id, lockId });
    game.socket.emit(SOCKET_CHANNEL, {
      type: "disarm-request",
      requestId,
      userId: game.user.id,
      sceneId: canvas.scene?.id,
      tileId: tile.id,
      tokenId: token.id,
      actorId: actor.id,
      lockId,
      skill: "slt",
      total: Number(roll.total),
      naturalD20
    });
  } catch (error) {
    if (state.activeLockId) releasePlayerDisarmInteractionLock({ tileId: tile.id, lockId: state.activeLockId });
    console.error(`${MODULE_ID} | Native disarm roll failed`, error);
    ui.notifications.error("The Sleight of Hand check could not be rolled.");
  } finally {
    if (!state.pendingRequestId) {
      state.disarmBusy = false;
      state.activeLockId = null;
      state.activeLockTileId = null;
      state.activeLockSceneId = null;
    }
  }
}

function releasePlayerDisarmInteractionLock({ sceneId = canvas.scene?.id, tileId, lockId } = {}) {
  const id = String(lockId ?? "").trim();
  if (!id || !game.socket?.emit) return;
  game.socket.emit(SOCKET_CHANNEL, {
    type: "disarm-cancel",
    userId: game.user?.id,
    sceneId,
    tileId,
    lockId: id
  });
  if (runtime.playerTrapInteraction.activeLockId === id) {
    runtime.playerTrapInteraction.activeLockId = null;
    runtime.playerTrapInteraction.activeLockTileId = null;
    runtime.playerTrapInteraction.activeLockSceneId = null;
  }
}

function playDisarmAttemptSound() {
  const data = {
    src: DISARM_ATTEMPT_SOUND,
    volume: 0.7,
    autoplay: true,
    loop: false,
    channel: "interface"
  };
  try {
    const AudioHelperClass = globalThis.foundry?.audio?.AudioHelper ?? game.audio?.constructor ?? globalThis.AudioHelper;
    if (typeof AudioHelperClass?.play === "function") {
      AudioHelperClass.play(data, true);
      return true;
    }
    game.audio?.play?.(DISARM_ATTEMPT_SOUND);
    return true;
  } catch (error) {
    console.warn(`${MODULE_ID} | Could not play disarm-attempt sound`, error);
    return false;
  }
}

function requestGmDisarmPreflight({ tile, token, actor }) {
  return new Promise(resolve => {
    const requestId = foundry.utils.randomID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const timeoutId = setTimeout(() => {
      const pending = runtime.pendingDisarmPreflights.get(requestId);
      if (!pending) return;
      runtime.pendingDisarmPreflights.delete(requestId);
      game.socket?.emit?.(SOCKET_CHANNEL, {
        type: "disarm-preflight-cancel",
        requestId,
        userId: game.user.id,
        sceneId: canvas.scene?.id,
        tileId: tile.id
      });
      resolve({
        ok: false,
        error: "The GM client did not process the disarm request in time. Please try again."
      });
    }, DISARM_PREFLIGHT_TIMEOUT_MS);

    runtime.pendingDisarmPreflights.set(requestId, { timeoutId, resolve, tileId: tile.id, sceneId: canvas.scene?.id });
    game.socket.emit(SOCKET_CHANNEL, {
      type: "disarm-preflight",
      requestId,
      userId: game.user.id,
      sceneId: canvas.scene?.id,
      tileId: tile.id,
      tokenId: token.id,
      actorId: actor.id
    });
  });
}

function setupGmAuthorityResumeHandling() {
  if (runtime.gmAuthorityResumeInstalled || !globalThis.document?.addEventListener) return;
  const resume = () => {
    if (globalThis.document?.hidden || !isPrimaryGM()) return;
    cleanupExpiredGmDisarmInteractionLocks();
    if (canvas?.ready && canvas?.scene) scheduleVisionDiscoveryRecheck();
  };
  globalThis.document.addEventListener("visibilitychange", resume);
  globalThis.window?.addEventListener?.("focus", resume);
  runtime.gmAuthorityResumeInstalled = true;
}

function setupDisarmSocket() {
  if (runtime.disarmSocketInstalled || !game.socket?.on) return;
  game.socket.on(SOCKET_CHANNEL, message => {
    if (!message || typeof message !== "object") return;

    if (message.type === "alarm-play") {
      receiveAlarmPlaybackMessage(message).catch(error => console.warn(`${MODULE_ID} | Alarm socket playback failed`, error));
      return;
    }
    if (message.type === "trigger-source-activate") {
      if (!isPrimaryGM()) return;
      resolveGmItemPileTriggerActivation(message).catch(error => console.error(`${MODULE_ID} | Item Pile trigger activation failed`, error));
      return;
    }
    if (message.type === "disarm-preflight") {
      if (!isPrimaryGM()) return;
      resolveGmDisarmPreflight(message).catch(error => {
        console.error(`${MODULE_ID} | Could not resolve disarm preflight`, error);
        emitDisarmPreflightResult(message, { ok: false, error: "The GM could not validate the disarm attempt." });
      });
      return;
    }
    if (message.type === "disarm-preflight-result") {
      receivePlayerDisarmPreflightResult(message);
      return;
    }
    if (message.type === "disarm-preflight-cancel") {
      if (isPrimaryGM()) cancelGmDisarmPreflight(message);
      return;
    }
    if (message.type === "disarm-lock-state") {
      receiveDisarmLockState(message);
      return;
    }
    if (message.type === "disarm-cancel") {
      if (isPrimaryGM()) releaseGmDisarmInteractionLock(message);
      return;
    }
    if (message.type === "disarm-request") {
      if (!isPrimaryGM()) return;
      resolveGmDisarmRequest(message).catch(error => {
        console.error(`${MODULE_ID} | Could not resolve player disarm request`, error);
        emitDisarmResult(message, { ok: false, error: "The GM could not resolve the disarm attempt." });
      });
      return;
    }
    if (message.type === "disarm-result") receivePlayerDisarmResult(message);
  });
  runtime.disarmSocketInstalled = true;
}

function activeGmUsers() {
  return Array.from(game.users ?? [])
    .filter(user => user?.active && user?.isGM)
    .sort((a, b) => String(a.id).localeCompare(String(b.id)));
}

function primaryActiveGMUser() {
  return activeGmUsers()[0] ?? null;
}

function gmDisarmContext(message) {
  const user = game.users.get?.(message?.userId);
  const scene = game.scenes.get?.(message?.sceneId);
  const tile = scene?.tiles?.get?.(message?.tileId);
  const token = scene?.tokens?.get?.(message?.tokenId);
  const actor = token?.actor;
  const trap = trapData(tile);
  const config = normalizeDiscoveryConfig(trap?.discovery);

  if (!user || user.isGM) return { ok: false, error: "The requesting player could not be validated." };
  if (!scene || !tile || !trap || !token || !actor) return { ok: false, error: "The trap or attempting token is no longer available." };
  if (String(actor.id) !== String(message?.actorId)) return { ok: false, error: "The attempting Actor no longer matches the selected token." };
  if (!actor.testUserPermission?.(user, "OWNER")) return { ok: false, error: "You do not own the selected Actor." };
  if (token.hidden === true || runtimeOriginFlag(token)) return { ok: false, error: "The selected token cannot attempt to disarm this trap." };
  if (!trapIsDiscovered(tile, trap)) return { ok: false, error: "The trap is no longer discovered." };
  if (trap.armed === false) return { ok: false, error: "The trap has already been disarmed." };
  if (trap.requiresReconfiguration === true) return { ok: false, error: "This trap must be recreated before it can be disarmed." };
  if (!config.enabled) return { ok: false, error: "Disarming is disabled for this trap." };
  const distance = measureTokenToTrapDisarmDistance(token, tile, scene);
  if (!isWithinTrapRange(distance, DISARM_MAX_DISTANCE_FT)) {
    return { ok: false, error: `Move within ${DISARM_MAX_DISTANCE_FT} ft of the trap to attempt to disarm it.`, reason: "out-of-range" };
  }

  const eligibility = evaluateDisarmEligibility({
    actor,
    config,
    attempts: trap.disarmAttempts
  });
  if (!eligibility.allowed) return { ok: false, error: eligibility.message, reason: eligibility.reason };

  return { ok: true, user, scene, tile, token, actor, trap, config, eligibility };
}

async function resolveGmDisarmPreflight(message) {
  if (!isPrimaryGM()) return;
  if (gmDisarmPreflightWasCancelled(message)) return;
  const context = gmDisarmContext(message);
  if (!context.ok) {
    emitDisarmPreflightResult(message, { ok: false, error: context.error, reason: context.reason });
    return;
  }
  const acquired = acquireGmDisarmInteractionLock(message);
  if (!acquired.ok) {
    emitDisarmPreflightResult(message, { ok: false, error: acquired.error, reason: "busy" });
    return;
  }
  emitDisarmPreflightResult(message, { ok: true, lockId: acquired.lockId });
}

function disarmInteractionLockKey(sceneId, tileId) {
  return `${String(sceneId ?? "")}:${String(tileId ?? "")}`;
}

function pruneCancelledDisarmPreflights(now = Date.now()) {
  for (const [requestId, entry] of runtime.cancelledDisarmPreflights) {
    if (!entry || Number(entry.expiresAt) <= now) runtime.cancelledDisarmPreflights.delete(requestId);
  }
}

function gmDisarmPreflightWasCancelled(message) {
  pruneCancelledDisarmPreflights();
  const requestId = String(message?.requestId ?? "");
  if (!requestId) return false;
  const entry = runtime.cancelledDisarmPreflights.get(requestId);
  if (!entry) return false;
  return (!entry.userId || String(entry.userId) === String(message?.userId ?? ""))
    && (!entry.tileId || String(entry.tileId) === String(message?.tileId ?? ""));
}

function currentGmDisarmInteractionLock(key, now = Date.now()) {
  const existing = runtime.disarmInteractionLocks.get(key);
  if (!existing) return null;
  if (Number(existing.expiresAt) > now) return existing;
  releaseGmDisarmInteractionLock({
    sceneId: existing.sceneId,
    tileId: existing.tileId,
    lockId: existing.lockId,
    userId: existing.userId
  });
  return null;
}

function cleanupExpiredGmDisarmInteractionLocks(now = Date.now()) {
  for (const key of Array.from(runtime.disarmInteractionLocks.keys())) currentGmDisarmInteractionLock(key, now);
  pruneCancelledDisarmPreflights(now);
}

function cancelGmDisarmPreflight(message = {}) {
  const requestId = String(message.requestId ?? "").trim();
  if (!requestId) return false;
  const now = Date.now();
  pruneCancelledDisarmPreflights(now);
  runtime.cancelledDisarmPreflights.set(requestId, {
    userId: String(message.userId ?? ""),
    tileId: String(message.tileId ?? ""),
    expiresAt: now + DISARM_CANCELLED_PREFLIGHT_TTL_MS
  });

  const key = disarmInteractionLockKey(message.sceneId, message.tileId);
  const existing = currentGmDisarmInteractionLock(key, now);
  if (existing && String(existing.requestId ?? "") === requestId
    && (!message.userId || String(existing.userId) === String(message.userId))) {
    releaseGmDisarmInteractionLock({
      sceneId: message.sceneId, tileId: message.tileId, lockId: existing.lockId, userId: existing.userId
    });
  }
  return true;
}

function acquireGmDisarmInteractionLock(message) {
  const key = disarmInteractionLockKey(message?.sceneId, message?.tileId);
  const existing = currentGmDisarmInteractionLock(key);
  if (existing) return { ok: false, error: "Another character is already attempting to disarm this trap." };
  const lockId = foundry.utils.randomID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const expiresAt = Date.now() + DISARM_INTERACTION_LOCK_TIMEOUT_MS;
  const timeoutId = setTimeout(() => releaseGmDisarmInteractionLock({
    sceneId: message.sceneId, tileId: message.tileId, lockId, userId: message.userId
  }), DISARM_INTERACTION_LOCK_TIMEOUT_MS);
  runtime.disarmInteractionLocks.set(key, {
    requestId: String(message.requestId ?? ""),
    lockId, userId: message.userId, actorId: message.actorId, tokenId: message.tokenId,
    sceneId: message.sceneId, tileId: message.tileId, expiresAt, timeoutId
  });
  emitDisarmLockState({ sceneId: message.sceneId, tileId: message.tileId, userId: message.userId, locked: true });
  return { ok: true, lockId };
}

function releaseGmDisarmInteractionLock(message = {}) {
  const key = disarmInteractionLockKey(message.sceneId, message.tileId);
  const existing = runtime.disarmInteractionLocks.get(key);
  if (!existing) return false;
  if (message.lockId && String(message.lockId) !== String(existing.lockId)) return false;
  if (message.userId && String(message.userId) !== String(existing.userId)) return false;
  clearTimeout(existing.timeoutId);
  runtime.disarmInteractionLocks.delete(key);
  emitDisarmLockState({ sceneId: message.sceneId, tileId: message.tileId, userId: existing.userId, locked: false });
  return true;
}

function emitDisarmLockState({ sceneId, tileId, userId, locked } = {}) {
  if (!game.socket?.emit || !tileId) return;
  game.socket.emit(SOCKET_CHANNEL, { type: "disarm-lock-state", sceneId, tileId, userId, locked: locked === true });
}

function receiveDisarmLockState(message) {
  if (game.user?.isGM || message?.sceneId !== canvas.scene?.id || !message?.tileId) return;
  const locks = runtime.playerTrapInteraction.lockedTrapIds;
  if (message.locked === true) locks.add(message.tileId);
  else locks.delete(message.tileId);
}

function emitDisarmPreflightResult(request, result) {
  if (!game.socket?.emit || !request?.requestId || !request?.userId) return;
  game.socket.emit(SOCKET_CHANNEL, {
    type: "disarm-preflight-result",
    requestId: request.requestId,
    userId: request.userId,
    sceneId: request.sceneId,
    tileId: request.tileId,
    ok: result?.ok === true,
    reason: result?.reason ? String(result.reason) : "",
    error: result?.error ? String(result.error) : "",
    lockId: result?.lockId ? String(result.lockId) : ""
  });
}

function receivePlayerDisarmPreflightResult(message) {
  if (game.user?.isGM || message?.userId !== game.user?.id) return;
  const pending = runtime.pendingDisarmPreflights.get(message.requestId);
  if (!pending) {
    // A delayed GM response can arrive after the player's local timeout. If
    // that late answer created a lock, release it immediately instead of
    // leaving the trap falsely busy until the GM timer eventually wakes up.
    if (message.ok === true && message.lockId) {
      releasePlayerDisarmInteractionLock({
        sceneId: message.sceneId, tileId: message.tileId, lockId: message.lockId
      });
    }
    return;
  }
  clearTimeout(pending.timeoutId);
  runtime.pendingDisarmPreflights.delete(message.requestId);
  pending.resolve?.({
    ok: message.ok === true,
    reason: message.reason || null,
    error: message.error || "",
    lockId: message.lockId || ""
  });
}

async function resolveGmDisarmRequest(message) {
  if (!isPrimaryGM()) return;

  const lockKey = `${message?.sceneId ?? ""}:${message?.tileId ?? ""}`;
  if (runtime.disarmGmLocks.has(lockKey)) {
    return emitDisarmResult(message, { ok: false, error: "Another disarm attempt is already being resolved for this trap." });
  }
  runtime.disarmGmLocks.add(lockKey);

  try {
    const interaction = currentGmDisarmInteractionLock(lockKey);
    if (!interaction
      || String(interaction.lockId) !== String(message?.lockId ?? "")
      || String(interaction.userId) !== String(message?.userId ?? "")) {
      return emitDisarmResult(message, { ok: false, error: "This disarm interaction is no longer reserved for your character." });
    }
    const context = gmDisarmContext(message);
    const reject = error => emitDisarmResult(message, { ok: false, error });
    if (!context.ok) return reject(context.error);

    const { user, tile, token, actor, trap, config } = context;
    const total = Number(message.total);
    const naturalD20 = Number.isInteger(Number(message.naturalD20)) ? Number(message.naturalD20) : null;
    if (!Number.isFinite(total)) return reject("The Sleight of Hand result was invalid.");
    if (!["slt", "sleightOfHand"].includes(String(message.skill ?? ""))) return reject("The requested disarm skill was invalid.");

    const dc = disarmDcFromTrap(trap);
    const outcome = evaluateDisarmAttempt({ total, dc, naturalD20, config });
    if (!outcome.valid) return reject("The Sleight of Hand result was invalid.");

    const attempts = recordDisarmAttempt(trap.disarmAttempts, actor.id, {
      total: outcome.total,
      naturalD20: outcome.naturalD20,
      success: outcome.success,
      triggered: outcome.triggerTrap,
      userId: user.id,
      timestamp: Date.now()
    });

    // Persist the attempt before any consequence. A dangerous activation can
    // itself disarm/re-arm the Tile, but must not erase the one-attempt record.
    await tile.update({ [`flags.${MODULE_ID}.disarmAttempts`]: attempts }, { easyTrapsPlayerDisarm: true });

    if (outcome.success) {
      await setTrapEnabled(tile, false, { resetDisarmAttempts: false });
      refreshTriggerOverlays();
      refreshAreaOverlays();
      refreshOpenSceneTrapManager();
    } else if (outcome.triggerTrap) {
      try {
        await executeConfiguredTrap(tile, [token]);
      } catch (error) {
        console.error(`${MODULE_ID} | Dangerous disarm failure could not activate trap`, error);
        await postDisarmResolutionMessage({ tile, trap, actor, token, outcome, attempts, activationError: true }).catch(() => {});
        return emitDisarmResult(message, {
          ok: false,
          error: "The disarm failed, but the trap could not complete its activation. Check the GM console.",
          triggered: true,
          triggerReason: outcome.triggerReason
        });
      }
    }

    await postDisarmResolutionMessage({ tile, trap, actor, token, outcome, attempts }).catch(error => {
      console.warn(`${MODULE_ID} | Could not post disarm result card`, error);
    });

    console.info(`${MODULE_ID} | Player disarm resolved`, {
      tileId: tile.id,
      actorId: actor.id,
      userId: user.id,
      total: outcome.total,
      naturalD20: outcome.naturalD20,
      dc: outcome.dc,
      success: outcome.success,
      triggered: outcome.triggerTrap,
      triggerReason: outcome.triggerReason
    });
    emitDisarmResult(message, {
      ok: true,
      success: outcome.success,
      triggered: outcome.triggerTrap,
      triggerReason: outcome.triggerReason,
      total: outcome.total,
      dc: config.disarm.showDcInChat === true ? outcome.dc : null
    });
  } finally {
    releaseGmDisarmInteractionLock(message);
    runtime.disarmGmLocks.delete(lockKey);
  }
}

async function postDisarmResolutionMessage({ tile, trap, actor, token, outcome, attempts, activationError = false } = {}) {
  if (!globalThis.ChatMessage?.create || !outcome?.valid) return null;
  const record = normalizeDisarmAttempts(attempts)?.[actor?.id];
  const triggered = outcome.triggerTrap === true;
  const status = outcome.success ? "Disarmed" : triggered ? "Trap Triggered" : "Failed";
  const cardClass = outcome.success ? "is-success" : triggered ? "is-triggered" : "is-failure";
  const icon = outcome.success ? "fa-circle-check" : triggered ? "fa-burst" : "fa-circle-xmark";
  const natural = outcome.naturalD20 === 1 ? "Natural 1 · " : "";
  const showDc = normalizeDiscoveryConfig(trap?.discovery).disarm.showDcInChat === true;
  const rollDisplay = showDc
    ? `${natural}${escapeHtml(outcome.total)} vs DC ${escapeHtml(outcome.dc)}`
    : `${natural}${escapeHtml(outcome.total)}`;
  const consequence = outcome.success
    ? "The trap is now disarmed."
    : triggered
      ? activationError
        ? "The failed attempt triggered the trap, but its activation could not complete."
        : "The failed attempt triggered the trap."
      : "The trap remains armed.";
  const content = `<article class="easy-traps-disarm-card ${cardClass}">
    <header><i class="fa-solid ${icon}"></i><span><b>Trap</b><small>${escapeHtml(actor?.name ?? "Character")} · Disarm attempt</small></span></header>
    <div class="et-disarm-card-result"><strong>${escapeHtml(status)}</strong><em>${rollDisplay}</em></div>
    <footer>${escapeHtml(consequence)}${record?.count ? ` · Attempt ${escapeHtml(record.count)}` : ""}</footer>
  </article>`;
  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker?.({ actor, token }) ?? {},
    content,
    flags: {
      [MODULE_ID]: {
        disarmResult: true,
        tileId: tile?.id ?? null,
        actorId: actor?.id ?? null,
        total: outcome.total,
        ...(showDc ? { dc: outcome.dc } : {}),
        naturalD20: outcome.naturalD20,
        success: outcome.success,
        triggered,
        triggerReason: outcome.triggerReason
      }
    }
  });
}

function emitDisarmResult(request, result) {
  if (!game.socket?.emit || !request?.requestId || !request?.userId) return;
  game.socket.emit(SOCKET_CHANNEL, {
    type: "disarm-result",
    requestId: request.requestId,
    userId: request.userId,
    tileId: request.tileId,
    ok: result.ok === true,
    success: result.success === true,
    triggered: result.triggered === true,
    triggerReason: result.triggerReason ? String(result.triggerReason) : "",
    total: Number.isFinite(Number(result.total)) ? Number(result.total) : null,
    dc: Number.isFinite(Number(result.dc)) ? Number(result.dc) : null,
    error: result.error ? String(result.error) : ""
  });
}

function receivePlayerDisarmResult(message) {
  if (game.user?.isGM || message?.userId !== game.user?.id) return;
  const pending = runtime.pendingDisarmRequests.get(message.requestId);
  if (!pending) return;

  clearTimeout(pending.timeoutId);
  runtime.pendingDisarmRequests.delete(message.requestId);
  const state = runtime.playerTrapInteraction;
  if (state.pendingRequestId === message.requestId) state.pendingRequestId = null;
  state.activeLockId = null;
  state.activeLockTileId = null;
  state.activeLockSceneId = null;
  state.disarmBusy = false;

  if (!message.ok) {
    if (message.error) ui.notifications.warn(message.error);
    return;
  }
  if (message.success) {
    setPlayerTrapHover(null);
    ui.notifications.info("The trap has been disarmed.");
  } else if (message.triggered) {
    ui.notifications.warn(message.triggerReason === "natural-one"
      ? "Natural 1 — the disarm failed and triggered the trap."
      : "The disarm failed and triggered the trap.");
  } else {
    ui.notifications.warn("The disarm attempt failed.");
  }
  Hooks.callAll("easyTrapsPlayerDisarmResolved", {
    requestId: message.requestId,
    tileId: message.tileId,
    success: message.success === true,
    triggered: message.triggered === true,
    triggerReason: message.triggerReason || null,
    total: message.total,
    dc: message.dc
  });
}

function setPlayerTrapHover(tile, { immediate = false } = {}) {
  const state = runtime.playerTrapInteraction;
  const nextId = tile?.id ?? null;
  if (state.hoveredTileId === nextId && state.overlay) {
    if (tile) ensurePlayerDisarmControl(tile);
    return;
  }
  if (!nextId && !state.overlay && !state.hoveredTileId) {
    destroyPlayerDisarmControl();
    return;
  }

  state.hoveredTileId = nextId;
  destroyPlayerTrapHoverOverlay({ immediate });
  destroyPlayerDisarmControl();
  if (!tile) return;

  state.overlay = createPlayerTrapHoverOverlay(tile);
  if (state.overlay) animatePlayerTrapOverlay(state.overlay, 0, 1, 125);
  ensurePlayerDisarmControl(tile);
}

function createPlayerTrapHoverOverlay(tile) {
  if (!globalThis.PIXI?.Container || !globalThis.PIXI?.Graphics) return null;
  const host = overlayHost();
  if (!host?.addChild) return null;

  const trap = trapData(tile);
  const geometry = trapInteractionGeometry(tile, trap);
  if (!geometry) return null;

  const container = new PIXI.Container();
  // Player source overlays are decoration only for every trigger type. The
  // single HTML DISARM control owns EasyTraps input, so native DoorControl and
  // Item Piles clicks always remain outside EasyTraps' canvas hit order.
  container.eventMode = "none";
  container.zIndex = 900;
  container.alpha = 0;

  const frame = new PIXI.Graphics();
  frame.eventMode = "none";
  if (geometry.type === "segment") {
    drawPlayerTrapInteractionSegment(frame, geometry.start, geometry.end, geometry.halfWidth);
  } else {
    const rect = geometry.rect;
    const x = Number(rect?.x) || 0;
    const y = Number(rect?.y) || 0;
    const width = Math.max(1, Number(rect?.width) || 1);
    const height = Math.max(1, Number(rect?.height) || 1);
    drawPlayerTrapInteractionFrame(frame, x, y, width, height);
  }
  container.addChild(frame);
  host.addChild(container);
  return container;
}

function drawPlayerTrapInteractionSegment(graphic, start, end, halfWidth) {
  const gold = 0xe0b867;
  const violet = 0xb998d5;
  const polygon = segmentBandPolygon(start, end, Math.max(5, Number(halfWidth) || 5));
  const outer = segmentBandPolygon(start, end, Math.max(9, Number(halfWidth) || 5) + 7);
  const middle = segmentBandPolygon(start, end, Math.max(7, Number(halfWidth) || 5) + 4);
  drawOverlayPolygon(graphic, outer, violet, 0.07, 0.015);
  drawOverlayPolygon(graphic, middle, gold, 0.12, 0.02);
  drawOverlayPolygon(graphic, polygon, gold, 0.94, 0.025);
}

function drawPlayerTrapInteractionFrame(graphic, x, y, width, height) {
  const gold = 0xe0b867;
  const violet = 0xb998d5;
  const inset = 2;

  drawPlayerTrapRect(graphic, x - 7, y - 7, width + 14, height + 14, violet, 0.07, 7, 0);
  drawPlayerTrapRect(graphic, x - 4, y - 4, width + 8, height + 8, gold, 0.12, 4, 0);
  drawPlayerTrapRect(graphic, x + inset, y + inset, Math.max(1, width - inset * 2), Math.max(1, height - inset * 2), gold, 0.94, 1.5, 0.025);

  const corner = Math.max(8, Math.min(16, Math.min(width, height) * 0.14));
  const left = x + inset;
  const right = x + width - inset;
  const top = y + inset;
  const bottom = y + height - inset;
  const segments = [
    [left, top + corner, left, top, left + corner, top],
    [right - corner, top, right, top, right, top + corner],
    [left, bottom - corner, left, bottom, left + corner, bottom],
    [right - corner, bottom, right, bottom, right, bottom - corner]
  ];
  for (const [x1, y1, x2, y2, x3, y3] of segments) {
    drawPlayerTrapCorner(graphic, x1, y1, x2, y2, x3, y3, 0xf4d795);
  }
}

function drawPlayerTrapRect(graphic, x, y, width, height, color, alpha, lineWidth, fillAlpha = 0) {
  if (typeof graphic.rect === "function" && typeof graphic.stroke === "function") {
    graphic.rect(x, y, width, height);
    if (fillAlpha) graphic.fill({ color, alpha: fillAlpha });
    graphic.stroke({ color, alpha, width: lineWidth });
  } else {
    graphic.lineStyle(lineWidth, color, alpha);
    if (fillAlpha) graphic.beginFill(color, fillAlpha);
    graphic.drawRect(x, y, width, height);
    if (fillAlpha) graphic.endFill();
  }
}

function drawPlayerTrapCorner(graphic, x1, y1, x2, y2, x3, y3, color) {
  if (typeof graphic.moveTo === "function" && typeof graphic.stroke === "function") {
    graphic.moveTo(x1, y1).lineTo(x2, y2).lineTo(x3, y3).stroke({ color, alpha: 0.98, width: 2.25 });
  } else {
    graphic.lineStyle(2.25, color, 0.98);
    graphic.moveTo(x1, y1);
    graphic.lineTo(x2, y2);
    graphic.lineTo(x3, y3);
  }
}

function animatePlayerTrapOverlay(overlay, from, to, duration = 120, onComplete = null) {
  if (overlay?._easyTrapsAnimationFrame) cancelAnimationFrame(overlay._easyTrapsAnimationFrame);
  overlay.alpha = from;
  const start = performance.now();
  const tick = now => {
    if (overlay.destroyed) return;
    const progress = Math.min(1, Math.max(0, (now - start) / Math.max(1, duration)));
    const eased = progress * progress * (3 - 2 * progress);
    overlay.alpha = from + (to - from) * eased;
    if (progress < 1) overlay._easyTrapsAnimationFrame = requestAnimationFrame(tick);
    else {
      overlay._easyTrapsAnimationFrame = null;
      onComplete?.();
    }
  };
  overlay._easyTrapsAnimationFrame = requestAnimationFrame(tick);
}

function destroyPlayerTrapHoverOverlay({ immediate = false } = {}) {
  const state = runtime.playerTrapInteraction;
  const overlay = state.overlay;
  state.overlay = null;
  if (!overlay) return;
  if (overlay._easyTrapsAnimationFrame) {
    cancelAnimationFrame(overlay._easyTrapsAnimationFrame);
    overlay._easyTrapsAnimationFrame = null;
  }
  const destroy = () => {
    try { overlay.destroy({ children: true }); } catch (_error) { /* already destroyed */ }
  };
  if (immediate) return destroy();
  animatePlayerTrapOverlay(overlay, Number(overlay.alpha) || 1, 0, PLAYER_TRAP_HOVER_FADE_MS, destroy);
}

function pulsePlayerTrapInteraction() {
  const button = runtime.playerTrapInteraction.disarmControl?.querySelector?.('[data-et-action="disarm"]');
  if (!button?.animate) return;
  try {
    button.animate([
      { transform: "scale(1)" },
      { transform: "scale(.94)" },
      { transform: "scale(1)" }
    ], { duration: PLAYER_TRAP_PULSE_MS, easing: "ease-out" });
  } catch (_error) { /* animation is decorative */ }
}

function destroyPlayerDisarmControl() {
  const state = runtime.playerTrapInteraction;
  if (state.disarmControlHideTimer) {
    clearTimeout(state.disarmControlHideTimer);
    state.disarmControlHideTimer = null;
  }
  const control = state.disarmControl;
  state.disarmControl = null;
  state.disarmControlTileId = null;
  state.disarmControlHovered = false;
  if (!control) return;
  try { control.remove(); } catch (_error) { /* already removed */ }
}

function scenePointToClientPoint(point) {
  if (!point || !canvas?.app?.view || !canvas?.stage || !globalThis.PIXI?.Point) return null;
  const view = canvas.app.view;
  const rect = view.getBoundingClientRect?.();
  if (!rect) return null;
  let global;
  try {
    global = canvas.stage.toGlobal
      ? canvas.stage.toGlobal(new PIXI.Point(Number(point.x) || 0, Number(point.y) || 0))
      : canvas.stage.worldTransform?.apply?.(new PIXI.Point(Number(point.x) || 0, Number(point.y) || 0));
  } catch (_error) {
    global = null;
  }
  if (!global) return null;
  const screen = canvas.app.renderer?.screen ?? canvas.app.screen ?? { width: view.width, height: view.height };
  const screenWidth = Math.max(1, Number(screen?.width) || Number(view.width) || rect.width || 1);
  const screenHeight = Math.max(1, Number(screen?.height) || Number(view.height) || rect.height || 1);
  return {
    x: rect.left + Number(global.x) * (rect.width / screenWidth),
    y: rect.top + Number(global.y) * (rect.height / screenHeight)
  };
}

function playerDisarmControlAnchor(tile, geometry, pointerPoint = null) {
  if (!geometry) return null;
  const type = normalizeTriggerType(trapData(tile)?.triggerType);

  if (type === TRIGGER_TYPES.DOOR && geometry.type === "segment") {
    const midpoint = {
      x: (Number(geometry.start?.x) + Number(geometry.end?.x)) / 2,
      y: (Number(geometry.start?.y) + Number(geometry.end?.y)) / 2
    };
    const startClient = scenePointToClientPoint(geometry.start);
    const endClient = scenePointToClientPoint(geometry.end);
    const midClient = scenePointToClientPoint(midpoint);
    if (!startClient || !endClient || !midClient) return null;

    const dx = endClient.x - startClient.x;
    const dy = endClient.y - startClient.y;
    const length = Math.hypot(dx, dy) || 1;
    let nx = -dy / length;
    let ny = dx / length;

    // DoorControl owns the midpoint. EasyTraps deliberately places DISARM on
    // one side of the Wall so the native door button always has visual and
    // pointer priority; moving over either side can still expose DISARM.
    const pointerClient = pointerPoint ? scenePointToClientPoint(pointerPoint) : null;
    if (pointerClient) {
      const side = (pointerClient.x - midClient.x) * nx + (pointerClient.y - midClient.y) * ny;
      if (side < 0) { nx *= -1; ny *= -1; }
    } else if (ny < -0.001 || (Math.abs(ny) <= 0.001 && nx < 0)) {
      nx *= -1;
      ny *= -1;
    }
    return { x: midClient.x + nx * 42, y: midClient.y + ny * 42, placement: "door" };
  }

  const rect = geometry.rect;
  if (!rect) return null;
  const width = Math.max(1, Number(rect.width) || 1);
  const height = Math.max(1, Number(rect.height) || 1);
  const centerX = (Number(rect.x) || 0) + width / 2;

  if (type === TRIGGER_TYPES.ITEM_PILE) {
    // The Item Pile owns its normal click/open affordance. Keep EasyTraps'
    // DISARM control on the opposite side of the source so it cannot cover
    // an OPEN/LOOT/SHOP control supplied by Item Piles, EasyLoot, or another
    // integration below the pile.
    const topCenter = scenePointToClientPoint({
      x: centerX,
      y: Number(rect.y) || 0
    });
    if (!topCenter) return null;
    return { x: topCenter.x, y: topCenter.y - 20, placement: "item-pile" };
  }

  const bottomCenter = scenePointToClientPoint({
    x: centerX,
    y: (Number(rect.y) || 0) + height
  });
  if (!bottomCenter) return null;
  return { x: bottomCenter.x, y: bottomCenter.y + 14, placement: "tile" };
}

function repositionPlayerDisarmControl(tile = null, pointerPoint = null) {
  const state = runtime.playerTrapInteraction;
  const current = tile ?? (state.disarmControlTileId
    ? canvas.scene?.tiles?.get?.(state.disarmControlTileId)
      ?? canvas.scene?.tiles?.find?.(entry => entry.id === state.disarmControlTileId)
      ?? null
    : null);
  const control = state.disarmControl;
  if (!current || !control || state.disarmControlTileId !== current.id) return;

  const geometry = trapInteractionGeometry(current, trapData(current));
  const anchor = playerDisarmControlAnchor(current, geometry, pointerPoint ?? state.lastPointerPoint);
  if (!anchor) return;
  control.style.left = `${Math.round(anchor.x)}px`;
  control.style.top = `${Math.round(anchor.y)}px`;
  control.dataset.placement = anchor.placement;
}

function createPlayerDisarmControlElement({ label = "DISARM", title = "Attempt to disarm the trap" } = {}) {
  const control = document.createElement("div");
  control.className = "easy-traps-player-disarm";
  control.setAttribute("role", "group");
  control.setAttribute("aria-label", "Trap disarm action");

  const button = document.createElement("button");
  button.type = "button";
  button.className = "et-player-disarm-action";
  button.dataset.etAction = "disarm";
  button.title = title;
  button.innerHTML = `<i class="fa-solid fa-screwdriver-wrench" aria-hidden="true"></i><span>${label}</span>`;
  control.appendChild(button);
  return { control, button };
}

function ensurePlayerDisarmControl(tile) {
  if (game.user?.isGM || !tile || !isPlayerTrapInteractionCandidate(tile)) {
    destroyPlayerDisarmControl();
    return null;
  }
  const state = runtime.playerTrapInteraction;
  if (state.disarmControl && state.disarmControlTileId === tile.id) {
    repositionPlayerDisarmControl(tile, state.lastPointerPoint);
    return state.disarmControl;
  }

  destroyPlayerDisarmControl();
  const { control, button } = createPlayerDisarmControlElement();
  control.dataset.easyTrapsTileId = tile.id;

  button.addEventListener("click", event => {
    event.preventDefault();
    event.stopPropagation();
    const current = canvas.scene?.tiles?.get?.(tile.id)
      ?? canvas.scene?.tiles?.find?.(entry => entry.id === tile.id)
      ?? null;
    if (isPlayerTrapInteractionCandidate(current)) attemptPlayerTrapDisarm(current);
  });

  control.addEventListener("mouseenter", () => {
    state.disarmControlHovered = true;
    if (state.disarmControlHideTimer) {
      clearTimeout(state.disarmControlHideTimer);
      state.disarmControlHideTimer = null;
    }
  });
  control.addEventListener("mouseleave", () => {
    state.disarmControlHovered = false;
    if (state.disarmControlHideTimer) clearTimeout(state.disarmControlHideTimer);
    state.disarmControlHideTimer = setTimeout(() => {
      state.disarmControlHideTimer = null;
      if (!state.disarmControlHovered) setPlayerTrapHover(null);
    }, 90);
  });

  document.body.appendChild(control);
  state.disarmControl = control;
  state.disarmControlTileId = tile.id;
  repositionPlayerDisarmControl(tile, state.lastPointerPoint);
  requestAnimationFrame(() => { if (control.isConnected) control.classList.add("is-visible"); });
  return control;
}

function overlayHost() {
  return canvas.interface ?? canvas.controls ?? canvas.stage;
}

function createPlacementPreview() {
  if (!globalThis.PIXI?.Graphics) return null;
  const host = overlayHost();
  if (!host?.addChild) return null;
  const graphic = new PIXI.Graphics();
  graphic.eventMode = "none";
  graphic.zIndex = 1100;
  host.addChild(graphic);
  return graphic;
}

function drawGridCells(graphic, cells, geometry, { preview = false, armed = true, origin = false } = {}) {
  const fillColor = origin ? 0x67b7ff : (preview ? 0xf0c879 : 0xd9ad60);
  const strokeColor = armed ? fillColor : 0x8a7f72;
  const fillAlpha = preview ? 0.17 : (armed ? 0.08 : 0.035);
  const strokeAlpha = preview ? 0.96 : 0.82;
  const padding = preview ? 3 : 2;
  for (const cell of cells) {
    const x = geometry.sceneX + cell.column * geometry.gridSize + padding;
    const y = geometry.sceneY + cell.row * geometry.gridSize + padding;
    const width = geometry.gridSize - padding * 2;
    const height = geometry.gridSize - padding * 2;
    if (typeof graphic.rect === "function" && typeof graphic.fill === "function") {
      graphic.rect(x, y, width, height);
      graphic.fill({ color: fillColor, alpha: fillAlpha });
      graphic.stroke({ color: strokeColor, alpha: strokeAlpha, width: preview ? 3 : 2 });
    } else {
      graphic.lineStyle(preview ? 3 : 2, strokeColor, strokeAlpha);
      graphic.beginFill(fillColor, fillAlpha);
      graphic.drawRect(x, y, width, height);
      graphic.endFill();
    }
  }
}

function clearTriggerOverlays() {
  for (const graphic of runtime.overlays.values()) {
    try { graphic.destroy({ children: true }); } catch (_error) { /* already destroyed */ }
  }
  runtime.overlays.clear();
}

function refreshTriggerOverlays() {
  clearTriggerOverlays();
  if (!canvas?.ready || !canvas.scene || !globalThis.PIXI?.Graphics) return;
  const host = overlayHost();
  if (!host?.addChild) return;
  const geometry = sceneGeometry();
  const isGM = game.user?.isGM === true;

  for (const tile of canvas.scene.tiles) {
    const trap = trapData(tile);
    if (!trap) continue;

    const type = normalizeTriggerType(trap.triggerType);

    // Players never see EasyTraps' technical controller overlays. Once an
    // external trap is discovered, however, the *real* Door / Item Pile keeps a
    // subtle persistent source outline so discovery remains visible even before
    // the pointer enters the native source. Hover only intensifies that outline
    // and adds the explicit DISARM affordance.
    if (!isGM) {
      if (!isExternalTriggerType(type) || !trapIsDiscovered(tile, trap)) continue;
      const graphic = new PIXI.Graphics();
      graphic.eventMode = "none";
      graphic.zIndex = 995;
      drawExternalTriggerSourceIndicator(graphic, tile, trap, { player: true });
      runtime.overlays.set(tile.id, graphic);
      host.addChild(graphic);
      continue;
    }

    const graphic = new PIXI.Graphics();
    graphic.eventMode = "none";
    graphic.zIndex = 1000;

    if (type === TRIGGER_TYPES.TILE) {
      const baseCell = baseCellFromMarker(tile, geometry);
      const cells = absoluteTriggerCells(baseCell, trap.triggerCells);
      drawGridCells(graphic, cells, geometry, { armed: trap.armed });
    } else {
      drawExternalTriggerSourceIndicator(graphic, tile, trap);
    }

    runtime.overlays.set(tile.id, graphic);
    host.addChild(graphic);
  }
  refreshAreaOverlays();
}

function drawExternalTriggerSourceIndicator(graphic, tile, trap, { player = false } = {}) {
  const geometry = trapInteractionGeometry(tile, trap);
  if (!geometry) return;

  const armed = trap?.armed !== false;
  const fillColor = 0xd9ad60;
  const strokeColor = armed ? fillColor : 0x8a7f72;
  const fillAlpha = player ? (armed ? 0.025 : 0.012) : (armed ? 0.08 : 0.035);
  const strokeAlpha = player ? (armed ? 0.62 : 0.44) : 0.82;

  if (geometry.type === "segment") {
    const polygon = segmentBandPolygon(geometry.start, geometry.end, geometry.halfWidth);
    drawTrapIndicatorPolygon(graphic, polygon, strokeColor, strokeAlpha, fillColor, fillAlpha);
    return;
  }

  const rect = geometry.rect;
  if (!rect) return;
  const padding = player ? 3 : 2;
  drawTrapIndicatorRect(
    graphic,
    rect.x + padding,
    rect.y + padding,
    Math.max(1, rect.width - padding * 2),
    Math.max(1, rect.height - padding * 2),
    strokeColor,
    strokeAlpha,
    fillColor,
    fillAlpha
  );
}

function drawTrapIndicatorRect(graphic, x, y, width, height, strokeColor, strokeAlpha, fillColor, fillAlpha) {
  if (typeof graphic.rect === "function" && typeof graphic.fill === "function") {
    graphic.rect(x, y, width, height);
    graphic.fill({ color: fillColor, alpha: fillAlpha });
    graphic.stroke({ color: strokeColor, alpha: strokeAlpha, width: 2 });
  } else {
    graphic.lineStyle(2, strokeColor, strokeAlpha);
    graphic.beginFill(fillColor, fillAlpha);
    graphic.drawRect(x, y, width, height);
    graphic.endFill();
  }
}

function drawTrapIndicatorPolygon(graphic, points, strokeColor, strokeAlpha, fillColor, fillAlpha) {
  const flat = points.flatMap(point => [point.x, point.y]);
  if (typeof graphic.poly === "function" && typeof graphic.fill === "function") {
    graphic.poly(flat, true);
    graphic.fill({ color: fillColor, alpha: fillAlpha });
    graphic.stroke({ color: strokeColor, alpha: strokeAlpha, width: 2 });
  } else {
    graphic.lineStyle(2, strokeColor, strokeAlpha);
    graphic.beginFill(fillColor, fillAlpha);
    graphic.drawPolygon(flat);
    graphic.endFill();
  }
}

function clearAreaOverlays() {
  for (const overlay of runtime.areaOverlays.values()) {
    try { overlay.destroy({ children: true }); } catch (_error) { /* already destroyed */ }
  }
  runtime.areaOverlays.clear();
}

function refreshAreaOverlays() {
  clearAreaOverlays();
  if (!game.user?.isGM || !canvas?.ready || !canvas.scene || !globalThis.PIXI?.Graphics) return;
  const host = overlayHost();
  if (!host?.addChild) return;

  for (const triggerTile of canvas.scene.tiles) {
    const trap = trapData(triggerTile);
    const hasTemplates = Boolean(trap && Array.isArray(trap.templates) && trap.templates.length);
    const hasSelectionZone = Boolean(trap?.selectionZone);
    const alarmConfig = trap && isAlarmTrap(trap) ? normalizeAlarmConfig(trap.alarm) : null;
    const hasSpatialAlarmRange = alarmConfig?.audibility.mode === ALARM_AUDIBILITY_MODES.SPATIAL;
    if (!trap || (!hasTemplates && !hasSelectionZone && !hasSpatialAlarmRange)) continue;

    const originMode = normalizeOriginMode(trap.originMode);
    const originTile = resolveOriginTile(triggerTile, trap, originMode);
    const triggerObject = triggerTile.object;
    const originObject = originTile?.object;
    const sourceObject = isExternalTriggerType(trap.triggerType)
      ? linkedSourceDocumentForTrap(triggerTile, trap)?.object
      : null;
    const pointerHover = runtime.gmAlarmRangePreview.hoveredTileId === triggerTile.id;
    const shouldShow = Boolean(
      pointerHover
      || triggerObject?.controlled || triggerObject?.hover
      || originObject?.controlled || originObject?.hover
      || sourceObject?.controlled || sourceObject?.hover
    );
    if (!shouldShow) continue;

    const referencePoint = setupTemplateReferencePoint(triggerTile, originTile, originMode);
    const container = new PIXI.Container();
    container.eventMode = "none";
    container.zIndex = 1090;
    const graphic = new PIXI.Graphics();
    graphic.eventMode = "none";
    container.addChild(graphic);

    if (hasSpatialAlarmRange) {
      drawAlarmRangePreview(container, graphic, triggerTile, trap, alarmConfig);
    }

    const states = savedAreaWorldStates(trap, referencePoint);
    for (let index = 0; index < states.length; index += 1) {
      const state = states[index];
      const snapshot = normalizedTemplateSnapshot(trap.templates[index], referencePoint);
      drawSavedAreaOutline(graphic, state, referencePoint);
      const label = createAreaBindingLabel(snapshot.binding, state.x, state.y);
      if (label) container.addChild(label);
    }
    if (hasSelectionZone) {
      const zone = trap.selectionZone;
      drawOverlayRect(graphic, Number(zone.x) || 0, Number(zone.y) || 0, Number(zone.width) || 0, Number(zone.height) || 0, 0x77d7b2, 0.95, 0.08);
      const label = createAreaBindingLabel("target-zone", Number(zone.x) || 0, Number(zone.y) || 0);
      if (label) container.addChild(label);
    }
    runtime.areaOverlays.set(triggerTile.id, container);
    host.addChild(container);
  }
}

function drawAlarmRangePreview(container, graphic, triggerTile, trap, config = normalizeAlarmConfig(trap?.alarm)) {
  const originPoint = alarmOriginPoint(triggerTile, trap);
  if (!originPoint) return;
  const scene = triggerTile?.parent ?? canvas.scene;
  const radiusPixels = alarmRangePixelRadius(config.audibility.radius, {
    gridSize: Number(scene?.grid?.size ?? canvas.grid?.size) || 100,
    gridDistance: Number(scene?.grid?.distance) || 5
  });
  if (!(radiusPixels > 0)) return;

  const color = 0xf0b45a;
  drawOverlayCircle(graphic, originPoint.x, originPoint.y, radiusPixels, color, 0.92, 0.055);
  drawOverlayCircle(graphic, originPoint.x, originPoint.y, 6, color, 1, 0.22);

  const label = createAlarmRangeLabel(config, originPoint);
  if (label) container.addChild(label);
}

function createAlarmRangeLabel(config, originPoint) {
  if (!globalThis.PIXI?.Text) return null;
  const units = sceneDistanceUnits();
  const walls = config.audibility.walls ? " · WALLS" : "";
  const text = `MAX HEARING RANGE · ${config.audibility.radius} ${units}${walls}`;
  const style = {
    fontFamily: "Arial",
    fontSize: 12,
    fontWeight: "700",
    fill: 0xffd394,
    stroke: { color: 0x000000, width: 4 },
    align: "center"
  };
  let label;
  try { label = new PIXI.Text(text, style); }
  catch (_error) { label = new PIXI.Text({ text, style }); }
  try {
    if (String(label?.text ?? "") !== text) label.text = text;
  } catch (_error) { /* label text is already usable */ }
  label.x = Number(originPoint.x) + 10;
  label.y = Number(originPoint.y) + 10;
  label.eventMode = "none";
  return label;
}

function templateSnapshotWorldState(snapshot, referencePoint) {
  const linked = snapshot.binding === TEMPLATE_BINDINGS.ORIGIN_LINKED;
  return {
    ...snapshot.data,
    binding: snapshot.binding,
    x: linked ? Number(referencePoint.x) + Number(snapshot.offsetX || 0) : Number(snapshot.x),
    y: linked ? Number(referencePoint.y) + Number(snapshot.offsetY || 0) : Number(snapshot.y),
    elevation: linked
      ? Number(referencePoint.elevation || 0) + Number(snapshot.elevationOffset || 0)
      : Number(snapshot.elevation || 0)
  };
}

function savedAreaWorldStates(trap, referencePoint, activity = null) {
  const snapshots = Array.isArray(trap?.templates) ? trap.templates : [];
  const effectiveTarget = activity ? resolveEffectiveTarget(activity.item, activity) : trap?.effectiveTarget;
  const canonical = canonicalTemplateDataList(activity, effectiveTarget);
  return snapshots.map((rawSnapshot, index) => {
    const snapshot = normalizedTemplateSnapshot(rawSnapshot, referencePoint);
    const placement = templateSnapshotWorldState(snapshot, referencePoint);
    const data = foundry.utils.deepClone(canonical[index] ?? snapshot.data ?? {});
    data.direction = Number(placement.direction) || 0;
    if (Number.isFinite(Number(placement.angle)) && Object.hasOwn(data, "angle")) data.angle = Number(placement.angle);
    return {
      ...data,
      binding: snapshot.binding,
      nativeGeometry: nativeGeometryForCurrentScene(snapshot, data, canvas.scene),
      x: Number(placement.x),
      y: Number(placement.y),
      elevation: Number(placement.elevation) || 0
    };
  });
}

function drawSavedAreaOutline(graphic, state, referencePoint) {
  const linked = state.binding === TEMPLATE_BINDINGS.ORIGIN_LINKED;
  const color = linked ? 0x67b7ff : 0xb79cff;

  if (!linked) drawOverlayLine(graphic, referencePoint.x, referencePoint.y, state.x, state.y, color, 0.7, 2);
  drawOverlayCircle(graphic, referencePoint.x, referencePoint.y, 5, color, 0.85, 0.16);

  const geometry = geometryFromSavedAreaState(state);
  if (!geometry) return;
  drawGeometryOutline(graphic, geometry, color, 0.92, 0.08);
}

function drawGeometryOutline(graphic, geometry, color, alpha = 1, fillAlpha = 0) {
  if (geometry?.type === "circle") {
    drawOverlayCircle(graphic, geometry.x, geometry.y, geometry.radius, color, alpha, fillAlpha);
    return;
  }
  if (geometry?.type === "rect") {
    drawOverlayRect(graphic, geometry.x, geometry.y, geometry.width, geometry.height, color, alpha, fillAlpha);
    return;
  }
  if (geometry?.type === "polygon" && Array.isArray(geometry.points) && geometry.points.length >= 3) {
    drawOverlayPolygon(graphic, geometry.points, color, alpha, fillAlpha);
  }
}

function drawOverlayLine(graphic, x1, y1, x2, y2, color, alpha = 1, width = 2) {
  if (typeof graphic.moveTo === "function" && typeof graphic.stroke === "function") {
    graphic.moveTo(x1, y1).lineTo(x2, y2).stroke({ color, alpha, width });
  } else {
    graphic.lineStyle(width, color, alpha);
    graphic.moveTo(x1, y1);
    graphic.lineTo(x2, y2);
  }
}

function drawOverlayCircle(graphic, x, y, radius, color, alpha = 1, fillAlpha = 0) {
  if (typeof graphic.circle === "function" && typeof graphic.stroke === "function") {
    graphic.circle(x, y, radius);
    if (fillAlpha) graphic.fill({ color, alpha: fillAlpha });
    graphic.stroke({ color, alpha, width: 2 });
  } else {
    graphic.lineStyle(2, color, alpha);
    if (fillAlpha) graphic.beginFill(color, fillAlpha);
    graphic.drawCircle(x, y, radius);
    if (fillAlpha) graphic.endFill();
  }
}

function drawOverlayRect(graphic, x, y, width, height, color, alpha = 1, fillAlpha = 0) {
  if (typeof graphic.rect === "function" && typeof graphic.stroke === "function") {
    graphic.rect(x, y, width, height);
    if (fillAlpha) graphic.fill({ color, alpha: fillAlpha });
    graphic.stroke({ color, alpha, width: 2 });
  } else {
    graphic.lineStyle(2, color, alpha);
    if (fillAlpha) graphic.beginFill(color, fillAlpha);
    graphic.drawRect(x, y, width, height);
    if (fillAlpha) graphic.endFill();
  }
}

function drawOverlayPolygon(graphic, points, color, alpha = 1, fillAlpha = 0) {
  const flat = points.flatMap(point => [point.x, point.y]);
  if (typeof graphic.poly === "function" && typeof graphic.stroke === "function") {
    graphic.poly(flat, true);
    if (fillAlpha) graphic.fill({ color, alpha: fillAlpha });
    graphic.stroke({ color, alpha, width: 2 });
  } else {
    graphic.lineStyle(2, color, alpha);
    if (fillAlpha) graphic.beginFill(color, fillAlpha);
    graphic.drawPolygon(flat);
    if (fillAlpha) graphic.endFill();
  }
}

function createAreaBindingLabel(binding, x, y) {
  if (!globalThis.PIXI?.Text) return null;
  const linked = binding === TEMPLATE_BINDINGS.ORIGIN_LINKED;
  const targetZone = binding === "target-zone";
  const text = targetZone ? "CREATURE TARGET ZONE" : linked ? "AREA LINKED TO ORIGIN" : "FIXED SPELL AREA";
  const style = {
    fontFamily: "Arial",
    fontSize: 11,
    fontWeight: "600",
    fill: targetZone ? 0xa9f0d5 : linked ? 0x9fd5ff : 0xd2baff,
    stroke: { color: 0x000000, width: 3 },
    align: "center"
  };
  let label;
  // Foundry 14 currently accepts the classic PIXI.Text(text, style) signature.
  // Constructing with a single options object can succeed without throwing on
  // compatibility builds while coercing that object to the literal string
  // "[object Object]". Prefer the text-first signature and verify the result.
  try { label = new PIXI.Text(text, style); }
  catch (_error) { label = new PIXI.Text({ text, style }); }
  try {
    if (String(label?.text ?? "") !== text) label.text = text;
  } catch (_error) { /* label text is already usable */ }
  label.x = Number(x) + 8;
  label.y = Number(y) + 8;
  label.eventMode = "none";
  return label;
}

function easyFixMultiHitApi() {
  const module = game.modules.get("easy-fix");
  if (module?.active !== true) return null;
  return game.easyFix?.multiHit
    ?? module.api?.multiHit
    ?? null;
}

function easyFixMultiHitApiIsCompatible(api = easyFixMultiHitApi()) {
  return Boolean(api
    && (api.id == null || api.id === "easy-fix")
    && typeof api.getEffectiveSpellConfig === "function"
    && typeof api.computeExtraHitCount === "function"
    && typeof api.runtime?.createCastContext === "function"
    && typeof api.resolveRemainingExtraHits === "function");
}

function easyFixMultiHitEnabled(api = easyFixMultiHitApi()) {
  if (!api) return false;
  const settingKey = api.settings?.MASTER;
  if (typeof settingKey !== "string" || !settingKey) return true;
  const settingId = `easy-fix.${settingKey}`;
  if (!game.settings?.settings?.has?.(settingId)) return true;
  try { return Boolean(game.settings.get("easy-fix", settingKey)); }
  catch (_error) { return true; }
}

function warnAboutOptionalIntegrationCompatibility() {
  const module = game.modules.get("easy-fix");
  if (module?.active !== true || easyFixMultiHitApiIsCompatible()) return;
  ui.notifications.warn(
    `EasyTraps ${VERSION}: EasyFix ${module.version ?? "unknown"} is active, but its public Multi-Hit API is unavailable or incompatible. `
    + `Automatic multi-hit Spell Traps will use the normal dnd5e spell path until a compatible EasyFix build is active.`
  );
}

function easyFixAcceptsActivity(configuration, activityId) {
  const accepted = [
    configuration?.hitActivityId,
    configuration?.baseActivityId,
    configuration?.extraActivityId
  ].filter(value => typeof value === "string" && value.trim()).map(value => value.trim());
  return !accepted.length || accepted.includes(activityId);
}

function createEasyFixTargetSnapshot(token) {
  const document = token?.document ?? token;
  if (!document?.uuid || !document?.id) return null;
  return {
    tokenId: document.id,
    tokenUuid: document.uuid,
    actorUuid: document.actor?.uuid ?? null,
    sceneId: document.parent?.id ?? canvas.scene?.id ?? null,
    name: document.name ?? document.actor?.name ?? ""
  };
}

function buildEasyFixMultiHitPlan(spell, activity, castLevel, targetIds, { hasTemplate = false, configurationOverride = null, cantripCasterLevel = null } = {}) {
  const api = easyFixMultiHitApi();
  if (!api || hasTemplate || !targetIds?.length || !easyFixMultiHitApiIsCompatible(api) || !easyFixMultiHitEnabled(api)) return null;

  let configuration = configurationOverride;
  try {
    if (!configuration) {
      const resolved = api.getEffectiveSpellConfig(spell, {
        includeBuiltInPreset: true,
        ignoreAutoPresetSetting: true
      });
      // The proposed public API returns the effective config directly. Accept a
      // { config, source } wrapper as well so EasyTraps is not coupled to API
      // presentation metadata. In both cases EasyFix remains the sole preset owner.
      configuration = resolved?.config && typeof resolved.config === "object"
        ? resolved.config
        : resolved;
    }
  } catch (error) {
    console.warn(`${MODULE_ID} | EasyFix effective spell configuration could not be read`, error);
    return null;
  }
  if (!configuration || configuration?.enabled === false || !easyFixAcceptsActivity(configuration, activity?.id)) return null;

  // EasyFix's public counter intentionally derives CANTRIP_SCALING from actor
  // level, not from castLevel. EasyTraps' hidden technical caster is level 1,
  // while the trap stores an explicit Caster Level. Feed a minimal read-only
  // actor-like level source to the count API for cantrips, while keeping the
  // spell's real castLevel at 0. Leveled spells keep their normal slot level.
  const isCantrip = normalizeSpellBaseLevel(spell?.system?.level) === 0;
  const countActor = isCantrip ? buildCantripCountActor(cantripCasterLevel) : null;
  const countCastLevel = isCantrip ? 0 : castLevel;
  const summary = api.computeExtraHitCount({
    item: spell,
    ...(countActor ? { actor: countActor } : {}),
    spellConfig: configuration,
    castLevel: countCastLevel
  });
  const totalHits = Math.max(1, Math.trunc(Number(summary?.totalHits) || 1));
  if (totalHits <= 1) return null;

  const availableIds = [...new Set(targetIds)].filter(id => canvas.scene?.tokens?.get?.(id)?.actor);
  if (!availableIds.length) return null;
  const selectedTargetIds = availableIds.slice(0, totalHits);
  const allocation = Array.from({ length: totalHits }, (_unused, index) => selectedTargetIds[index % selectedTargetIds.length]);
  return { api, configuration, summary, totalHits, selectedTargetIds, allocation };
}

function resolveCasterToken(actor, activity = null) {
  return actor?.getActiveTokens?.()?.[0]
    ?? actor?.token
    ?? activity?.token
    ?? null;
}

async function prepareEasyFixControlledVfx(plan, { spell, activity, actor, sourceToken, hitSnapshots } = {}) {
  // Enhanced VFX is an optional EasyFix capability, not an EasyTraps requirement.
  // EasyTraps never reads EasyFix settings or internal VFX flags directly.
  // Await the public helper so both current synchronous implementations and
  // future asynchronous implementations remain compatible.
  const prepareVolley = plan?.api?.vfx?.magicMissile?.prepareControlledVolley;
  if (typeof prepareVolley !== "function") return null;

  try {
    const prepared = await prepareVolley({
      activity,
      actor,
      item: spell,
      sourceToken,
      targetSnapshots: hitSnapshots
    });
    return prepared?.contextVfx ?? null;
  } catch (error) {
    console.warn(`${MODULE_ID} | EasyFix controlled Magic Missile VFX preparation failed; mechanics will continue normally.`, error);
    return null;
  }
}

async function executeEasyFixMultiHit({ spell, activity, actor, castLevel, scaling, plan }) {
  const previousTargetIds = currentTargetIds();
  const snapshots = new Map(plan.selectedTargetIds.map(id => {
    const snapshot = createEasyFixTargetSnapshot(canvas.scene?.tokens?.get?.(id));
    return [id, snapshot];
  }).filter(([_id, snapshot]) => snapshot));
  const hitSnapshots = plan.allocation.map(id => snapshots.get(id)).filter(Boolean);
  if (hitSnapshots.length !== plan.totalHits) {
    throw new Error("One or more automatic spell targets could not be resolved for every hit.");
  }

  let context = null;
  try {
    // Do not make a native base cast here. EasyFix deliberately guards a
    // configured multi-hit spell's ordinary preUseActivity path. Instead,
    // create the public cast context with zero resolved hits and let EasyFix
    // execute the full saved hit pool through its isExtraHit workflow, which
    // is explicitly designed to bypass that guard without opening target UI.
    const contextUsageConfig = {
      consume: false,
      scaling: Math.max(0, Number(scaling) || 0),
      ...(castLevel > 0 ? { spell: { slot: `spell${castLevel}` } } : {})
    };
    const sourceToken = resolveCasterToken(actor, activity);
    const contextVfx = await prepareEasyFixControlledVfx(plan, {
      spell,
      activity,
      actor,
      sourceToken,
      hitSnapshots
    });
    context = plan.api.runtime.createCastContext({
      activity,
      actor,
      item: spell,
      token: sourceToken,
      spellConfig: plan.configuration,
      usageConfig: contextUsageConfig,
      spellLevel: castLevel,
      extraHitSummary: plan.summary,
      resolvedHitCount: 0,
      results: {},
      userId: game.user?.id ?? null,
      createdFrom: MODULE_ID,
      vfx: contextVfx
    });
    if (!context?.id) throw new Error("EasyFix did not create a multi-hit cast context.");

    const resolution = await plan.api.resolveRemainingExtraHits(context.id, { targetSnapshots: hitSnapshots });
    if (!resolution?.ok || !resolution?.completed) {
      plan.api.runtime?.deleteCastContext?.(context.id);
      throw new Error("The configured multi-hit spell did not finish resolving all of its hits.");
    }

    await setUserTargetIds(plan.selectedTargetIds);
    const lastResults = resolution.iterations?.at?.(-1)?.results ?? {};
    return {
      ...lastResults,
      easyFix: {
        automatic: true,
        totalHits: plan.totalHits,
        targetIds: plan.selectedTargetIds,
        resolution
      }
    };
  } catch (error) {
    if (context?.id) plan.api.runtime?.deleteCastContext?.(context.id);
    await setUserTargetIds(previousTargetIds);
    throw error;
  }
}

async function postTrapActivationMessage(tile) {
  try {
    return await ChatMessage.create({
      speaker: { alias: "Trap" },
      content: '<div class="et-trap-activation-message"><i class="fa-solid fa-triangle-exclamation"></i><strong>A trap is triggered!</strong></div>',
      flags: { [MODULE_ID]: { trapActivation: true, triggerTileId: tile?.id ?? null } }
    });
  } catch (error) {
    console.warn(`${MODULE_ID} | Trap activation chat message could not be created`, error);
    return null;
  }
}

function alarmOriginPoint(tile, trap) {
  const originMode = normalizeOriginMode(trap?.originMode ?? ORIGIN_MODES.TRIGGER_TILE);
  if (originMode === ORIGIN_MODES.SEPARATE_TILE) {
    const originTile = resolveOriginTile(tile, trap, ORIGIN_MODES.SEPARATE_TILE);
    return originTile ? tileCenterPoint(originTile) : null;
  }
  return tile ? tileCenterPoint(tile) : null;
}

function alarmCooldownKey(tile) {
  return String(tile?.uuid ?? tile?.id ?? "");
}

function alarmCooldownRemainingMs(tile) {
  const key = alarmCooldownKey(tile);
  const until = Number(runtime.alarmCooldownUntil.get(key)) || 0;
  const remaining = Math.max(0, until - Date.now());
  if (!remaining && key) runtime.alarmCooldownUntil.delete(key);
  return remaining;
}

function setAlarmCooldown(tile, seconds) {
  const key = alarmCooldownKey(tile);
  if (!key) return;
  const duration = Math.max(0, Number(seconds) || 0) * 1000;
  if (!duration) runtime.alarmCooldownUntil.delete(key);
  else runtime.alarmCooldownUntil.set(key, Date.now() + duration);
}

async function postAlarmActivationMessage(tile, trap, config) {
  const mode = normalizeAlarmConfig(config).chat.mode;
  if (mode === ALARM_CHAT_MODES.OFF || !globalThis.ChatMessage?.create) return null;
  const content = `<div class="et-trap-activation-message et-alarm-activation-message"><i class="fa-solid fa-bell"></i><strong>Alarm triggered!</strong><span>${escapeHtml(trapDisplayName(trap, tile))}</span></div>`;
  const data = {
    speaker: { alias: "Alarm" },
    content,
    flags: { [MODULE_ID]: { alarmActivation: true, triggerTileId: tile?.id ?? null } }
  };
  if (mode === ALARM_CHAT_MODES.GM_ONLY) {
    const recipients = ChatMessage.getWhisperRecipients?.("GM") ?? [];
    data.whisper = recipients.map(user => user.id ?? user).filter(Boolean);
  }
  try { return await ChatMessage.create(data); }
  catch (error) {
    console.warn(`${MODULE_ID} | Alarm activation chat message could not be created`, error);
    return null;
  }
}

function alarmSocketMessage(config, sceneId, { gmOnly = false } = {}) {
  return {
    type: "alarm-play",
    userId: game.user?.id ?? null,
    sceneId,
    gmOnly: Boolean(gmOnly),
    alarm: normalizeAlarmConfig(config)
  };
}

async function receiveAlarmPlaybackMessage(message) {
  const sender = game.users?.get?.(message?.userId);
  if (!sender?.isGM) return false;
  if (message?.sceneId !== canvas.scene?.id) return false;
  if (message?.gmOnly === true && !game.user?.isGM) return false;
  await playAlarmLocally(message.alarm);
  return true;
}

function reportAlarmPlaybackFailure(error) {
  console.warn(`${MODULE_ID} | Alarm sound could not be played`, error);
  if (isPrimaryGM()) ui.notifications.warn(`Alarm triggered, but its sound could not be played: ${error?.message ?? error}`);
}

function startConfiguredAlarm(tile, config, originPoint) {
  const normalized = normalizeAlarmConfig(config);
  try {
    if (normalized.audibility.mode === ALARM_AUDIBILITY_MODES.SPATIAL) {
      const playback = startSpatialAlarm(normalized, originPoint);
      playback.completion.catch(reportAlarmPlaybackFailure);
      return true;
    }

    const message = alarmSocketMessage(normalized, tile?.parent?.id ?? canvas.scene?.id, {
      gmOnly: normalized.audibility.mode === ALARM_AUDIBILITY_MODES.GM_ONLY
    });
    // Module sockets do not echo to the sender. Start local playback and emit
    // to the other clients without blocking trap lifecycle on audio loading or
    // playback duration. Receivers reject messages that do not claim a GM
    // sender and ignore messages for a different viewed Scene.
    receiveAlarmPlaybackMessage(message).catch(reportAlarmPlaybackFailure);
    game.socket?.emit?.(SOCKET_CHANNEL, message);
    return true;
  } catch (error) {
    reportAlarmPlaybackFailure(error);
    return false;
  }
}

async function executeAlarmTrap(tile, triggeringTokens, { onComplete = null } = {}) {
  const trap = trapData(tile);
  if (!trap?.armed) {
    const payload = { continue: false, reason: "disarmed" };
    safeTrapComplete(onComplete, payload);
    return payload;
  }
  if (!isAlarmTrap(trap)) throw new Error("This trap is not configured as an Alarm Trap.");
  if (trap.requiresReconfiguration) throw new Error("This trap must be recreated before it can activate.");

  const config = normalizeAlarmConfig(trap.alarm);
  if (trap.disarmAfterTrigger === false && alarmCooldownRemainingMs(tile) > 0) {
    const payload = { continue: false, reason: "cooldown" };
    safeTrapComplete(onComplete, payload);
    return payload;
  }
  const originPoint = config.audibility.mode === ALARM_AUDIBILITY_MODES.SPATIAL
    ? alarmOriginPoint(tile, trap)
    : null;
  if (config.audibility.mode === ALARM_AUDIBILITY_MODES.SPATIAL && !originPoint) {
    throw new Error("The configured EasyTraps alarm origin could not be found.");
  }

  let trapDisabled = false;
  try {
    // Disable first to protect against duplicate MATT/Item Piles callbacks while
    // the sound is being emitted. Repeatable alarms are rearmed below.
    await setTrapEnabled(tile, false);
    trapDisabled = true;
    await postAlarmActivationMessage(tile, trap, config);
    await pauseGameForTrap(trap);

    const soundDispatched = startConfiguredAlarm(tile, config, originPoint);

    if (trap.disarmAfterTrigger === false) {
      // Cooldown starts at activation time, not after the audio ends. Long or
      // sustained alarms therefore cannot hold the trigger workflow open.
      setAlarmCooldown(tile, config.cooldownSeconds);
      await setTrapEnabled(tile, true, { resetDisarmAttempts: false });
      trapDisabled = false;
    }

    const tokens = (triggeringTokens ?? []).map(token => token?.document ?? token).filter(Boolean);
    const payload = {
      continue: true,
      tokens,
      soundDispatched,
      passed: [],
      failed: [],
      tokenresults: [],
      workflow: "alarm"
    };
    Hooks.callAll("easyTrapsAlarmTriggered", { tile, trap, config, originPoint, triggeringTokens: tokens, soundDispatched });
    safeTrapComplete(onComplete, payload);
    return payload;
  } catch (error) {
    if (trapDisabled) await setTrapEnabled(tile, true, { resetDisarmAttempts: false }).catch(rearmError => {
      console.warn(`${MODULE_ID} | Could not re-arm Alarm Trap after a failed workflow`, rearmError);
    });
    throw error;
  }
}

async function executeConfiguredTrap(tile, triggeringTokens, options = {}) {
  const trap = trapData(tile);
  if (isAlarmTrap(trap)) return executeAlarmTrap(tile, triggeringTokens, options);
  return executeNativeTrapSpell(tile, triggeringTokens, options);
}

async function executeNativeTrapSpell(tile, triggeringTokens, { onComplete = null } = {}) {
  const trap = trapData(tile);
  if (!trap?.armed) {
    const payload = { continue: false, reason: "disarmed" };
    safeTrapComplete(onComplete, payload);
    return payload;
  }
  if (trap.requiresReconfiguration) throw new Error("This trap must be recreated for the current native spell workflow.");

  const sourceSpell = await fromUuid(trap.spellUuid);
  if (!sourceSpell || sourceSpell.type !== "spell") throw new Error(`Spell not found: ${trap.spellName ?? trap.spellUuid}`);
  const sourceResolution = resolveActivitySelection(sourceSpell, trap.activityId);
  if (!sourceResolution.supported) throw new Error(activitySelectionErrorMessage(sourceSpell, sourceResolution));
  const savedRevision = Number(trap.sourceModifiedTime) || null;
  const currentRevision = sourceModifiedTime(sourceSpell);
  if (savedRevision && currentRevision && savedRevision !== currentRevision) {
    throw new Error(`${sourceSpell.name} changed after this trap was created. Recreate the trap so its saved launch inputs match the current Item.`);
  }
  const workflow = planSpellWorkflow(sourceSpell, sourceResolution.activity.id);
  if (workflow.mode === WORKFLOW_MODES.UNSUPPORTED) throw new Error(workflowUnsupportedMessage(workflow));

  const triggeringToken = triggeringTokens.find(token => token?.actor) ?? triggeringTokens[0] ?? null;
  const originMode = normalizeOriginMode(trap.originMode ?? ORIGIN_MODES.TRIGGERING_TOKEN);
  const targetMode = normalizeTargetMode(trap.targetMode ?? TARGET_MODES.NONE);
  const areaMode = normalizeAreaMode(trap.areaMode ?? AREA_MODES.NONE);
  const spellSaveDc = normalizeSpellSaveDc(trap.spellSaveDc);
  const spellAttackBonus = normalizeSpellAttackBonus(trap.spellAttackBonus);
  const baseSpellLevel = normalizeSpellBaseLevel(sourceSpell.system?.level);
  const castLevel = normalizeCastLevel(trap.castLevel, baseSpellLevel);
  const cantripCasterLevel = baseSpellLevel === 0
    ? normalizeCantripCasterLevel(trap.cantripCasterLevel, 1)
    : null;
  const scaling = baseSpellLevel === 0
    ? cantripScalingIncrease(cantripCasterLevel)
    : castScaling(castLevel, baseSpellLevel);
  let actor = null;
  let originPoint = null;
  let runtimeSpell = null;
  let technicalOriginToken = null;
  let activatedTemplates = [];
  let trapDisabled = false;

  try {
    if (originMode === ORIGIN_MODES.TRIGGERING_TOKEN) {
      actor = triggeringToken?.actor;
      originPoint = triggeringToken ? tokenCenterPoint(triggeringToken) : null;
      if (!actor || !originPoint) throw new Error("The triggering token has no actor to cast the spell.");
    } else {
      const originTile = resolveOriginTile(tile, trap, originMode);
      if (!originTile) throw new Error("The configured EasyTraps origin Tile could not be found.");
      originPoint = tileCenterPoint(originTile);
      const technicalToken = await ensureRuntimeOriginToken(originTile, tile);
      technicalOriginToken = technicalToken;
      actor = technicalToken.actor;
      if (!actor) throw new Error("The EasyTraps origin token has no synthetic actor.");
      // Remove stale persistent animation residue before starting another cast.
      // This never deletes the actor's mechanical ActiveEffects.
      await cleanupPersistentRuntimeOriginVisuals(technicalOriginToken);
    }

    if (targetMode === TARGET_MODES.SPELL_AREA && areaMode !== AREA_MODES.PREPLACED) {
      throw new Error("Creatures in spell area requires an area positioned during trap creation.");
    }

    // Resolve dynamic targets from the current scene immediately before the real Item use.
    // No token UUIDs from setup previews are persisted in the trap.
    let targetIds = targetMode === TARGET_MODES.TRIGGERING_TOKEN
      ? triggeringTokens.map(token => token?.id).filter(Boolean)
      : targetMode === TARGET_MODES.SPELL_AREA
        ? collectSavedAreaTargetIds(trap, originPoint, sourceResolution.activity)
        : targetMode === TARGET_MODES.CUSTOM_ZONE
          ? collectCustomZoneTargetIds(trap.selectionZone)
          : [];
    // Technical origin tokens can physically overlap the saved spell area.
    // Remove them before target-capacity and multi-hit planning so they never
    // count as victims even briefly. Midi hooks below remain a defensive layer.
    targetIds = filterRuntimeOriginTargetIds(targetIds);
    let targets = targetIds.map(id => canvas.scene.tokens.get(id)).filter(token => token?.actor);
    if ([TARGET_MODES.TRIGGERING_TOKEN, TARGET_MODES.CUSTOM_ZONE].includes(targetMode) && !targets.length) {
      throw new Error("No valid creature was found for this trap's direct-target workflow.");
    }

    // Each trap owns a hidden runtime copy of the real spell. Ordinary custom-
    // zone spells receive a target capacity equal to the current creature count,
    // allowing one stable native use instead of competing asynchronous casts.
    // EasyFix-configured multi-hit spells remain single-target at Item level;
    // their public API resolves the saved hit pool one target at a time.
    const preliminaryMultiHitPlan = buildEasyFixMultiHitPlan(
      sourceSpell,
      sourceResolution.activity,
      castLevel,
      targetIds,
      {
        hasTemplate: areaMode === AREA_MODES.PREPLACED,
        cantripCasterLevel
      }
    );
    const targetCapacity = preliminaryMultiHitPlan
      ? 1
      : targetMode === TARGET_MODES.CUSTOM_ZONE
        ? targetIds.length
        : null;
    runtimeSpell = await ensureRuntimeSpell(actor, sourceSpell, tile, sourceResolution.activity.id, {
      spellSaveDc,
      spellAttackBonus,
      targetCapacity,
      cantripCasterLevel
    });
    const runtimeResolution = resolveActivitySelection(runtimeSpell, sourceResolution.activity.id);
    if (!runtimeResolution.supported) throw new Error(activitySelectionErrorMessage(runtimeSpell, runtimeResolution));
    const activity = runtimeResolution.activity;
    const multiHitPlan = buildEasyFixMultiHitPlan(
      runtimeSpell,
      activity,
      castLevel,
      targetIds,
      {
        hasTemplate: areaMode === AREA_MODES.PREPLACED,
        // Reuse the configuration resolved from the original compendium/world
        // spell. The hidden runtime copy must not fall back to D&D5e's native
        // multi-target prompt merely because another module resolves presets
        // differently for an embedded synthetic Item.
        configurationOverride: preliminaryMultiHitPlan?.configuration ?? null,
        cantripCasterLevel
      }
    );
    if (preliminaryMultiHitPlan && !multiHitPlan) {
      throw new Error("EasyFix recognized this multi-hit spell, but its automatic runtime bridge could not be initialized.");
    }
    if (multiHitPlan) {
      targetIds = multiHitPlan.selectedTargetIds;
      targets = targetIds.map(id => canvas.scene.tokens.get(id)).filter(token => token?.actor);
    }

    // Temporarily disable the Tile while the native workflow is being started.
    // Single-use traps remain disabled; repeatable traps are rearmed only after a
    // successful Item use, preventing concurrent activations during this cast.
    await setTrapEnabled(tile, false);
    trapDisabled = true;
    await postTrapActivationMessage(tile);
    await pauseGameForTrap(trap);

    const useSpell = () => useOriginalSpellItem(runtimeSpell, {
      activityId: activity.id,
      createMeasuredTemplate: areaMode === AREA_MODES.PREPLACED,
      configure: Boolean(trap.requiresNativeInteraction),
      scaling,
      castLevel
    });
    let nativeResult;
    if (multiHitPlan) {
      nativeResult = await executeEasyFixMultiHit({
        spell: runtimeSpell,
        activity,
        actor,
        castLevel,
        scaling,
        plan: multiHitPlan
      });
    } else if (areaMode === AREA_MODES.PREPLACED) {
      const replay = await withNativeSpellTargets(targetIds, () => withSavedNativeTemplatePlacement({
        spell: runtimeSpell,
        activityId: activity.id,
        trap,
        originPoint,
        triggerTile: tile
      }, useSpell), { preserveOnSuccess: true });
      nativeResult = replay?.result;
      activatedTemplates = replay?.templates ?? [];
    } else nativeResult = await withNativeSpellTargets(targetIds, useSpell, { preserveOnSuccess: targetMode !== TARGET_MODES.NONE });

    if (!nativeResult) throw new Error("The original spell use was cancelled or could not be completed.");
    if (isInstantaneousSpell(sourceSpell) && technicalOriginToken) scheduleRuntimeOriginVisualCleanup(technicalOriginToken);
    if (activatedTemplates.length && isInstantaneousSpell(sourceSpell)) scheduleMeasuredTemplateCleanup(activatedTemplates);
    if (trap.disarmAfterTrigger === false) {
      await setTrapEnabled(tile, true, { resetDisarmAttempts: false });
      trapDisabled = false;
    }
    const payload = {
      continue: true,
      tokens: targets,
      nativeResult,
      passed: [],
      failed: [],
      tokenresults: [],
      workflow: workflow.mode
    };
    safeTrapComplete(onComplete, payload);
    return payload;
  } catch (error) {
    await deleteMeasuredTemplates(activatedTemplates);
    if (isInstantaneousSpell(sourceSpell) && technicalOriginToken) scheduleRuntimeOriginVisualCleanup(technicalOriginToken);
    if (trapDisabled) await setTrapEnabled(tile, true, { resetDisarmAttempts: false }).catch(rearmError => {
      console.warn(`${MODULE_ID} | Could not re-arm trap after a failed workflow`, rearmError);
    });
    throw error;
  }
}

function safeTrapComplete(callback, payload) {
  if (!(callback instanceof Function)) return;
  try { callback(payload); }
  catch (error) { console.warn(`${MODULE_ID} | Trap completion callback failed`, error); }
}

async function setTrapEnabled(tile, enabled, { resetDisarmAttempts = Boolean(enabled) } = {}) {
  const changes = {
    [`flags.${MODULE_ID}.armed`]: Boolean(enabled),
    ...(enabled && resetDisarmAttempts ? { [`flags.${MODULE_ID}.-=disarmAttempts`]: null } : {}),
    "flags.monks-active-tiles.active": mattActiveForTrap(trapData(tile), enabled)
  };
  await tile.update(changes);
}

async function pauseGameForTrap(trap) {
  if (!trap?.pauseOnTrigger || game.paused) return false;
  if (!(game.togglePause instanceof Function)) {
    console.warn(`${MODULE_ID} | Foundry pause API is unavailable.`);
    return false;
  }
  try {
    await Promise.resolve(game.togglePause(true, { broadcast: true }));
    return true;
  } catch (error) {
    console.warn(`${MODULE_ID} | Could not pause the game when the trap activated`, error);
    return false;
  }
}

/**
 * Supply the live Foundry targets expected by the native spell workflow.
 *
 * Successful targeted casts deliberately keep the workflow's resulting target
 * state. D&D5e chat actions and automation modules may resolve saves, damage,
 * effects, or macros after Item.use() has already returned. Restoring the GM's
 * previous targets on a timer can therefore erase the spell targets before the
 * native workflow is finished. Cancelled and failed casts still restore the
 * previous selection transactionally.
 */
async function withNativeSpellTargets(ids, callback, { preserveOnSuccess = false } = {}) {
  const previous = currentTargetIds();
  await setUserTargetIds(ids);
  try {
    const result = await callback();
    if (!result || !preserveOnSuccess) await setUserTargetIds(previous);
    return result;
  } catch (error) {
    await setUserTargetIds(previous);
    throw error;
  }
}

function filterRuntimeOriginTargetIds(ids) {
  return [...new Set(ids ?? [])].filter(id => {
    const token = canvas.scene?.tokens?.get?.(id);
    return Boolean(token?.actor) && !runtimeOriginFlag(token);
  });
}

function currentTargetIds() {
  const targets = game.user?.targets;
  if (Array.isArray(targets?.ids)) return [...targets.ids];
  return Array.from(targets ?? []).map(token => token.id ?? token.document?.id).filter(Boolean);
}

async function setUserTargetIds(ids) {
  const unique = [...new Set((ids ?? []).filter(id => canvas.tokens?.get?.(id)))];
  if (typeof game.user?.updateTokenTargets === "function") {
    await Promise.resolve(game.user.updateTokenTargets(unique));
    await waitForCanvasFrames(1);
    return;
  }
  const desired = new Set(unique);
  for (const token of Array.from(game.user?.targets ?? [])) {
    if (!desired.has(token.id)) {
      await Promise.resolve(token.setTarget?.(false, { user: game.user, releaseOthers: false, groupSelection: true }));
    }
  }
  for (const id of desired) {
    await Promise.resolve(canvas.tokens?.get?.(id)?.setTarget?.(true, { user: game.user, releaseOthers: false, groupSelection: true }));
  }
  await waitForCanvasFrames(1);
}

/**
 * Resolve targets from the persisted EasyTraps snapshots, not from the rendered
 * PIXI/Region object. D&D5e v5.3 can back templates with Region geometry whose
 * runtime shape uses a different coordinate space. The saved world state is the
 * single source of truth shared by the GM overlay, target collection, and the
 * recreated native template.
 */
function collectSavedAreaTargetIds(trap, originPoint, activity = null) {
  const geometries = savedAreaWorldStates(trap, originPoint, activity)
    .map(state => geometryFromSavedAreaState(state))
    .filter(Boolean);
  if (!geometries.length) return [];

  const ids = [];
  for (const token of canvas.tokens?.placeables ?? []) {
    const document = token.document;
    if (!document?.actorId || document.getFlag(MODULE_ID, "temporaryOrigin") === true || runtimeOriginFlag(document)) continue;
    const rect = tokenBoundsRect(token);
    if (geometries.some(geometry => geometryOverlapsRect(geometry, rect))) ids.push(document.id);
  }
  return [...new Set(ids)];
}

function collectCustomZoneTargetIds(zone) {
  if (!zone) return [];
  const rect = {
    x: Number(zone.x) || 0,
    y: Number(zone.y) || 0,
    width: Math.max(0, Number(zone.width) || 0),
    height: Math.max(0, Number(zone.height) || 0)
  };
  if (!rect.width || !rect.height) return [];
  const ids = [];
  for (const token of canvas.tokens?.placeables ?? []) {
    const document = token.document;
    if (!document?.actorId || document.getFlag(MODULE_ID, "temporaryOrigin") === true || runtimeOriginFlag(document)) continue;
    // A neighboring token whose square only touches the zone border is not in
    // the selected cell. Use document geometry plus positive-area overlap,
    // rather than PIXI bounds and inclusive edge intersection.
    if (rectanglesOverlapArea(rect, tokenDocumentBoundsRect(document))) ids.push(document.id);
  }
  return [...new Set(ids)];
}

function geometryOverlapsRect(geometry, rect) {
  if (geometry?.type === "circle") return circleIntersectsRect(geometry, rect);
  if (geometry?.type === "polygon") return polygonIntersectsRect(geometry.points, rect);
  if (geometry?.type === "rect") return rectanglesIntersect(geometry, rect);
  return false;
}

function tokenBoundsRect(token) {
  const bounds = token?.bounds;
  if (bounds && [bounds.x, bounds.y, bounds.width, bounds.height].every(value => Number.isFinite(Number(value)))) {
    return { x: Number(bounds.x), y: Number(bounds.y), width: Number(bounds.width), height: Number(bounds.height) };
  }
  return tokenCanvasRectangle(token?.document);
}

function tokenDocumentBoundsRect(document) {
  return tokenCanvasRectangle(document);
}

function serializePlacedTemplateGeometry(document) {
  const object = document?.object
    ?? canvas?.templates?.get?.(document?.id)
    ?? canvas?.templates?.placeables?.find?.(entry => entry?.document?.id === document?.id)
    ?? null;
  let shape = object?.shape ?? object?._shape ?? object?.template?.shape ?? null;
  if (!shape && object?._computeShape instanceof Function) {
    try { shape = object._computeShape(); }
    catch (_error) { /* fall through to canonical geometry */ }
  }
  if (!shape) return null;
  const origin = { x: Number(document?.x) || 0, y: Number(document?.y) || 0 };
  return serializeCanvasShape(shape, origin);
}

function serializeCanvasShape(shape, documentOrigin) {
  const rawPoints = shape?.points;
  if (rawPoints && typeof rawPoints[Symbol.iterator] === "function") {
    const values = Array.from(rawPoints, Number).filter(Number.isFinite);
    if (values.length >= 6 && values.length % 2 === 0) {
      const points = [];
      for (let index = 0; index < values.length; index += 2) points.push({ x: values[index], y: values[index + 1] });
      return { version: 1, space: "local", type: "polygon", points: normalizeShapePointsToLocal(points, documentOrigin) };
    }
  }

  const shapeName = String(shape?.constructor?.name ?? "").toLowerCase();
  if (shapeName.includes("ellipse")) {
    const center = normalizeShapePointsToLocal([{ x: Number(shape?.x) || 0, y: Number(shape?.y) || 0 }], documentOrigin)[0];
    const radiusX = Math.max(0, Number(shape?.halfWidth ?? shape?.radiusX ?? shape?.width / 2) || 0);
    const radiusY = Math.max(0, Number(shape?.halfHeight ?? shape?.radiusY ?? shape?.height / 2) || 0);
    if (radiusX && radiusY) {
      const points = [];
      for (let index = 0; index < 48; index += 1) {
        const angle = index * Math.PI * 2 / 48;
        points.push({ x: center.x + Math.cos(angle) * radiusX, y: center.y + Math.sin(angle) * radiusY });
      }
      return { version: 1, space: "local", type: "polygon", points };
    }
  }

  const radius = Number(shape?.radius);
  if (Number.isFinite(radius) && radius >= 0) {
    const [center] = normalizeShapePointsToLocal([{ x: Number(shape?.x) || 0, y: Number(shape?.y) || 0 }], documentOrigin);
    return { version: 1, space: "local", type: "circle", x: center.x, y: center.y, radius };
  }

  const width = Number(shape?.width);
  const height = Number(shape?.height);
  if (Number.isFinite(width) && Number.isFinite(height) && width >= 0 && height >= 0) {
    const [topLeft] = normalizeShapePointsToLocal([{ x: Number(shape?.x) || 0, y: Number(shape?.y) || 0 }], documentOrigin);
    return { version: 1, space: "local", type: "rect", x: topLeft.x, y: topLeft.y, width, height };
  }

  return null;
}

function normalizeShapePointsToLocal(points, documentOrigin) {
  const clean = points.map(point => ({ x: Number(point.x) || 0, y: Number(point.y) || 0 }));
  if (!clean.length) return clean;
  const origin = { x: Number(documentOrigin?.x) || 0, y: Number(documentOrigin?.y) || 0 };
  const distanceToZero = Math.min(...clean.map(point => Math.hypot(point.x, point.y)));
  const distanceToDocument = Math.min(...clean.map(point => Math.hypot(point.x - origin.x, point.y - origin.y)));
  const tolerance = Math.max(2, (Number(canvas?.dimensions?.size) || 100) * 0.25);
  // Foundry template shapes are normally local. Only translate when the shape is
  // clearly expressed in scene coordinates, which some integrations may expose.
  if (distanceToDocument + tolerance < distanceToZero) {
    return clean.map(point => ({ x: point.x - origin.x, y: point.y - origin.y }));
  }
  return clean;
}

function templateMeasurementMetadata(scene = canvas.scene) {
  return {
    version: 1,
    sceneUnits: sceneDistanceUnits(scene),
    gridDistance: Number(scene?.grid?.distance) || 5,
    gridSize: Number(scene?.grid?.size) || Number(canvas?.grid?.size) || 100
  };
}

function scaleSerializedNativeGeometry(nativeGeometry, factor) {
  const scale = Number(factor);
  if (!nativeGeometry || !Number.isFinite(scale) || scale <= 0 || Math.abs(scale - 1) < 0.000001) {
    return foundry.utils.deepClone(nativeGeometry ?? null);
  }
  const native = foundry.utils.deepClone(nativeGeometry);
  if (native.type === "circle") {
    native.x = (Number(native.x) || 0) * scale;
    native.y = (Number(native.y) || 0) * scale;
    native.radius = Math.max(0, Number(native.radius) || 0) * scale;
  } else if (native.type === "rect") {
    native.x = (Number(native.x) || 0) * scale;
    native.y = (Number(native.y) || 0) * scale;
    native.width = Math.max(0, Number(native.width) || 0) * scale;
    native.height = Math.max(0, Number(native.height) || 0) * scale;
  } else if (native.type === "polygon" && Array.isArray(native.points)) {
    native.points = native.points.map(point => ({
      x: (Number(point?.x) || 0) * scale,
      y: (Number(point?.y) || 0) * scale
    }));
  }
  return native;
}

function nativeGeometryScaleForCurrentScene(snapshot, canonicalData, scene = canvas.scene) {
  const saved = snapshot?.measurement;
  if (saved && Number(saved.version) >= 1) {
    const savedGridSize = Number(saved.gridSize);
    const savedGridDistance = Number(saved.gridDistance);
    const currentGridSize = Number(scene?.grid?.size ?? canvas?.grid?.size);
    const currentGridDistance = Number(scene?.grid?.distance);
    const savedFeet = convertLengthUnits(savedGridDistance, saved.sceneUnits, "ft", { fallback: savedGridDistance });
    const currentFeet = convertLengthUnits(currentGridDistance, sceneDistanceUnits(scene), "ft", { fallback: currentGridDistance });
    const savedPixelsPerFoot = savedGridSize / savedFeet;
    const currentPixelsPerFoot = currentGridSize / currentFeet;
    const factor = currentPixelsPerFoot / savedPixelsPerFoot;
    if ([savedPixelsPerFoot, currentPixelsPerFoot, factor].every(value => Number.isFinite(value) && value > 0)) return factor;
  }

  // Pre-0.5.5 snapshots have no measurement metadata. Their native PIXI
  // geometry was generated from whatever numeric distance EasyTraps handed to
  // Foundry at creation time. If that number differs from today's canonical,
  // unit-normalized distance, scale the local shape instead of forcing the GM
  // to recreate an otherwise valid trap.
  const storedData = snapshot?.data ?? {};
  for (const key of ["distance", "width"]) {
    const stored = Number(storedData?.[key]);
    const current = Number(canonicalData?.[key]);
    if (!Number.isFinite(stored) || !Number.isFinite(current) || stored <= 0 || current <= 0) continue;
    const factor = current / stored;
    if (Number.isFinite(factor) && factor > 0) return factor;
  }
  return 1;
}

function nativeGeometryForCurrentScene(snapshot, canonicalData, scene = canvas.scene) {
  const native = snapshot?.nativeGeometry ?? null;
  if (!native) return null;
  return scaleSerializedNativeGeometry(native, nativeGeometryScaleForCurrentScene(snapshot, canonicalData, scene));
}

function geometryFromSavedAreaState(state) {
  const origin = { x: Number(state?.x) || 0, y: Number(state?.y) || 0 };

  // The GM overlay is a deterministic visual summary of the canonical template
  // data. Prefer that stable model over PIXI's transient `shape` object: on
  // Foundry 14 / D&D5e 5.3.x some line/circle placements expose a control shape
  // that is not the final AoE footprint, producing tiny or missing previews even
  // though the saved native cast itself is correct.
  const canonical = geometryFromTemplateData(state, origin);
  if (canonical) return canonical;

  const native = state?.nativeGeometry;
  if (native?.type === "circle") {
    return {
      type: "circle",
      x: origin.x + (Number(native.x) || 0),
      y: origin.y + (Number(native.y) || 0),
      radius: Math.max(0, Number(native.radius) || 0)
    };
  }
  if (native?.type === "rect") {
    return {
      type: "rect",
      x: origin.x + (Number(native.x) || 0),
      y: origin.y + (Number(native.y) || 0),
      width: Math.max(0, Number(native.width) || 0),
      height: Math.max(0, Number(native.height) || 0)
    };
  }
  if (native?.type === "polygon" && Array.isArray(native.points) && native.points.length >= 3) {
    return {
      type: "polygon",
      points: native.points.map(point => ({
        x: origin.x + (Number(point?.x) || 0),
        y: origin.y + (Number(point?.y) || 0)
      }))
    };
  }
  return null;
}

function geometryFromTemplateData(data, origin) {
  return templatePreviewGeometry(data, origin, {
    gridSize: sceneGeometry().gridSize,
    gridDistance: Number(canvas.scene?.grid?.distance) || 5,
    defaultConeAngle: Number(CONFIG.MeasuredTemplate?.defaults?.angle) || 53.13
  });
}

function circleIntersectsRect(circle, rect) {
  const closestX = Math.max(rect.x, Math.min(circle.x, rect.x + rect.width));
  const closestY = Math.max(rect.y, Math.min(circle.y, rect.y + rect.height));
  const dx = circle.x - closestX;
  const dy = circle.y - closestY;
  return dx * dx + dy * dy <= circle.radius * circle.radius + 0.0001;
}

function rectanglesIntersect(a, b) {
  return a.x <= b.x + b.width && a.x + a.width >= b.x && a.y <= b.y + b.height && a.y + a.height >= b.y;
}

function rectanglesOverlapArea(a, b, epsilon = 0.01) {
  const overlapWidth = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const overlapHeight = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return overlapWidth > epsilon && overlapHeight > epsilon;
}

function polygonIntersectsRect(points, rect) {
  if (!Array.isArray(points) || points.length < 3) return false;
  if (points.some(point => pointInRect(point, rect))) return true;
  const corners = rectCorners(rect);
  if (corners.some(point => pointInPolygon(point, points))) return true;
  const rectEdges = polygonEdges(corners);
  const polygonSegments = polygonEdges(points);
  return polygonSegments.some(([a, b]) => rectEdges.some(([c, d]) => segmentsIntersect(a, b, c, d)));
}

function rectCorners(rect) {
  return [
    { x: rect.x, y: rect.y },
    { x: rect.x + rect.width, y: rect.y },
    { x: rect.x + rect.width, y: rect.y + rect.height },
    { x: rect.x, y: rect.y + rect.height }
  ];
}

function polygonEdges(points) {
  return points.map((point, index) => [point, points[(index + 1) % points.length]]);
}

function pointInRect(point, rect) {
  return point.x >= rect.x && point.x <= rect.x + rect.width && point.y >= rect.y && point.y <= rect.y + rect.height;
}

function pointInPolygon(point, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i];
    const b = polygon[j];
    if (pointOnSegment(point, a, b)) return true;
    const crosses = ((a.y > point.y) !== (b.y > point.y))
      && point.x < (b.x - a.x) * (point.y - a.y) / ((b.y - a.y) || Number.EPSILON) + a.x;
    if (crosses) inside = !inside;
  }
  return inside;
}

function segmentsIntersect(a, b, c, d) {
  const o1 = orientation(a, b, c);
  const o2 = orientation(a, b, d);
  const o3 = orientation(c, d, a);
  const o4 = orientation(c, d, b);
  if (o1 !== o2 && o3 !== o4) return true;
  return (o1 === 0 && pointOnSegment(c, a, b))
    || (o2 === 0 && pointOnSegment(d, a, b))
    || (o3 === 0 && pointOnSegment(a, c, d))
    || (o4 === 0 && pointOnSegment(b, c, d));
}

function orientation(a, b, c) {
  const value = (b.y - a.y) * (c.x - b.x) - (b.x - a.x) * (c.y - b.y);
  if (Math.abs(value) < 0.0001) return 0;
  return value > 0 ? 1 : 2;
}

function pointOnSegment(point, a, b) {
  if (Math.abs((point.y - a.y) * (b.x - a.x) - (point.x - a.x) * (b.y - a.y)) > 0.0001) return false;
  return point.x >= Math.min(a.x, b.x) - 0.0001 && point.x <= Math.max(a.x, b.x) + 0.0001
    && point.y >= Math.min(a.y, b.y) - 0.0001 && point.y <= Math.max(a.y, b.y) + 0.0001;
}

function isInstantaneousSpell(spell) {
  const units = String(spell?.system?.duration?.units ?? spell?.system?.duration?.unit ?? "").toLowerCase();
  return ["inst", "instant", "instantaneous"].includes(units);
}

async function cleanupPersistentRuntimeOriginVisuals(tokenDocument) {
  if (!tokenDocument || !runtimeOriginFlag(tokenDocument)) return 0;
  const manager = globalThis.Sequencer?.EffectManager;
  if (!(manager?.getEffects instanceof Function) || !(manager?.endEffects instanceof Function)) return 0;
  const object = tokenDocument.object ?? tokenDocument;
  try {
    const effects = [
      ...(manager.getEffects({ source: object }) ?? []),
      ...(manager.getEffects({ target: object }) ?? [])
    ];
    const persistent = [...new Map(effects
      .filter(effect => effect?.data?.persist === true)
      .map(effect => [effect.id, effect])).values()];
    if (!persistent.length) return 0;
    await manager.endEffects({ effects: persistent });
    return persistent.length;
  } catch (error) {
    console.warn(`${MODULE_ID} | Could not clean persistent visual effects from the technical origin`, error);
    return 0;
  }
}

function scheduleRuntimeOriginVisualCleanup(tokenDocument) {
  if (!tokenDocument || !runtimeOriginFlag(tokenDocument)) return;
  // Automated Animations / Sequencer may register a persistent effect either
  // immediately or shortly after the D&D5e activity resolves. Sweep quickly
  // first so an instantaneous trap does not leave a caster marker behind,
  // then repeat defensively for delayed module hooks.
  for (const delay of RUNTIME_ORIGIN_VFX_SWEEP_DELAYS_MS) {
    setTimeout(() => cleanupPersistentRuntimeOriginVisuals(tokenDocument), delay);
  }
}

function scheduleMeasuredTemplateCleanup(documents) {
  const refs = [...(documents ?? [])];
  setTimeout(() => deleteMeasuredTemplates(refs), INSTANT_TEMPLATE_CLEANUP_MS);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, Math.max(0, Number(ms) || 0)));
}

function resolveOriginTile(triggerTile, trap, originMode) {
  if (originMode === ORIGIN_MODES.TRIGGER_TILE) return triggerTile;
  if (originMode !== ORIGIN_MODES.SEPARATE_TILE) return null;
  const scene = triggerTile.parent ?? canvas.scene;
  return scene?.tiles?.get?.(trap.originTileId)
    ?? scene?.tiles?.find?.(tile => tile.uuid === trap.originTileUuid)
    ?? null;
}

function tileCenterPoint(tile) {
  const topLeft = markerTopLeft(tile);
  return {
    x: topLeft.x + Number(tile.width) / 2,
    y: topLeft.y + Number(tile.height) / 2,
    elevation: Number(tile.elevation) || 0
  };
}

function tokenCenterPoint(tokenDocument) {
  const point = tokenDocument.getCenterPoint?.();
  if (point) return { x: Number(point.x), y: Number(point.y), elevation: Number(tokenDocument.elevation) || 0 };
  const rect = tokenCanvasRectangle(tokenDocument);
  return {
    x: rect.x + rect.width / 2,
    y: rect.y + rect.height / 2,
    elevation: Number(tokenDocument.elevation) || 0
  };
}

function setupTemplateReferencePoint(triggerTile, originTile, originMode) {
  if (normalizeOriginMode(originMode) === ORIGIN_MODES.SEPARATE_TILE && originTile) return tileCenterPoint(originTile);
  // For "triggering creature", the trigger Tile is the design-time stand-in. At activation the same offsets
  // are applied from the triggering token's current center.
  return tileCenterPoint(triggerTile);
}

function abilityTemplateClass() {
  return game.dnd5e?.canvas?.AbilityTemplate
    ?? globalThis.dnd5e?.canvas?.AbilityTemplate
    ?? CONFIG.DND5E?.AbilityTemplate
    ?? null;
}

async function capturePreplacedTemplates(sourceSpell, activityId, referencePoint, effectiveTarget = null) {
  const activity = findActivity(sourceSpell, activityId);
  if (!activity) {
    ui.notifications.error("The selected spell Activity could not be found for area placement.");
    return null;
  }

  const createdDocuments = [];
  const previousTargets = currentTargetIds();
  let keyHandler = null;
  const previousCancel = runtime.cancelPlacement;
  runtime.placing = true;
  try {
    await setUserTargetIds([]);
    const resolvedTarget = effectiveTarget ?? resolveEffectiveTarget(sourceSpell, activity);
    const previews = createSetupTemplatePreviews(activity, resolvedTarget);
    if (!Array.isArray(previews) || !previews.length) {
      ui.notifications.warn("The selected spell does not create a D&D5e measured template.");
      return null;
    }

    const cancelPreview = () => {
      const handler = canvas.app?.view?.oncontextmenu;
      if (typeof handler === "function") {
        const event = new MouseEvent("contextmenu", { bubbles: true, cancelable: true, view: window });
        handler(event);
      }
    };
    runtime.cancelPlacement = cancelPreview;
    keyHandler = event => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      cancelPreview();
    };
    window.addEventListener("keydown", keyHandler, true);

    // Use D&D5e's placement controls with a neutral document. The spell Item is not used and no activity hooks fire.
    await waitForCanvasFrames(2);
    for (const preview of previews) {
      let result;
      try {
        result = await preview.drawPreview();
      } catch (error) {
        console.error(`${MODULE_ID} | D&D5e template preview failed`, error);
        ui.notifications.error(`The spell area could not be positioned: ${error.message ?? error}`);
        return null;
      }
      const documents = Array.isArray(result) ? result.flat(Infinity).filter(Boolean) : result ? [result] : [];
      if (!documents.length) {
        ui.notifications.warn("Spell-area placement was cancelled.");
        return null;
      }
      createdDocuments.push(...documents);
      // A setup preview may trigger generic auto-target integrations. These targets are design-time state only.
      await setUserTargetIds([]);
      const invalid = documents.find(document => !isValidPlacedTemplate(document));
      if (invalid) {
        console.error(`${MODULE_ID} | Rejected invalid template placement`, invalid?.toObject?.() ?? invalid);
        ui.notifications.error("The spell area must be positioned inside the scene.");
        return null;
      }
    }
    if (!createdDocuments.length) return null;
    // Embedded template objects are drawn asynchronously. Give the canvas a
    // chance to build the final native shape after snapping before serializing it.
    await waitForCanvasFrames(2);
    for (const document of createdDocuments) {
      try { document.object?.refresh?.(); }
      catch (_error) { /* the drawn object already has its final geometry */ }
    }
    await waitForCanvasFrames(1);
    const targetType = String(resolvedTarget?.template?.type ?? "");
    return createdDocuments.map((document, index) => serializeTemplateSnapshot(
      document,
      referencePoint,
      targetType,
      previews[index]?.easyTrapsCanonicalData ?? null
    ));
  } catch (error) {
    console.error(`${MODULE_ID} | Spell-area setup failed`, error);
    ui.notifications.error(`The spell area could not be prepared: ${error.message ?? error}`);
    return null;
  } finally {
    if (keyHandler) window.removeEventListener("keydown", keyHandler, true);
    runtime.cancelPlacement = previousCancel ?? null;
    runtime.placing = false;
    const ids = createdDocuments.map(document => document.id).filter(Boolean);
    if (ids.length) {
      try { await canvas.scene.deleteEmbeddedDocuments("MeasuredTemplate", ids); }
      catch (error) { console.warn(`${MODULE_ID} | Setup template cleanup failed`, error); }
    }
    await waitForCanvasFrames(1);
    await sleep(SETUP_TARGET_RESTORE_DELAY_MS);
    await setUserTargetIds(previousTargets);
  }
}

function normalizedTemplateDimensions(target = {}, activity = null, scene = canvas.scene) {
  const sourceUnits = String(target?.units ?? "").trim() || sceneDistanceUnits(scene);
  const sceneUnits = sceneDistanceUnits(scene);
  const raw = {
    size: numericTemplateValue(target?.size, activity, 0),
    width: numericTemplateValue(target?.width, activity, 5),
    height: numericTemplateValue(target?.height, activity, 0)
  };
  return {
    sourceUnits,
    sceneUnits,
    raw,
    size: convertLengthUnits(raw.size, sourceUnits, sceneUnits, { fallback: raw.size }),
    width: convertLengthUnits(raw.width, sourceUnits, sceneUnits, { fallback: raw.width }),
    height: convertLengthUnits(raw.height, sourceUnits, sceneUnits, { fallback: raw.height })
  };
}

function canonicalTemplateDataList(activity = null, effectiveTarget = null) {
  const target = (effectiveTarget ?? resolveEffectiveTarget(activity?.item, activity))?.template ?? {};
  const config = globalThis.dnd5e?.config ?? game.dnd5e?.config ?? CONFIG.DND5E;
  const templateShape = config?.areaTargetTypes?.[target.type]?.template;
  if (!templateShape) return [];
  const dimensions = normalizedTemplateDimensions(target, activity, canvas.scene);
  const { size, width, height } = dimensions;
  const count = Math.max(1, Math.trunc(numericTemplateValue(target.count, activity, 1)) || 1);
  const templateData = {
    t: templateShape,
    user: game.user.id,
    distance: size,
    direction: 0,
    x: 0,
    y: 0,
    fillColor: game.user.color,
    flags: {
      dnd5e: {
        dimensions: {
          size,
          width,
          height,
          adjustedSize: target.type === "radius"
        }
      },
      [MODULE_ID]: {
        setupPreview: true,
        sceneUnitNormalized: true,
        sourceUnits: dimensions.sourceUnits,
        sceneUnits: dimensions.sceneUnits
      }
    }
  };
  if (templateShape === "cone") templateData.angle = CONFIG.MeasuredTemplate.defaults.angle;
  else if (templateShape === "rect") {
    templateData.width = size;
    if (game.settings.get("dnd5e", "gridAlignedSquareTemplates")) {
      templateData.distance = Math.hypot(size, size);
      templateData.direction = 45;
    } else templateData.t = "ray";
  } else if (templateShape === "ray") templateData.width = width;
  return Array.from({ length: count }, () => foundry.utils.deepClone(templateData));
}

function createSetupTemplatePreviews(activity, effectiveTarget = null) {
  const TemplateClass = abilityTemplateClass();
  if (!TemplateClass) throw new Error("EasyTraps could not access the D&D5e ability-template class.");
  const DocumentClass = CONFIG.MeasuredTemplate.documentClass;
  return canonicalTemplateDataList(activity, effectiveTarget).map(templateData => {
    const document = new DocumentClass(foundry.utils.deepClone(templateData), { parent: canvas.scene });
    const preview = new TemplateClass(document);
    preview.actorSheet = null;
    preview.easyTrapsCanonicalData = foundry.utils.deepClone(templateData);
    return preview;
  });
}

function numericTemplateValue(value, activity, fallback = 0) {
  const direct = Number(value);
  if (Number.isFinite(direct)) return direct;
  const formula = String(value ?? "").trim();
  if (!formula) return Number(fallback) || 0;
  try {
    const rollData = activity?.getRollData?.() ?? {};
    const replaced = globalThis.Roll?.replaceFormulaData?.(formula, rollData, { missing: 0 }) ?? formula;
    const evaluated = globalThis.Roll?.safeEval?.(replaced);
    if (Number.isFinite(Number(evaluated))) return Number(evaluated);
  } catch (error) {
    console.warn(`${MODULE_ID} | Could not resolve template dimension ${formula}`, error);
  }
  return Number(fallback) || 0;
}

function isValidPlacedTemplate(document) {
  const data = document?.toObject?.() ?? document ?? {};
  const x = Number(data.x);
  const y = Number(data.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
  const dimensions = canvas?.dimensions;
  if (!dimensions) return false;
  const left = Number(dimensions.sceneX) || 0;
  const top = Number(dimensions.sceneY) || 0;
  const right = left + (Number(dimensions.sceneWidth) || 0);
  const bottom = top + (Number(dimensions.sceneHeight) || 0);
  if (x < left || x > right || y < top || y > bottom) return false;
  if (x === 0 && y === 0 && (left !== 0 || top !== 0)) return false;
  return true;
}

function inferTemplateBinding(data, referencePoint, targetType = "") {
  const shape = String(data?.t ?? data?.type ?? "").toLowerCase();
  const semanticType = String(targetType ?? "").toLowerCase();
  if (["cone", "line"].includes(semanticType) || shape === "cone") return TEMPLATE_BINDINGS.ORIGIN_LINKED;
  if (shape === "ray" && semanticType !== "cube" && semanticType !== "square") return TEMPLATE_BINDINGS.ORIGIN_LINKED;
  const dx = Number(data?.x) - Number(referencePoint?.x);
  const dy = Number(data?.y) - Number(referencePoint?.y);
  const tolerance = Math.max(10, sceneGeometry().gridSize * 0.75);
  return Math.hypot(dx, dy) <= tolerance ? TEMPLATE_BINDINGS.ORIGIN_LINKED : TEMPLATE_BINDINGS.SCENE_FIXED;
}

function serializeTemplateSnapshot(document, referencePoint, targetType = "", canonicalData = null) {
  const placed = document.toObject();
  const data = foundry.utils.deepClone(canonicalData ?? placed);
  data.direction = Number(placed.direction) || 0;
  if (Number.isFinite(Number(placed.angle)) && Object.hasOwn(data, "angle")) data.angle = Number(placed.angle);
  const binding = inferTemplateBinding({ ...data, x: placed.x, y: placed.y }, referencePoint, targetType);
  const snapshot = {
    binding,
    targetType: String(targetType ?? ""),
    // Store the exact final Foundry/PIXI shape produced after native snapping.
    // This geometry is design-time data only; the real spell still recreates its
    // template from the current Activity when the trap fires.
    nativeGeometry: serializePlacedTemplateGeometry(document),
    measurement: templateMeasurementMetadata(document?.parent ?? canvas.scene),
    offsetX: Number(placed.x) - Number(referencePoint.x),
    offsetY: Number(placed.y) - Number(referencePoint.y),
    elevationOffset: (Number(placed.elevation) || 0) - (Number(referencePoint.elevation) || 0),
    x: Number(placed.x),
    y: Number(placed.y),
    elevation: Number(placed.elevation) || 0,
    data
  };
  delete data._id;
  delete data._stats;
  delete data.x;
  delete data.y;
  delete data.elevation;
  const moduleFlags = data.flags?.[MODULE_ID];
  if (moduleFlags && typeof moduleFlags === "object") {
    delete moduleFlags.setupPreview;
    if (!Object.keys(moduleFlags).length) delete data.flags[MODULE_ID];
  }
  if (data.flags && !Object.keys(data.flags).length) delete data.flags;
  return snapshot;
}

function normalizedTemplateSnapshot(snapshot, referencePoint = null) {
  const copy = foundry.utils.deepClone(snapshot ?? {});
  const data = copy.data ?? {};
  let binding = Object.values(TEMPLATE_BINDINGS).includes(copy.binding) ? copy.binding : null;
  const reconstructed = {
    x: Number.isFinite(Number(copy.x)) ? Number(copy.x) : Number(referencePoint?.x || 0) + Number(copy.offsetX || 0),
    y: Number.isFinite(Number(copy.y)) ? Number(copy.y) : Number(referencePoint?.y || 0) + Number(copy.offsetY || 0),
    elevation: Number.isFinite(Number(copy.elevation)) ? Number(copy.elevation) : Number(referencePoint?.elevation || 0) + Number(copy.elevationOffset || 0)
  };
  if (!binding) binding = inferTemplateBinding({ ...data, ...reconstructed }, referencePoint ?? reconstructed, copy.targetType);
  return {
    ...copy,
    binding,
    x: reconstructed.x,
    y: reconstructed.y,
    elevation: reconstructed.elevation,
    offsetX: Number(copy.offsetX || 0),
    offsetY: Number(copy.offsetY || 0),
    elevationOffset: Number(copy.elevationOffset || 0),
    data
  };
}

function savedTemplatePlacements(trap, originPoint, triggerTile) {
  const snapshots = Array.isArray(trap.templates) ? trap.templates : [];
  return snapshots.map(rawSnapshot => {
    const snapshot = normalizedTemplateSnapshot(rawSnapshot, originPoint);
    const state = templateSnapshotWorldState(snapshot, originPoint);
    return {
      x: Number(state.x),
      y: Number(state.y),
      elevation: Number(state.elevation) || 0,
      direction: Number(state.direction) || 0,
      flags: {
        [MODULE_ID]: {
          activatedTemplate: true,
          binding: snapshot.binding,
          triggerTileId: triggerTile.id,
          triggerTileUuid: triggerTile.uuid
        }
      }
    };
  });
}

/**
 * Let the real D&D5e Item workflow create its measured templates, but replace the
 * interactive placement step with the geometry recorded while the trap was built.
 * This keeps template creation inside Activity#use, so Midi-QOL, animations, macros,
 * chat flags, and post-use hooks see the same native workflow as a manual spell use.
 */
async function withSavedNativeTemplatePlacement({ spell, activityId, trap, originPoint, triggerTile }, callback) {
  const activity = findActivity(spell, activityId);
  if (!activity) throw new Error("The runtime spell no longer contains the saved Activity.");
  const prepared = savedTemplatePlacements(trap, originPoint, triggerTile);
  if (!prepared.length) throw new Error("The trap has no saved spell-area geometry to replay.");

  const createdDocuments = [];
  let matched = false;
  let placementError = null;
  const hookId = Hooks.on("dnd5e.createActivityTemplate", (createdActivity, previews) => {
    if (matched) return;
    const sameItem = createdActivity?.item?.uuid === spell.uuid
      || (createdActivity?.item?.id === spell.id && createdActivity?.actor?.id === spell.actor?.id);
    if (!sameItem || createdActivity?.id !== activityId) return;
    matched = true;
    if (!Array.isArray(previews) || previews.length !== prepared.length) {
      placementError = new Error(`The native workflow requested ${previews?.length ?? 0} template(s), but the trap saved ${prepared.length}.`);
      for (const preview of previews ?? []) preview.drawPreview = async () => { throw placementError; };
      return;
    }
    previews.forEach((preview, index) => {
      const placement = foundry.utils.deepClone(prepared[index]);
      const current = preview.document?.toObject?.() ?? {};
      const flags = foundry.utils.mergeObject(current.flags ?? {}, placement.flags ?? {}, { inplace: false });
      preview.document?.updateSource?.({
        x: placement.x,
        y: placement.y,
        elevation: placement.elevation,
        direction: placement.direction,
        flags
      });
      preview.drawPreview = async () => {
        if (placementError) throw placementError;
        const documents = await canvas.scene.createEmbeddedDocuments("MeasuredTemplate", [preview.document.toObject()]);
        createdDocuments.push(...documents);
        return documents;
      };
    });
  });

  try {
    const result = await callback();
    if (placementError) throw placementError;
    if (!matched) throw new Error("The native D&D5e spell workflow did not request its saved template.");
    if (!createdDocuments.length) throw new Error("The native D&D5e spell workflow did not create the saved template.");
    return { result, templates: createdDocuments };
  } catch (error) {
    await deleteMeasuredTemplates(createdDocuments);
    throw error;
  } finally {
    Hooks.off("dnd5e.createActivityTemplate", hookId);
  }
}

async function deleteMeasuredTemplates(documents) {
  const ids = (documents ?? []).map(document => document?.id).filter(Boolean);
  if (!ids.length || !canvas.scene) return;
  try {
    const existing = ids.filter(id => canvas.scene.templates?.has?.(id));
    if (existing.length) await canvas.scene.deleteEmbeddedDocuments("MeasuredTemplate", existing);
  } catch (error) {
    console.warn(`${MODULE_ID} | Activated template cleanup failed`, error);
  }
}

async function ensureInternalCaster() {
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

function runtimeOriginFlag(token) {
  return token?.getFlag?.(MODULE_ID, "runtimeOrigin") ?? token?.flags?.[MODULE_ID]?.runtimeOrigin ?? null;
}

function runtimeSpellFlag(item) {
  return item?.getFlag?.(MODULE_ID, "runtimeSpell") ?? item?.flags?.[MODULE_ID]?.runtimeSpell ?? null;
}

async function ensureRuntimeOriginToken(originTile, triggerTile) {
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

async function protectRuntimeOriginTokens() {
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

async function cleanupTemporaryOriginTokens() {
  if (!isPrimaryGM() || !canvas.scene) return;
  const ids = canvas.scene.tokens
    .filter(token => token.getFlag(MODULE_ID, "temporaryOrigin") === true)
    .map(token => token.id);
  if (!ids.length) return;
  try { await canvas.scene.deleteEmbeddedDocuments("Token", ids); }
  catch (error) { console.warn(`${MODULE_ID} | Legacy temporary origin cleanup failed`, error); }
}

function allTrapUuids() {
  const uuids = new Set();
  for (const scene of game.scenes ?? []) {
    for (const tile of scene.tiles ?? []) if (trapData(tile)) uuids.add(tile.uuid);
  }
  return uuids;
}

function allRuntimeActors() {
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

async function cleanupOrphanedRuntimeDocuments() {
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


async function cleanupRuntimeDocumentsForTrap(triggerTile) {
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

function hideRuntimeSpellEntries(application, html) {
  const actor = application?.actor ?? application?.document;
  if (actor?.documentName !== "Actor" || !actor.items) return;
  const root = html?.querySelectorAll ? html : html?.[0] ?? application?.element;
  if (!root?.querySelectorAll) return;
  const ids = actor.items.filter(item => Boolean(runtimeSpellFlag(item))).map(item => item.id);
  for (const id of ids) {
    const selectors = [
      `[data-item-id="${id}"]`,
      `[data-entry-id="${id}"]`,
      `[data-document-id="${id}"]`,
      `[data-uuid$=".Item.${id}"]`
    ];
    for (const element of root.querySelectorAll(selectors.join(","))) element.remove();
  }
}

function hideInternalCasterEntries(html) {
  const root = html?.querySelectorAll ? html : html?.[0] ?? html?.element;
  if (!root?.querySelectorAll) return;
  const ids = game.actors
    .filter(actor => actor.getFlag(MODULE_ID, "internalCaster") === true)
    .map(actor => actor.id);
  for (const id of ids) {
    const selectors = [
      `[data-entry-id="${id}"]`,
      `[data-document-id="${id}"]`,
      `[data-entity-id="${id}"]`
    ];
    for (const element of root.querySelectorAll(selectors.join(","))) element.remove();
  }
}

function onDeleteTile(tileDocument, options = {}) {
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

function applyRuntimeCantripCasterLevel(activity, usageConfig, _dialogConfig, messageConfig) {
  const item = activity?.item;
  const flag = runtimeSpellFlag(item);
  if (!flag || item?.type !== "spell" || normalizeSpellBaseLevel(item.system?.level) !== 0) return;

  const casterLevel = normalizeCantripCasterLevel(flag.cantripCasterLevel, 1);
  const scaling = cantripScalingIncrease(casterLevel);
  usageConfig.scaling = scaling;

  // Activity#use has already cloned the embedded runtime Item before this hook
  // fires. Override roll data on only that transient clone, leaving both the
  // technical caster and the persistent runtime Item untouched. Reusing the
  // native Scaling constructor preserves D&D5e's @scaling / @scaling.increase
  // semantics for ordinary and custom cantrip damage formulas.
  if (!installCantripRollDataScaling(item, scaling)) {
    console.warn(`${MODULE_ID} | Could not apply caster-level scaling to runtime cantrip ${item.name}. Native actor scaling will be used.`);
    return;
  }

  foundry.utils.setProperty(messageConfig, `data.flags.${MODULE_ID}.cantripCasterLevel`, casterLevel);
}

function sourceModifiedTime(sourceSpell) {
  const value = Number(sourceSpell?._stats?.modifiedTime ?? sourceSpell?._source?._stats?.modifiedTime);
  return Number.isFinite(value) ? value : null;
}

function prioritizeActivityData(data, activityId) {
  const activities = data?.system?.activities;
  if (!activityId || !activities) return data;
  if (Array.isArray(activities)) {
    const index = activities.findIndex(activity => activity?._id === activityId || activity?.id === activityId);
    if (index > 0) activities.unshift(activities.splice(index, 1)[0]);
    return data;
  }
  if (typeof activities === "object" && Object.hasOwn(activities, activityId)) {
    const selected = activities[activityId];
    const sorts = Object.values(activities).map(activity => Number(activity?.sort)).filter(Number.isFinite);
    selected.sort = (sorts.length ? Math.min(...sorts) : 0) - (Number(CONST?.SORT_INTEGER_DENSITY) || 100000);
    data.system.activities = {
      [activityId]: selected,
      ...Object.fromEntries(Object.entries(activities).filter(([id]) => id !== activityId))
    };
  }
  return data;
}

function rawActivityData(data, activityId) {
  const activities = data?.system?.activities;
  if (!activities || !activityId) return null;
  if (Array.isArray(activities)) {
    return activities.find(activity => activity?._id === activityId || activity?.id === activityId) ?? null;
  }
  if (typeof activities === "object") return activities[activityId] ?? null;
  return null;
}

function applyRuntimeTemplateUnitNormalization(data, sourceSpell, activityId, scene = canvas.scene) {
  const sourceActivity = findActivity(sourceSpell, activityId);
  if (!sourceActivity) return data;
  const effectiveTarget = resolveEffectiveTarget(sourceSpell, sourceActivity);
  if (!effectiveTemplateShape(effectiveTarget)) return data;

  const template = foundry.utils.deepClone(effectiveTarget?.template ?? {});
  const dimensions = normalizedTemplateDimensions(template, sourceActivity, scene);
  const normalizedTemplate = {
    ...template,
    units: dimensions.sceneUnits,
    size: String(dimensions.size),
    width: String(dimensions.width),
    height: String(dimensions.height)
  };
  const sourceActivityTarget = plainData(sourceActivity?.toObject?.()?.target ?? sourceActivity?.target);
  const runtimeActivity = rawActivityData(data, activityId);

  if (sourceActivityTarget.override === true) {
    if (runtimeActivity) {
      runtimeActivity.target ??= {};
      runtimeActivity.target.template = foundry.utils.mergeObject(runtimeActivity.target.template ?? {}, normalizedTemplate, {
        inplace: false,
        insertKeys: true,
        overwrite: true,
        recursive: true
      });
    }
  } else {
    data.system ??= {};
    data.system.target ??= {};
    data.system.target.template = foundry.utils.mergeObject(data.system.target.template ?? {}, normalizedTemplate, {
      inplace: false,
      insertKeys: true,
      overwrite: true,
      recursive: true
    });
  }

  data.flags = foundry.utils.mergeObject(data.flags ?? {}, {
    [MODULE_ID]: {
      runtimeTemplateUnits: {
        sourceUnits: dimensions.sourceUnits,
        sceneUnits: dimensions.sceneUnits
      }
    }
  }, { inplace: false });
  return data;
}

function applyRuntimeSpellConfiguration(data, activityId, {
  spellSaveDc = DEFAULT_SPELL_SAVE_DC,
  spellAttackBonus = DEFAULT_SPELL_ATTACK_BONUS,
  targetCapacity = null
} = {}) {
  const activity = rawActivityData(data, activityId);
  if (!activity) return data;

  const saveDc = normalizeSpellSaveDc(spellSaveDc);
  if (String(activity.type ?? "") === "save" || activity.save) {
    activity.save ??= {};
    activity.save.dc ??= {};
    // D&D5e treats a blank calculation plus a numeric formula as a flat DC.
    // This avoids mutating the caster Actor and works identically for trigger-
    // token origins and the hidden EasyTraps caster.
    activity.save.dc.calculation = "";
    activity.save.dc.formula = String(saveDc);
  }

  const attackBonus = normalizeSpellAttackBonus(spellAttackBonus);
  if (String(activity.type ?? "") === "attack" || activity.attack) {
    activity.attack ??= {};
    activity.attack.flat = true;
    activity.attack.ability = "none";
    activity.attack.bonus = String(attackBonus);
  }

  const capacity = normalizeOptionalTargetCapacity(targetCapacity);
  if (capacity) {
    data.system ??= {};
    data.system.target ??= {};
    data.system.target.affects ??= {};
    data.system.target.affects.count = String(capacity);
    data.system.target.affects.choice = false;

    // Some Items override target data at Activity level while others inherit
    // from the Item. Populate both sources on the hidden runtime copy so the
    // native workflow receives the same dynamic capacity in either case.
    activity.target ??= {};
    activity.target.affects ??= {};
    activity.target.affects.count = String(capacity);
    activity.target.affects.choice = false;
  }
  return data;
}

function prepareRuntimeSpell(sourceSpell, triggerTile, activityId, configuration = {}) {
  const data = prioritizeActivityData(prepareRuntimeSpellSourceData(sourceSpell), activityId);
  applyRuntimeTemplateUnitNormalization(data, sourceSpell, activityId, triggerTile?.parent ?? canvas.scene);
  applyRuntimeSpellConfiguration(data, activityId, configuration);
  const spellSaveDc = normalizeSpellSaveDc(configuration.spellSaveDc);
  const spellAttackBonus = normalizeSpellAttackBonus(configuration.spellAttackBonus);
  const targetCapacity = normalizeOptionalTargetCapacity(configuration.targetCapacity);
  const cantripCasterLevel = normalizeSpellBaseLevel(sourceSpell.system?.level) === 0
    ? normalizeCantripCasterLevel(configuration.cantripCasterLevel, 1)
    : null;
  data.flags = foundry.utils.mergeObject(data.flags ?? {}, {
    [MODULE_ID]: {
      runtimeSpell: {
        runtimeSchema: RUNTIME_SPELL_SCHEMA,
        sourceUuid: sourceSpell.uuid,
        sourceModifiedTime: sourceModifiedTime(sourceSpell),
        activityId,
        spellSaveDc,
        spellAttackBonus,
        targetCapacity,
        cantripCasterLevel,
        sceneUnits: sceneDistanceUnits(triggerTile?.parent ?? canvas.scene),
        triggerTileId: triggerTile.id,
        triggerTileUuid: triggerTile.uuid,
        version: VERSION
      }
    }
  }, { inplace: false });
  return data;
}

async function ensureRuntimeSpell(actor, sourceSpell, triggerTile, activityId, configuration = {}) {
  const modifiedTime = sourceModifiedTime(sourceSpell);
  const spellSaveDc = normalizeSpellSaveDc(configuration.spellSaveDc);
  const spellAttackBonus = normalizeSpellAttackBonus(configuration.spellAttackBonus);
  const targetCapacity = normalizeOptionalTargetCapacity(configuration.targetCapacity);
  const cantripCasterLevel = normalizeSpellBaseLevel(sourceSpell.system?.level) === 0
    ? normalizeCantripCasterLevel(configuration.cantripCasterLevel, 1)
    : null;
  let item = actor.items.find(entry => {
    const flag = runtimeSpellFlag(entry);
    const sameTrap = flag?.triggerTileUuid === triggerTile.uuid || flag?.triggerTileId === triggerTile.id;
    const sameSource = flag?.sourceUuid === sourceSpell.uuid;
    const sameRevision = (flag?.sourceModifiedTime ?? null) === modifiedTime;
    const sameActivity = flag?.activityId === activityId;
    const sameRuntimeSchema = Number(flag?.runtimeSchema) === RUNTIME_SPELL_SCHEMA;
    const sameSaveDc = normalizeSpellSaveDc(flag?.spellSaveDc) === spellSaveDc;
    const sameAttackBonus = normalizeSpellAttackBonus(flag?.spellAttackBonus) === spellAttackBonus;
    const storedCapacity = normalizeOptionalTargetCapacity(flag?.targetCapacity);
    const sameTargetCapacity = storedCapacity === targetCapacity;
    const storedCantripCasterLevel = normalizeSpellBaseLevel(sourceSpell.system?.level) === 0
      ? normalizeCantripCasterLevel(flag?.cantripCasterLevel, 1)
      : null;
    const sameCantripCasterLevel = storedCantripCasterLevel === cantripCasterLevel;
    const sameSceneUnits = String(flag?.sceneUnits ?? "") === sceneDistanceUnits(triggerTile?.parent ?? canvas.scene);
    return sameTrap && sameSource && sameRevision && sameActivity
      && sameRuntimeSchema && sameSaveDc && sameAttackBonus && sameTargetCapacity
      && sameCantripCasterLevel && sameSceneUnits;
  });
  if (item) return item;
  // Keep older runtime copies intact because active effects, concentration, summons, macros or chat cards may still
  // reference them. A new source revision or selected Activity receives a new hidden runtime Item.
  [item] = await actor.createEmbeddedDocuments("Item", [prepareRuntimeSpell(sourceSpell, triggerTile, activityId, {
    spellSaveDc,
    spellAttackBonus,
    targetCapacity,
    cantripCasterLevel
  })], { renderSheet: false });
  if (!item) throw new Error("EasyTraps could not create its stable native spell copy.");
  return item;
}

function prepareRuntimeSpellSourceData(sourceSpell) {
  const data = sourceSpell.toObject();
  delete data._id;
  delete data.folder;
  data.name = sourceSpell.name;
  if (data.system) {
    const baseLevel = normalizeSpellBaseLevel(data.system.level);
    if (baseLevel > 0) {
      // The hidden runtime Item never consumes a slot, but it must use a
      // slot-capable spellcasting method so D&D5e keeps its native scaling
      // pipeline enabled. Compendium spells normally already use `spell`;
      // normalizing here also makes leveled innate/at-will source Items
      // eligible for the trap's explicitly saved cast level.
      data.system.method = "spell";
      data.system.prepared = 1;
    }
    // Preserve compatibility with pre-5.1 spell data imported by third-party
    // compendiums. Current D&D5e stores `method`/`prepared` directly.
    if (data.system.preparation) {
      data.system.preparation.mode = baseLevel > 0 ? "prepared" : data.system.preparation.mode;
      data.system.preparation.prepared = true;
    }
  }
  if (data.system?.activities && typeof data.system.activities === "object") {
    for (const activity of Object.values(data.system.activities)) {
      activity.consumption ??= {};
      activity.consumption.spellSlot = false;
    }
  }
  return data;
}

async function useOriginalSpellItem(spell, {
  activityId,
  createMeasuredTemplate = false,
  configure = false,
  scaling = 0,
  castLevel = null,
  usageOverrides = null,
  messageOverrides = null,
  forceActivityUse = false
} = {}) {
  const resolution = resolveActivitySelection(spell, activityId);
  if (!resolution.supported || !(spell?.use instanceof Function)) {
    throw new Error(`${spell?.name ?? "The selected spell"} cannot use its saved Activity through the native D&D5e Item API.`);
  }
  const firstUsable = usableActivityList(spell)[0];
  if (firstUsable?.id !== activityId) {
    throw new Error(`${spell.name}'s runtime Activity order does not match the saved trap configuration.`);
  }
  const baseLevel = normalizeSpellBaseLevel(spell.system?.level);
  const level = normalizeCastLevel(castLevel, baseLevel);
  let usage = {
    consume: false,
    scaling: Math.max(Number(scaling) || 0, castScaling(level, baseLevel)),
    create: { measuredTemplate: Boolean(createMeasuredTemplate) }
  };
  if (usageOverrides && typeof usageOverrides === "object") {
    usage = foundry.utils.mergeObject(usage, usageOverrides, {
      inplace: false,
      insertKeys: true,
      insertValues: true,
      overwrite: true,
      recursive: true
    });
  }
  if (level > 0) usage.spell = { slot: `spell${level}` };
  const dialog = { configure: Boolean(configure) };
  let message = {
    create: true,
    ...(level > 0 ? { data: { system: { spellLevel: level } } } : {})
  };
  if (messageOverrides && typeof messageOverrides === "object") {
    message = foundry.utils.mergeObject(message, messageOverrides, {
      inplace: false,
      insertKeys: true,
      insertValues: true,
      overwrite: true,
      recursive: true
    });
  }
  const usable = usableActivityList(spell);

  // Item#use is the natural entry point for a spell with one usable Activity.
  // For a multi-Activity Item, Item#use always opens the native chooser unless a
  // Shift keyboard event is supplied. A synthetic Shift event leaks into attack
  // and damage rolls, so replay the already-saved choice by invoking the exact
  // Activity that Item#use would delegate to after that chooser.
  if (forceActivityUse || usable.length > 1) return resolution.activity.use(usage, dialog, message);
  return spell.use({ chooseActivity: false, ...usage }, dialog, message);
}

function activityList(spell) {
  const activities = spell.system?.activities;
  if (!activities) return [];
  if (Array.isArray(activities)) return activities;
  if (Array.isArray(activities.contents)) return activities.contents;
  if (activities.values instanceof Function) return Array.from(activities.values());
  return Object.values(activities);
}

function isPrimaryGM() {
  if (!game.user?.isGM || !game.user?.active) return false;
  return primaryActiveGMUser()?.id === game.user.id;
}

function normalize(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function escapeHtml(value) {
  const text = String(value ?? "");
  if (foundry.utils.escapeHTML) return foundry.utils.escapeHTML(text);
  return text.replace(/[&<>'"]/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
}


// ---------------------------------------------------------------------------
// Monk's Active Tile Triggers backend
// ---------------------------------------------------------------------------
function mattActionId() {
  return foundry.utils.randomID?.() ?? Math.random().toString(36).slice(2, 18);
}

function buildMattTriggerFlags() {
  return {
    // Stay inactive until trigger, origin, target rule, and saved area are all committed.
    active: false,
    trigger: ["enter"],
    restriction: "all",
    controlled: "all",
    chance: 100,
    pertoken: false,
    minrequired: 0,
    actions: [{ id: mattActionId(), action: `${MODULE_ID}.execute-trap`, data: {} }]
  };
}

function registerMattActions(matt) {
  try {
    matt.registerTileGroup(MODULE_ID, "EasyTraps");
    matt.registerTileAction(MODULE_ID, "execute-trap", {
      name: "EasyTraps: Execute configured trap",
      ctrls: [],
      fn: async args => {
        const tile = args.tile;
        if (!tile) return;
        let tokens = (args.tokens ?? []).map(token => token?.document ?? token).filter(Boolean);
        if (!tokens.length) {
          // MATT's "Manually Trigger Actions" can invoke an action without a
          // movement token. Reuse one explicitly controlled GM token as the
          // triggering-creature context when the trap needs one. Area/custom
          // traps with a technical origin can execute without any token.
          const controlled = Array.from(canvas.tokens?.controlled ?? [])
            .map(token => token?.document ?? token)
            .filter(token => token?.actor && token.hidden !== true && !runtimeOriginFlag(token));
          const trap = trapData(tile);
          const needsTriggeringToken = normalizeOriginMode(trap?.originMode) === ORIGIN_MODES.TRIGGERING_TOKEN
            || normalizeTargetMode(trap?.targetMode) === TARGET_MODES.TRIGGERING_TOKEN;
          if (needsTriggeringToken) {
            if (controlled.length !== 1) {
              ui.notifications.warn("Select exactly one creature token before using Manually Trigger Actions for this trap.");
              tile.resumeActions?.(args._id, { continue: false, reason: "manual-trigger-token-required" });
              return { pause: false };
            }
            tokens = controlled;
          } else if (controlled.length === 1) tokens = controlled;
        }
        executeMattTrap(tile, tokens, {
          onComplete: result => tile.resumeActions?.(args._id, result)
        }).catch(error => {
          console.error(`${MODULE_ID} | MATT trap execution failed`, error);
          ui.notifications.error(`The trap failed: ${error.message ?? error}`);
          tile.resumeActions?.(args._id, { continue: false, error: String(error) });
        });
        return { pause: true };
      },
      content: async () => `<span class="action-style">EasyTraps</span> <span class="details-style">Execute configured trap</span>`
    });
  } catch (error) {
    console.error(`${MODULE_ID} | Could not register MATT action`, error);
  }
}

async function executeMattTrap(tile, triggeringTokens, options = {}) {
  const key = tile.uuid ?? tile.id;
  if (runtime.triggering.has(key)) {
    const payload = { continue: false, reason: "already-running" };
    safeTrapComplete(options.onComplete, payload);
    return payload;
  }
  runtime.triggering.add(key);
  try {
    return await executeConfiguredTrap(tile, triggeringTokens, options);
  } finally {
    runtime.triggering.delete(key);
  }
}

function planSpellWorkflow(spell, activityId) {
  const resolution = resolveActivitySelection(spell, activityId);
  if (!resolution.supported) {
    return {
      mode: WORKFLOW_MODES.UNSUPPORTED,
      supported: false,
      reason: resolution.reason,
      activityCount: resolution.activityCount,
      activityId
    };
  }
  const activity = resolution.activity;
  return {
    mode: WORKFLOW_MODES.NATIVE_SPELL,
    supported: true,
    activityId: activity.id,
    activityType: String(activity.type ?? "activity"),
    activityCount: resolution.activityCount,
    reason: "selected-activity-native-spell-item"
  };
}

function workflowUnsupportedMessage(plan) {
  const reason = String(plan?.reason ?? "unsupported");
  if (reason === "activity-choice-required") return "This trap does not contain a saved Activity choice. Recreate it.";
  if (reason === "activity-changed") return "The spell's saved Activity changed or is no longer usable. Recreate the trap.";
  if (reason === "missing-activity") return "The spell Activity saved by this trap could not be found.";
  return "The selected spell Activity is not available through the native D&D5e Item workflow.";
}
