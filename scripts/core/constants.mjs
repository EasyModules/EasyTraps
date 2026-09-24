

export const MODULE_ID = "easy-traps";

export const VERSION = "1.0.0";

export const TRIGGER_SCHEMA = 31;

export const MACRO_NAME = "EasyTraps — Create Spell Trap";

export const ALARM_MACRO_NAME = "EasyTraps — Create Alarm Trap";

export const DEFAULT_TRIGGER_TEXTURE = `modules/${MODULE_ID}/assets/trigger-floor.svg`;

export const DEFAULT_ORIGIN_TEXTURE = `modules/${MODULE_ID}/assets/trigger-floor.svg`;

export const INTERNAL_CASTER_NAME = "EasyTraps";

export const RUNTIME_ORIGIN_NAME = "EasyTraps";

export const INSTANT_TEMPLATE_CLEANUP_MS = 8000;

export const INTERNAL_CASTER_SCHEMA = 2;

export const INTERNAL_CASTER_CR = 5;

export const INTERNAL_CASTER_SPELLCASTING_ABILITY = "int";

export const INTERNAL_CASTER_INTELLIGENCE = 18;

export const RUNTIME_SPELL_SCHEMA = 5;

export const DEFAULT_SPELL_SAVE_DC = 13;

export const DEFAULT_SPELL_ATTACK_BONUS = 4;

export const DEFAULT_PAUSE_ON_TRIGGER = true;

export const DEFAULT_DISARM_AFTER_TRIGGER = true;

export const TRANSPARENT_TOKEN_TEXTURE = `modules/${MODULE_ID}/assets/transparent.svg`;

export const SOCKET_CHANNEL = `module.${MODULE_ID}`;

export const DISARM_PREFLIGHT_TIMEOUT_MS = 15000;

export const DISARM_RESOLUTION_TIMEOUT_MS = 120000;

export const DISARM_MAX_DISTANCE_FT = 5;

export const DISARM_INTERACTION_LOCK_TIMEOUT_MS = 120000;

export const DISARM_CANCELLED_PREFLIGHT_TTL_MS = 5 * 60 * 1000;

export const DISCOVERY_VISION_RECHECK_DELAY_MS = 80;

export const DOOR_TRIGGER_ACTIVATION_DELAY_MS = 350;

export const ITEM_PILE_INTERACTION_DEDUPE_MS = 3000;

export const ITEM_PILE_INTERACTION_DEDUPE_WINDOW_MS = 1500;

export const CANVAS_PAN_DURATION_MS = 350;

export const PLAYER_TRAP_HOVER_FADE_MS = 90;

export const PLAYER_TRAP_PULSE_MS = 110;

export const SETUP_TARGET_RESTORE_DELAY_MS = 150;

export const PLACEMENT_POINTER_RELEASE_TIMEOUT_MS = 5000;

export const DOOR_SOURCE_BAND_GRID_RATIO = 0.10;

export const RANGE_EPSILON_FT = 0.05;

export const DOOR_SOURCE_BAND_MIN_PX = 8;

export const DOOR_SOURCE_BAND_MAX_PX = 18;

export const DOOR_LOS_FACE_OFFSET_GRID_RATIO = 0.035;

export const DOOR_LOS_FACE_OFFSET_MIN_PX = 2;

export const DOOR_LOS_FACE_OFFSET_MAX_PX = 6;

export const RUNTIME_ORIGIN_VFX_SWEEP_DELAYS_MS = Object.freeze([50, 250, 750, 1800, 6000]);

export const DISARM_ATTEMPT_SOUND = `modules/${MODULE_ID}/assets/audio/disarm-attempt-key-lock.ogg`;

export const ALARM_TRAP_NAME = "Alarm Trap";

export const SETTINGS = Object.freeze({
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

export const DEFAULT_FAVORITE_SPELL_NAMES = Object.freeze([
  "Burning Hands",
  "Web",
  "Fireball",
  "Magic Missile",
  "Lightning Bolt",
  "Cone of Cold"
]);

export const ORIGIN_MODES = Object.freeze({
  TRIGGER_TILE: "trigger-tile",
  SEPARATE_TILE: "separate-tile",
  TRIGGERING_TOKEN: "triggering-token"
});

export const TARGET_MODES = Object.freeze({
  TRIGGERING_TOKEN: "triggering-token",
  SPELL_AREA: "spell-area",
  CUSTOM_ZONE: "custom-zone",
  NONE: "none"
});

export const TARGETING_PROFILES = Object.freeze({
  NATIVE_AREA: "native-area",
  DIRECT: "direct-target",
  SELF: "self",
  NONE: "no-target",
  INTERACTIVE: "native-interactive"
});

export const TEMPLATE_BINDINGS = Object.freeze({
  ORIGIN_LINKED: "origin-linked",
  SCENE_FIXED: "scene-fixed"
});

export const AREA_MODES = Object.freeze({
  PREPLACED: "preplaced",
  ON_TRIGGER: "on-trigger",
  NONE: "none"
});

export const WORKFLOW_MODES = Object.freeze({
  NATIVE_SPELL: "native-spell",
  UNSUPPORTED: "unsupported"
});
