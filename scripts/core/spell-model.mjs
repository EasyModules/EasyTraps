

export function normalizeSpellBaseLevel(value) {
  const level = Math.trunc(Number(value));
  return Number.isFinite(level) ? Math.min(9, Math.max(0, level)) : 0;
}

export function normalizeCastLevel(value, baseLevel = 0) {
  const base = normalizeSpellBaseLevel(baseLevel);
  if (base === 0) return 0;
  const requested = Math.trunc(Number(value));
  return Math.min(9, Math.max(base, Number.isFinite(requested) ? requested : base));
}

export function castScaling(castLevel, baseLevel = 0) {
  const base = normalizeSpellBaseLevel(baseLevel);
  return Math.max(0, normalizeCastLevel(castLevel, base) - base);
}

export function isInstantaneousSpell(spell) {
  const units = String(spell?.system?.duration?.units ?? spell?.system?.duration?.unit ?? "").toLowerCase();
  return ["inst", "instant", "instantaneous"].includes(units);
}
