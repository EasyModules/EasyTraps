import { ALARM_AUDIBILITY_MODES, alarmRangePixelRadius, normalizeAlarmConfig } from "../alarm.mjs";
import {
  isPointInScene,
  pointerToCanvas,
  sceneDistanceUnits,
  sceneGeometry,
  trapCanvasRectangle
} from "../core/canvas-geometry.mjs";
import { MODULE_ID, TEMPLATE_BINDINGS } from "../core/constants.mjs";
import { runtime } from "../core/runtime-state.mjs";
import { savedAreaWorldStates } from "../core/saved-areas.mjs";
import { linkedSourceDocumentForTrap } from "../core/source-documents.mjs";
import { geometryFromSavedAreaState, normalizedTemplateSnapshot } from "../core/template-snapshots.mjs";
import {
  pointInsideTrapInteractionGeometry,
  segmentBandPolygon,
  trapInteractionGeometry
} from "../core/trap-geometry.mjs";
import {
  isAlarmTrap,
  normalizeOriginMode,
  originData,
  resolveOriginTile,
  setupTemplateReferencePoint,
  trapData,
  trapIsDiscovered
} from "../core/trap-model.mjs";
import { controllerTileFromSource } from "../core/trigger-links.mjs";
import { absoluteTriggerCells, baseCellFromMarker } from "../grid-trigger.mjs";
import { alarmOriginPoint } from "../payloads/alarm-payload.mjs";
import { visibleTokenAtPoint } from "../player-interaction.mjs";
import {
  TRIGGER_TYPES,
  isExternalTriggerType,
  normalizeTriggerType,
  sourceLinkFromDocument
} from "../trigger-sources.mjs";
import {
  drawGridCells,
  drawOverlayCircle,
  drawOverlayLine,
  drawOverlayPolygon,
  drawOverlayRect,
  overlayHost
} from "./canvas-drawing.mjs";

export function spatialAlarmTrap(tile) {
  const trap = trapData(tile);
  if (!trap || !isAlarmTrap(trap)) return null;
  const config = normalizeAlarmConfig(trap.alarm);
  return config.audibility.mode === ALARM_AUDIBILITY_MODES.SPATIAL ? { tile, trap, config } : null;
}

export function gmAlarmRangeTrapAtPoint(point) {
  const scene = canvas.scene;
  if (!scene || !point) return null;
  const tiles = Array.from(scene.tiles ?? []);

  // Item Pile triggers are represented to the GM by the visible Token, not the
  // hidden technical controller. Resolve that direct source first.
  const gridSize = Number(canvas.grid?.size ?? scene.grid?.size) || 100;
  const token = visibleTokenAtPoint(point, canvas.tokens?.placeables ?? [], gridSize);
  if (token?.document) {
    const link = sourceLinkFromDocument(token.document, MODULE_ID);
    if (link?.type === TRIGGER_TYPES.ITEM_PILE) {
      const controller = controllerTileFromSource(scene, token.document, TRIGGER_TYPES.ITEM_PILE);
      if (spatialAlarmTrap(controller)) return controller;
    }
  }

  // One reverse pass handles separate origins, Door source geometry, and normal
  // Tile triggers. This stays cheap enough for pointer hover even in trap-heavy
  // scenes and does not change any native placeable interaction state.
  for (let index = tiles.length - 1; index >= 0; index -= 1) {
    const tile = tiles[index];
    const origin = originData(tile);
    if (origin?.kind === "alarm-origin") {
      const rect = trapCanvasRectangle(tile);
      if (pointInsideTrapInteractionGeometry(point, { type: "rect", rect })) {
        const triggerTile = scene.tiles?.get?.(origin.triggerTileId)
          ?? scene.tiles?.find?.(entry => entry.uuid === origin.triggerTileUuid)
          ?? null;
        if (spatialAlarmTrap(triggerTile)) return triggerTile;
      }
      continue;
    }

    const candidate = spatialAlarmTrap(tile);
    if (!candidate) continue;
    const type = normalizeTriggerType(candidate.trap.triggerType);
    if (type === TRIGGER_TYPES.ITEM_PILE) continue;
    const geometry = trapInteractionGeometry(tile, candidate.trap);
    if (geometry && pointInsideTrapInteractionGeometry(point, geometry)) return tile;
  }
  return null;
}

export function setGmAlarmRangeHover(tile) {
  const state = runtime.gmAlarmRangePreview;
  const nextId = tile?.id ?? null;
  if (state.hoveredTileId === nextId) return;
  state.hoveredTileId = nextId;
  refreshAreaOverlays();
}

export function onGmAlarmRangePointerMove(event) {
  if (!game.user?.isGM || !canvas?.scene) return;
  const point = pointerToCanvas(event);
  if (!point || !isPointInScene(point)) {
    setGmAlarmRangeHover(null);
    return;
  }
  setGmAlarmRangeHover(gmAlarmRangeTrapAtPoint(point));
}

export function setupGmAlarmRangePreview() {
  teardownGmAlarmRangePreview();
  if (!game.user?.isGM || !canvas?.ready || !canvas.stage?.on) return;
  const state = runtime.gmAlarmRangePreview;
  state.moveHandler = event => onGmAlarmRangePointerMove(event);
  canvas.stage.on("pointermove", state.moveHandler);
  state.installed = true;
}

export function teardownGmAlarmRangePreview() {
  const state = runtime.gmAlarmRangePreview;
  if (state.moveHandler) {
    try { canvas.stage?.off?.("pointermove", state.moveHandler); } catch (_error) { /* canvas already gone */ }
  }
  state.moveHandler = null;
  state.installed = false;
  state.hoveredTileId = null;
}

export function clearTriggerOverlays() {
  for (const graphic of runtime.overlays.values()) {
    try { graphic.destroy({ children: true }); } catch (_error) { /* already destroyed */ }
  }
  runtime.overlays.clear();
}

export function refreshTriggerOverlays() {
  clearTriggerOverlays();
  if (!canvas?.ready || !canvas.scene || !globalThis.PIXI?.Graphics) return;
  const host = overlayHost();
  if (!host?.addChild) return;
  const geometry = sceneGeometry();
  const isGM = game.user?.isGM === true;

  for (const tile of canvas.scene.tiles) {
    const trap = trapData(tile);
    if (!trap) continue;

    const type = normalizeTriggerType(trap.triggerType);

    // Players never see EasyTraps' technical controller overlays. Once an
    // external trap is discovered, however, the *real* Door / Item Pile keeps a
    // subtle persistent source outline so discovery remains visible even before
    // the pointer enters the native source. Hover only intensifies that outline
    // and adds the explicit DISARM affordance.
    if (!isGM) {
      if (!isExternalTriggerType(type) || !trapIsDiscovered(tile, trap)) continue;
      const graphic = new PIXI.Graphics();
      graphic.eventMode = "none";
      graphic.zIndex = 995;
      drawExternalTriggerSourceIndicator(graphic, tile, trap, { player: true });
      runtime.overlays.set(tile.id, graphic);
      host.addChild(graphic);
      continue;
    }

    const graphic = new PIXI.Graphics();
    graphic.eventMode = "none";
    graphic.zIndex = 1000;

    if (type === TRIGGER_TYPES.TILE) {
      const baseCell = baseCellFromMarker(tile, geometry);
      const cells = absoluteTriggerCells(baseCell, trap.triggerCells);
      drawGridCells(graphic, cells, geometry, { armed: trap.armed });
    } else {
      drawExternalTriggerSourceIndicator(graphic, tile, trap);
    }

    runtime.overlays.set(tile.id, graphic);
    host.addChild(graphic);
  }
  refreshAreaOverlays();
}

export function drawExternalTriggerSourceIndicator(graphic, tile, trap, { player = false } = {}) {
  const geometry = trapInteractionGeometry(tile, trap);
  if (!geometry) return;

  const armed = trap?.armed !== false;
  const fillColor = 0xd9ad60;
  const strokeColor = armed ? fillColor : 0x8a7f72;
  const fillAlpha = player ? (armed ? 0.025 : 0.012) : (armed ? 0.08 : 0.035);
  const strokeAlpha = player ? (armed ? 0.62 : 0.44) : 0.82;

  if (geometry.type === "segment") {
    const polygon = segmentBandPolygon(geometry.start, geometry.end, geometry.halfWidth);
    drawTrapIndicatorPolygon(graphic, polygon, strokeColor, strokeAlpha, fillColor, fillAlpha);
    return;
  }

  const rect = geometry.rect;
  if (!rect) return;
  const padding = player ? 3 : 2;
  drawTrapIndicatorRect(
    graphic,
    rect.x + padding,
    rect.y + padding,
    Math.max(1, rect.width - padding * 2),
    Math.max(1, rect.height - padding * 2),
    strokeColor,
    strokeAlpha,
    fillColor,
    fillAlpha
  );
}

export function drawTrapIndicatorRect(graphic, x, y, width, height, strokeColor, strokeAlpha, fillColor, fillAlpha) {
  if (typeof graphic.rect === "function" && typeof graphic.fill === "function") {
    graphic.rect(x, y, width, height);
    graphic.fill({ color: fillColor, alpha: fillAlpha });
    graphic.stroke({ color: strokeColor, alpha: strokeAlpha, width: 2 });
  } else {
    graphic.lineStyle(2, strokeColor, strokeAlpha);
    graphic.beginFill(fillColor, fillAlpha);
    graphic.drawRect(x, y, width, height);
    graphic.endFill();
  }
}

export function drawTrapIndicatorPolygon(graphic, points, strokeColor, strokeAlpha, fillColor, fillAlpha) {
  const flat = points.flatMap(point => [point.x, point.y]);
  if (typeof graphic.poly === "function" && typeof graphic.fill === "function") {
    graphic.poly(flat, true);
    graphic.fill({ color: fillColor, alpha: fillAlpha });
    graphic.stroke({ color: strokeColor, alpha: strokeAlpha, width: 2 });
  } else {
    graphic.lineStyle(2, strokeColor, strokeAlpha);
    graphic.beginFill(fillColor, fillAlpha);
    graphic.drawPolygon(flat);
    graphic.endFill();
  }
}

export function clearAreaOverlays() {
  for (const overlay of runtime.areaOverlays.values()) {
    try { overlay.destroy({ children: true }); } catch (_error) { /* already destroyed */ }
  }
  runtime.areaOverlays.clear();
}

export function refreshAreaOverlays() {
  clearAreaOverlays();
  if (!game.user?.isGM || !canvas?.ready || !canvas.scene || !globalThis.PIXI?.Graphics) return;
  const host = overlayHost();
  if (!host?.addChild) return;

  for (const triggerTile of canvas.scene.tiles) {
    const trap = trapData(triggerTile);
    const hasTemplates = Boolean(trap && Array.isArray(trap.templates) && trap.templates.length);
    const hasSelectionZone = Boolean(trap?.selectionZone);
    const alarmConfig = trap && isAlarmTrap(trap) ? normalizeAlarmConfig(trap.alarm) : null;
    const hasSpatialAlarmRange = alarmConfig?.audibility.mode === ALARM_AUDIBILITY_MODES.SPATIAL;
    if (!trap || (!hasTemplates && !hasSelectionZone && !hasSpatialAlarmRange)) continue;

    const originMode = normalizeOriginMode(trap.originMode);
    const originTile = resolveOriginTile(triggerTile, trap, originMode);
    const triggerObject = triggerTile.object;
    const originObject = originTile?.object;
    const sourceObject = isExternalTriggerType(trap.triggerType)
      ? linkedSourceDocumentForTrap(triggerTile, trap)?.object
      : null;
    const pointerHover = runtime.gmAlarmRangePreview.hoveredTileId === triggerTile.id;
    const shouldShow = Boolean(
      pointerHover
      || triggerObject?.controlled || triggerObject?.hover
      || originObject?.controlled || originObject?.hover
      || sourceObject?.controlled || sourceObject?.hover
    );
    if (!shouldShow) continue;

    const referencePoint = setupTemplateReferencePoint(triggerTile, originTile, originMode);
    const container = new PIXI.Container();
    container.eventMode = "none";
    container.zIndex = 1090;
    const graphic = new PIXI.Graphics();
    graphic.eventMode = "none";
    container.addChild(graphic);

    if (hasSpatialAlarmRange) {
      drawAlarmRangePreview(container, graphic, triggerTile, trap, alarmConfig);
    }

    const states = savedAreaWorldStates(trap, referencePoint);
    for (let index = 0; index < states.length; index += 1) {
      const state = states[index];
      const snapshot = normalizedTemplateSnapshot(trap.templates[index], referencePoint);
      drawSavedAreaOutline(graphic, state, referencePoint);
      const label = createAreaBindingLabel(snapshot.binding, state.x, state.y);
      if (label) container.addChild(label);
    }
    if (hasSelectionZone) {
      const zone = trap.selectionZone;
      drawOverlayRect(graphic, Number(zone.x) || 0, Number(zone.y) || 0, Number(zone.width) || 0, Number(zone.height) || 0, 0x77d7b2, 0.95, 0.08);
      const label = createAreaBindingLabel("target-zone", Number(zone.x) || 0, Number(zone.y) || 0);
      if (label) container.addChild(label);
    }
    runtime.areaOverlays.set(triggerTile.id, container);
    host.addChild(container);
  }
}

export function drawAlarmRangePreview(container, graphic, triggerTile, trap, config = normalizeAlarmConfig(trap?.alarm)) {
  const originPoint = alarmOriginPoint(triggerTile, trap);
  if (!originPoint) return;
  const scene = triggerTile?.parent ?? canvas.scene;
  const radiusPixels = alarmRangePixelRadius(config.audibility.radius, {
    gridSize: Number(scene?.grid?.size ?? canvas.grid?.size) || 100,
    gridDistance: Number(scene?.grid?.distance) || 5
  });
  if (!(radiusPixels > 0)) return;

  const color = 0xf0b45a;
  drawOverlayCircle(graphic, originPoint.x, originPoint.y, radiusPixels, color, 0.92, 0.055);
  drawOverlayCircle(graphic, originPoint.x, originPoint.y, 6, color, 1, 0.22);

  const label = createAlarmRangeLabel(config, originPoint);
  if (label) container.addChild(label);
}

export function createAlarmRangeLabel(config, originPoint) {
  if (!globalThis.PIXI?.Text) return null;
  const units = sceneDistanceUnits();
  const walls = config.audibility.walls ? " · WALLS" : "";
  const text = `MAX HEARING RANGE · ${config.audibility.radius} ${units}${walls}`;
  const style = {
    fontFamily: "Arial",
    fontSize: 12,
    fontWeight: "700",
    fill: 0xffd394,
    stroke: { color: 0x000000, width: 4 },
    align: "center"
  };
  let label;
  try { label = new PIXI.Text(text, style); }
  catch (_error) { label = new PIXI.Text({ text, style }); }
  try {
    if (String(label?.text ?? "") !== text) label.text = text;
  } catch (_error) { /* label text is already usable */ }
  label.x = Number(originPoint.x) + 10;
  label.y = Number(originPoint.y) + 10;
  label.eventMode = "none";
  return label;
}

export function drawSavedAreaOutline(graphic, state, referencePoint) {
  const linked = state.binding === TEMPLATE_BINDINGS.ORIGIN_LINKED;
  const color = linked ? 0x67b7ff : 0xb79cff;

  if (!linked) drawOverlayLine(graphic, referencePoint.x, referencePoint.y, state.x, state.y, color, 0.7, 2);
  drawOverlayCircle(graphic, referencePoint.x, referencePoint.y, 5, color, 0.85, 0.16);

  const geometry = geometryFromSavedAreaState(state);
  if (!geometry) return;
  drawGeometryOutline(graphic, geometry, color, 0.92, 0.08);
}

export function drawGeometryOutline(graphic, geometry, color, alpha = 1, fillAlpha = 0) {
  if (geometry?.type === "circle") {
    drawOverlayCircle(graphic, geometry.x, geometry.y, geometry.radius, color, alpha, fillAlpha);
    return;
  }
  if (geometry?.type === "rect") {
    drawOverlayRect(graphic, geometry.x, geometry.y, geometry.width, geometry.height, color, alpha, fillAlpha);
    return;
  }
  if (geometry?.type === "polygon" && Array.isArray(geometry.points) && geometry.points.length >= 3) {
    drawOverlayPolygon(graphic, geometry.points, color, alpha, fillAlpha);
  }
}

export function createAreaBindingLabel(binding, x, y) {
  if (!globalThis.PIXI?.Text) return null;
  const linked = binding === TEMPLATE_BINDINGS.ORIGIN_LINKED;
  const targetZone = binding === "target-zone";
  const text = targetZone ? "CREATURE TARGET ZONE" : linked ? "AREA LINKED TO ORIGIN" : "FIXED SPELL AREA";
  const style = {
    fontFamily: "Arial",
    fontSize: 11,
    fontWeight: "600",
    fill: targetZone ? 0xa9f0d5 : linked ? 0x9fd5ff : 0xd2baff,
    stroke: { color: 0x000000, width: 3 },
    align: "center"
  };
  let label;
  // Foundry 14 currently accepts the classic PIXI.Text(text, style) signature.
  // Constructing with a single options object can succeed without throwing on
  // compatibility builds while coercing that object to the literal string
  // "[object Object]". Prefer the text-first signature and verify the result.
  try { label = new PIXI.Text(text, style); }
  catch (_error) { label = new PIXI.Text({ text, style }); }
  try {
    if (String(label?.text ?? "") !== text) label.text = text;
  } catch (_error) { /* label text is already usable */ }
  label.x = Number(x) + 8;
  label.y = Number(y) + 8;
  label.eventMode = "none";
  return label;
}
