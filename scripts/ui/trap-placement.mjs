import { ALARM_AUDIBILITY_MODES, normalizeAlarmConfig } from "../alarm.mjs";
import { isPointInScene, pointerToCanvas, sceneGeometry, snapCell, snapGridVertex } from "../core/canvas-geometry.mjs";
import {
  ALARM_TRAP_NAME,
  AREA_MODES,
  DEFAULT_TRIGGER_TEXTURE,
  MODULE_ID,
  ORIGIN_MODES,
  TARGET_MODES
} from "../core/constants.mjs";
import { refreshAreaOverlays, refreshTriggerOverlays } from "../core/presentation.mjs";
import { runtime } from "../core/runtime-state.mjs";
import { rememberCreationDefaults } from "../core/settings.mjs";
import { waitForCanvasFrames, waitForPlacementPointerRelease } from "../core/timing.mjs";
import { createTrapOriginTile, createTrapTriggerTile } from "../core/trap-documents.mjs";
import { deleteCreatedTrapDocuments } from "../core/trap-lifecycle.mjs";
import {
  normalizeAreaMode,
  normalizeOriginMode,
  normalizeTargetMode,
  normalizeTargetingProfile,
  setupTemplateReferencePoint
} from "../core/trap-model.mjs";
import { setTrapEnabled } from "../core/trap-state.mjs";
import {
  absoluteTriggerCells,
  clampBaseCell,
  clampCellCount,
  markerDataForBaseCell,
  rectangleOffsets,
  sceneCellFromPoint
} from "../grid-trigger.mjs";
import { TRIGGER_TYPES, normalizeTriggerType } from "../trigger-sources.mjs";
import { createDoorTrapController } from "../triggers/door-trigger.mjs";
import { createItemPileTrapController } from "../triggers/item-pile-trigger.mjs";
import {
  createPlacementPreview,
  drawGridCells,
  drawOverlayCircle,
  drawOverlayLine,
  overlayHost
} from "./canvas-drawing.mjs";
import { capturePreplacedTemplates } from "./template-placement.mjs";

/**
 * Trigger-source placement seam. The visible source can be an ordinary Tile, a
 * Foundry Door Wall, or a real Item Pile Token. Door and Item Pile traps retain
 * a hidden controller Tile so trap configuration, discovery/disarm, origin
 * state, and Scene Manager behavior stay on one authoritative trap document.
 */
export async function placeTrapTriggerSource(subject, selection, controllerOptions) {
  if (runtime.placing) return null;
  const stage = canvas.stage;
  if (!stage?.on) throw new Error("The canvas is not ready for trigger placement.");
  runtime.placing = true;
  const preview = globalThis.PIXI?.Graphics ? new PIXI.Graphics() : null;
  const host = overlayHost();
  if (preview && host?.addChild) {
    preview.eventMode = "none";
    preview.zIndex = 1300;
    host.addChild(preview);
  }
  const previousCursor = (canvas.app?.canvas ?? canvas.app?.view)?.style?.cursor ?? "";
  const cursorTarget = canvas.app?.canvas ?? canvas.app?.view;
  if (cursorTarget?.style) cursorTarget.style.cursor = "crosshair";

  return new Promise(resolve => {
    let finished = false;
    let doorStart = null;
    const cleanup = result => {
      if (finished) return;
      finished = true;
      stage.off("pointermove", onPointerMove);
      stage.off("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown, true);
      try { preview?.destroy?.({ children: true }); } catch {}
      if (cursorTarget?.style) cursorTarget.style.cursor = previousCursor;
      runtime.placing = false;
      if (runtime.cancelPlacement === cancelPlacement) runtime.cancelPlacement = null;
      resolve(result ?? null);
    };
    const cancelPlacement = () => cleanup(null);
    runtime.cancelPlacement = cancelPlacement;
    const onKeyDown = event => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      cancelPlacement();
    };
    const onPointerMove = event => {
      if (finished || !preview) return;
      const point = pointerToCanvas(event);
      preview.clear();
      if (!point || !isPointInScene(point)) return;
      const type = normalizeTriggerType(selection.triggerType);
      if (type !== TRIGGER_TYPES.DOOR) doorStart = null;
      if (type === TRIGGER_TYPES.DOOR) {
        const current = snapGridVertex(point);
        if (doorStart) drawOverlayLine(preview, doorStart.x, doorStart.y, current.x, current.y, 0xe0b867, 0.95, 4);
        else drawOverlayCircle(preview, current.x, current.y, 8, 0xe0b867, 0.95, 0.12);
        return;
      }
      const geometry = sceneGeometry();
      const width = type === TRIGGER_TYPES.TILE ? clampCellCount(selection.widthCells) : 1;
      const height = type === TRIGGER_TYPES.TILE ? clampCellCount(selection.heightCells) : 1;
      const offsets = rectangleOffsets(width, height);
      const baseCell = clampBaseCell(sceneCellFromPoint(point, geometry), offsets, geometry);
      drawGridCells(preview, absoluteTriggerCells(baseCell, offsets), geometry, { preview: true, armed: true, origin: false });
    };
    const onPointerDown = async event => {
      if (finished || event.button !== 0) return;
      event.stopPropagation?.();
      const point = pointerToCanvas(event);
      if (!point || !isPointInScene(point)) return;
      const type = normalizeTriggerType(selection.triggerType);
      if (type !== TRIGGER_TYPES.DOOR) doorStart = null;
      if (type === TRIGGER_TYPES.DOOR && !doorStart) {
        doorStart = snapGridVertex(point);
        ui.notifications.info("Door start selected. Click the second endpoint.");
        return;
      }
      const pointerReleased = waitForPlacementPointerRelease(event);
      try {
        let controller;
        if (type === TRIGGER_TYPES.DOOR) {
          const end = snapGridVertex(point);
          if (Math.hypot(end.x - doorStart.x, end.y - doorStart.y) < 1) {
            ui.notifications.warn("Choose a different second point for the Door.");
            return;
          }
          controller = await createDoorTrapController(subject, doorStart, end, controllerOptions);
        } else if (type === TRIGGER_TYPES.ITEM_PILE) {
          controller = await createItemPileTrapController(subject, point, controllerOptions);
        } else {
          controller = await createTrapTriggerTile(subject, snapCell(point), {
            ...controllerOptions,
            widthCells: clampCellCount(selection.widthCells),
            heightCells: clampCellCount(selection.heightCells),
            triggerType: TRIGGER_TYPES.TILE
          });
        }
        await pointerReleased;
        await waitForCanvasFrames(2);
        cleanup(controller);
      } catch (error) {
        console.error(`${MODULE_ID} | Trigger-source placement failed`, error);
        ui.notifications.error(`The trigger could not be created: ${error?.message ?? String(error ?? "Unknown error")}`);
        cleanup(null);
      }
    };
    stage.on("pointermove", onPointerMove);
    stage.on("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown, true);
  });
}

export async function placeFloorTrigger(spell, selection, placementUi = null) {
  const normalizedOrigin = normalizeOriginMode(selection.originMode);
  const normalizedTarget = normalizeTargetMode(selection.targetMode);
  const normalizedArea = normalizeAreaMode(selection.areaMode);
  const targetingProfile = normalizeTargetingProfile(selection.targetingProfile);
  placementUi?.setPhase?.("trigger");
  const controllerOptions = {
    originMode: normalizedOrigin,
    activityId: selection.activityId,
    targetMode: normalizedTarget,
    areaMode: normalizedArea,
    targetingProfile,
    effectiveTarget: selection.effectiveTarget,
    requiresNativeInteraction: selection.requiresNativeInteraction,
    activityType: selection.activityType,
    activityLabel: selection.activityLabel,
    activityCount: selection.activityCount,
    sourceModifiedTime: selection.sourceModifiedTime,
    castLevel: selection.castLevel,
    cantripCasterLevel: selection.cantripCasterLevel,
    scaling: selection.scaling,
    spellSaveDc: selection.spellSaveDc,
    spellAttackBonus: selection.spellAttackBonus,
    pauseOnTrigger: selection.pauseOnTrigger,
    disarmAfterTrigger: selection.disarmAfterTrigger,
    discovery: selection.discovery
  };
  const triggerTile = await placeTrapTriggerSource(spell, selection, controllerOptions);
  if (!triggerTile) return null;

  let originTile = null;
  if (normalizedOrigin === ORIGIN_MODES.SEPARATE_TILE) {
    placementUi?.setPhase?.("origin");
    originTile = await placeSeparateTrapOriginTile(spell, triggerTile);
    if (!originTile) {
      await deleteCreatedTrapDocuments(triggerTile, null);
      return null;
    }
    await triggerTile.update({
      [`flags.${MODULE_ID}.originTileId`]: originTile.id,
      [`flags.${MODULE_ID}.originTileUuid`]: originTile.uuid
    });
  }


  if (normalizedTarget === TARGET_MODES.CUSTOM_ZONE) {
    placementUi?.setPhase?.("targets");
    const selectionZone = await placeCustomTargetZone({
      widthCells: selection.selectionZoneWidth,
      heightCells: selection.selectionZoneHeight
    });
    if (!selectionZone) {
      await deleteCreatedTrapDocuments(triggerTile, originTile);
      return null;
    }
    await triggerTile.update({ [`flags.${MODULE_ID}.selectionZone`]: selectionZone });
  }

  if (normalizedArea === AREA_MODES.PREPLACED) {
    placementUi?.setPhase?.("area");
    const referencePoint = setupTemplateReferencePoint(triggerTile, originTile, normalizedOrigin);
    const templates = await capturePreplacedTemplates(spell, selection.activityId, referencePoint, selection.effectiveTarget);
    if (!templates?.length) {
      await deleteCreatedTrapDocuments(triggerTile, originTile);
      return null;
    }
    await triggerTile.update({ [`flags.${MODULE_ID}.templates`]: templates });
  }

  await setTrapEnabled(triggerTile, true);
  await rememberCreationDefaults(selection);
  refreshTriggerOverlays();
  return triggerTile;
}

export async function placeAlarmTrap(selection, placementUi = null) {
  const alarm = normalizeAlarmConfig(selection.alarm);
  const normalizedOrigin = alarm.audibility.mode === ALARM_AUDIBILITY_MODES.SPATIAL
    ? normalizeOriginMode(selection.originMode)
    : ORIGIN_MODES.TRIGGER_TILE;
  const subject = { name: ALARM_TRAP_NAME, img: DEFAULT_TRIGGER_TEXTURE };
  placementUi?.setPhase?.("trigger");
  const controllerOptions = {
    trapType: "alarm",
    originMode: normalizedOrigin,
    alarm,
    pauseOnTrigger: selection.pauseOnTrigger,
    disarmAfterTrigger: selection.disarmAfterTrigger,
    discovery: selection.discovery
  };
  const triggerTile = await placeTrapTriggerSource(subject, selection, controllerOptions);
  if (!triggerTile) return null;

  let originTile = null;
  if (normalizedOrigin === ORIGIN_MODES.SEPARATE_TILE) {
    placementUi?.setPhase?.("origin");
    originTile = await placeSeparateTrapOriginTile(subject, triggerTile);
    if (!originTile) {
      await deleteCreatedTrapDocuments(triggerTile, null);
      return null;
    }
    await triggerTile.update({
      [`flags.${MODULE_ID}.originTileId`]: originTile.id,
      [`flags.${MODULE_ID}.originTileUuid`]: originTile.uuid
    });
  }

  await setTrapEnabled(triggerTile, true);
  refreshTriggerOverlays();
  refreshAreaOverlays();
  return triggerTile;
}

export async function placeSeparateTrapOriginTile(subject, triggerTile) {
  return placeGridDocument({
    width: 1,
    height: 1,
    originPreview: true,
    createDocument: point => createTrapOriginTile(subject, triggerTile, point)
  });
}

export async function placeCustomTargetZone({ widthCells = 1, heightCells = 1 } = {}) {
  const width = clampCellCount(widthCells);
  const height = clampCellCount(heightCells);
  return placeGridDocument({
    width,
    height,
    createDocument: async point => {
      const geometry = sceneGeometry();
      const offsets = rectangleOffsets(width, height);
      const baseCell = clampBaseCell(sceneCellFromPoint(point, geometry), offsets, geometry);
      const marker = markerDataForBaseCell(baseCell, offsets, geometry);
      return {
        x: marker.x,
        y: marker.y,
        width: marker.width,
        height: marker.height,
        widthCells: width,
        heightCells: height
      };
    }
  });
}

export async function placeGridDocument({ width = 1, height = 1, createDocument, originPreview = false }) {
  if (runtime.placing) return ui.notifications.warn("Finish the current placement first.");
  runtime.placing = true;
  try { await canvas.tiles?.activate?.(); } catch (_error) { /* layer activation is optional */ }

  const stage = canvas.stage;
  const previousCursor = stage.cursor;
  stage.cursor = "crosshair";
  stage.eventMode = stage.eventMode === "none" ? "static" : stage.eventMode;
  const preview = createPlacementPreview();

  return new Promise(resolve => {
    let finished = false;
    const cleanup = result => {
      if (finished) return;
      finished = true;
      stage.off("pointerdown", onPointerDown);
      stage.off("pointermove", onPointerMove);
      window.removeEventListener("keydown", onKeyDown, true);
      try { preview?.destroy({ children: true }); } catch (_error) { /* already destroyed */ }
      stage.cursor = previousCursor;
      runtime.placing = false;
      if (runtime.cancelPlacement === cancelPlacement) runtime.cancelPlacement = null;
      resolve(result ?? null);
    };
    const cancelPlacement = () => cleanup(null);
    runtime.cancelPlacement = cancelPlacement;
    const onKeyDown = event => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      cancelPlacement();
    };
    const onPointerMove = event => {
      if (finished || !preview) return;
      const point = pointerToCanvas(event);
      preview.clear();
      if (!point || !isPointInScene(point)) return;
      const geometry = sceneGeometry();
      const offsets = rectangleOffsets(width, height);
      const baseCell = clampBaseCell(sceneCellFromPoint(point, geometry), offsets, geometry);
      drawGridCells(preview, absoluteTriggerCells(baseCell, offsets), geometry, {
        preview: true,
        armed: true,
        origin: originPreview
      });
    };
    const onPointerDown = async event => {
      if (finished || event.button !== 0) return;
      event.stopPropagation?.();
      const point = pointerToCanvas(event);
      if (!point || !isPointInScene(point)) return;
      // Start listening before document creation so a fast pointer-up cannot be missed.
      const pointerReleased = waitForPlacementPointerRelease(event);
      const snapped = snapCell(point);
      try {
        const document = await createDocument(snapped);
        // Do not let the click that placed this Tile confirm the next D&D5e template preview.
        await pointerReleased;
        await waitForCanvasFrames(2);
        cleanup(document);
      } catch (error) {
        console.error(`${MODULE_ID} | Placement failed`, error);
        ui.notifications.error(`The placement could not be completed: ${error?.message ?? String(error ?? "Unknown error")}`);
        cleanup(null);
      }
    };
    stage.on("pointermove", onPointerMove);
    stage.on("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown, true);
  });
}
