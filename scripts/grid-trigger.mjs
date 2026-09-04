/**
 * Square-grid trigger persistence and legacy migration helpers.
 *
 * These row/column + rectangular-offset helpers intentionally model the
 * existing EasyTraps square-grid schema. Hex/gridless support should use a
 * topology adapter backed by Foundry's Grid APIs rather than extending this
 * arithmetic with more special cases.
 */
export const CELL_EPSILON = 0.001;

function cellKey(row, column) {
  return `${row}:${column}`;
}

export function rectangleOffsets(widthCells = 1, heightCells = 1) {
  const width = clampCellCount(widthCells);
  const height = clampCellCount(heightCells);
  const cells = [];
  for (let dy = 0; dy < height; dy += 1) {
    for (let dx = 0; dx < width; dx += 1) cells.push({ dx, dy });
  }
  return cells;
}

export function normalizeOffsets(cells) {
  const unique = new Map();
  for (const cell of Array.isArray(cells) ? cells : []) {
    const dx = Math.max(0, Math.trunc(Number(cell?.dx) || 0));
    const dy = Math.max(0, Math.trunc(Number(cell?.dy) || 0));
    unique.set(cellKey(dy, dx), { dx, dy });
  }
  return unique.size ? [...unique.values()].sort((a, b) => a.dy - b.dy || a.dx - b.dx) : [{ dx: 0, dy: 0 }];
}

export function offsetBounds(cells) {
  const normalized = normalizeOffsets(cells);
  return {
    width: Math.max(...normalized.map(cell => cell.dx)) + 1,
    height: Math.max(...normalized.map(cell => cell.dy)) + 1
  };
}

export function sceneCellFromPoint(point, geometry) {
  const { sceneX, sceneY, gridSize } = geometry;
  return {
    column: Math.floor((Number(point.x) - sceneX) / gridSize),
    row: Math.floor((Number(point.y) - sceneY) / gridSize)
  };
}

function markerAnchor(marker) {
  const texture = marker?.texture ?? marker?._source?.texture ?? {};
  return {
    x: clampAnchor(texture.anchorX, 0),
    y: clampAnchor(texture.anchorY, 0)
  };
}

/**
 * TileDocument x/y are the top-left coordinates of the document rectangle.
 * EasyTraps canonical markers use texture anchor 0/0 so the Foundry selection
 * rectangle, MATT hit area, and EasyTraps grid overlay share the same top-left.
 */
export function markerTopLeft(marker) {
  return {
    x: Number(marker?.x) || 0,
    y: Number(marker?.y) || 0
  };
}

/**
 * Schemas 3-8 incorrectly stored x/y at the texture-anchor position. This
 * helper recovers the intended top-left cell during the one-time migration to
 * the canonical TileDocument coordinate model.
 */
function legacyAnchoredMarkerTopLeft(marker) {
  const anchor = markerAnchor(marker);
  const width = Math.max(0, Number(marker?.width) || 0);
  const height = Math.max(0, Number(marker?.height) || 0);
  return {
    x: (Number(marker?.x) || 0) - width * anchor.x,
    y: (Number(marker?.y) || 0) - height * anchor.y
  };
}

export function legacyAnchoredBaseCellFromMarker(marker, geometry) {
  const { sceneX, sceneY, gridSize } = geometry;
  const topLeft = legacyAnchoredMarkerTopLeft(marker);
  return {
    column: Math.floor((topLeft.x + CELL_EPSILON - sceneX) / gridSize),
    row: Math.floor((topLeft.y + CELL_EPSILON - sceneY) / gridSize)
  };
}

export function baseCellFromMarker(marker, geometry) {
  const { sceneX, sceneY, gridSize } = geometry;
  const topLeft = markerTopLeft(marker);
  return {
    column: Math.floor((topLeft.x + CELL_EPSILON - sceneX) / gridSize),
    row: Math.floor((topLeft.y + CELL_EPSILON - sceneY) / gridSize)
  };
}

/**
 * EasyTraps 0.0.3 stored its 70% marker x/y as though they were top-left
 * coordinates, while Foundry rendered those coordinates at the texture anchor.
 * Adding half of the old marker size reproduces the cell that 0.0.3 used for
 * its mechanical trigger and lets 0.0.4 migrate without moving the trap area.
 */
export function legacyBaseCellFromMarker003(marker, geometry) {
  const { sceneX, sceneY, gridSize } = geometry;
  const centerXUsedBy003 = Number(marker?.x) + (Number(marker?.width) || gridSize * 0.7) / 2;
  const centerYUsedBy003 = Number(marker?.y) + (Number(marker?.height) || gridSize * 0.7) / 2;
  return {
    column: Math.floor((centerXUsedBy003 - sceneX) / gridSize),
    row: Math.floor((centerYUsedBy003 - sceneY) / gridSize)
  };
}

export function markerDataForBaseCell(baseCell, offsets, geometry) {
  const { sceneX, sceneY, gridSize } = geometry;
  const bounds = offsetBounds(offsets);
  const width = bounds.width * gridSize;
  const height = bounds.height * gridSize;
  return {
    x: sceneX + baseCell.column * gridSize,
    y: sceneY + baseCell.row * gridSize,
    width,
    height,
    rotation: 0
  };
}

export function clampBaseCell(baseCell, offsets, geometry) {
  const bounds = offsetBounds(offsets);
  const maxColumn = Math.max(0, Number(geometry.columns) - bounds.width);
  const maxRow = Math.max(0, Number(geometry.rows) - bounds.height);
  return {
    column: Math.min(maxColumn, Math.max(0, Math.trunc(Number(baseCell.column) || 0))),
    row: Math.min(maxRow, Math.max(0, Math.trunc(Number(baseCell.row) || 0)))
  };
}

export function absoluteTriggerCells(baseCell, offsets) {
  return normalizeOffsets(offsets).map(cell => ({
    row: baseCell.row + cell.dy,
    column: baseCell.column + cell.dx
  }));
}


export function clampCellCount(value, maximum = 20) {
  return Math.min(maximum, Math.max(1, Math.round(Number(value) || 1)));
}

function clampAnchor(value, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(1, Math.max(0, number));
}
