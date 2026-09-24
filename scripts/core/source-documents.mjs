import { MODULE_ID } from "./constants.mjs";
import { trapData } from "./trap-model.mjs";
import {
  TRIGGER_SOURCE_OWNERSHIP,
  TRIGGER_TYPES,
  isExternalTriggerType,
  normalizeTriggerSourceOwnership,
  normalizeTriggerType,
  sourceLinkFlag,
  sourceLinkFromDocument
} from "../trigger-sources.mjs";

export function triggerSourceOwnershipForTrap(trap) {
  if (!trap || !isExternalTriggerType(trap.triggerType)) return null;
  return normalizeTriggerSourceOwnership(trap.triggerSourceOwnership, TRIGGER_SOURCE_OWNERSHIP.CREATED);
}

export async function linkTriggerSourceDocument(sourceDocument, controllerTile, triggerType) {
  if (!sourceDocument || !controllerTile) return;
  const trap = trapData(controllerTile);
  const existing = sourceLinkFromDocument(sourceDocument, MODULE_ID);
  const ownership = normalizeTriggerSourceOwnership(
    trap?.triggerSourceOwnership ?? existing?.ownership,
    TRIGGER_SOURCE_OWNERSHIP.CREATED
  );
  const payload = sourceLinkFlag({
    type: triggerType,
    controllerTileId: controllerTile.id,
    controllerTileUuid: controllerTile.uuid,
    ownership
  });
  await sourceDocument.update({ [`flags.${MODULE_ID}.triggerSource`]: payload }, { easyTrapsInternal: true });
}

export function linkedSourceDocumentForTrap(tile, trap = trapData(tile)) {
  if (!tile || !trap || !isExternalTriggerType(trap.triggerType)) return null;
  const scene = tile.parent;
  const sourceId = String(trap.triggerSourceId ?? "");
  if (!scene || !sourceId) return null;
  const type = normalizeTriggerType(trap.triggerType);
  if (type === TRIGGER_TYPES.DOOR) return scene.walls?.get?.(sourceId) ?? null;
  if (type === TRIGGER_TYPES.ITEM_PILE) return scene.tokens?.get?.(sourceId) ?? null;
  return null;
}
