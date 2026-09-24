import { doorControllerGeometryForWall, sceneGeometry, tokenCanvasRectangle } from "./canvas-geometry.mjs";
import { MODULE_ID, TRIGGER_SCHEMA, VERSION } from "./constants.mjs";
import { changedValue, hasChange } from "./document-changes.mjs";
import { linkedSourceDocumentForTrap } from "./source-documents.mjs";
import { originData, trapData, triggerDimensions } from "./trap-model.mjs";
import {
  clampBaseCell,
  clampCellCount,
  markerDataForBaseCell,
  markerTopLeft,
  rectangleOffsets
} from "../grid-trigger.mjs";
import { TRIGGER_TYPES, isExternalTriggerType, normalizeTriggerType } from "../trigger-sources.mjs";

export function normalizeExternalControllerTileUpdate(tileDocument, trap, changes, options = {}) {
  const type = normalizeTriggerType(trap?.triggerType);
  if (!isExternalTriggerType(type)) return false;

  // Foundry's native Tile visibility toggle represents discovery for EasyTraps,
  // not the technical controller's actual hidden state. Keep the controller
  // permanently invisible while mirroring an explicit GM visibility request
  // into the shared discovered flag. EasyTraps' own discovery updates already
  // carry that flag and bypass this compatibility translation.
  if (!options?.easyTrapsInternal && !options?.easyTrapsDiscovery && hasChange(changes, "hidden")) {
    const requestedHidden = Boolean(changedValue(changes, "hidden", tileDocument.hidden));
    changes[`flags.${MODULE_ID}.discovered`] = !requestedHidden;
  }

  const source = linkedSourceDocumentForTrap(tileDocument, trap);
  if (type === TRIGGER_TYPES.DOOR && source) {
    const geometry = doorControllerGeometryForWall(source, source.parent ?? tileDocument.parent ?? canvas.scene);
    if (geometry) Object.assign(changes, geometry);
  } else if (type === TRIGGER_TYPES.ITEM_PILE && source) {
    const rect = tokenCanvasRectangle(source, source.parent ?? tileDocument.parent ?? canvas.scene);
    Object.assign(changes, {
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
      rotation: Number(source.rotation) || 0,
      elevation: Number(source.elevation) || 0
    });
  }

  changes.hidden = true;
  changes.alpha = 0;
  changes[`flags.${MODULE_ID}.schema`] = TRIGGER_SCHEMA;
  changes[`flags.${MODULE_ID}.version`] = VERSION;
  return true;
}

export function onPreUpdateTile(tileDocument, changes, options = {}) {
  if (!game.user?.isGM) return;
  const trap = trapData(tileDocument);
  const origin = originData(tileDocument);
  if (!trap && !origin) return;

  if (origin) {
    normalizeOriginTileUpdate(tileDocument, changes);
    return;
  }

  // Door and Item Pile controllers follow their real source geometry. They must
  // never be snapped back to the ordinary square-grid trigger model.
  if (normalizeExternalControllerTileUpdate(tileDocument, trap, changes, options)) return;

  const geometry = sceneGeometry();
  const proposed = proposedTileState(tileDocument, changes);
  const currentBounds = triggerDimensions(trap);
  const widthChanged = hasChange(changes, "width");
  const heightChanged = hasChange(changes, "height");
  const widthCells = widthChanged ? clampCellCount(proposed.width / geometry.gridSize) : currentBounds.width;
  const heightCells = heightChanged ? clampCellCount(proposed.height / geometry.gridSize) : currentBounds.height;
  const offsets = rectangleOffsets(widthCells, heightCells);

  let proposedTopLeft = markerTopLeft(proposed);
  if ((widthChanged || heightChanged) && !hasChange(changes, "x") && !hasChange(changes, "y")) {
    proposedTopLeft = markerTopLeft(tileDocument);
  }
  const requestedBaseCell = {
    column: Math.round((proposedTopLeft.x - geometry.sceneX) / geometry.gridSize),
    row: Math.round((proposedTopLeft.y - geometry.sceneY) / geometry.gridSize)
  };
  const baseCell = clampBaseCell(requestedBaseCell, offsets, geometry);
  const anchor = { x: 0, y: 0 };
  const marker = markerDataForBaseCell(baseCell, offsets, geometry);

  changes.x = marker.x;
  changes.y = marker.y;
  changes.width = marker.width;
  changes.height = marker.height;
  changes.rotation = 0;
  foundry.utils.setProperty(changes, "texture.anchorX", anchor.x);
  foundry.utils.setProperty(changes, "texture.anchorY", anchor.y);
  changes[`flags.${MODULE_ID}.schema`] = TRIGGER_SCHEMA;
  changes[`flags.${MODULE_ID}.version`] = VERSION;
  changes[`flags.${MODULE_ID}.triggerCells`] = offsets;
  changes[`flags.${MODULE_ID}.triggerWidth`] = widthCells;
  changes[`flags.${MODULE_ID}.triggerHeight`] = heightCells;
}

export function normalizeOriginTileUpdate(tileDocument, changes) {
  const geometry = sceneGeometry();
  const proposed = proposedTileState(tileDocument, changes);
  let proposedTopLeft = markerTopLeft(proposed);
  if ((hasChange(changes, "width") || hasChange(changes, "height"))
    && !hasChange(changes, "x") && !hasChange(changes, "y")) {
    proposedTopLeft = markerTopLeft(tileDocument);
  }
  const offsets = rectangleOffsets(1, 1);
  const requestedBaseCell = {
    column: Math.round((proposedTopLeft.x - geometry.sceneX) / geometry.gridSize),
    row: Math.round((proposedTopLeft.y - geometry.sceneY) / geometry.gridSize)
  };
  const baseCell = clampBaseCell(requestedBaseCell, offsets, geometry);
  const anchor = { x: 0, y: 0 };
  const marker = markerDataForBaseCell(baseCell, offsets, geometry);

  changes.x = marker.x;
  changes.y = marker.y;
  changes.width = marker.width;
  changes.height = marker.height;
  changes.rotation = 0;
  foundry.utils.setProperty(changes, "texture.anchorX", anchor.x);
  foundry.utils.setProperty(changes, "texture.anchorY", anchor.y);
  changes[`flags.${MODULE_ID}.schema`] = TRIGGER_SCHEMA;
  changes[`flags.${MODULE_ID}.version`] = VERSION;
}

export function proposedTileState(tileDocument, changes) {
  const texture = {
    anchorX: changedValue(changes, "texture.anchorX", tileDocument.texture?.anchorX ?? 0),
    anchorY: changedValue(changes, "texture.anchorY", tileDocument.texture?.anchorY ?? 0)
  };
  return {
    x: Number(changedValue(changes, "x", tileDocument.x)),
    y: Number(changedValue(changes, "y", tileDocument.y)),
    width: Math.max(1, Number(changedValue(changes, "width", tileDocument.width))),
    height: Math.max(1, Number(changedValue(changes, "height", tileDocument.height))),
    texture
  };
}
