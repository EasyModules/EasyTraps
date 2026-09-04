/**
 * Stable Discovery & Disarming data model.
 *
 * Rules-facing defaults keep Thieves' Tools as an optional physical requirement
 * for a standard mechanical disarm. The factory baseline leaves that requirement
 * disabled. The selected Item is a possession requirement only; EasyTraps does
 * not maintain a second hidden tool-proficiency gate. Failure-trigger consequences are
 * opt-in because they are properties of specific traps, not a universal rule.
 *
 * EasyTraps-only automation controls (passive discovery, range, line of sight,
 * pausing, and one-attempt bookkeeping) remain configurable conveniences.
 * Passive discovery consumes D&D5e's own derived Passive Perception value
 * (`actor.system.skills.prc.passive`). D&D5e 5.3 keeps skill roll mode separate
 * from that value, so EasyTraps applies only the 2024 passive ±5 adjustment
 * when Perception currently has advantage or disadvantage.
 */

export const THIEVES_TOOLS_2024_REQUIREMENT = Object.freeze({
  uuid: "Compendium.dnd5e.equipment24.Item.phbtulThievesToo",
  name: "Thieves' Tools",
  img: "icons/tools/hand/lockpicks-steel-grey.webp",
  type: "tool",
  identifier: "thieves-tools",
  sourceUuid: "Compendium.dnd5e.equipment24.Item.phbtulThievesToo"
});

export const DEFAULT_DISCOVERY_CONFIG = Object.freeze({
  enabled: true,
  detection: Object.freeze({
    dc: 15,
    skill: "perception",
    passive: true,
    distance: 30,
    requireLOS: true,
    pauseOnDiscovery: true
  }),
  disarm: Object.freeze({
    dc: 15,
    skill: "sleightOfHand",
    requireProficiency: false,
    requiredItemEnabled: false,
    requiredToolUuid: THIEVES_TOOLS_2024_REQUIREMENT.uuid,
    requiredToolName: THIEVES_TOOLS_2024_REQUIREMENT.name,
    requiredToolImg: THIEVES_TOOLS_2024_REQUIREMENT.img,
    requiredToolType: THIEVES_TOOLS_2024_REQUIREMENT.type,
    requiredToolIdentifier: THIEVES_TOOLS_2024_REQUIREMENT.identifier,
    requiredToolSourceUuid: THIEVES_TOOLS_2024_REQUIREMENT.sourceUuid,
    oneAttemptPerActor: true,
    showDcInChat: false,
    // A failed check does not universally activate a trap. Individual traps
    // can opt into dangerous failure or a natural-1 consequence.
    dangerousFailure: false,
    dangerousThreshold: 5,
    // A natural 1 is not a universal automatic failure for 2024 ability checks.
    naturalOneTriggers: false,
    alwaysDisarmOnCritical: false
  })
});

const LEGACY_V036_DEFAULT = Object.freeze({
  enabled: false,
  detection: Object.freeze({
    dc: 15,
    skill: "perception",
    passive: true,
    distance: 30,
    requireLOS: true,
    pauseOnDiscovery: true
  }),
  disarm: Object.freeze({
    dc: 15,
    skill: "sleightOfHand",
    requireProficiency: false,
    requiredToolUuid: "",
    requiredToolName: "",
    requiredToolImg: "",
    requiredToolType: "",
    requiredToolIdentifier: "",
    oneAttemptPerActor: true,
    showDcInChat: false,
    dangerousFailure: false,
    dangerousThreshold: 5,
    naturalOneTriggers: false,
    alwaysDisarmOnCritical: false
  })
});

const V040_FACTORY_DEFAULT = Object.freeze({
  enabled: true,
  detection: Object.freeze({
    dc: 15, skill: "perception", passive: true, distance: 30, requireLOS: true, pauseOnDiscovery: true
  }),
  disarm: Object.freeze({
    dc: 15, requireProficiency: false, requiredToolUuid: "", requiredToolIdentifier: "",
    oneAttemptPerActor: true, showDcInChat: false, dangerousFailure: true,
    dangerousThreshold: 14, naturalOneTriggers: false,
    alwaysDisarmOnCritical: false
  })
});

const V041_FACTORY_DEFAULT = Object.freeze({
  enabled: true,
  detection: Object.freeze({ dc: 15, skill: "perception", passive: true, distance: 30, requireLOS: true, pauseOnDiscovery: true }),
  disarm: Object.freeze({
    dc: 15, requireProficiency: false,
    requiredToolUuid: THIEVES_TOOLS_2024_REQUIREMENT.uuid,
    requiredToolName: THIEVES_TOOLS_2024_REQUIREMENT.name,
    requiredToolImg: THIEVES_TOOLS_2024_REQUIREMENT.img,
    requiredToolType: THIEVES_TOOLS_2024_REQUIREMENT.type,
    requiredToolIdentifier: THIEVES_TOOLS_2024_REQUIREMENT.identifier,
    requiredToolSourceUuid: THIEVES_TOOLS_2024_REQUIREMENT.sourceUuid,
    oneAttemptPerActor: true, showDcInChat: false, dangerousFailure: false,
    dangerousThreshold: 14, naturalOneTriggers: false,
    alwaysDisarmOnCritical: false
  })
});

const V043_FACTORY_DEFAULT = Object.freeze({
  enabled: true,
  detection: Object.freeze({ dc: 15, skill: "perception", passive: true, distance: 30, requireLOS: true, pauseOnDiscovery: true }),
  disarm: Object.freeze({
    dc: 15, requireProficiency: false,
    requiredToolUuid: THIEVES_TOOLS_2024_REQUIREMENT.uuid,
    requiredToolName: THIEVES_TOOLS_2024_REQUIREMENT.name,
    requiredToolImg: THIEVES_TOOLS_2024_REQUIREMENT.img,
    requiredToolType: THIEVES_TOOLS_2024_REQUIREMENT.type,
    requiredToolIdentifier: THIEVES_TOOLS_2024_REQUIREMENT.identifier,
    requiredToolSourceUuid: THIEVES_TOOLS_2024_REQUIREMENT.sourceUuid,
    oneAttemptPerActor: true, showDcInChat: false, dangerousFailure: false,
    dangerousThreshold: 5, naturalOneTriggers: false,
    alwaysDisarmOnCritical: false
  })
});

function normalizeRuleDc(value, fallback = 15) {
  const parsed = Math.trunc(Number(value));
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(99, Math.max(1, parsed));
}

function normalizeDetectionDistance(value) {
  const parsed = Math.round(Number(value));
  if (!Number.isFinite(parsed)) return DEFAULT_DISCOVERY_CONFIG.detection.distance;
  return Math.min(999, Math.max(0, parsed));
}

function normalizeDangerousThreshold(value, disarmDc = DEFAULT_DISCOVERY_CONFIG.disarm.dc) {
  const dc = normalizeRuleDc(disarmDc, DEFAULT_DISCOVERY_CONFIG.disarm.dc);
  // Dangerous failure must always be a genuinely worse result than an ordinary
  // failed check boundary. The threshold therefore stays strictly below the
  // Disarm DC; DC 1 naturally leaves only threshold 0.
  const maximum = Math.max(0, dc - 1);
  const parsed = Math.trunc(Number(value));
  const fallback = Math.min(maximum, DEFAULT_DISCOVERY_CONFIG.disarm.dangerousThreshold);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(maximum, Math.max(0, parsed));
}

function normalizeIdentityText(value) {
  return String(value ?? "").trim();
}

function comparableName(value) {
  return normalizeIdentityText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/\s+/g, " ");
}

function getProperty(object, path) {
  const helper = globalThis.foundry?.utils?.getProperty;
  if (typeof helper === "function") return helper(object, path);
  return String(path).split(".").reduce((value, key) => value?.[key], object);
}

/**
 * Return the canonical source UUID for an Item when Foundry/D&D5e preserved it.
 * Embedded Actor Items receive new UUIDs, so their own UUID is never treated as
 * the identity of the requirement.
 */
function itemSourceUuid(item) {
  const candidates = [
    item?.getFlag?.("easy-traps", "referenceSourceUuid"),
    item?.getFlag?.("core", "sourceId"),
    getProperty(item, "flags.easy-traps.referenceSourceUuid"),
    getProperty(item, "flags.core.sourceId"),
    getProperty(item, "_stats.compendiumSource")
  ];
  const directUuid = normalizeIdentityText(item?.uuid);
  if (directUuid.startsWith("Compendium.")) candidates.push(directUuid);
  return candidates.map(normalizeIdentityText).find(Boolean) ?? "";
}

/** Build stable requirement metadata from any Item document. */
export function itemRequirementIdentity(item) {
  return {
    uuid: normalizeIdentityText(item?.uuid),
    name: normalizeIdentityText(item?.name),
    img: normalizeIdentityText(item?.img),
    type: normalizeIdentityText(item?.type),
    identifier: normalizeIdentityText(getProperty(item, "system.identifier")),
    sourceUuid: itemSourceUuid(item)
  };
}

/**
 * Match an owned Item against a saved requirement by identity, not instance.
 * Priority: canonical source UUID -> D&D5e identifier -> same type + name.
 */
export function itemMatchesRequirement(item, requirement = {}) {
  if (!item) return false;
  const wantedUuid = normalizeIdentityText(requirement.requiredToolUuid ?? requirement.uuid);
  const wantedSource = normalizeIdentityText(requirement.requiredToolSourceUuid ?? requirement.sourceUuid);
  const wantedIdentifier = normalizeIdentityText(requirement.requiredToolIdentifier ?? requirement.identifier);
  const wantedName = normalizeIdentityText(requirement.requiredToolName ?? requirement.name);
  const wantedType = normalizeIdentityText(requirement.requiredToolType ?? requirement.type);

  const hasRequirement = Boolean(wantedUuid || wantedSource || wantedIdentifier || wantedName);
  if (!hasRequirement) return false;

  const candidate = itemRequirementIdentity(item);
  const candidateSources = new Set([candidate.sourceUuid, candidate.uuid].filter(Boolean));
  const wantedSources = new Set([wantedSource, wantedUuid.startsWith("Compendium.") ? wantedUuid : ""].filter(Boolean));
  if ([...wantedSources].some(source => candidateSources.has(source))) return true;

  if (wantedIdentifier && candidate.identifier && wantedIdentifier === candidate.identifier) {
    if (!wantedType || !candidate.type || wantedType === candidate.type) return true;
  }

  if (wantedName && candidate.name && comparableName(wantedName) === comparableName(candidate.name)) {
    if (!wantedType || !candidate.type || wantedType === candidate.type) return true;
  }

  return false;
}

/**
 * Check whether an Actor possesses any copy of the configured required Item.
 * An exact embedded Item UUID is deliberately not required.
 */
export function actorHasRequiredItem(actor, requirement = {}) {
  const wantedUuid = normalizeIdentityText(requirement.requiredToolUuid ?? requirement.uuid);
  const wantedSource = normalizeIdentityText(requirement.requiredToolSourceUuid ?? requirement.sourceUuid);
  const wantedIdentifier = normalizeIdentityText(requirement.requiredToolIdentifier ?? requirement.identifier);
  const wantedName = normalizeIdentityText(requirement.requiredToolName ?? requirement.name);
  if (!(wantedUuid || wantedSource || wantedIdentifier || wantedName)) return true;
  const items = Array.from(actor?.items ?? []);
  return items.some(item => itemMatchesRequirement(item, requirement));
}

export function normalizeDiscoveryConfig(value = {}) {
  const detection = value?.detection ?? {};
  const disarm = value?.disarm ?? {};
  const detectionSkill = detection.skill === "investigation" ? "investigation" : "perception";
  const configuredToolUuid = normalizeIdentityText(disarm.requiredToolUuid);
  const configuredToolSourceUuid = normalizeIdentityText(disarm.requiredToolSourceUuid);
  const configuredToolIdentifier = normalizeIdentityText(disarm.requiredToolIdentifier);
  const configuredToolName = normalizeIdentityText(disarm.requiredToolName);
  const configuredToolImg = normalizeIdentityText(disarm.requiredToolImg);
  const configuredToolType = normalizeIdentityText(disarm.requiredToolType);
  const hasConfiguredToolIdentity = Boolean(
    configuredToolUuid || configuredToolSourceUuid || configuredToolIdentifier || configuredToolName
  );
  // v0.4.5 separates the selected Item from whether that Item is currently
  // required. Legacy data inferred the requirement from the presence of Item
  // identity, so preserve that behavior when the explicit boolean is absent.
  const requiredItemEnabled = typeof disarm.requiredItemEnabled === "boolean"
    ? disarm.requiredItemEnabled
    : hasConfiguredToolIdentity;
  const requiredToolUuid = hasConfiguredToolIdentity ? configuredToolUuid : THIEVES_TOOLS_2024_REQUIREMENT.uuid;
  const requiredToolSourceUuid = hasConfiguredToolIdentity ? configuredToolSourceUuid : THIEVES_TOOLS_2024_REQUIREMENT.sourceUuid;
  const requiredToolIdentifier = hasConfiguredToolIdentity ? configuredToolIdentifier : THIEVES_TOOLS_2024_REQUIREMENT.identifier;
  const requiredToolName = hasConfiguredToolIdentity ? configuredToolName : THIEVES_TOOLS_2024_REQUIREMENT.name;
  const requiredToolImg = hasConfiguredToolIdentity ? configuredToolImg : THIEVES_TOOLS_2024_REQUIREMENT.img;
  const requiredToolType = hasConfiguredToolIdentity ? configuredToolType : THIEVES_TOOLS_2024_REQUIREMENT.type;

  const disarmDc = normalizeRuleDc(disarm.dc, DEFAULT_DISCOVERY_CONFIG.disarm.dc);

  return {
    enabled: value?.enabled === true,
    detection: {
      dc: normalizeRuleDc(detection.dc, DEFAULT_DISCOVERY_CONFIG.detection.dc),
      skill: detectionSkill,
      passive: detectionSkill === "perception" && detection.passive !== false,
      distance: normalizeDetectionDistance(detection.distance),
      requireLOS: detection.requireLOS !== false,
      pauseOnDiscovery: detection.pauseOnDiscovery !== false
    },
    disarm: {
      dc: disarmDc,
      skill: "sleightOfHand",
      requireProficiency: disarm.requireProficiency === true,
      requiredItemEnabled,
      requiredToolUuid,
      requiredToolName,
      requiredToolImg,
      requiredToolType,
      requiredToolIdentifier,
      requiredToolSourceUuid,
      oneAttemptPerActor: disarm.oneAttemptPerActor !== false,
      showDcInChat: disarm.showDcInChat === true,
      dangerousFailure: disarm.dangerousFailure === true,
      dangerousThreshold: normalizeDangerousThreshold(disarm.dangerousThreshold, disarmDc),
      naturalOneTriggers: disarm.naturalOneTriggers === true,
      alwaysDisarmOnCritical: disarm.alwaysDisarmOnCritical === true
    }
  };
}

export function isUnmodifiedV036DiscoveryDefaults(value = {}) {
  const detection = value?.detection ?? {};
  const disarm = value?.disarm ?? {};
  return value?.enabled === LEGACY_V036_DEFAULT.enabled
    && Number(detection.dc) === LEGACY_V036_DEFAULT.detection.dc
    && String(detection.skill ?? "perception") === LEGACY_V036_DEFAULT.detection.skill
    && detection.passive !== false
    && Number(detection.distance) === LEGACY_V036_DEFAULT.detection.distance
    && detection.requireLOS !== false
    && detection.pauseOnDiscovery !== false
    && Number(disarm.dc) === LEGACY_V036_DEFAULT.disarm.dc
    && disarm.requireProficiency !== true
    && !normalizeIdentityText(disarm.requiredToolUuid)
    && !normalizeIdentityText(disarm.requiredToolIdentifier)
    && disarm.oneAttemptPerActor !== false
    && disarm.dangerousFailure !== true
    && Number(disarm.dangerousThreshold ?? 5) === LEGACY_V036_DEFAULT.disarm.dangerousThreshold
    && disarm.naturalOneTriggers !== true
    && disarm.alwaysDisarmOnCritical !== true;
}

export function isUnmodifiedV040DiscoveryDefaults(value = {}) {
  const detection = value?.detection ?? {};
  const disarm = value?.disarm ?? {};
  return value?.enabled === V040_FACTORY_DEFAULT.enabled
    && Number(detection.dc) === V040_FACTORY_DEFAULT.detection.dc
    && String(detection.skill ?? "perception") === V040_FACTORY_DEFAULT.detection.skill
    && detection.passive !== false
    && Number(detection.distance) === V040_FACTORY_DEFAULT.detection.distance
    && detection.requireLOS !== false
    && detection.pauseOnDiscovery !== false
    && Number(disarm.dc) === V040_FACTORY_DEFAULT.disarm.dc
    && disarm.requireProficiency !== true
    && !normalizeIdentityText(disarm.requiredToolUuid)
    && !normalizeIdentityText(disarm.requiredToolIdentifier)
    && !normalizeIdentityText(disarm.requiredToolName)
    && disarm.oneAttemptPerActor !== false
    && disarm.dangerousFailure === true
    && Number(disarm.dangerousThreshold) === V040_FACTORY_DEFAULT.disarm.dangerousThreshold
    && disarm.naturalOneTriggers !== true
    && disarm.alwaysDisarmOnCritical !== true;
}

export function isUnmodifiedV041DiscoveryDefaults(value = {}) {
  const normalized = normalizeDiscoveryConfig(value);
  const detection = normalized.detection;
  const disarm = normalized.disarm;
  return normalized.enabled === V041_FACTORY_DEFAULT.enabled
    && detection.dc === V041_FACTORY_DEFAULT.detection.dc
    && detection.skill === V041_FACTORY_DEFAULT.detection.skill
    && detection.passive === V041_FACTORY_DEFAULT.detection.passive
    && detection.distance === V041_FACTORY_DEFAULT.detection.distance
    && detection.requireLOS === V041_FACTORY_DEFAULT.detection.requireLOS
    && detection.pauseOnDiscovery === V041_FACTORY_DEFAULT.detection.pauseOnDiscovery
    && disarm.dc === V041_FACTORY_DEFAULT.disarm.dc
    && disarm.requireProficiency === false
    && disarm.requiredToolIdentifier === THIEVES_TOOLS_2024_REQUIREMENT.identifier
    && disarm.oneAttemptPerActor === true
    && disarm.dangerousFailure === false
    && Number(value?.disarm?.dangerousThreshold) === 14
    && disarm.naturalOneTriggers === false
    && disarm.alwaysDisarmOnCritical === false;
}

export function isUnmodifiedV043DiscoveryDefaults(value = {}) {
  const normalized = normalizeDiscoveryConfig(value);
  const detection = normalized.detection;
  const disarm = normalized.disarm;
  return normalized.enabled === V043_FACTORY_DEFAULT.enabled
    && detection.dc === V043_FACTORY_DEFAULT.detection.dc
    && detection.skill === V043_FACTORY_DEFAULT.detection.skill
    && detection.passive === V043_FACTORY_DEFAULT.detection.passive
    && detection.distance === V043_FACTORY_DEFAULT.detection.distance
    && detection.requireLOS === V043_FACTORY_DEFAULT.detection.requireLOS
    && detection.pauseOnDiscovery === V043_FACTORY_DEFAULT.detection.pauseOnDiscovery
    && disarm.dc === V043_FACTORY_DEFAULT.disarm.dc
    && disarm.requireProficiency === false
    && disarm.requiredToolIdentifier === THIEVES_TOOLS_2024_REQUIREMENT.identifier
    && disarm.oneAttemptPerActor === true
    && disarm.dangerousFailure === false
    && disarm.dangerousThreshold === 5
    && disarm.naturalOneTriggers === false
    && disarm.alwaysDisarmOnCritical === false;
}

export function migrateDiscoveryConfig(value = {}, { fromSchema = 0 } = {}) {
  const source = value && typeof value === "object" ? structuredClone(value) : {};
  const schema = Number(fromSchema) || 0;

  // v0.3.5/schema 23 briefly stored a detector-proficiency gate and defaulted
  // one-attempt-per-Actor off. Neither behavior had runtime execution yet.
  if (schema > 0 && schema < 24) {
    if (source.detection && typeof source.detection === "object") delete source.detection.requireProficiency;
    if (source.disarm && typeof source.disarm === "object" && !Object.hasOwn(source.disarm, "naturalOneTriggers")) {
      source.disarm.oneAttemptPerActor = true;
      source.disarm.naturalOneTriggers = false;
    }
  }

  // Schema 25 adds canonical Item-source identity. Existing UUID/name/identifier
  // metadata remains valid and is enough for backwards-compatible matching.
  if (schema > 0 && schema < 25 && source.disarm && typeof source.disarm === "object") {
    source.disarm.requiredToolSourceUuid ??= "";
  }

  // Schema 26 separates the selected required Item from the on/off requirement.
  // Older data encoded "enabled" implicitly by storing any Item identity.
  if (schema > 0 && schema < 26 && source.disarm && typeof source.disarm === "object") {
    const hadIdentity = Boolean(
      normalizeIdentityText(source.disarm.requiredToolUuid)
      || normalizeIdentityText(source.disarm.requiredToolSourceUuid)
      || normalizeIdentityText(source.disarm.requiredToolIdentifier)
      || normalizeIdentityText(source.disarm.requiredToolName)
    );
    source.disarm.requiredItemEnabled ??= hadIdentity;
  }

  // Schema 27 adds an explicit chat-card DC visibility preference. Missing
  // legacy values intentionally normalize to false so existing worlds do not
  // begin revealing a previously hidden rules value.
  if (schema > 0 && schema < 27 && source.disarm && typeof source.disarm === "object") {
    source.disarm.showDcInChat ??= false;
  }

  // Schema 29 adds an optional natural-20 house rule. Existing traps and
  // world defaults remain unchanged in behavior because the option is off.
  if (schema > 0 && schema < 29 && source.disarm && typeof source.disarm === "object") {
    source.disarm.alwaysDisarmOnCritical ??= false;
  }

  // Schema 30 retires the legacy hidden tool-proficiency gate. Required Item
  // remains a possession requirement and Sleight of Hand proficiency remains
  // independently configurable.
  if (source.disarm && typeof source.disarm === "object") {
    delete source.disarm.requireToolProficiency;
  }

  return normalizeDiscoveryConfig(source);
}

export function testSightCollision(PolygonClass, origin, destination) {
  if (typeof PolygonClass?.testCollision !== "function") {
    throw new TypeError("Foundry sight collision API is unavailable.");
  }
  // Keep the static method attached to its constructor. PointSourcePolygon's
  // inherited static testCollision implementation uses `this` as the Polygon
  // constructor internally, so extracting the function breaks Foundry v14.
  return PolygonClass.testCollision(origin, destination, { type: "sight", mode: "any" });
}

function actorPassivePerception(actor) {
  const value = Number(getProperty(actor, "system.skills.prc.passive"));
  return Number.isFinite(value) ? value : null;
}

/**
 * Convert D&D5e's skill roll mode into the passive-check modifier prescribed by
 * the 2024 rules. The system currently stores advantage as a positive mode and
 * disadvantage as a negative mode; string fallbacks make the helper resilient
 * to compatible modules which expose a descriptive value instead.
 */
export function passiveRollModeAdjustment(mode) {
  if (typeof mode === "number" && Number.isFinite(mode)) {
    if (mode > 0) return 5;
    if (mode < 0) return -5;
    return 0;
  }
  const normalized = String(mode ?? "").trim().toLocaleLowerCase();
  if (["advantage", "adv", "1", "+1"].includes(normalized)) return 5;
  if (["disadvantage", "dis", "-1"].includes(normalized)) return -5;
  return 0;
}

/** D&D5e Passive Perception including the separate 2024 adv/disadv adjustment. */
export function actorEffectivePassivePerception(actor) {
  const passive = actorPassivePerception(actor);
  if (!Number.isFinite(passive)) return null;
  const mode = getProperty(actor, "system.skills.prc.roll.mode");
  return passive + passiveRollModeAdjustment(mode);
}

/**
 * Return the closest points between two axis-aligned canvas rectangles.
 * Trigger Tiles are normalized to rotation 0 by EasyTraps, so this measures
 * creature-edge to trigger-edge distance without approximating either by its
 * center point.
 */
export function closestPointsBetweenRectangles(source = {}, target = {}) {
  const a = normalizeRectangle(source);
  const b = normalizeRectangle(target);
  const [sourceX, targetX] = nearestAxisPair(a.x, a.x + a.width, b.x, b.x + b.width);
  const [sourceY, targetY] = nearestAxisPair(a.y, a.y + a.height, b.y, b.y + b.height);
  return {
    source: { x: sourceX, y: sourceY },
    target: { x: targetX, y: targetY }
  };
}

function clampPointToRectangle(point = {}, rect = {}) {
  const value = normalizeRectangle(rect);
  return {
    x: clamp(Number(point.x) || 0, value.x, value.x + value.width),
    y: clamp(Number(point.y) || 0, value.y, value.y + value.height)
  };
}

function closestPointOnSegment(point = {}, start = {}, end = {}) {
  const px = Number(point.x) || 0;
  const py = Number(point.y) || 0;
  const ax = Number(start.x) || 0;
  const ay = Number(start.y) || 0;
  const bx = Number(end.x) || 0;
  const by = Number(end.y) || 0;
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSquared = (dx * dx) + (dy * dy);
  if (lengthSquared <= Number.EPSILON) return { x: ax, y: ay };
  const t = clamp((((px - ax) * dx) + ((py - ay) * dy)) / lengthSquared, 0, 1);
  return { x: ax + (dx * t), y: ay + (dy * t) };
}

function pointInsideRectangle(point = {}, rect = {}) {
  const value = normalizeRectangle(rect);
  const x = Number(point.x) || 0;
  const y = Number(point.y) || 0;
  return x >= value.x && x <= value.x + value.width && y >= value.y && y <= value.y + value.height;
}

function segmentIntersection(a = {}, b = {}, c = {}, d = {}) {
  const ax = Number(a.x) || 0;
  const ay = Number(a.y) || 0;
  const bx = Number(b.x) || 0;
  const by = Number(b.y) || 0;
  const cx = Number(c.x) || 0;
  const cy = Number(c.y) || 0;
  const dx = Number(d.x) || 0;
  const dy = Number(d.y) || 0;
  const rX = bx - ax;
  const rY = by - ay;
  const sX = dx - cx;
  const sY = dy - cy;
  const cross = (rX * sY) - (rY * sX);
  if (Math.abs(cross) <= Number.EPSILON) return null;
  const qX = cx - ax;
  const qY = cy - ay;
  const t = ((qX * sY) - (qY * sX)) / cross;
  const u = ((qX * rY) - (qY * rX)) / cross;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return { x: ax + (t * rX), y: ay + (t * rY) };
}

/**
 * Return the closest points between an axis-aligned rectangle and an arbitrary
 * canvas segment. Door triggers use this so 5 ft checks measure against the
 * real WallDocument segment rather than the hidden controller Tile cell.
 */
export function closestPointsBetweenRectangleAndSegment(rect = {}, start = {}, end = {}) {
  const value = normalizeRectangle(rect);
  const a = { x: Number(start.x) || 0, y: Number(start.y) || 0 };
  const b = { x: Number(end.x) || 0, y: Number(end.y) || 0 };

  if (pointInsideRectangle(a, value)) return { source: { ...a }, target: { ...a } };
  if (pointInsideRectangle(b, value)) return { source: { ...b }, target: { ...b } };

  const left = value.x;
  const right = value.x + value.width;
  const top = value.y;
  const bottom = value.y + value.height;
  const edges = [
    [{ x: left, y: top }, { x: right, y: top }],
    [{ x: right, y: top }, { x: right, y: bottom }],
    [{ x: right, y: bottom }, { x: left, y: bottom }],
    [{ x: left, y: bottom }, { x: left, y: top }]
  ];
  for (const [edgeStart, edgeEnd] of edges) {
    const intersection = segmentIntersection(a, b, edgeStart, edgeEnd);
    if (intersection) return { source: { ...intersection }, target: { ...intersection } };
  }

  const candidates = [];
  for (const endpoint of [a, b]) {
    const source = clampPointToRectangle(endpoint, value);
    candidates.push({ source, target: endpoint });
  }
  for (const corner of [
    { x: left, y: top },
    { x: right, y: top },
    { x: right, y: bottom },
    { x: left, y: bottom }
  ]) {
    candidates.push({ source: corner, target: closestPointOnSegment(corner, a, b) });
  }

  return candidates.reduce((best, candidate) => {
    const dx = candidate.target.x - candidate.source.x;
    const dy = candidate.target.y - candidate.source.y;
    const distanceSquared = (dx * dx) + (dy * dy);
    if (!best || distanceSquared < best.distanceSquared) return { ...candidate, distanceSquared };
    return best;
  }, null) ?? { source: clampPointToRectangle(a, value), target: a };
}

/**
 * Candidate points used for LOS. A visible center, edge midpoint, or inset
 * corner is sufficient; one blocked center point must not hide a partially
 * exposed trap around a wall corner.
 */
export function rectangleLosSamplePoints(rect = {}, { inset = 2 } = {}) {
  const value = normalizeRectangle(rect);
  const maxInset = Math.max(0, Math.min(value.width, value.height) / 4);
  const pad = clamp(Number(inset) || 0, 0, maxInset);
  const left = value.x + pad;
  const right = value.x + value.width - pad;
  const top = value.y + pad;
  const bottom = value.y + value.height - pad;
  const centerX = value.x + value.width / 2;
  const centerY = value.y + value.height / 2;
  return dedupePoints([
    { x: centerX, y: centerY },
    { x: centerX, y: top },
    { x: centerX, y: bottom },
    { x: left, y: centerY },
    { x: right, y: centerY },
    { x: left, y: top },
    { x: right, y: top },
    { x: left, y: bottom },
    { x: right, y: bottom }
  ]);
}

/** Decide whether a hidden EasyTraps Tile is eligible for passive discovery. */
export function isPassiveDiscoveryCandidate({ trap, hidden, busy = false } = {}) {
  if (!trap || trap.requiresReconfiguration) return false;
  if (hidden !== true || busy) return false;
  const config = normalizeDiscoveryConfig(trap.discovery);
  return config.enabled && config.detection.skill === "perception" && config.detection.passive;
}

/** Pure rules evaluation, separated from Foundry movement/geometry plumbing. */
export function evaluatePassiveDiscovery({ actor, config, distance, hasLOS = true } = {}) {
  const discovery = normalizeDiscoveryConfig(config);
  if (!actor?.hasPlayerOwner) return { discovered: false, reason: "not-player-owned" };
  if (!discovery.enabled) return { discovered: false, reason: "disabled" };
  if (discovery.detection.skill !== "perception") return { discovered: false, reason: "not-perception" };
  if (!discovery.detection.passive) return { discovered: false, reason: "passive-disabled" };

  const passive = actorEffectivePassivePerception(actor);
  if (!Number.isFinite(passive)) return { discovered: false, reason: "missing-passive" };

  const measuredDistance = Number(distance);
  if (!Number.isFinite(measuredDistance) || measuredDistance > discovery.detection.distance) {
    return { discovered: false, reason: "out-of-range", passive, distance: measuredDistance };
  }
  if (discovery.detection.requireLOS && !hasLOS) {
    return { discovered: false, reason: "blocked-los", passive, distance: measuredDistance };
  }
  if (passive < discovery.detection.dc) {
    return { discovered: false, reason: "below-dc", passive, distance: measuredDistance };
  }
  return { discovered: true, reason: "success", passive, distance: measuredDistance };
}

function normalizeRectangle(rect = {}) {
  const width = Math.max(0, Number(rect.width) || 0);
  const height = Math.max(0, Number(rect.height) || 0);
  return {
    x: Number(rect.x) || 0,
    y: Number(rect.y) || 0,
    width,
    height
  };
}

function nearestAxisPair(aMin, aMax, bMin, bMax) {
  if (aMax < bMin) return [aMax, bMin];
  if (bMax < aMin) return [aMin, bMax];
  const overlapMin = Math.max(aMin, bMin);
  const overlapMax = Math.min(aMax, bMax);
  const midpoint = (overlapMin + overlapMax) / 2;
  return [midpoint, midpoint];
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, Number(value) || 0));
}

function dedupePoints(points) {
  const seen = new Set();
  return points.filter(point => {
    const key = `${Number(point.x).toFixed(4)}:${Number(point.y).toFixed(4)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function detectionSkillLabel(skill) {
  return skill === "investigation" ? "Investigation" : "Perception";
}

export function discoverySummary(config) {
  const value = normalizeDiscoveryConfig(config);
  if (!value.enabled) return "Discovery off";
  return `${detectionSkillLabel(value.detection.skill)} DC ${value.detection.dc} · Disarm DC ${value.disarm.dc}`;
}
