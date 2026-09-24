import { DOOR_SOURCE_BAND_GRID_RATIO, DOOR_SOURCE_BAND_MAX_PX, DOOR_SOURCE_BAND_MIN_PX } from "./constants.mjs";
import { tokenDocumentCanvasRectangle } from "../document-geometry.mjs";
import { markerTopLeft } from "../grid-trigger.mjs";
import { convertLengthUnits } from "../integrations/dnd5e-units.mjs";
import { doorControllerTileGeometry } from "../trigger-sources.mjs";

export function snapGridVertex(point) {
  const size = Number(canvas.grid?.size ?? canvas.scene?.grid?.size) || 100;
  const d = canvas.dimensions;
  return {
    x: d.sceneX + Math.round((Number(point.x) - d.sceneX) / size) * size,
    y: d.sceneY + Math.round((Number(point.y) - d.sceneY) / size) * size
  };
}

export function controllerPointForDoor(start, end) {
  return snapCell({ x: (Number(start.x) + Number(end.x)) / 2, y: (Number(start.y) + Number(end.y)) / 2 });
}

export function doorControllerGeometryForWall(wallDocument, scene = wallDocument?.parent ?? canvas.scene) {
  const segment = segmentFromDoorDocument(wallDocument);
  if (!segment) return null;
  return doorControllerTileGeometry(segment.start, segment.end, {
    thickness: doorSourceBandHalfWidth(scene) * 2,
    minLength: 1
  });
}

export function pointerToCanvas(event) {
  const global = event.global ?? event.data?.global;
  if (global && canvas.stage?.toLocal) return canvas.stage.toLocal(global);
  const native = event.nativeEvent ?? event.data?.originalEvent;
  if (native && typeof canvas.canvasCoordinatesFromClient === "function") {
    return canvas.canvasCoordinatesFromClient({ x: native.clientX, y: native.clientY });
  }
  return null;
}

export function isPointInScene(point) {
  const d = canvas.dimensions;
  return point.x >= d.sceneX && point.x <= d.sceneX + d.sceneWidth
    && point.y >= d.sceneY && point.y <= d.sceneY + d.sceneHeight;
}

export function snapCell(point) {
  const size = canvas.grid.size;
  const d = canvas.dimensions;
  return {
    x: d.sceneX + Math.floor((point.x - d.sceneX) / size) * size,
    y: d.sceneY + Math.floor((point.y - d.sceneY) / size) * size
  };
}

export function tokenCanvasRectangle(tokenDocument, scene = tokenDocument?.parent ?? canvas.scene) {
  const activeGrid = canvas.scene?.id === scene?.id ? canvas.grid : null;
  return tokenDocumentCanvasRectangle(tokenDocument, { scene, activeGrid });
}

export function trapCanvasRectangle(tile) {
  return {
    x: Number(tile?.x) || 0,
    y: Number(tile?.y) || 0,
    width: Math.max(0, Number(tile?.width) || 0),
    height: Math.max(0, Number(tile?.height) || 0)
  };
}

export function sceneDistanceUnits(scene = canvas.scene) {
  return String(scene?.grid?.units ?? "").trim() || "ft";
}

export function feetFromSceneLength(value, scene = canvas.scene) {
  return convertLengthUnits(value, sceneDistanceUnits(scene), "ft", { fallback: value });
}

export function doorSourceBandHalfWidth(scene = canvas.scene) {
  const gridSize = Number(scene?.grid?.size ?? canvas.grid?.size) || 100;
  return Math.min(
    DOOR_SOURCE_BAND_MAX_PX,
    Math.max(DOOR_SOURCE_BAND_MIN_PX, gridSize * DOOR_SOURCE_BAND_GRID_RATIO)
  );
}

export function segmentFromDoorDocument(document) {
  const c = Array.from(document?.c ?? []);
  if (c.length < 4 || !c.slice(0, 4).every(value => Number.isFinite(Number(value)))) return null;
  return {
    start: { x: Number(c[0]), y: Number(c[1]) },
    end: { x: Number(c[2]), y: Number(c[3]) }
  };
}

export function sceneGeometry() {
  const d = canvas.dimensions;
  const gridSize = Number(canvas.grid?.size ?? canvas.scene?.grid?.size) || 100;
  return {
    sceneX: Number(d.sceneX) || 0,
    sceneY: Number(d.sceneY) || 0,
    gridSize,
    columns: Math.ceil(Number(d.sceneWidth) / gridSize),
    rows: Math.ceil(Number(d.sceneHeight) / gridSize)
  };
}

export function tileCenterPoint(tile) {
  const topLeft = markerTopLeft(tile);
  return {
    x: topLeft.x + Number(tile.width) / 2,
    y: topLeft.y + Number(tile.height) / 2,
    elevation: Number(tile.elevation) || 0
  };
}

export function tokenCenterPoint(tokenDocument) {
  const point = tokenDocument.getCenterPoint?.();
  if (point) return { x: Number(point.x), y: Number(point.y), elevation: Number(tokenDocument.elevation) || 0 };
  const rect = tokenCanvasRectangle(tokenDocument);
  return {
    x: rect.x + rect.width / 2,
    y: rect.y + rect.height / 2,
    elevation: Number(tokenDocument.elevation) || 0
  };
}
