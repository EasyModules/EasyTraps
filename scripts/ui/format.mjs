import { buildCantripCasterLevelOptions, normalizeCantripCasterLevel } from "../cantrip-scaling.mjs";
import { AREA_MODES, ORIGIN_MODES, TARGET_MODES } from "../core/constants.mjs";
import { normalizeCastLevel, normalizeSpellBaseLevel } from "../core/spell-model.mjs";
import {
  normalizeAreaMode,
  normalizeOriginMode,
  normalizeSpellAttackBonus,
  normalizeTargetMode
} from "../core/trap-model.mjs";

export function castLevelLabel(castLevel, baseLevel = null) {
  const base = baseLevel == null ? null : normalizeSpellBaseLevel(baseLevel);
  const level = normalizeCastLevel(castLevel, base ?? castLevel);
  if (level === 0) return "Cantrip";
  const increase = base == null ? 0 : Math.max(0, level - base);
  return increase ? `Level ${level} (upcast +${increase})` : `Level ${level}`;
}

export function cantripCasterLevelLabel(casterLevel) {
  return `Caster Level ${normalizeCantripCasterLevel(casterLevel, 1)}`;
}

export function trapExecutionLevelLabel(trap) {
  const castLevel = normalizeSpellBaseLevel(trap?.castLevel);
  return castLevel === 0
    ? cantripCasterLevelLabel(trap?.cantripCasterLevel)
    : castLevelLabel(castLevel);
}

export function buildCastLevelOptions(baseLevel, selectedLevel = baseLevel) {
  const base = normalizeSpellBaseLevel(baseLevel);
  const selected = normalizeCastLevel(selectedLevel, base);
  if (base === 0) return buildCantripCasterLevelOptions(selectedLevel);
  return Array.from({ length: 10 - base }, (_entry, index) => base + index)
    .map(level => `<option value="${level}" ${level === selected ? "selected" : ""}>${level === base ? `Level ${level} (base)` : `Level ${level}`}</option>`)
    .join("");
}

export function originModeLabel(mode) {
  const normalized = normalizeOriginMode(mode);
  if (normalized === ORIGIN_MODES.SEPARATE_TILE) return "origin: another point";
  if (normalized === ORIGIN_MODES.TRIGGERING_TOKEN) return "origin: triggering creature";
  return "origin: the trap";
}

export function formatSignedModifier(value) {
  const normalized = normalizeSpellAttackBonus(value);
  return normalized >= 0 ? `+${normalized}` : String(normalized);
}

export function targetModeLabel(mode) {
  const normalized = normalizeTargetMode(mode);
  if (normalized === TARGET_MODES.SPELL_AREA) return "Creatures in native spell area";
  if (normalized === TARGET_MODES.CUSTOM_ZONE) return "Creatures in custom target zone";
  if (normalized === TARGET_MODES.NONE) return "Native spell targeting";
  return "Triggering creature";
}

export function areaModeLabel(mode) {
  const normalized = normalizeAreaMode(mode);
  if (normalized === AREA_MODES.PREPLACED) return "Native area saved during creation";
  if (normalized === AREA_MODES.ON_TRIGGER) return "Native placement when triggered";
  return "No spell template";
}
