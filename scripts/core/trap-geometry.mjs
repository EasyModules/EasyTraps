import {
  doorSourceBandHalfWidth,
  feetFromSceneLength,
  segmentFromDoorDocument,
  tokenCanvasRectangle,
  trapCanvasRectangle
} from "./canvas-geometry.mjs";
import {
  DOOR_LOS_FACE_OFFSET_GRID_RATIO,
  DOOR_LOS_FACE_OFFSET_MAX_PX,
  DOOR_LOS_FACE_OFFSET_MIN_PX,
  MODULE_ID,
  RANGE_EPSILON_FT
} from "./constants.mjs";
import { linkedSourceDocumentForTrap } from "./source-documents.mjs";
import { trapData } from "./trap-model.mjs";
import {
  closestPointsBetweenRectangleAndSegment,
  closestPointsBetweenRectangles,
  rectangleLosSamplePoints,
  testSightCollision
} from "../discovery.mjs";
import { sceneDistanceBetweenPoints, squareGridCellCenterRectangle } from "../length-units.mjs";
import { TRIGGER_TYPES, isExternalTriggerType, normalizeTriggerType } from "../trigger-sources.mjs";

export function doorLosFaceOffset(scene = canvas.scene) {
  const gridSize = Number(scene?.grid?.size ?? canvas.grid?.size) || 100;
  return Math.min(
    DOOR_LOS_FACE_OFFSET_MAX_PX,
    Math.max(DOOR_LOS_FACE_OFFSET_MIN_PX, gridSize * DOOR_LOS_FACE_OFFSET_GRID_RATIO)
  );
}

export function segmentBandPolygon(start, end, halfWidth) {
  const ax = Number(start?.x) || 0;
  const ay = Number(start?.y) || 0;
  const bx = Number(end?.x) || 0;
  const by = Number(end?.y) || 0;
  const dx = bx - ax;
  const dy = by - ay;
  const length = Math.hypot(dx, dy);
  if (length <= Number.EPSILON) {
    const pad = Math.max(1, Number(halfWidth) || 1);
    return [
      { x: ax - pad, y: ay - pad },
      { x: ax + pad, y: ay - pad },
      { x: ax + pad, y: ay + pad },
      { x: ax - pad, y: ay + pad }
    ];
  }
  const nx = -dy / length;
  const ny = dx / length;
  const pad = Math.max(1, Number(halfWidth) || 1);
  return [
    { x: ax + nx * pad, y: ay + ny * pad },
    { x: bx + nx * pad, y: by + ny * pad },
    { x: bx - nx * pad, y: by - ny * pad },
    { x: ax - nx * pad, y: ay - ny * pad }
  ];
}

export function pointToSegmentDistance(point, start, end) {
  const px = Number(point?.x) || 0;
  const py = Number(point?.y) || 0;
  const ax = Number(start?.x) || 0;
  const ay = Number(start?.y) || 0;
  const bx = Number(end?.x) || 0;
  const by = Number(end?.y) || 0;
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSquared = (dx * dx) + (dy * dy);
  if (lengthSquared <= Number.EPSILON) return Math.hypot(px - ax, py - ay);
  const t = Math.min(1, Math.max(0, (((px - ax) * dx) + ((py - ay) * dy)) / lengthSquared));
  return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
}

export function trapInteractionGeometry(tile, trap = trapData(tile)) {
  if (!tile || !trap) return null;
  const type = normalizeTriggerType(trap.triggerType);
  const sourceDocument = isExternalTriggerType(type) ? linkedSourceDocumentForTrap(tile, trap) : null;
  if (isExternalTriggerType(type) && !sourceDocument) return null;

  if (type === TRIGGER_TYPES.ITEM_PILE && sourceDocument) {
    return {
      type: "rect",
      rect: tokenCanvasRectangle(sourceDocument),
      elevation: Number(sourceDocument.elevation) || 0,
      sourceDocument,
      triggerType: type
    };
  }

  if (type === TRIGGER_TYPES.DOOR && sourceDocument) {
    const segment = segmentFromDoorDocument(sourceDocument);
    if (!segment) return null;
    return {
      type: "segment",
      ...segment,
      halfWidth: doorSourceBandHalfWidth(tile.parent ?? canvas.scene),
      elevation: 0,
      sourceDocument,
      triggerType: type
    };
  }

  return {
    type: "rect",
    rect: trapCanvasRectangle(tile),
    elevation: Number(tile?.elevation) || 0,
    sourceDocument: tile,
    triggerType: type
  };
}

export function pointInsideTrapInteractionGeometry(point, geometry) {
  if (!point || !geometry) return false;
  if (geometry.type === "segment") {
    return pointToSegmentDistance(point, geometry.start, geometry.end) <= Math.max(1, Number(geometry.halfWidth) || 1);
  }
  const rect = geometry.rect;
  if (!rect) return false;
  return point.x >= rect.x && point.x <= rect.x + rect.width
    && point.y >= rect.y && point.y <= rect.y + rect.height;
}

export function distanceGeometryForTrap(tokenDocument, tile) {
  const tokenRect = tokenCanvasRectangle(tokenDocument);
  const trap = trapData(tile);
  const geometry = trapInteractionGeometry(tile, trap);
  if (!geometry) return null;

  if (geometry.type === "segment") {
    return {
      points: closestPointsBetweenRectangleAndSegment(tokenRect, geometry.start, geometry.end),
      targetElevation: Number(geometry.elevation) || 0,
      sourceDocument: geometry.sourceDocument
    };
  }

  const targetRect = geometry.rect;
  return {
    points: closestPointsBetweenRectangles(tokenRect, targetRect),
    targetElevation: Number(geometry.elevation) || 0,
    sourceDocument: geometry.sourceDocument
  };
}

export function measureTokenToTrapDistance(tokenDocument, tile, scene = tokenDocument?.parent ?? tile?.parent ?? canvas.scene) {
  const geometry = distanceGeometryForTrap(tokenDocument, tile);
  if (!geometry?.points?.source || !geometry?.points?.target) return Number.POSITIVE_INFINITY;
  const source = { ...geometry.points.source, elevation: Number(tokenDocument?.elevation) || 0 };
  const target = { ...geometry.points.target, elevation: Number(geometry.targetElevation) || 0 };
  if (Math.abs(source.x - target.x) < 0.001
    && Math.abs(source.y - target.y) < 0.001
    && Math.abs(source.elevation - target.elevation) < 0.001) return 0;

  // Discovery/disarm are physical proximity checks, not movement-path checks.
  // Keep them independent from diagonal movement-cost rules so the same saved
  // Scene geometry has one deterministic meaning on every client. GM-window
  // background throttling is handled separately by the authority handshake.
  const sceneDistance = sceneDistanceBetweenPoints(source, target, {
    gridSize: Number(scene?.grid?.size) || 100,
    gridDistance: Number(scene?.grid?.distance) || 5
  });
  return feetFromSceneLength(sceneDistance, scene);
}

/**
 * Disarm uses a stricter interaction distance than passive discovery. Discovery
 * measures simple edge proximity; disarm must also distinguish "adjacent to the
 * source" from "an entire empty grid-space away". This prevents Door traps from
 * being disarmed from visually distant squares while still accepting a
 * character standing next to a slightly off-grid Item Pile.
 */
export function disarmDistanceGeometryForTrap(tokenDocument, tile, scene = tokenDocument?.parent ?? tile?.parent ?? canvas.scene) {
  const gridSize = Number(scene?.grid?.size) || 100;
  const tokenCenters = squareGridCellCenterRectangle(tokenCanvasRectangle(tokenDocument), { gridSize });
  const trap = trapData(tile);
  const geometry = trapInteractionGeometry(tile, trap);
  if (!geometry) return null;

  if (geometry.type === "segment") {
    return {
      points: closestPointsBetweenRectangleAndSegment(tokenCenters, geometry.start, geometry.end),
      targetElevation: Number(geometry.elevation) || 0,
      sourceDocument: geometry.sourceDocument
    };
  }

  const sourceCenters = squareGridCellCenterRectangle(geometry.rect, { gridSize });
  return {
    points: closestPointsBetweenRectangles(tokenCenters, sourceCenters),
    targetElevation: Number(geometry.elevation) || 0,
    sourceDocument: geometry.sourceDocument
  };
}

export function measureTokenToTrapDisarmDistance(tokenDocument, tile, scene = tokenDocument?.parent ?? tile?.parent ?? canvas.scene) {
  const geometry = disarmDistanceGeometryForTrap(tokenDocument, tile, scene);
  if (!geometry?.points?.source || !geometry?.points?.target) return Number.POSITIVE_INFINITY;
  const source = { ...geometry.points.source, elevation: Number(tokenDocument?.elevation) || 0 };
  const target = { ...geometry.points.target, elevation: Number(geometry.targetElevation) || 0 };
  if (Math.abs(source.x - target.x) < 0.001
    && Math.abs(source.y - target.y) < 0.001
    && Math.abs(source.elevation - target.elevation) < 0.001) return 0;

  const sceneDistance = sceneDistanceBetweenPoints(source, target, {
    gridSize: Number(scene?.grid?.size) || 100,
    gridDistance: Number(scene?.grid?.distance) || 5
  });
  return feetFromSceneLength(sceneDistance, scene);
}

export function isWithinTrapRange(distance, limitFeet) {
  const value = Number(distance);
  const limit = Number(limitFeet);
  return Number.isFinite(value) && Number.isFinite(limit) && value <= limit + RANGE_EPSILON_FT;
}

export function trapHasLineOfSightFromToken(tokenDocument, tile) {
  const PolygonClass = foundry?.canvas?.geometry?.ClockwiseSweepPolygon;
  if (typeof PolygonClass?.testCollision !== "function") return false;

  const tokenRect = tokenCanvasRectangle(tokenDocument);
  const trap = trapData(tile);
  const geometry = trapInteractionGeometry(tile, trap);
  const origin = {
    x: tokenRect.x + tokenRect.width / 2,
    y: tokenRect.y + tokenRect.height / 2,
    elevation: Number(tokenDocument?.elevation) || 0
  };

  let samples = [];
  const targetElevation = Number(geometry?.elevation) || 0;

  if (geometry?.type === "segment") {
    const { start, end } = geometry;
    const midpoint = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const length = Math.hypot(dx, dy);
    let nx = length > Number.EPSILON ? -dy / length : 1;
    let ny = length > Number.EPSILON ? dx / length : 0;
    if (((origin.x - midpoint.x) * nx) + ((origin.y - midpoint.y) * ny) < 0) {
      nx *= -1;
      ny *= -1;
    }
    const offset = doorLosFaceOffset(tile?.parent ?? canvas.scene);
    const points = [
      closestPointsBetweenRectangleAndSegment(tokenRect, start, end).target,
      { x: start.x + dx * 0.18, y: start.y + dy * 0.18 },
      midpoint,
      { x: start.x + dx * 0.82, y: start.y + dy * 0.82 }
    ];
    samples = points.map(point => ({
      x: point.x + nx * offset,
      y: point.y + ny * offset
    }));
  } else {
    const trapRect = geometry?.rect ?? trapCanvasRectangle(tile);
    const closest = closestPointsBetweenRectangles(tokenRect, trapRect).target;
    samples = [closest, ...rectangleLosSamplePoints(trapRect, { inset: 2 })];
  }

  const seen = new Set();
  for (const point of samples) {
    const key = `${Number(point.x).toFixed(3)}:${Number(point.y).toFixed(3)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const destination = {
      x: Number(point.x) || 0,
      y: Number(point.y) || 0,
      elevation: targetElevation
    };
    try {
      const collision = testSightCollision(PolygonClass, origin, destination);
      if (!collision) return true;
    } catch (error) {
      console.warn(`${MODULE_ID} | Could not test passive discovery line of sight`, error);
      return false;
    }
  }
  return false;
}
