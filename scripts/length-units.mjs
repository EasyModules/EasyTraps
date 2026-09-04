const UNIT_ALIASES = Object.freeze({
  foot: "ft",
  feet: "ft",
  "ft.": "ft",
  meter: "m",
  meters: "m",
  metre: "m",
  metres: "m",
  "m.": "m",
  kilometer: "km",
  kilometers: "km",
  kilometre: "km",
  kilometres: "km",
  "km.": "km",
  mile: "mi",
  miles: "mi",
  "mi.": "mi"
});

export function normalizeLengthUnitKey(unit, movementUnits = {}) {
  const raw = String(unit ?? "").trim();
  if (!raw) return "";
  if (Object.hasOwn(movementUnits ?? {}, raw)) return raw;

  const lower = raw.toLowerCase();
  if (Object.hasOwn(movementUnits ?? {}, lower)) return lower;

  const alias = UNIT_ALIASES[lower] ?? lower;
  return Object.hasOwn(movementUnits ?? {}, alias) ? alias : raw;
}

export function convertConfiguredLength(value, fromUnits, toUnits, movementUnits = {}, { fallback = null } = {}) {
  const numeric = Number(value);
  const fallbackValue = Number.isFinite(Number(fallback)) ? Number(fallback) : numeric;
  if (!Number.isFinite(numeric)) {
    return { value: fallbackValue, supported: false, from: "", to: "", reason: "non-numeric" };
  }

  const from = normalizeLengthUnitKey(fromUnits, movementUnits);
  const to = normalizeLengthUnitKey(toUnits, movementUnits);
  if (!from || !to) return { value: fallbackValue, supported: false, from, to, reason: "blank-unit" };
  if (from === to) return { value: numeric, supported: true, from, to, reason: null };

  const fromConversion = Number(movementUnits?.[from]?.conversion);
  const toConversion = Number(movementUnits?.[to]?.conversion);
  if (![fromConversion, toConversion].every(entry => Number.isFinite(entry) && entry > 0)) {
    return { value: fallbackValue, supported: false, from, to, reason: "unknown-unit" };
  }

  const converted = numeric * fromConversion / toConversion;
  if (!Number.isFinite(converted)) {
    return { value: fallbackValue, supported: false, from, to, reason: "invalid-result" };
  }
  return { value: converted, supported: true, from, to, reason: null };
}

/**
 * Convert a straight canvas-point separation into the Scene's configured
 * distance units. This deliberately does not use Grid#measurePath: discovery
 * and disarm ranges are physical proximity checks, not movement-cost checks.
 * Player preflight and GM authority intentionally consume the same geometry;
 * browser background throttling is a separate authority/timing concern.
 */
export function sceneDistanceBetweenPoints(source = {}, target = {}, {
  gridSize = 100,
  gridDistance = 5
} = {}) {
  const size = Number(gridSize);
  const distancePerGrid = Number(gridDistance);
  if (![size, distancePerGrid].every(value => Number.isFinite(value) && value > 0)) return Number.POSITIVE_INFINITY;
  const dx = (Number(target.x) || 0) - (Number(source.x) || 0);
  const dy = (Number(target.y) || 0) - (Number(source.y) || 0);
  const dz = (Number(target.elevation) || 0) - (Number(source.elevation) || 0);
  const planar = Math.hypot(dx, dy) / size * distancePerGrid;
  return Math.hypot(planar, dz);
}


/**
 * Convert a token/source footprint into the rectangle spanned by the centers
 * of its occupied SQUARE-grid cells. For a 1x1 footprint this collapses to the cell
 * center; for larger footprints it spans the centers of the outermost cells.
 * This is intentionally square-grid-specific and must not be reused for hex.
 * It matches 5e adjacency better than raw edge-to-edge distance: adjacent
 * 1x1 spaces are 5 ft apart, while a full empty square between them is 10 ft.
 */
export function squareGridCellCenterRectangle(rect = {}, { gridSize = 100 } = {}) {
  const size = Number(gridSize);
  const x = Number(rect.x) || 0;
  const y = Number(rect.y) || 0;
  const width = Math.max(0, Number(rect.width) || 0);
  const height = Math.max(0, Number(rect.height) || 0);
  if (!Number.isFinite(size) || size <= 0) return { x, y, width, height };

  const insetX = Math.min(width / 2, size / 2);
  const insetY = Math.min(height / 2, size / 2);
  return {
    x: x + insetX,
    y: y + insetY,
    width: Math.max(0, width - insetX * 2),
    height: Math.max(0, height - insetY * 2)
  };
}
