import { TRIGGER_TYPES, normalizeTriggerType, trapDiscoveryState } from "./trigger-sources.mjs";

/**
 * Pure helpers for player-side interaction with discovered EasyTraps Tiles.
 *
 * Foundry keeps ordinary Tiles non-interactive for players without Tile
 * permissions, even when the Tile is visible. EasyTraps therefore listens at
 * the canvas stage and performs a narrow hit-test against its own visible trap
 * documents. These helpers deliberately contain no PIXI or document writes so
 * the interaction rules remain independent from rendering details.
 */

const MODULE_ID = "easy-traps";
const TRAP_KINDS = new Set(["spell-grid", "spell-floor"]);

export function isPlayerTrapInteractionCandidate(tile) {
  const trap = tile?.flags?.[MODULE_ID];
  if (!TRAP_KINDS.has(trap?.kind)) return false;
  if (!trapDiscoveryState(tile, trap)) return false;
  if (trap?.requiresReconfiguration === true) return false;
  if (trap?.discovery?.enabled === false) return false;
  // DISARM is an action, not an inspection state. A visible trap which is
  // already disarmed remains visible but does not advertise another disarm.
  if (trap?.armed === false) return false;
  return true;
}

function pointInsideDocumentRect(point, document) {
  if (!point || !document) return false;
  const x = Number(document.x);
  const y = Number(document.y);
  const width = Number(document.width);
  const height = Number(document.height);
  if (![x, y, width, height].every(Number.isFinite)) return false;
  return point.x >= x && point.x <= x + width
    && point.y >= y && point.y <= y + height;
}

/** Return the last matching Tile, mirroring top-most document order. */
export function playerTrapAtPoint(point, tiles = []) {
  for (let index = tiles.length - 1; index >= 0; index -= 1) {
    const tile = tiles[index];
    if (!isPlayerTrapInteractionCandidate(tile)) continue;
    const trap = tile?.flags?.[MODULE_ID];
    // Door and Item Pile controllers are backend-only. Their real source
    // geometry is resolved by the Foundry-aware canvas adapter in main.mjs.
    if (normalizeTriggerType(trap?.triggerType) !== TRIGGER_TYPES.TILE) continue;
    if (pointInsideDocumentRect(point, tile)) return tile;
  }
  return null;
}

export function tokenContainsScenePoint(token, point, gridSize = 100) {
  if (!token || !point || token.visible === false) return false;
  if (token.document?.hidden === true) return false;

  const bounds = token.bounds;
  if (bounds && typeof bounds.contains === "function") {
    try { return bounds.contains(point.x, point.y); }
    catch (_error) { /* fall back to document dimensions */ }
  }

  const document = token.document ?? token;
  const size = Math.max(1, Number(gridSize) || 100);
  const x = Number(document?.x);
  const y = Number(document?.y);
  const width = Math.max(0.01, Number(document?.width) || 1) * size;
  const height = Math.max(0.01, Number(document?.height) || 1) * size;
  if (![x, y].every(Number.isFinite)) return false;
  return point.x >= x && point.x <= x + width
    && point.y >= y && point.y <= y + height;
}

export function visibleTokenAtPoint(point, tokens = [], gridSize = 100) {
  // Reverse order gives visually upper tokens first if multiple footprints
  // overlap. Any token wins over a trap so normal token interaction is never
  // replaced by EasyTraps.
  for (let index = tokens.length - 1; index >= 0; index -= 1) {
    const token = tokens[index];
    if (tokenContainsScenePoint(token, point, gridSize)) return token;
  }
  return null;
}
