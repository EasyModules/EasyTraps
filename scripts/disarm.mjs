/**
 * EasyTraps disarm rule helpers.
 *
 * These helpers intentionally keep the rules layer separate from canvas/socket
 * plumbing so disarm decisions remain deterministic and easy to maintain.
 */

import { itemMatchesRequirement } from "./discovery.mjs";

export function normalizeDisarmDc(value, fallback = 15) {
  const parsed = Math.trunc(Number(value));
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(99, Math.max(1, parsed));
}

export function normalizeDangerousThreshold(value, fallback = 5) {
  const parsed = Math.trunc(Number(value));
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(99, Math.max(0, parsed));
}

export function disarmDcFromTrap(trap, fallback = 15) {
  return normalizeDisarmDc(trap?.discovery?.disarm?.dc, fallback);
}

export function firstUsableDisarmRoll(result) {
  const rolls = Array.isArray(result)
    ? result
    : Array.isArray(result?.rolls)
      ? result.rolls
      : result?.total !== undefined
        ? [result]
        : [];

  return rolls.find(roll => Number.isFinite(Number(roll?.total))) ?? null;
}

/** Return the active d20 face from a D&D5e D20Roll, including adv/disadv. */
export function naturalD20FromRoll(roll) {
  for (const die of Array.from(roll?.dice ?? [])) {
    if (Number(die?.faces) !== 20) continue;
    const results = Array.from(die?.results ?? []);
    const active = results.find(result => result?.active !== false && result?.discarded !== true);
    const value = Number(active?.result);
    if (Number.isInteger(value) && value >= 1 && value <= 20) return value;
  }
  return null;
}

function skillProficiencyLevel(actor, skillId = "slt") {
  const skill = actor?.system?.skills?.[skillId];
  if (!skill) return 0;
  const candidates = [
    skill.proficient,
    skill.value,
    skill.prof?.multiplier,
    skill.prof?.value
  ];
  return candidates.reduce((highest, candidate) => {
    const value = Number(candidate);
    return Number.isFinite(value) && value > highest ? value : highest;
  }, 0);
}

export function actorHasSkillProficiency(actor, skillId = "slt") {
  // D&D5e uses 0.5 for half-proficiency features such as Jack of All Trades.
  // A setting that explicitly requires proficiency should accept normal
  // proficiency (1) and expertise (2), but not half proficiency.
  return skillProficiencyLevel(actor, skillId) >= 1;
}

function requirementConfigured(requirement = {}) {
  if (requirement.requiredItemEnabled === false) return false;
  const hasIdentity = [
    requirement.requiredToolUuid,
    requirement.requiredToolSourceUuid,
    requirement.requiredToolIdentifier,
    requirement.requiredToolName
  ].some(value => Boolean(String(value ?? "").trim()));
  if (requirement.requiredItemEnabled === true) return hasIdentity;
  // Legacy data before schema 26 implied the requirement from Item identity.
  return hasIdentity;
}

function findRequiredItem(actor, requirement = {}) {
  if (!requirementConfigured(requirement)) return null;
  return Array.from(actor?.items ?? []).find(item => itemMatchesRequirement(item, requirement)) ?? null;
}

export function normalizeDisarmAttempts(value = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const result = {};
  for (const [actorId, record] of Object.entries(value)) {
    if (!actorId || !record || typeof record !== "object" || Array.isArray(record)) continue;
    result[actorId] = {
      count: Math.max(1, Math.trunc(Number(record.count) || 1)),
      lastTotal: Number.isFinite(Number(record.lastTotal)) ? Number(record.lastTotal) : null,
      lastNatural: Number.isInteger(Number(record.lastNatural)) ? Number(record.lastNatural) : null,
      lastSuccess: record.lastSuccess === true,
      lastTriggered: record.lastTriggered === true,
      userId: String(record.userId ?? ""),
      timestamp: Number.isFinite(Number(record.timestamp)) ? Number(record.timestamp) : null
    };
  }
  return result;
}

export function actorHasDisarmAttempt(attempts, actorId) {
  if (!actorId) return false;
  return Boolean(normalizeDisarmAttempts(attempts)[String(actorId)]);
}

export function recordDisarmAttempt(attempts, actorId, data = {}) {
  const id = String(actorId ?? "").trim();
  const next = normalizeDisarmAttempts(attempts);
  if (!id) return next;
  const prior = next[id];
  next[id] = {
    count: (prior?.count ?? 0) + 1,
    lastTotal: Number.isFinite(Number(data.total)) ? Number(data.total) : null,
    lastNatural: Number.isInteger(Number(data.naturalD20)) ? Number(data.naturalD20) : null,
    lastSuccess: data.success === true,
    lastTriggered: data.triggered === true,
    userId: String(data.userId ?? ""),
    timestamp: Number.isFinite(Number(data.timestamp)) ? Number(data.timestamp) : Date.now()
  };
  return next;
}

/**
 * Validate all gates which must pass before a native Sleight of Hand roll.
 * The same helper is used on the player client and re-run authoritatively by GM.
 */
export function evaluateDisarmEligibility({
  actor,
  config,
  attempts = {}
} = {}) {
  const disarm = config?.disarm ?? {};
  if (!actor) return Object.freeze({ allowed: false, reason: "missing-actor", message: "The attempting character is unavailable." });

  if (disarm.requireProficiency === true && !actorHasSkillProficiency(actor, "slt")) {
    return Object.freeze({ allowed: false, reason: "skill-proficiency", message: "This trap requires proficiency in Sleight of Hand." });
  }

  const hasRequirement = requirementConfigured(disarm);
  const requiredItem = hasRequirement ? findRequiredItem(actor, disarm) : null;
  if (hasRequirement && !requiredItem) {
    const name = String(disarm.requiredToolName ?? "").trim();
    return Object.freeze({
      allowed: false,
      reason: "required-item",
      message: name ? `You need ${name} to attempt this disarm.` : "You do not have the required item for this trap.",
      requiredItem: null
    });
  }


  if (disarm.oneAttemptPerActor !== false && actorHasDisarmAttempt(attempts, actor.id)) {
    return Object.freeze({
      allowed: false,
      reason: "already-attempted",
      message: "This character has already attempted to disarm this trap.",
      requiredItem
    });
  }

  return Object.freeze({ allowed: true, reason: "ok", message: "", requiredItem });
}

/**
 * Resolve a completed native disarm roll, including optional critical/dangerous
 * consequences. Dangerous failure only applies to an actual failed check.
 */
export function evaluateDisarmAttempt({ total, dc, naturalD20 = null, config = {} } = {}) {
  const numericTotal = Number(total);
  const normalizedDc = normalizeDisarmDc(dc);
  if (!Number.isFinite(numericTotal)) {
    return Object.freeze({
      valid: false,
      success: false,
      total: null,
      dc: normalizedDc,
      naturalD20: null,
      triggerTrap: false,
      triggerReason: null,
      reason: "invalid-total"
    });
  }

  const d20 = Number.isInteger(Number(naturalD20)) && Number(naturalD20) >= 1 && Number(naturalD20) <= 20
    ? Number(naturalD20)
    : null;
  const disarm = config?.disarm ?? config ?? {};
  const naturalOneTriggers = disarm.naturalOneTriggers === true;
  const alwaysDisarmOnCritical = disarm.alwaysDisarmOnCritical === true;
  const forcedNaturalFailure = naturalOneTriggers && d20 === 1;
  const forcedNaturalSuccess = alwaysDisarmOnCritical && d20 === 20;
  const success = forcedNaturalSuccess || (!forcedNaturalFailure && numericTotal >= normalizedDc);
  const dangerousThreshold = Math.min(
    normalizeDangerousThreshold(disarm.dangerousThreshold),
    Math.max(0, normalizedDc - 1)
  );
  const dangerous = !success
    && disarm.dangerousFailure === true
    && numericTotal <= dangerousThreshold;
  const triggerTrap = forcedNaturalFailure || dangerous;
  const triggerReason = forcedNaturalFailure ? "natural-one" : dangerous ? "dangerous-failure" : null;

  return Object.freeze({
    valid: true,
    success,
    total: numericTotal,
    dc: normalizedDc,
    naturalD20: d20,
    triggerTrap,
    triggerReason,
    reason: success ? "success" : triggerTrap ? triggerReason : "failure"
  });
}

