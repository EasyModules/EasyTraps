import { TARGETING_PROFILES, WORKFLOW_MODES } from "../core/constants.mjs";

export function usableActivityList(spell) {
  return activityList(spell)
    .filter(activity => activity && activity.use instanceof Function && activity.canUse !== false);
}

export function resolveActivitySelection(spell, activityId = null) {
  const activities = usableActivityList(spell);
  if (!activities.length) {
    return { supported: false, reason: "missing-activity", activityCount: 0, activity: null, activities };
  }
  if (activityId) {
    const activity = activities.find(candidate => candidate.id === activityId) ?? null;
    return activity
      ? { supported: true, reason: "selected-native-activity", activityCount: activities.length, activity, activities }
      : { supported: false, reason: "activity-changed", activityCount: activities.length, activity: null, activities };
  }
  if (activities.length === 1) {
    return { supported: true, reason: "single-native-activity", activityCount: 1, activity: activities[0], activities };
  }
  return { supported: false, reason: "activity-choice-required", activityCount: activities.length, activity: null, activities };
}

export function findActivity(spell, activityId) {
  if (!activityId) return null;
  return usableActivityList(spell).find(activity => activity.id === activityId) ?? null;
}

export function activityLabel(activity) {
  const name = String(activity?.name ?? "").trim();
  const type = String(activity?.type ?? "activity");
  return name || type.charAt(0).toUpperCase() + type.slice(1);
}

export function plainData(value) {
  if (!value) return {};
  try { return foundry.utils.deepClone(value.toObject?.() ?? value); }
  catch (_error) { return {}; }
}

export function targetFieldHasValue(value) {
  if (value === 0 || value === false) return true;
  if (Array.isArray(value)) return value.length > 0;
  if (value && typeof value === "object") return Object.values(value).some(targetFieldHasValue);
  return value !== null && value !== undefined && String(value).trim() !== "";
}

export function fillMissingTargetFields(target, prepared) {
  const output = foundry.utils.deepClone(target ?? {});
  for (const key of ["affects", "template"]) {
    output[key] ??= {};
    const fallback = prepared?.[key] ?? {};
    for (const [field, value] of Object.entries(fallback)) {
      if (!targetFieldHasValue(output[key]?.[field]) && targetFieldHasValue(value)) {
        output[key][field] = foundry.utils.deepClone(value);
      }
    }
  }
  return output;
}

export function resolveEffectiveTarget(spell, activity) {
  const itemTarget = plainData(spell?.system?.target);
  const preparedTarget = plainData(activity?.target);
  const sourceTarget = plainData(activity?.toObject?.()?.target ?? activity?.target);
  if (sourceTarget.override === true) return sourceTarget;
  // With override disabled, D&D5e inherits targeting from the Item. Activity target source data mostly contains
  // defaults plus its own prompt flag, so it must not overwrite a populated Item template with blank defaults.
  const effective = fillMissingTargetFields(itemTarget, preparedTarget);
  effective.override = false;
  effective.prompt = sourceTarget.prompt ?? preparedTarget.prompt ?? itemTarget.prompt ?? true;
  return effective;
}

export function effectiveTemplateShape(target) {
  const type = String(target?.template?.type ?? "").trim();
  if (!type) return null;
  const config = globalThis.dnd5e?.config ?? game.dnd5e?.config ?? CONFIG.DND5E;
  return config?.areaTargetTypes?.[type]?.template ?? null;
}

export function activityHasPromptedTemplate(activity, spell = activity?.item, effectiveTarget = null) {
  const target = effectiveTarget ?? resolveEffectiveTarget(spell, activity);
  return Boolean(effectiveTemplateShape(target)) && target.prompt !== false;
}

export function creatureTargetType(target) {
  return ["creature", "willing", "creatureOrObject", "any", "ally", "enemy"]
    .includes(String(target?.affects?.type ?? "").trim());
}

export function templateSuppliesCreatureTargets(target) {
  const affects = String(target?.affects?.type ?? "").trim();
  return !["object", "space", "self"].includes(affects);
}

export function activityNeedsNativeConfiguration(activity, targetingProfile) {
  const type = String(activity?.type ?? "").trim();
  return targetingProfile === TARGETING_PROFILES.INTERACTIVE
    || ["summon", "enchant", "transform", "forward", "cast"].includes(type);
}

export function classifyTargetingProfile(target, activity = null) {
  const affects = String(target?.affects?.type ?? "").trim();
  const activityType = String(activity?.type ?? "").trim();
  if (effectiveTemplateShape(target) && target.prompt !== false) return TARGETING_PROFILES.NATIVE_AREA;
  if (creatureTargetType(target)) return TARGETING_PROFILES.DIRECT;
  // A D&D5e attack Activity consumes selected token targets even when an imported Item left affects.type blank.
  // This follows the Activity contract; it does not infer a spell rule from the spell name or description.
  if (!affects && activityType === "attack") return TARGETING_PROFILES.DIRECT;
  if (affects === "self") return TARGETING_PROFILES.SELF;
  if (["object", "space"].includes(affects)) return TARGETING_PROFILES.INTERACTIVE;
  if (["summon", "enchant", "transform", "forward", "cast"].includes(activityType)) {
    return TARGETING_PROFILES.INTERACTIVE;
  }
  return TARGETING_PROFILES.NONE;
}

export function activitySelectionErrorMessage(spell, resolution) {
  if (resolution?.reason === "activity-changed") return `${spell.name}'s saved Activity no longer exists or cannot currently be used. Recreate the trap.`;
  if (resolution?.reason === "activity-choice-required") return `${spell.name} has more than one usable Activity and requires a choice.`;
  return `${spell.name} has no usable D&D5e Activity.`;
}

export function activityList(spell) {
  const activities = spell.system?.activities;
  if (!activities) return [];
  if (Array.isArray(activities)) return activities;
  if (Array.isArray(activities.contents)) return activities.contents;
  if (activities.values instanceof Function) return Array.from(activities.values());
  return Object.values(activities);
}

export function planSpellWorkflow(spell, activityId) {
  const resolution = resolveActivitySelection(spell, activityId);
  if (!resolution.supported) {
    return {
      mode: WORKFLOW_MODES.UNSUPPORTED,
      supported: false,
      reason: resolution.reason,
      activityCount: resolution.activityCount,
      activityId
    };
  }
  const activity = resolution.activity;
  return {
    mode: WORKFLOW_MODES.NATIVE_SPELL,
    supported: true,
    activityId: activity.id,
    activityType: String(activity.type ?? "activity"),
    activityCount: resolution.activityCount,
    reason: "selected-activity-native-spell-item"
  };
}

export function workflowUnsupportedMessage(plan) {
  const reason = String(plan?.reason ?? "unsupported");
  if (reason === "activity-choice-required") return "This trap does not contain a saved Activity choice. Recreate it.";
  if (reason === "activity-changed") return "The spell's saved Activity changed or is no longer usable. Recreate the trap.";
  if (reason === "missing-activity") return "The spell Activity saved by this trap could not be found.";
  return "The selected spell Activity is not available through the native D&D5e Item workflow.";
}
