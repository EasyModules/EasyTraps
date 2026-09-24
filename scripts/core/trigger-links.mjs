import { isPrimaryGM } from "./authority.mjs";
import { MODULE_ID } from "./constants.mjs";
import { runtime } from "./runtime-state.mjs";
import { linkTriggerSourceDocument } from "./source-documents.mjs";
import { trapData } from "./trap-model.mjs";
import { deleteItemPileDocument } from "../integrations/item-piles.mjs";
import {
  TRIGGER_SOURCE_OWNERSHIP,
  TRIGGER_TYPES,
  isExternalTriggerType,
  normalizeTriggerSourceOwnership,
  normalizeTriggerType,
  sourceLinkFromDocument,
  trapMatchesTriggerSource,
  triggerTypeLabel
} from "../trigger-sources.mjs";

export async function deleteTriggerSourceForController(controllerTile) {
  const trap = trapData(controllerTile);
  if (!trap || !isExternalTriggerType(trap.triggerType)) return;
  const uuid = String(trap.triggerSourceUuid ?? "").trim();
  if (!uuid) return;
  try {
    const source = await fromUuid(uuid);
    if (!source) return;
    const sourceLink = sourceLinkFromDocument(source, MODULE_ID);
    const ownership = normalizeTriggerSourceOwnership(
      trap.triggerSourceOwnership ?? sourceLink?.ownership,
      TRIGGER_SOURCE_OWNERSHIP.CREATED
    );
    if (ownership !== TRIGGER_SOURCE_OWNERSHIP.CREATED) {
      if (source.unsetFlag instanceof Function) await source.unsetFlag(MODULE_ID, "triggerSource");
      return;
    }
    if (source.documentName === "Wall") await source.parent?.deleteEmbeddedDocuments?.("Wall", [source.id], { easyTrapsInternal: true });
    else if (source.documentName === "Token" && normalizeTriggerType(trap.triggerType) === TRIGGER_TYPES.ITEM_PILE) await deleteItemPileDocument(source);
    else if (source.documentName === "Token") await source.parent?.deleteEmbeddedDocuments?.("Token", [source.id], { easyTrapsInternal: true });
    else if (source.delete instanceof Function) await source.delete({ easyTrapsInternal: true });
  } catch (error) {
    console.warn(`${MODULE_ID} | Could not clean linked trigger source`, error);
  }
}

export function triggerTypeForSourceDocument(sourceDocument) {
  const name = String(sourceDocument?.documentName ?? sourceDocument?.constructor?.documentName ?? "");
  if (name === "Wall") return TRIGGER_TYPES.DOOR;
  if (name === "Token") return TRIGGER_TYPES.ITEM_PILE;
  return null;
}

export function queueTriggerSourceLinkRepair(sourceDocument, controllerTile, triggerType) {
  if (!isPrimaryGM() || !sourceDocument || !controllerTile) return;
  const key = `${String(sourceDocument.uuid ?? sourceDocument.id ?? "")}:${String(controllerTile.uuid ?? controllerTile.id ?? "")}`;
  if (runtime.sourceLinkRepairs.has(key)) return;
  runtime.sourceLinkRepairs.add(key);
  queueMicrotask(async () => {
    try {
      await linkTriggerSourceDocument(sourceDocument, controllerTile, triggerType);
    } catch (error) {
      console.warn(`${MODULE_ID} | Could not repair trigger-source back-link`, error);
    } finally {
      runtime.sourceLinkRepairs.delete(key);
    }
  });
}

export function controllerTileFromSource(scene, sourceDocument, expectedType = null) {
  if (!scene || !sourceDocument) return null;
  const inferredType = expectedType ?? triggerTypeForSourceDocument(sourceDocument);
  if (!inferredType || !isExternalTriggerType(inferredType)) return null;

  const link = sourceLinkFromDocument(sourceDocument, MODULE_ID);
  if (link?.controllerTileId) {
    const linkedTile = scene.tiles?.get?.(link.controllerTileId) ?? null;
    const linkedTrap = trapData(linkedTile);
    if (linkedTrap && trapMatchesTriggerSource(linkedTrap, sourceDocument, inferredType)) {
      if (link.type !== inferredType || link.controllerTileUuid !== String(linkedTile.uuid ?? "")) {
        queueTriggerSourceLinkRepair(sourceDocument, linkedTile, inferredType);
      }
      return linkedTile;
    }
  }

  // Item Piles can rewrite Token data during its own lifecycle. The controller
  // keeps the authoritative source id/uuid, so recover from that relationship
  // even when the source-side EasyTraps flag was lost or became stale.
  const recovered = Array.from(scene.tiles ?? []).find(tile => {
    const trap = trapData(tile);
    return trap && trapMatchesTriggerSource(trap, sourceDocument, inferredType);
  }) ?? null;
  if (recovered) queueTriggerSourceLinkRepair(sourceDocument, recovered, inferredType);
  return recovered;
}

export function triggerSourceDeletionKey(sourceDocument) {
  const sceneId = String(sourceDocument?.parent?.id ?? "");
  const documentName = String(sourceDocument?.documentName ?? sourceDocument?.constructor?.documentName ?? "");
  const sourceId = String(sourceDocument?.id ?? "");
  return sceneId && documentName && sourceId ? `${sceneId}:${documentName}:${sourceId}` : null;
}

export function rememberTriggerSourceControllerBeforeDelete(sourceDocument, triggerType, options = {}) {
  if (options?.easyTrapsInternal || !isPrimaryGM()) return;
  const key = triggerSourceDeletionKey(sourceDocument);
  if (!key) return;
  const tile = controllerTileFromSource(sourceDocument?.parent, sourceDocument, triggerType);
  if (!tile) return;
  runtime.pendingSourceDeletions.set(key, {
    scene: tile.parent ?? sourceDocument?.parent ?? null,
    controllerTileId: tile.id,
    controllerTileUuid: String(tile.uuid ?? ""),
    triggerType: normalizeTriggerType(triggerType)
  });
}

export function consumeRememberedTriggerSourceController(sourceDocument, triggerType) {
  const key = triggerSourceDeletionKey(sourceDocument);
  if (!key) return null;
  const remembered = runtime.pendingSourceDeletions.get(key) ?? null;
  runtime.pendingSourceDeletions.delete(key);
  if (!remembered || remembered.triggerType !== normalizeTriggerType(triggerType)) return null;
  return remembered;
}

export function onPreDeleteTriggerSourceWall(wallDocument, options = {}) {
  rememberTriggerSourceControllerBeforeDelete(wallDocument, TRIGGER_TYPES.DOOR, options);
}

export function onPreDeleteItemPileTriggerSource(tokenDocument, options = {}) {
  rememberTriggerSourceControllerBeforeDelete(tokenDocument, TRIGGER_TYPES.ITEM_PILE, options);
}

export function deleteRememberedTriggerController(sourceDocument, triggerType, options = {}) {
  if (options?.easyTrapsInternal || !isPrimaryGM()) return;
  const remembered = consumeRememberedTriggerSourceController(sourceDocument, triggerType);
  const fallbackTile = controllerTileFromSource(sourceDocument?.parent, sourceDocument, triggerType);
  const scene = remembered?.scene ?? fallbackTile?.parent ?? sourceDocument?.parent ?? null;
  const controllerTileId = remembered?.controllerTileId ?? fallbackTile?.id ?? null;
  if (!scene || !controllerTileId) return;
  queueMicrotask(async () => {
    const controller = scene.tiles?.get?.(controllerTileId) ?? null;
    if (!controller) return;
    try {
      await scene.deleteEmbeddedDocuments("Tile", [controller.id], { easyTrapsInternal: true });
    } catch (error) {
      console.warn(`${MODULE_ID} | Could not delete ${triggerTypeLabel(triggerType)} trigger controller`, error);
    }
  });
}

export function onDeleteTriggerSourceWall(wallDocument, options = {}) {
  deleteRememberedTriggerController(wallDocument, TRIGGER_TYPES.DOOR, options);
}

export function onDeleteItemPileTriggerSource(tokenDocument, options = {}) {
  deleteRememberedTriggerController(tokenDocument, TRIGGER_TYPES.ITEM_PILE, options);
}
