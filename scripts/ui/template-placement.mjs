import { MODULE_ID, SETUP_TARGET_RESTORE_DELAY_MS } from "../core/constants.mjs";
import { runtime } from "../core/runtime-state.mjs";
import { serializeTemplateSnapshot } from "../core/template-snapshots.mjs";
import { sleep, waitForCanvasFrames } from "../core/timing.mjs";
import { findActivity, resolveEffectiveTarget } from "../integrations/dnd5e-activities.mjs";
import { createSetupTemplatePreviews, isValidPlacedTemplate } from "../integrations/dnd5e-templates.mjs";
import { currentTargetIds, setUserTargetIds } from "../integrations/targeting.mjs";

export async function capturePreplacedTemplates(sourceSpell, activityId, referencePoint, effectiveTarget = null) {
  const activity = findActivity(sourceSpell, activityId);
  if (!activity) {
    ui.notifications.error("The selected spell Activity could not be found for area placement.");
    return null;
  }

  const createdDocuments = [];
  const previousTargets = currentTargetIds();
  let keyHandler = null;
  const previousCancel = runtime.cancelPlacement;
  runtime.placing = true;
  try {
    await setUserTargetIds([]);
    const resolvedTarget = effectiveTarget ?? resolveEffectiveTarget(sourceSpell, activity);
    const previews = createSetupTemplatePreviews(activity, resolvedTarget);
    if (!Array.isArray(previews) || !previews.length) {
      ui.notifications.warn("The selected spell does not create a D&D5e measured template.");
      return null;
    }

    const cancelPreview = () => {
      const handler = canvas.app?.view?.oncontextmenu;
      if (typeof handler === "function") {
        const event = new MouseEvent("contextmenu", { bubbles: true, cancelable: true, view: window });
        handler(event);
      }
    };
    runtime.cancelPlacement = cancelPreview;
    keyHandler = event => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      cancelPreview();
    };
    window.addEventListener("keydown", keyHandler, true);

    // Use D&D5e's placement controls with a neutral document. The spell Item is not used and no activity hooks fire.
    await waitForCanvasFrames(2);
    for (const preview of previews) {
      let result;
      try {
        result = await preview.drawPreview();
      } catch (error) {
        console.error(`${MODULE_ID} | D&D5e template preview failed`, error);
        ui.notifications.error(`The spell area could not be positioned: ${error.message ?? error}`);
        return null;
      }
      const documents = Array.isArray(result) ? result.flat(Infinity).filter(Boolean) : result ? [result] : [];
      if (!documents.length) {
        ui.notifications.warn("Spell-area placement was cancelled.");
        return null;
      }
      createdDocuments.push(...documents);
      // A setup preview may trigger generic auto-target integrations. These targets are design-time state only.
      await setUserTargetIds([]);
      const invalid = documents.find(document => !isValidPlacedTemplate(document));
      if (invalid) {
        console.error(`${MODULE_ID} | Rejected invalid template placement`, invalid?.toObject?.() ?? invalid);
        ui.notifications.error("The spell area must be positioned inside the scene.");
        return null;
      }
    }
    if (!createdDocuments.length) return null;
    // Embedded template objects are drawn asynchronously. Give the canvas a
    // chance to build the final native shape after snapping before serializing it.
    await waitForCanvasFrames(2);
    for (const document of createdDocuments) {
      try { document.object?.refresh?.(); }
      catch (_error) { /* the drawn object already has its final geometry */ }
    }
    await waitForCanvasFrames(1);
    const targetType = String(resolvedTarget?.template?.type ?? "");
    return createdDocuments.map((document, index) => serializeTemplateSnapshot(
      document,
      referencePoint,
      targetType,
      previews[index]?.easyTrapsCanonicalData ?? null
    ));
  } catch (error) {
    console.error(`${MODULE_ID} | Spell-area setup failed`, error);
    ui.notifications.error(`The spell area could not be prepared: ${error.message ?? error}`);
    return null;
  } finally {
    if (keyHandler) window.removeEventListener("keydown", keyHandler, true);
    runtime.cancelPlacement = previousCancel ?? null;
    runtime.placing = false;
    const ids = createdDocuments.map(document => document.id).filter(Boolean);
    if (ids.length) {
      try { await canvas.scene.deleteEmbeddedDocuments("MeasuredTemplate", ids); }
      catch (error) { console.warn(`${MODULE_ID} | Setup template cleanup failed`, error); }
    }
    await waitForCanvasFrames(1);
    await sleep(SETUP_TARGET_RESTORE_DELAY_MS);
    await setUserTargetIds(previousTargets);
  }
}
