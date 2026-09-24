import { isPrimaryGM } from "../core/authority.mjs";
import { MODULE_ID, ORIGIN_MODES, TARGET_MODES } from "../core/constants.mjs";
import { runtime } from "../core/runtime-state.mjs";
import { linkedSourceDocumentForTrap } from "../core/source-documents.mjs";
import { trapData } from "../core/trap-model.mjs";
import { executeConfiguredTrap } from "../core/trap-runtime.mjs";
import { normalizeTriggerType, trapRequiresTriggeringToken, triggerTypeLabel } from "../trigger-sources.mjs";

export async function activateTrapFromTriggerSource(tile, triggeringToken = null, { sourceType = null, sourceDocument = null } = {}) {
  const trap = trapData(tile);
  if (!tile || !trap || trap.armed === false || trap.requiresReconfiguration === true) return false;
  const tokenDocument = triggeringToken?.document ?? triggeringToken ?? null;
  const needsToken = trapRequiresTriggeringToken(trap, {
    triggeringOrigin: ORIGIN_MODES.TRIGGERING_TOKEN,
    triggeringTarget: TARGET_MODES.TRIGGERING_TOKEN
  });
  if (needsToken && !tokenDocument) {
    if (isPrimaryGM()) ui.notifications.warn(`${triggerTypeLabel(sourceType ?? trap.triggerType)} trap needs a triggering creature. Have the player control exactly one owned token while interacting with it.`);
    return false;
  }
  const key = tile.uuid;
  if (runtime.triggering.has(key)) return false;
  runtime.triggering.add(key);
  try {
    await executeConfiguredTrap(tile, tokenDocument ? [tokenDocument] : []);
    Hooks.callAll("easyTrapsTriggerSourceActivated", {
      tile,
      trap,
      triggerType: normalizeTriggerType(sourceType ?? trap.triggerType),
      sourceDocument: sourceDocument ?? linkedSourceDocumentForTrap(tile, trap),
      triggeringToken: tokenDocument
    });
    return true;
  } catch (error) {
    console.error(`${MODULE_ID} | ${triggerTypeLabel(sourceType ?? trap.triggerType)} trap failed`, error);
    ui.notifications.error(error?.message ?? String(error ?? "The trap could not be activated."));
    return false;
  } finally {
    runtime.triggering.delete(key);
  }
}
