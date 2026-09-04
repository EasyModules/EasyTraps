/**
 * Normalize the caster level used by a trap cantrip. D&D5e cantrips scale from
 * caster level rather than spell-slot level, so this value deliberately stays
 * separate from EasyTraps' leveled-spell castLevel flag.
 */
export function normalizeCantripCasterLevel(value, fallback = 1) {
  const fallbackLevel = Math.min(20, Math.max(1, Math.trunc(Number(fallback)) || 1));
  const level = Math.trunc(Number(value));
  return Number.isFinite(level) ? Math.min(20, Math.max(1, level)) : fallbackLevel;
}

/**
 * Return D&D5e's native cantrip scaling steps above baseline for caster levels
 * 1-20: 1-4 => 0, 5-10 => 1, 11-16 => 2, 17-20 => 3.
 */
export function cantripScalingIncrease(casterLevel) {
  const level = normalizeCantripCasterLevel(casterLevel);
  return Math.floor((level + 1) / 6);
}


/**
 * Build the minimal actor-like data EasyFix's public Multi-Hit counter expects
 * when resolving cantrip tiers. EasyTraps uses a technical caster actor whose
 * real level is intentionally unrelated to the trap's configured Caster Level,
 * so the count-only API must receive an explicit read-only level source.
 */
export function buildCantripCountActor(casterLevel) {
  const level = normalizeCantripCasterLevel(casterLevel);
  return { system: { details: { level } }, items: [] };
}

/** Build the compact 1-20 selector used by the trap wizard/quick editor. */
export function buildCantripCasterLevelOptions(selectedLevel = 1) {
  const selected = normalizeCantripCasterLevel(selectedLevel);
  return Array.from({ length: 20 }, (_entry, index) => index + 1)
    .map(level => `<option value="${level}" ${level === selected ? "selected" : ""}>Level ${level}</option>`)
    .join("");
}

/**
 * Scope a caster-level override to the transient D&D5e Item clone created by
 * Activity#use. We intentionally do not import or replace D&D5e's Scaling
 * class. Instead, reuse the constructor of the native Scaling object returned
 * by Item#getRollData so formulas keep the system's own @scaling semantics.
 *
 * @returns {boolean} whether the local override could be installed.
 */
export function installCantripRollDataScaling(item, scalingIncrease) {
  if (!item || typeof item.getRollData !== "function") return false;
  const increase = Math.max(0, Math.trunc(Number(scalingIncrease)) || 0);
  const originalGetRollData = item.getRollData;

  try {
    Object.defineProperty(item, "getRollData", {
      configurable: true,
      writable: true,
      value(...args) {
        const data = originalGetRollData.apply(this, args);
        const ScalingClass = data?.scaling?.constructor;
        if (typeof ScalingClass !== "function") return data;
        try {
          const replacement = new ScalingClass(increase);
          if (Number(replacement?.increase) === increase) data.scaling = replacement;
        } catch (_error) {
          // Fail closed to the native roll data if a future D&D5e Scaling class
          // stops supporting construction from an increase value.
        }
        return data;
      }
    });
    return true;
  } catch (_error) {
    return false;
  }
}
