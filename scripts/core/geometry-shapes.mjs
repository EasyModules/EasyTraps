import { templatePreviewGeometry } from "../area-geometry.mjs";
import { sceneGeometry, tokenCanvasRectangle } from "./canvas-geometry.mjs";

export function geometryOverlapsRect(geometry, rect) {
  if (geometry?.type === "circle") return circleIntersectsRect(geometry, rect);
  if (geometry?.type === "polygon") return polygonIntersectsRect(geometry.points, rect);
  if (geometry?.type === "rect") return rectanglesIntersect(geometry, rect);
  return false;
}

export function tokenBoundsRect(token) {
  const bounds = token?.bounds;
  if (bounds && [bounds.x, bounds.y, bounds.width, bounds.height].every(value => Number.isFinite(Number(value)))) {
    return { x: Number(bounds.x), y: Number(bounds.y), width: Number(bounds.width), height: Number(bounds.height) };
  }
  return tokenCanvasRectangle(token?.document);
}

export function tokenDocumentBoundsRect(document) {
  return tokenCanvasRectangle(document);
}

export function geometryFromTemplateData(data, origin) {
  return templatePreviewGeometry(data, origin, {
    gridSize: sceneGeometry().gridSize,
    gridDistance: Number(canvas.scene?.grid?.distance) || 5,
    defaultConeAngle: Number(CONFIG.MeasuredTemplate?.defaults?.angle) || 53.13
  });
}

export function circleIntersectsRect(circle, rect) {
  const closestX = Math.max(rect.x, Math.min(circle.x, rect.x + rect.width));
  const closestY = Math.max(rect.y, Math.min(circle.y, rect.y + rect.height));
  const dx = circle.x - closestX;
  const dy = circle.y - closestY;
  return dx * dx + dy * dy <= circle.radius * circle.radius + 0.0001;
}

export function rectanglesIntersect(a, b) {
  return a.x <= b.x + b.width && a.x + a.width >= b.x && a.y <= b.y + b.height && a.y + a.height >= b.y;
}

export function rectanglesOverlapArea(a, b, epsilon = 0.01) {
  const overlapWidth = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const overlapHeight = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return overlapWidth > epsilon && overlapHeight > epsilon;
}

export function polygonIntersectsRect(points, rect) {
  if (!Array.isArray(points) || points.length < 3) return false;
  if (points.some(point => pointInRect(point, rect))) return true;
  const corners = rectCorners(rect);
  if (corners.some(point => pointInPolygon(point, points))) return true;
  const rectEdges = polygonEdges(corners);
  const polygonSegments = polygonEdges(points);
  return polygonSegments.some(([a, b]) => rectEdges.some(([c, d]) => segmentsIntersect(a, b, c, d)));
}

export function rectCorners(rect) {
  return [
    { x: rect.x, y: rect.y },
    { x: rect.x + rect.width, y: rect.y },
    { x: rect.x + rect.width, y: rect.y + rect.height },
    { x: rect.x, y: rect.y + rect.height }
  ];
}

export function polygonEdges(points) {
  return points.map((point, index) => [point, points[(index + 1) % points.length]]);
}

export function pointInRect(point, rect) {
  return point.x >= rect.x && point.x <= rect.x + rect.width && point.y >= rect.y && point.y <= rect.y + rect.height;
}

export function pointInPolygon(point, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i];
    const b = polygon[j];
    if (pointOnSegment(point, a, b)) return true;
    const crosses = ((a.y > point.y) !== (b.y > point.y))
      && point.x < (b.x - a.x) * (point.y - a.y) / ((b.y - a.y) || Number.EPSILON) + a.x;
    if (crosses) inside = !inside;
  }
  return inside;
}

export function segmentsIntersect(a, b, c, d) {
  const o1 = orientation(a, b, c);
  const o2 = orientation(a, b, d);
  const o3 = orientation(c, d, a);
  const o4 = orientation(c, d, b);
  if (o1 !== o2 && o3 !== o4) return true;
  return (o1 === 0 && pointOnSegment(c, a, b))
    || (o2 === 0 && pointOnSegment(d, a, b))
    || (o3 === 0 && pointOnSegment(a, c, d))
    || (o4 === 0 && pointOnSegment(b, c, d));
}

export function orientation(a, b, c) {
  const value = (b.y - a.y) * (c.x - b.x) - (b.x - a.x) * (c.y - b.y);
  if (Math.abs(value) < 0.0001) return 0;
  return value > 0 ? 1 : 2;
}

export function pointOnSegment(point, a, b) {
  if (Math.abs((point.y - a.y) * (b.x - a.x) - (point.x - a.x) * (b.y - a.y)) > 0.0001) return false;
  return point.x >= Math.min(a.x, b.x) - 0.0001 && point.x <= Math.max(a.x, b.x) + 0.0001
    && point.y >= Math.min(a.y, b.y) - 0.0001 && point.y <= Math.max(a.y, b.y) + 0.0001;
}
