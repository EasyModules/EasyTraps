/**
 * Document-space geometry helpers which do not depend on PIXI placeables.
 *
 * Prefer Foundry's document API for prepared token dimensions. This is
 * important because square grids can be represented by one scalar size while
 * hexagonal grids have independent sizeX/sizeY bounds. The fallback preserves
 * EasyTraps' pre-v0.5.17 square-grid behavior for older saved data and compatibility fallbacks.
 */
export function sceneGridPixelDimensions(scene, { activeGrid = null, fallbackGridSize = 100 } = {}) {
  const sceneGridSize = positiveOr(scene?.grid?.size, fallbackGridSize);
  const width = positiveOr(activeGrid?.sizeX ?? activeGrid?.size, sceneGridSize);
  const height = positiveOr(activeGrid?.sizeY ?? activeGrid?.size, width);
  return { width, height };
}

export function tokenDocumentCanvasRectangle(tokenDocument, {
  scene = tokenDocument?.parent ?? null,
  activeGrid = null,
  fallbackGridSize = 100
} = {}) {
  const x = finiteOr(tokenDocument?.x, 0);
  const y = finiteOr(tokenDocument?.y, 0);

  const prepared = preparedTokenPixelSize(tokenDocument);
  if (prepared) return { x, y, ...prepared };

  const { width: sizeX, height: sizeY } = sceneGridPixelDimensions(scene, { activeGrid, fallbackGridSize });
  return {
    x,
    y,
    width: Math.max(0.01, finiteOr(tokenDocument?.width, 1)) * sizeX,
    height: Math.max(0.01, finiteOr(tokenDocument?.height, 1)) * sizeY
  };
}

function preparedTokenPixelSize(tokenDocument) {
  if (typeof tokenDocument?.getSize !== "function") return null;
  try {
    const size = tokenDocument.getSize();
    const width = Number(size?.width);
    const height = Number(size?.height);
    if (Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0) {
      return { width, height };
    }
  } catch (_error) {
    // Fall through to the deterministic document/grid calculation below.
  }
  return null;
}

function finiteOr(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : Number(fallback) || 0;
}

function positiveOr(value, fallback) {
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 0) return numeric;
  const fallbackNumeric = Number(fallback);
  return Number.isFinite(fallbackNumeric) && fallbackNumeric > 0 ? fallbackNumeric : 100;
}
