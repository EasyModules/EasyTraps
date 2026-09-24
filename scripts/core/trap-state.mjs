import { MODULE_ID, ORIGIN_MODES, SETTINGS, TRIGGER_SCHEMA, VERSION } from "./constants.mjs";
import {
  refreshAreaOverlays,
  refreshOpenSceneTrapManager,
  refreshPlayerTrapInteractionState,
  refreshTriggerOverlays
} from "./presentation.mjs";
import { linkedSourceDocumentForTrap } from "./source-documents.mjs";
import { normalizeOriginMode, resolveOriginTile, sceneTrapDocuments, trapData } from "./trap-model.mjs";
import { normalizeDiscoveryConfig } from "../discovery.mjs";
import { mattActiveForTrap } from "../integrations/matt-state.mjs";
import { TRIGGER_TYPES, isExternalTriggerType, normalizeTriggerType, triggerTypeLabel } from "../trigger-sources.mjs";

export function trapArmBlockReason(tile, trap = trapData(tile)) {
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

export function trapCanArm(tile, trap = trapData(tile)) {
  return trapArmBlockReason(tile, trap) == null;
}

export async function setTrapDiscovered(tile, discovered) {
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

export async function applyAdvancedSettingsToAllTraps(value, meta = {}, scene = canvas.scene) {
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

export async function setTrapEnabled(tile, enabled, { resetDisarmAttempts = Boolean(enabled) } = {}) {
  const changes = {
    [`flags.${MODULE_ID}.armed`]: Boolean(enabled),
    ...(enabled && resetDisarmAttempts ? { [`flags.${MODULE_ID}.-=disarmAttempts`]: null } : {}),
    "flags.monks-active-tiles.active": mattActiveForTrap(trapData(tile), enabled)
  };
  await tile.update(changes);
}

export async function pauseGameForTrap(trap) {
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
