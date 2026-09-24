import { sceneDistanceUnits } from "../core/canvas-geometry.mjs";
import { MODULE_ID } from "../core/constants.mjs";
import { savedTemplatePlacements } from "../core/template-snapshots.mjs";
import { findActivity, resolveEffectiveTarget } from "./dnd5e-activities.mjs";
import { convertLengthUnits } from "./dnd5e-units.mjs";

export function abilityTemplateClass() {
  return game.dnd5e?.canvas?.AbilityTemplate
    ?? globalThis.dnd5e?.canvas?.AbilityTemplate
    ?? CONFIG.DND5E?.AbilityTemplate
    ?? null;
}

export function normalizedTemplateDimensions(target = {}, activity = null, scene = canvas.scene) {
  const sourceUnits = String(target?.units ?? "").trim() || sceneDistanceUnits(scene);
  const sceneUnits = sceneDistanceUnits(scene);
  const raw = {
    size: numericTemplateValue(target?.size, activity, 0),
    width: numericTemplateValue(target?.width, activity, 5),
    height: numericTemplateValue(target?.height, activity, 0)
  };
  return {
    sourceUnits,
    sceneUnits,
    raw,
    size: convertLengthUnits(raw.size, sourceUnits, sceneUnits, { fallback: raw.size }),
    width: convertLengthUnits(raw.width, sourceUnits, sceneUnits, { fallback: raw.width }),
    height: convertLengthUnits(raw.height, sourceUnits, sceneUnits, { fallback: raw.height })
  };
}

export function canonicalTemplateDataList(activity = null, effectiveTarget = null) {
  const target = (effectiveTarget ?? resolveEffectiveTarget(activity?.item, activity))?.template ?? {};
  const config = globalThis.dnd5e?.config ?? game.dnd5e?.config ?? CONFIG.DND5E;
  const templateShape = config?.areaTargetTypes?.[target.type]?.template;
  if (!templateShape) return [];
  const dimensions = normalizedTemplateDimensions(target, activity, canvas.scene);
  const { size, width, height } = dimensions;
  const count = Math.max(1, Math.trunc(numericTemplateValue(target.count, activity, 1)) || 1);
  const templateData = {
    t: templateShape,
    user: game.user.id,
    distance: size,
    direction: 0,
    x: 0,
    y: 0,
    fillColor: game.user.color,
    flags: {
      dnd5e: {
        dimensions: {
          size,
          width,
          height,
          adjustedSize: target.type === "radius"
        }
      },
      [MODULE_ID]: {
        setupPreview: true,
        sceneUnitNormalized: true,
        sourceUnits: dimensions.sourceUnits,
        sceneUnits: dimensions.sceneUnits
      }
    }
  };
  if (templateShape === "cone") templateData.angle = CONFIG.MeasuredTemplate.defaults.angle;
  else if (templateShape === "rect") {
    templateData.width = size;
    if (game.settings.get("dnd5e", "gridAlignedSquareTemplates")) {
      templateData.distance = Math.hypot(size, size);
      templateData.direction = 45;
    } else templateData.t = "ray";
  } else if (templateShape === "ray") templateData.width = width;
  return Array.from({ length: count }, () => foundry.utils.deepClone(templateData));
}

export function createSetupTemplatePreviews(activity, effectiveTarget = null) {
  const TemplateClass = abilityTemplateClass();
  if (!TemplateClass) throw new Error("EasyTraps could not access the D&D5e ability-template class.");
  const DocumentClass = CONFIG.MeasuredTemplate.documentClass;
  return canonicalTemplateDataList(activity, effectiveTarget).map(templateData => {
    const document = new DocumentClass(foundry.utils.deepClone(templateData), { parent: canvas.scene });
    const preview = new TemplateClass(document);
    preview.actorSheet = null;
    preview.easyTrapsCanonicalData = foundry.utils.deepClone(templateData);
    return preview;
  });
}

export function numericTemplateValue(value, activity, fallback = 0) {
  const direct = Number(value);
  if (Number.isFinite(direct)) return direct;
  const formula = String(value ?? "").trim();
  if (!formula) return Number(fallback) || 0;
  try {
    const rollData = activity?.getRollData?.() ?? {};
    const replaced = globalThis.Roll?.replaceFormulaData?.(formula, rollData, { missing: 0 }) ?? formula;
    const evaluated = globalThis.Roll?.safeEval?.(replaced);
    if (Number.isFinite(Number(evaluated))) return Number(evaluated);
  } catch (error) {
    console.warn(`${MODULE_ID} | Could not resolve template dimension ${formula}`, error);
  }
  return Number(fallback) || 0;
}

export function isValidPlacedTemplate(document) {
  const data = document?.toObject?.() ?? document ?? {};
  const x = Number(data.x);
  const y = Number(data.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
  const dimensions = canvas?.dimensions;
  if (!dimensions) return false;
  const left = Number(dimensions.sceneX) || 0;
  const top = Number(dimensions.sceneY) || 0;
  const right = left + (Number(dimensions.sceneWidth) || 0);
  const bottom = top + (Number(dimensions.sceneHeight) || 0);
  if (x < left || x > right || y < top || y > bottom) return false;
  if (x === 0 && y === 0 && (left !== 0 || top !== 0)) return false;
  return true;
}

/**
 * Let the real D&D5e Item workflow create its measured templates, but replace the
 * interactive placement step with the geometry recorded while the trap was built.
 * This keeps template creation inside Activity#use, so Midi-QOL, animations, macros,
 * chat flags, and post-use hooks see the same native workflow as a manual spell use.
 */
export async function withSavedNativeTemplatePlacement({ spell, activityId, trap, originPoint, triggerTile }, callback) {
  const activity = findActivity(spell, activityId);
  if (!activity) throw new Error("The runtime spell no longer contains the saved Activity.");
  const prepared = savedTemplatePlacements(trap, originPoint, triggerTile);
  if (!prepared.length) throw new Error("The trap has no saved spell-area geometry to replay.");

  const createdDocuments = [];
  let matched = false;
  let placementError = null;
  const hookId = Hooks.on("dnd5e.createActivityTemplate", (createdActivity, previews) => {
    if (matched) return;
    const sameItem = createdActivity?.item?.uuid === spell.uuid
      || (createdActivity?.item?.id === spell.id && createdActivity?.actor?.id === spell.actor?.id);
    if (!sameItem || createdActivity?.id !== activityId) return;
    matched = true;
    if (!Array.isArray(previews) || previews.length !== prepared.length) {
      placementError = new Error(`The native workflow requested ${previews?.length ?? 0} template(s), but the trap saved ${prepared.length}.`);
      for (const preview of previews ?? []) preview.drawPreview = async () => { throw placementError; };
      return;
    }
    previews.forEach((preview, index) => {
      const placement = foundry.utils.deepClone(prepared[index]);
      const current = preview.document?.toObject?.() ?? {};
      const flags = foundry.utils.mergeObject(current.flags ?? {}, placement.flags ?? {}, { inplace: false });
      preview.document?.updateSource?.({
        x: placement.x,
        y: placement.y,
        elevation: placement.elevation,
        direction: placement.direction,
        flags
      });
      preview.drawPreview = async () => {
        if (placementError) throw placementError;
        const documents = await canvas.scene.createEmbeddedDocuments("MeasuredTemplate", [preview.document.toObject()]);
        createdDocuments.push(...documents);
        return documents;
      };
    });
  });

  try {
    const result = await callback();
    if (placementError) throw placementError;
    if (!matched) throw new Error("The native D&D5e spell workflow did not request its saved template.");
    if (!createdDocuments.length) throw new Error("The native D&D5e spell workflow did not create the saved template.");
    return { result, templates: createdDocuments };
  } catch (error) {
    await deleteMeasuredTemplates(createdDocuments);
    throw error;
  } finally {
    Hooks.off("dnd5e.createActivityTemplate", hookId);
  }
}

export async function deleteMeasuredTemplates(documents) {
  const ids = (documents ?? []).map(document => document?.id).filter(Boolean);
  if (!ids.length || !canvas.scene) return;
  try {
    const existing = ids.filter(id => canvas.scene.templates?.has?.(id));
    if (existing.length) await canvas.scene.deleteEmbeddedDocuments("MeasuredTemplate", existing);
  } catch (error) {
    console.warn(`${MODULE_ID} | Activated template cleanup failed`, error);
  }
}
