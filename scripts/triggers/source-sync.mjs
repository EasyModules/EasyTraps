import { isPrimaryGM } from "../core/authority.mjs";
import { doorControllerGeometryForWall, tokenCanvasRectangle } from "../core/canvas-geometry.mjs";
import { MODULE_ID } from "../core/constants.mjs";
import {
  linkTriggerSourceDocument,
  linkedSourceDocumentForTrap,
  triggerSourceOwnershipForTrap
} from "../core/source-documents.mjs";
import { trapData } from "../core/trap-model.mjs";
import { controllerTileFromSource } from "../core/trigger-links.mjs";
import {
  TRIGGER_TYPES,
  isExternalTriggerType,
  normalizeTriggerType,
  sourceLinkFromDocument,
  triggerTypeLabel
} from "../trigger-sources.mjs";

export async function syncDoorControllerToSource(wallDocument, controllerTile = null) {
  const tile = controllerTile ?? controllerTileFromSource(wallDocument?.parent, wallDocument, TRIGGER_TYPES.DOOR);
  if (!tile || !wallDocument) return false;
  const geometry = doorControllerGeometryForWall(wallDocument, wallDocument.parent ?? tile.parent ?? canvas.scene);
  if (!geometry) return false;
  const update = {
    ...geometry,
    hidden: true,
    alpha: 0,
    "texture.anchorX": 0,
    "texture.anchorY": 0
  };
  const differs = ["x", "y", "width", "height", "rotation", "alpha"].some(key => Math.abs(Number(tile[key]) - Number(update[key])) > 0.001)
    || tile.hidden !== true
    || Number(tile.texture?.anchorX ?? 0) !== 0
    || Number(tile.texture?.anchorY ?? 0) !== 0;
  if (differs) await tile.update(update, { easyTrapsInternal: true });
  return true;
}

export async function syncItemPileControllerToSource(tokenDocument, controllerTile = null) {
  const tile = controllerTile ?? controllerTileFromSource(tokenDocument?.parent, tokenDocument, TRIGGER_TYPES.ITEM_PILE);
  if (!tile || !tokenDocument) return false;
  const rect = tokenCanvasRectangle(tokenDocument, tokenDocument.parent ?? canvas.scene);
  const update = {
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
    rotation: Number(tokenDocument.rotation) || 0,
    elevation: Number(tokenDocument.elevation) || 0,
    hidden: true,
    alpha: 0
  };
  const differs = ["x", "y", "width", "height", "rotation", "elevation", "alpha"].some(key => Number(tile[key]) !== Number(update[key]))
    || tile.hidden !== true;
  if (differs) await tile.update(update, { easyTrapsInternal: true });
  return true;
}

export async function repairExternalTriggerSourceLinks(scene = canvas.scene) {
  if (!isPrimaryGM() || !scene) return { repaired: 0, synced: 0 };
  let repaired = 0;
  let synced = 0;
  for (const tile of scene.tiles ?? []) {
    const trap = trapData(tile);
    if (!trap || !isExternalTriggerType(trap.triggerType)) continue;
    const source = linkedSourceDocumentForTrap(tile, trap);
    if (!source) continue;
    const type = normalizeTriggerType(trap.triggerType);
    const link = sourceLinkFromDocument(source, MODULE_ID);
    const ownership = triggerSourceOwnershipForTrap(trap);
    if (!link || link.type !== type || link.controllerTileId !== tile.id || link.controllerTileUuid !== String(tile.uuid ?? "") || link.ownership !== ownership) {
      try {
        await linkTriggerSourceDocument(source, tile, type);
        repaired += 1;
      } catch (error) {
        console.warn(`${MODULE_ID} | Could not restore ${triggerTypeLabel(type)} source link`, error);
      }
    }
    try {
      if (type === TRIGGER_TYPES.DOOR) await syncDoorControllerToSource(source, tile);
      else if (type === TRIGGER_TYPES.ITEM_PILE) await syncItemPileControllerToSource(source, tile);
      synced += 1;
    } catch (error) {
      console.warn(`${MODULE_ID} | Could not synchronize ${triggerTypeLabel(type)} controller`, error);
    }
  }
  return { repaired, synced };
}
