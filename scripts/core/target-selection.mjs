import { MODULE_ID } from "./constants.mjs";
import {
  geometryOverlapsRect,
  rectanglesOverlapArea,
  tokenBoundsRect,
  tokenDocumentBoundsRect
} from "./geometry-shapes.mjs";
import { savedAreaWorldStates } from "./saved-areas.mjs";
import { geometryFromSavedAreaState } from "./template-snapshots.mjs";
import { runtimeOriginFlag } from "./trap-model.mjs";

/**
 * Resolve targets from the persisted EasyTraps snapshots, not from the rendered
 * PIXI/Region object. D&D5e v5.3 can back templates with Region geometry whose
 * runtime shape uses a different coordinate space. The saved world state is the
 * single source of truth shared by the GM overlay, target collection, and the
 * recreated native template.
 */
export function collectSavedAreaTargetIds(trap, originPoint, activity = null) {
  const geometries = savedAreaWorldStates(trap, originPoint, activity)
    .map(state => geometryFromSavedAreaState(state))
    .filter(Boolean);
  if (!geometries.length) return [];

  const ids = [];
  for (const token of canvas.tokens?.placeables ?? []) {
    const document = token.document;
    if (!document?.actorId || document.getFlag(MODULE_ID, "temporaryOrigin") === true || runtimeOriginFlag(document)) continue;
    const rect = tokenBoundsRect(token);
    if (geometries.some(geometry => geometryOverlapsRect(geometry, rect))) ids.push(document.id);
  }
  return [...new Set(ids)];
}

export function collectCustomZoneTargetIds(zone) {
  if (!zone) return [];
  const rect = {
    x: Number(zone.x) || 0,
    y: Number(zone.y) || 0,
    width: Math.max(0, Number(zone.width) || 0),
    height: Math.max(0, Number(zone.height) || 0)
  };
  if (!rect.width || !rect.height) return [];
  const ids = [];
  for (const token of canvas.tokens?.placeables ?? []) {
    const document = token.document;
    if (!document?.actorId || document.getFlag(MODULE_ID, "temporaryOrigin") === true || runtimeOriginFlag(document)) continue;
    // A neighboring token whose square only touches the zone border is not in
    // the selected cell. Use document geometry plus positive-area overlap,
    // rather than PIXI bounds and inclusive edge intersection.
    if (rectanglesOverlapArea(rect, tokenDocumentBoundsRect(document))) ids.push(document.id);
  }
  return [...new Set(ids)];
}
