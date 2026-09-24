import {
  cantripScalingIncrease,
  installCantripRollDataScaling,
  normalizeCantripCasterLevel
} from "../cantrip-scaling.mjs";
import { sceneDistanceUnits } from "../core/canvas-geometry.mjs";
import {
  DEFAULT_SPELL_ATTACK_BONUS,
  DEFAULT_SPELL_SAVE_DC,
  MODULE_ID,
  RUNTIME_SPELL_SCHEMA,
  VERSION
} from "../core/constants.mjs";
import { castScaling, normalizeCastLevel, normalizeSpellBaseLevel } from "../core/spell-model.mjs";
import {
  normalizeOptionalTargetCapacity,
  normalizeSpellAttackBonus,
  normalizeSpellSaveDc,
  runtimeSpellFlag
} from "../core/trap-model.mjs";
import {
  effectiveTemplateShape,
  findActivity,
  plainData,
  resolveActivitySelection,
  resolveEffectiveTarget,
  usableActivityList
} from "./dnd5e-activities.mjs";
import { normalizedTemplateDimensions } from "./dnd5e-templates.mjs";

export function applyRuntimeCantripCasterLevel(activity, usageConfig, _dialogConfig, messageConfig) {
  const item = activity?.item;
  const flag = runtimeSpellFlag(item);
  if (!flag || item?.type !== "spell" || normalizeSpellBaseLevel(item.system?.level) !== 0) return;

  const casterLevel = normalizeCantripCasterLevel(flag.cantripCasterLevel, 1);
  const scaling = cantripScalingIncrease(casterLevel);
  usageConfig.scaling = scaling;

  // Activity#use has already cloned the embedded runtime Item before this hook
  // fires. Override roll data on only that transient clone, leaving both the
  // technical caster and the persistent runtime Item untouched. Reusing the
  // native Scaling constructor preserves D&D5e's @scaling / @scaling.increase
  // semantics for ordinary and custom cantrip damage formulas.
  if (!installCantripRollDataScaling(item, scaling)) {
    console.warn(`${MODULE_ID} | Could not apply caster-level scaling to runtime cantrip ${item.name}. Native actor scaling will be used.`);
    return;
  }

  foundry.utils.setProperty(messageConfig, `data.flags.${MODULE_ID}.cantripCasterLevel`, casterLevel);
}

export function sourceModifiedTime(sourceSpell) {
  const value = Number(sourceSpell?._stats?.modifiedTime ?? sourceSpell?._source?._stats?.modifiedTime);
  return Number.isFinite(value) ? value : null;
}

export function prioritizeActivityData(data, activityId) {
  const activities = data?.system?.activities;
  if (!activityId || !activities) return data;
  if (Array.isArray(activities)) {
    const index = activities.findIndex(activity => activity?._id === activityId || activity?.id === activityId);
    if (index > 0) activities.unshift(activities.splice(index, 1)[0]);
    return data;
  }
  if (typeof activities === "object" && Object.hasOwn(activities, activityId)) {
    const selected = activities[activityId];
    const sorts = Object.values(activities).map(activity => Number(activity?.sort)).filter(Number.isFinite);
    selected.sort = (sorts.length ? Math.min(...sorts) : 0) - (Number(CONST?.SORT_INTEGER_DENSITY) || 100000);
    data.system.activities = {
      [activityId]: selected,
      ...Object.fromEntries(Object.entries(activities).filter(([id]) => id !== activityId))
    };
  }
  return data;
}

export function rawActivityData(data, activityId) {
  const activities = data?.system?.activities;
  if (!activities || !activityId) return null;
  if (Array.isArray(activities)) {
    return activities.find(activity => activity?._id === activityId || activity?.id === activityId) ?? null;
  }
  if (typeof activities === "object") return activities[activityId] ?? null;
  return null;
}

export function applyRuntimeTemplateUnitNormalization(data, sourceSpell, activityId, scene = canvas.scene) {
  const sourceActivity = findActivity(sourceSpell, activityId);
  if (!sourceActivity) return data;
  const effectiveTarget = resolveEffectiveTarget(sourceSpell, sourceActivity);
  if (!effectiveTemplateShape(effectiveTarget)) return data;

  const template = foundry.utils.deepClone(effectiveTarget?.template ?? {});
  const dimensions = normalizedTemplateDimensions(template, sourceActivity, scene);
  const normalizedTemplate = {
    ...template,
    units: dimensions.sceneUnits,
    size: String(dimensions.size),
    width: String(dimensions.width),
    height: String(dimensions.height)
  };
  const sourceActivityTarget = plainData(sourceActivity?.toObject?.()?.target ?? sourceActivity?.target);
  const runtimeActivity = rawActivityData(data, activityId);

  if (sourceActivityTarget.override === true) {
    if (runtimeActivity) {
      runtimeActivity.target ??= {};
      runtimeActivity.target.template = foundry.utils.mergeObject(runtimeActivity.target.template ?? {}, normalizedTemplate, {
        inplace: false,
        insertKeys: true,
        overwrite: true,
        recursive: true
      });
    }
  } else {
    data.system ??= {};
    data.system.target ??= {};
    data.system.target.template = foundry.utils.mergeObject(data.system.target.template ?? {}, normalizedTemplate, {
      inplace: false,
      insertKeys: true,
      overwrite: true,
      recursive: true
    });
  }

  data.flags = foundry.utils.mergeObject(data.flags ?? {}, {
    [MODULE_ID]: {
      runtimeTemplateUnits: {
        sourceUnits: dimensions.sourceUnits,
        sceneUnits: dimensions.sceneUnits
      }
    }
  }, { inplace: false });
  return data;
}

export function applyRuntimeSpellConfiguration(data, activityId, {
  spellSaveDc = DEFAULT_SPELL_SAVE_DC,
  spellAttackBonus = DEFAULT_SPELL_ATTACK_BONUS,
  targetCapacity = null
} = {}) {
  const activity = rawActivityData(data, activityId);
  if (!activity) return data;

  const saveDc = normalizeSpellSaveDc(spellSaveDc);
  if (String(activity.type ?? "") === "save" || activity.save) {
    activity.save ??= {};
    activity.save.dc ??= {};
    // D&D5e treats a blank calculation plus a numeric formula as a flat DC.
    // This avoids mutating the caster Actor and works identically for trigger-
    // token origins and the hidden EasyTraps caster.
    activity.save.dc.calculation = "";
    activity.save.dc.formula = String(saveDc);
  }

  const attackBonus = normalizeSpellAttackBonus(spellAttackBonus);
  if (String(activity.type ?? "") === "attack" || activity.attack) {
    activity.attack ??= {};
    activity.attack.flat = true;
    activity.attack.ability = "none";
    activity.attack.bonus = String(attackBonus);
  }

  const capacity = normalizeOptionalTargetCapacity(targetCapacity);
  if (capacity) {
    data.system ??= {};
    data.system.target ??= {};
    data.system.target.affects ??= {};
    data.system.target.affects.count = String(capacity);
    data.system.target.affects.choice = false;

    // Some Items override target data at Activity level while others inherit
    // from the Item. Populate both sources on the hidden runtime copy so the
    // native workflow receives the same dynamic capacity in either case.
    activity.target ??= {};
    activity.target.affects ??= {};
    activity.target.affects.count = String(capacity);
    activity.target.affects.choice = false;
  }
  return data;
}

export function prepareRuntimeSpell(sourceSpell, triggerTile, activityId, configuration = {}) {
  const data = prioritizeActivityData(prepareRuntimeSpellSourceData(sourceSpell), activityId);
  applyRuntimeTemplateUnitNormalization(data, sourceSpell, activityId, triggerTile?.parent ?? canvas.scene);
  applyRuntimeSpellConfiguration(data, activityId, configuration);
  const spellSaveDc = normalizeSpellSaveDc(configuration.spellSaveDc);
  const spellAttackBonus = normalizeSpellAttackBonus(configuration.spellAttackBonus);
  const targetCapacity = normalizeOptionalTargetCapacity(configuration.targetCapacity);
  const cantripCasterLevel = normalizeSpellBaseLevel(sourceSpell.system?.level) === 0
    ? normalizeCantripCasterLevel(configuration.cantripCasterLevel, 1)
    : null;
  data.flags = foundry.utils.mergeObject(data.flags ?? {}, {
    [MODULE_ID]: {
      runtimeSpell: {
        runtimeSchema: RUNTIME_SPELL_SCHEMA,
        sourceUuid: sourceSpell.uuid,
        sourceModifiedTime: sourceModifiedTime(sourceSpell),
        activityId,
        spellSaveDc,
        spellAttackBonus,
        targetCapacity,
        cantripCasterLevel,
        sceneUnits: sceneDistanceUnits(triggerTile?.parent ?? canvas.scene),
        triggerTileId: triggerTile.id,
        triggerTileUuid: triggerTile.uuid,
        version: VERSION
      }
    }
  }, { inplace: false });
  return data;
}

export async function ensureRuntimeSpell(actor, sourceSpell, triggerTile, activityId, configuration = {}) {
  const modifiedTime = sourceModifiedTime(sourceSpell);
  const spellSaveDc = normalizeSpellSaveDc(configuration.spellSaveDc);
  const spellAttackBonus = normalizeSpellAttackBonus(configuration.spellAttackBonus);
  const targetCapacity = normalizeOptionalTargetCapacity(configuration.targetCapacity);
  const cantripCasterLevel = normalizeSpellBaseLevel(sourceSpell.system?.level) === 0
    ? normalizeCantripCasterLevel(configuration.cantripCasterLevel, 1)
    : null;
  let item = actor.items.find(entry => {
    const flag = runtimeSpellFlag(entry);
    const sameTrap = flag?.triggerTileUuid === triggerTile.uuid || flag?.triggerTileId === triggerTile.id;
    const sameSource = flag?.sourceUuid === sourceSpell.uuid;
    const sameRevision = (flag?.sourceModifiedTime ?? null) === modifiedTime;
    const sameActivity = flag?.activityId === activityId;
    const sameRuntimeSchema = Number(flag?.runtimeSchema) === RUNTIME_SPELL_SCHEMA;
    const sameSaveDc = normalizeSpellSaveDc(flag?.spellSaveDc) === spellSaveDc;
    const sameAttackBonus = normalizeSpellAttackBonus(flag?.spellAttackBonus) === spellAttackBonus;
    const storedCapacity = normalizeOptionalTargetCapacity(flag?.targetCapacity);
    const sameTargetCapacity = storedCapacity === targetCapacity;
    const storedCantripCasterLevel = normalizeSpellBaseLevel(sourceSpell.system?.level) === 0
      ? normalizeCantripCasterLevel(flag?.cantripCasterLevel, 1)
      : null;
    const sameCantripCasterLevel = storedCantripCasterLevel === cantripCasterLevel;
    const sameSceneUnits = String(flag?.sceneUnits ?? "") === sceneDistanceUnits(triggerTile?.parent ?? canvas.scene);
    return sameTrap && sameSource && sameRevision && sameActivity
      && sameRuntimeSchema && sameSaveDc && sameAttackBonus && sameTargetCapacity
      && sameCantripCasterLevel && sameSceneUnits;
  });
  if (item) return item;
  // Keep older runtime copies intact because active effects, concentration, summons, macros or chat cards may still
  // reference them. A new source revision or selected Activity receives a new hidden runtime Item.
  [item] = await actor.createEmbeddedDocuments("Item", [prepareRuntimeSpell(sourceSpell, triggerTile, activityId, {
    spellSaveDc,
    spellAttackBonus,
    targetCapacity,
    cantripCasterLevel
  })], { renderSheet: false });
  if (!item) throw new Error("EasyTraps could not create its stable native spell copy.");
  return item;
}

export function prepareRuntimeSpellSourceData(sourceSpell) {
  const data = sourceSpell.toObject();
  delete data._id;
  delete data.folder;
  data.name = sourceSpell.name;
  if (data.system) {
    const baseLevel = normalizeSpellBaseLevel(data.system.level);
    if (baseLevel > 0) {
      // The hidden runtime Item never consumes a slot, but it must use a
      // slot-capable spellcasting method so D&D5e keeps its native scaling
      // pipeline enabled. Compendium spells normally already use `spell`;
      // normalizing here also makes leveled innate/at-will source Items
      // eligible for the trap's explicitly saved cast level.
      data.system.method = "spell";
      data.system.prepared = 1;
    }
    // Preserve compatibility with pre-5.1 spell data imported by third-party
    // compendiums. Current D&D5e stores `method`/`prepared` directly.
    if (data.system.preparation) {
      data.system.preparation.mode = baseLevel > 0 ? "prepared" : data.system.preparation.mode;
      data.system.preparation.prepared = true;
    }
  }
  if (data.system?.activities && typeof data.system.activities === "object") {
    for (const activity of Object.values(data.system.activities)) {
      activity.consumption ??= {};
      activity.consumption.spellSlot = false;
    }
  }
  return data;
}

export async function useOriginalSpellItem(spell, {
  activityId,
  createMeasuredTemplate = false,
  configure = false,
  scaling = 0,
  castLevel = null,
  usageOverrides = null,
  messageOverrides = null,
  forceActivityUse = false
} = {}) {
  const resolution = resolveActivitySelection(spell, activityId);
  if (!resolution.supported || !(spell?.use instanceof Function)) {
    throw new Error(`${spell?.name ?? "The selected spell"} cannot use its saved Activity through the native D&D5e Item API.`);
  }
  const firstUsable = usableActivityList(spell)[0];
  if (firstUsable?.id !== activityId) {
    throw new Error(`${spell.name}'s runtime Activity order does not match the saved trap configuration.`);
  }
  const baseLevel = normalizeSpellBaseLevel(spell.system?.level);
  const level = normalizeCastLevel(castLevel, baseLevel);
  let usage = {
    consume: false,
    scaling: Math.max(Number(scaling) || 0, castScaling(level, baseLevel)),
    create: { measuredTemplate: Boolean(createMeasuredTemplate) }
  };
  if (usageOverrides && typeof usageOverrides === "object") {
    usage = foundry.utils.mergeObject(usage, usageOverrides, {
      inplace: false,
      insertKeys: true,
      insertValues: true,
      overwrite: true,
      recursive: true
    });
  }
  if (level > 0) usage.spell = { slot: `spell${level}` };
  const dialog = { configure: Boolean(configure) };
  let message = {
    create: true,
    ...(level > 0 ? { data: { system: { spellLevel: level } } } : {})
  };
  if (messageOverrides && typeof messageOverrides === "object") {
    message = foundry.utils.mergeObject(message, messageOverrides, {
      inplace: false,
      insertKeys: true,
      insertValues: true,
      overwrite: true,
      recursive: true
    });
  }
  const usable = usableActivityList(spell);

  // Item#use is the natural entry point for a spell with one usable Activity.
  // For a multi-Activity Item, Item#use always opens the native chooser unless a
  // Shift keyboard event is supplied. A synthetic Shift event leaks into attack
  // and damage rolls, so replay the already-saved choice by invoking the exact
  // Activity that Item#use would delegate to after that chooser.
  if (forceActivityUse || usable.length > 1) return resolution.activity.use(usage, dialog, message);
  return spell.use({ chooseActivity: false, ...usage }, dialog, message);
}
