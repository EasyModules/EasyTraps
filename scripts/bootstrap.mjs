import { createEasyTrapsConfigurationMenuType } from "./config.mjs";
import {
  DEFAULT_DISARM_AFTER_TRIGGER,
  DEFAULT_ORIGIN_TEXTURE,
  DEFAULT_PAUSE_ON_TRIGGER,
  DEFAULT_SPELL_ATTACK_BONUS,
  DEFAULT_SPELL_SAVE_DC,
  DEFAULT_TRIGGER_TEXTURE,
  MODULE_ID,
  SETTINGS,
  VERSION
} from "./core/constants.mjs";
import { setupDisarmSocket, setupGmAuthorityResumeHandling } from "./core/disarm-runtime.mjs";
import {
  refreshAreaOverlays,
  refreshOpenSceneTrapManager,
  refreshPlayerTrapInteractionState,
  refreshTriggerOverlays
} from "./core/presentation.mjs";
import { runtime } from "./core/runtime-state.mjs";
import {
  closeRuntimeOriginTokenHud,
  makeRuntimeOriginNonInteractive,
  onControlRuntimeOriginToken,
  onPreUpdateToken,
  onTargetRuntimeOriginToken,
  refreshRuntimeOriginActorDecorations
} from "./core/runtime-tokens.mjs";
import { migrateDiscoveryDefaultsSetting } from "./core/settings-migrations.mjs";
import { getFavoriteSpells, getSelectedCompendiums } from "./core/spell-catalog.mjs";
import { onPreUpdateTile } from "./core/tile-updates.mjs";
import {
  onMoveTokenDiscovery,
  onSightRefreshDiscovery,
  onTokenVisionChangedDiscovery,
  scheduleVisionDiscoveryRecheck
} from "./core/trap-discovery.mjs";
import {
  cleanupNonSpatialAlarmOrigins,
  cleanupOrphanedRuntimeDocuments,
  cleanupTemporaryOriginTokens,
  onDeleteTile,
  protectRuntimeOriginTokens
} from "./core/trap-lifecycle.mjs";
import { migrateLegacyTriggers } from "./core/trap-migrations.mjs";
import {
  onDeleteItemPileTriggerSource,
  onDeleteTriggerSourceWall,
  onPreDeleteItemPileTriggerSource,
  onPreDeleteTriggerSourceWall
} from "./core/trigger-links.mjs";
import { DEFAULT_DISCOVERY_CONFIG, actorHasRequiredItem } from "./discovery.mjs";
import { applyRuntimeCantripCasterLevel } from "./integrations/dnd5e.mjs";
import { warnAboutOptionalIntegrationCompatibility } from "./integrations/easy-fix.mjs";
import { registerWithEasyModules } from "./integrations/easy-modules.mjs";
import { ensureAlarmMacro, ensureMacro, removeLegacyDevelopmentMacros } from "./integrations/macros.mjs";
import { registerMattActions } from "./integrations/matt.mjs";
import { stripRuntimeOriginFromMidiWorkflow } from "./integrations/midi-qol.mjs";
import { TRIGGER_TYPES } from "./trigger-sources.mjs";
import { onPreUpdateDoorTriggerSource, onUpdateDoorTriggerSource } from "./triggers/door-trigger.mjs";
import {
  onUpdateItemPileTriggerSource,
  setupTriggerSourceHooks,
  syncVisibleItemPileController
} from "./triggers/item-pile-trigger.mjs";
import { repairExternalTriggerSourceLinks } from "./triggers/source-sync.mjs";
import {
  clearAreaOverlays,
  clearTriggerOverlays,
  setupGmAlarmRangePreview,
  teardownGmAlarmRangePreview
} from "./ui/canvas-overlays.mjs";
import { configurationServices, openConfiguration, resetSettings } from "./ui/configuration.mjs";
import { openAlarmWizard, openWizard } from "./ui/launchers.mjs";
import {
  repositionPlayerDisarmControl,
  setupPlayerTrapInteraction,
  teardownPlayerTrapInteraction
} from "./ui/player-interaction.mjs";
import { hideInternalCasterEntries, hideRuntimeSpellEntries } from "./ui/runtime-entries.mjs";
import {
  closeSceneManagerForCanvasTearDown,
  openSceneTrapManager,
  registerSceneControlButtons
} from "./ui/scene-manager.mjs";
import { renderTrapTileHud } from "./ui/trap-hud.mjs";

export function registerHooks() {
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
}

