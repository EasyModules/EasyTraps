import { MODULE_ID } from "../core/constants.mjs";
import { TRIGGER_TYPES, normalizeTriggerType } from "../trigger-sources.mjs";

export function mattActiveForTrap(trap, enabled) {
  return normalizeTriggerType(trap?.triggerType) === TRIGGER_TYPES.TILE && Boolean(enabled);
}

// ---------------------------------------------------------------------------
// Monk's Active Tile Triggers backend
// ---------------------------------------------------------------------------
export function mattActionId() {
  return foundry.utils.randomID?.() ?? Math.random().toString(36).slice(2, 18);
}

export function buildMattTriggerFlags() {
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
