import { tileCenterPoint } from "./canvas-geometry.mjs";
import {
  AREA_MODES,
  DEFAULT_SPELL_ATTACK_BONUS,
  DEFAULT_SPELL_SAVE_DC,
  DEFAULT_TRIGGER_TEXTURE,
  MODULE_ID,
  ORIGIN_MODES,
  TARGETING_PROFILES,
  TARGET_MODES
} from "./constants.mjs";
import { clampCellCount, rectangleOffsets } from "../grid-trigger.mjs";
import { trapDiscoveryState } from "../trigger-sources.mjs";

export function sceneTrapDocuments(scene = canvas.scene) {
  if (!scene?.tiles) return [];
  return Array.from(scene.tiles)
    .filter(tile => Boolean(trapData(tile)))
    .sort((a, b) => {
      const armedA = trapData(a)?.armed !== false ? 0 : 1;
      const armedB = trapData(b)?.armed !== false ? 0 : 1;
      return armedA - armedB || String(a.name ?? "").localeCompare(String(b.name ?? ""));
    });
}

export function trapIsDiscovered(tile, trap = trapData(tile)) {
  return trapDiscoveryState(tile, trap);
}

export function trapData(tile) {
  const data = tile?.flags?.[MODULE_ID];
  return ["spell-grid", "spell-floor", "alarm-grid"].includes(data?.kind) ? data : null;
}

export function trapTypeOf(trap) {
  if (trap?.trapType === "alarm" || trap?.kind === "alarm-grid") return "alarm";
  return "spell";
}

export function isAlarmTrap(trap) {
  return trapTypeOf(trap) === "alarm";
}

export function trapDisplayName(trap, tile = null) {
  if (!trap) return tile?.name ?? "Trap";
  if (isAlarmTrap(trap)) return String(trap.alarmName ?? "Alarm Trap");
  return String(trap.spellName ?? tile?.name ?? "Spell Trap");
}

export function trapDisplayImage(trap) {
  return String(isAlarmTrap(trap) ? trap?.alarmImg : trap?.spellImg).trim() || DEFAULT_TRIGGER_TEXTURE;
}

export function originData(tile) {
  const data = tile?.flags?.[MODULE_ID];
  return ["spell-origin", "alarm-origin"].includes(data?.kind) ? data : null;
}

export function normalizeOriginMode(value) {
  return Object.values(ORIGIN_MODES).includes(value) ? value : ORIGIN_MODES.TRIGGER_TILE;
}

export function normalizeTargetMode(value) {
  if (value === "original") return TARGET_MODES.NONE;
  return Object.values(TARGET_MODES).includes(value) ? value : TARGET_MODES.NONE;
}

export function normalizeTargetingProfile(value) {
  return Object.values(TARGETING_PROFILES).includes(value) ? value : TARGETING_PROFILES.NONE;
}

export function normalizeAreaMode(value) {
  if (value === "original") return AREA_MODES.ON_TRIGGER;
  return Object.values(AREA_MODES).includes(value) ? value : AREA_MODES.NONE;
}

export function normalizeSpellSaveDc(value) {
  if (value === null || value === undefined || String(value).trim() === "") return DEFAULT_SPELL_SAVE_DC;
  const parsed = Math.trunc(Number(value));
  if (!Number.isFinite(parsed)) return DEFAULT_SPELL_SAVE_DC;
  return Math.min(99, Math.max(1, parsed));
}

export function normalizeSpellAttackBonus(value) {
  const text = String(value ?? "").replace(/\s+/g, "");
  if (!text) return DEFAULT_SPELL_ATTACK_BONUS;
  const parsed = Math.trunc(Number(text));
  if (!Number.isFinite(parsed)) return DEFAULT_SPELL_ATTACK_BONUS;
  return Math.min(99, Math.max(-99, parsed));
}

export function normalizeOptionalTargetCapacity(value) {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const parsed = Math.trunc(Number(value));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function triggerDimensions(trap) {
  const offsets = Array.isArray(trap?.triggerCells) && trap.triggerCells.length
    ? trap.triggerCells
    : rectangleOffsets(trap?.triggerWidth, trap?.triggerHeight);
  const width = Math.max(...offsets.map(cell => Number(cell?.dx) || 0)) + 1;
  const height = Math.max(...offsets.map(cell => Number(cell?.dy) || 0)) + 1;
  return { width: clampCellCount(width), height: clampCellCount(height) };
}

export function resolveOriginTile(triggerTile, trap, originMode) {
  if (originMode === ORIGIN_MODES.TRIGGER_TILE) return triggerTile;
  if (originMode !== ORIGIN_MODES.SEPARATE_TILE) return null;
  const scene = triggerTile.parent ?? canvas.scene;
  return scene?.tiles?.get?.(trap.originTileId)
    ?? scene?.tiles?.find?.(tile => tile.uuid === trap.originTileUuid)
    ?? null;
}

export function setupTemplateReferencePoint(triggerTile, originTile, originMode) {
  if (normalizeOriginMode(originMode) === ORIGIN_MODES.SEPARATE_TILE && originTile) return tileCenterPoint(originTile);
  // For "triggering creature", the trigger Tile is the design-time stand-in. At activation the same offsets
  // are applied from the triggering token's current center.
  return tileCenterPoint(triggerTile);
}

export function runtimeOriginFlag(token) {
  return token?.getFlag?.(MODULE_ID, "runtimeOrigin") ?? token?.flags?.[MODULE_ID]?.runtimeOrigin ?? null;
}

export function runtimeSpellFlag(item) {
  return item?.getFlag?.(MODULE_ID, "runtimeSpell") ?? item?.flags?.[MODULE_ID]?.runtimeSpell ?? null;
}
