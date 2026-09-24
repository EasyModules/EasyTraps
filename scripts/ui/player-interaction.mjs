import { isPointInScene, pointerToCanvas } from "../core/canvas-geometry.mjs";
import { MODULE_ID, PLAYER_TRAP_HOVER_FADE_MS, PLAYER_TRAP_PULSE_MS } from "../core/constants.mjs";
import { attemptPlayerTrapDisarm, releasePlayerDisarmInteractionLock } from "../core/disarm-runtime.mjs";
import { runtime } from "../core/runtime-state.mjs";
import {
  pointInsideTrapInteractionGeometry,
  segmentBandPolygon,
  trapInteractionGeometry
} from "../core/trap-geometry.mjs";
import { trapData } from "../core/trap-model.mjs";
import { controllerTileFromSource } from "../core/trigger-links.mjs";
import { isPlayerTrapInteractionCandidate, playerTrapAtPoint, visibleTokenAtPoint } from "../player-interaction.mjs";
import { TRIGGER_TYPES, normalizeTriggerType, sourceLinkFromDocument } from "../trigger-sources.mjs";
import { drawOverlayPolygon, overlayHost } from "./canvas-drawing.mjs";

/**
 * Player trap interaction
 * -----------------------
 * Foundry v14 leaves visible Tiles non-interactive for players who do not own
 * them (`eventMode: none`). We intentionally do not change source permissions
 * or PIXI interaction state. Instead, the canvas stage performs a narrow
 * hover-only source-aware hit-test: ordinary traps use the Tile, Item Piles use
 * the real Token, and Doors use a bilateral band around the real Wall segment.
 * EasyTraps never converts a source primary click into DISARM; one shared HTML
 * DISARM control owns that action, leaving native source interaction untouched.
 */
export function setupPlayerTrapInteraction() {
  teardownPlayerTrapInteraction();
  if (game.user?.isGM || !canvas?.ready || !canvas.stage?.on) return;

  const state = runtime.playerTrapInteraction;
  state.moveHandler = event => onPlayerTrapPointerMove(event);
  canvas.stage.on("pointermove", state.moveHandler);
  state.installed = true;
}

export function teardownPlayerTrapInteraction() {
  const state = runtime.playerTrapInteraction;
  if (state.moveHandler) {
    try { canvas.stage?.off?.("pointermove", state.moveHandler); } catch (_error) { /* canvas already gone */ }
  }
  state.moveHandler = null;
  state.installed = false;
  state.lastPointerPoint = null;
  destroyPlayerDisarmControl();
  state.disarmBusy = false;
  state.pendingRequestId = null;
  if (state.activeLockId && state.activeLockTileId) {
    releasePlayerDisarmInteractionLock({ sceneId: state.activeLockSceneId, tileId: state.activeLockTileId, lockId: state.activeLockId });
  }
  state.activeLockId = null;
  state.activeLockTileId = null;
  state.activeLockSceneId = null;
  state.lockedTrapIds.clear();
  for (const pending of runtime.pendingDisarmRequests.values()) clearTimeout(pending.timeoutId);
  runtime.pendingDisarmRequests.clear();
  for (const pending of runtime.pendingDisarmPreflights.values()) {
    clearTimeout(pending.timeoutId);
    pending.resolve?.({ ok: false, error: "Canvas closed before the disarm attempt began." });
  }
  runtime.pendingDisarmPreflights.clear();
  setPlayerTrapHover(null, { immediate: true });
}

export function refreshPlayerTrapInteractionState() {
  const state = runtime.playerTrapInteraction;
  if (game.user?.isGM) {
    if (state.installed) teardownPlayerTrapInteraction();
    return;
  }
  if (!canvas?.ready || !canvas.scene) return;
  if (!state.installed) setupPlayerTrapInteraction();
  if (!state.hoveredTileId) return;
  const tile = canvas.scene.tiles.get?.(state.hoveredTileId)
    ?? canvas.scene.tiles.find?.(entry => entry.id === state.hoveredTileId);
  if (!isPlayerTrapInteractionCandidate(tile)) setPlayerTrapHover(null);
}

export function playerTrapInteractionAtPoint(point) {
  const scene = canvas.scene;
  const gridSize = Number(canvas.grid?.size ?? scene?.grid?.size) || 100;
  const token = visibleTokenAtPoint(point, canvas.tokens?.placeables ?? [], gridSize);

  // A discovered trapped Item Pile is itself a Token. Resolve it back to the
  // hidden controller so the visible source owns the interaction.
  if (token?.document) {
    const link = sourceLinkFromDocument(token.document, MODULE_ID);
    const itemPileTrap = link?.type === TRIGGER_TYPES.ITEM_PILE
      ? controllerTileFromSource(scene, token.document, TRIGGER_TYPES.ITEM_PILE)
      : null;
    if (isPlayerTrapInteractionCandidate(itemPileTrap)) {
      return { tile: itemPileTrap, token, sourceDocument: token.document, triggerType: TRIGGER_TYPES.ITEM_PILE };
    }
    return { tile: null, token, sourceDocument: null, triggerType: null };
  }

  const tiles = Array.from(scene?.tiles ?? []);
  for (let index = tiles.length - 1; index >= 0; index -= 1) {
    const tile = tiles[index];
    if (!isPlayerTrapInteractionCandidate(tile)) continue;
    const trap = trapData(tile);
    if (normalizeTriggerType(trap?.triggerType) !== TRIGGER_TYPES.DOOR) continue;
    const geometry = trapInteractionGeometry(tile, trap);
    if (geometry?.type === "segment" && pointInsideTrapInteractionGeometry(point, geometry)) {
      return {
        tile,
        token: null,
        sourceDocument: geometry.sourceDocument,
        triggerType: TRIGGER_TYPES.DOOR
      };
    }
  }

  const tile = playerTrapAtPoint(point, tiles);
  return {
    tile,
    token: null,
    sourceDocument: tile,
    triggerType: tile ? TRIGGER_TYPES.TILE : null
  };
}

export function onPlayerTrapPointerMove(event) {
  if (game.user?.isGM || !canvas?.scene) return;
  const state = runtime.playerTrapInteraction;
  const point = pointerToCanvas(event);
  state.lastPointerPoint = point ?? state.lastPointerPoint;
  if (!point || !isPointInScene(point)) {
    if (!state.disarmControlHovered) setPlayerTrapHover(null);
    return;
  }

  const interaction = playerTrapInteractionAtPoint(point);
  if (interaction.tile) {
    if (state.disarmControlHideTimer) {
      clearTimeout(state.disarmControlHideTimer);
      state.disarmControlHideTimer = null;
    }
    setPlayerTrapHover(interaction.tile);
    repositionPlayerDisarmControl(interaction.tile, point);
    return;
  }

  // The explicit DISARM control sits outside the source. Keep a short bridge
  // window while the pointer crosses that gap; entering the DOM control cancels
  // this timer. The source itself never becomes an EasyTraps click target.
  if (state.disarmControl && !state.disarmControlHovered) {
    if (!state.disarmControlHideTimer) {
      state.disarmControlHideTimer = setTimeout(() => {
        state.disarmControlHideTimer = null;
        if (!state.disarmControlHovered) setPlayerTrapHover(null);
      }, 260);
    }
    return;
  }

  // When the pointer is over the HTML DISARM control the canvas no longer
  // receives pointer movement. Preserve hover until the control reports leave.
  if (!state.disarmControlHovered) setPlayerTrapHover(null);
}

export function setPlayerTrapHover(tile, { immediate = false } = {}) {
  const state = runtime.playerTrapInteraction;
  const nextId = tile?.id ?? null;
  if (state.hoveredTileId === nextId && state.overlay) {
    if (tile) ensurePlayerDisarmControl(tile);
    return;
  }
  if (!nextId && !state.overlay && !state.hoveredTileId) {
    destroyPlayerDisarmControl();
    return;
  }

  state.hoveredTileId = nextId;
  destroyPlayerTrapHoverOverlay({ immediate });
  destroyPlayerDisarmControl();
  if (!tile) return;

  state.overlay = createPlayerTrapHoverOverlay(tile);
  if (state.overlay) animatePlayerTrapOverlay(state.overlay, 0, 1, 125);
  ensurePlayerDisarmControl(tile);
}

export function createPlayerTrapHoverOverlay(tile) {
  if (!globalThis.PIXI?.Container || !globalThis.PIXI?.Graphics) return null;
  const host = overlayHost();
  if (!host?.addChild) return null;

  const trap = trapData(tile);
  const geometry = trapInteractionGeometry(tile, trap);
  if (!geometry) return null;

  const container = new PIXI.Container();
  // Player source overlays are decoration only for every trigger type. The
  // single HTML DISARM control owns EasyTraps input, so native DoorControl and
  // Item Piles clicks always remain outside EasyTraps' canvas hit order.
  container.eventMode = "none";
  container.zIndex = 900;
  container.alpha = 0;

  const frame = new PIXI.Graphics();
  frame.eventMode = "none";
  if (geometry.type === "segment") {
    drawPlayerTrapInteractionSegment(frame, geometry.start, geometry.end, geometry.halfWidth);
  } else {
    const rect = geometry.rect;
    const x = Number(rect?.x) || 0;
    const y = Number(rect?.y) || 0;
    const width = Math.max(1, Number(rect?.width) || 1);
    const height = Math.max(1, Number(rect?.height) || 1);
    drawPlayerTrapInteractionFrame(frame, x, y, width, height);
  }
  container.addChild(frame);
  host.addChild(container);
  return container;
}

export function drawPlayerTrapInteractionSegment(graphic, start, end, halfWidth) {
  const gold = 0xe0b867;
  const violet = 0xb998d5;
  const polygon = segmentBandPolygon(start, end, Math.max(5, Number(halfWidth) || 5));
  const outer = segmentBandPolygon(start, end, Math.max(9, Number(halfWidth) || 5) + 7);
  const middle = segmentBandPolygon(start, end, Math.max(7, Number(halfWidth) || 5) + 4);
  drawOverlayPolygon(graphic, outer, violet, 0.07, 0.015);
  drawOverlayPolygon(graphic, middle, gold, 0.12, 0.02);
  drawOverlayPolygon(graphic, polygon, gold, 0.94, 0.025);
}

export function drawPlayerTrapInteractionFrame(graphic, x, y, width, height) {
  const gold = 0xe0b867;
  const violet = 0xb998d5;
  const inset = 2;

  drawPlayerTrapRect(graphic, x - 7, y - 7, width + 14, height + 14, violet, 0.07, 7, 0);
  drawPlayerTrapRect(graphic, x - 4, y - 4, width + 8, height + 8, gold, 0.12, 4, 0);
  drawPlayerTrapRect(graphic, x + inset, y + inset, Math.max(1, width - inset * 2), Math.max(1, height - inset * 2), gold, 0.94, 1.5, 0.025);

  const corner = Math.max(8, Math.min(16, Math.min(width, height) * 0.14));
  const left = x + inset;
  const right = x + width - inset;
  const top = y + inset;
  const bottom = y + height - inset;
  const segments = [
    [left, top + corner, left, top, left + corner, top],
    [right - corner, top, right, top, right, top + corner],
    [left, bottom - corner, left, bottom, left + corner, bottom],
    [right - corner, bottom, right, bottom, right, bottom - corner]
  ];
  for (const [x1, y1, x2, y2, x3, y3] of segments) {
    drawPlayerTrapCorner(graphic, x1, y1, x2, y2, x3, y3, 0xf4d795);
  }
}

export function drawPlayerTrapRect(graphic, x, y, width, height, color, alpha, lineWidth, fillAlpha = 0) {
  if (typeof graphic.rect === "function" && typeof graphic.stroke === "function") {
    graphic.rect(x, y, width, height);
    if (fillAlpha) graphic.fill({ color, alpha: fillAlpha });
    graphic.stroke({ color, alpha, width: lineWidth });
  } else {
    graphic.lineStyle(lineWidth, color, alpha);
    if (fillAlpha) graphic.beginFill(color, fillAlpha);
    graphic.drawRect(x, y, width, height);
    if (fillAlpha) graphic.endFill();
  }
}

export function drawPlayerTrapCorner(graphic, x1, y1, x2, y2, x3, y3, color) {
  if (typeof graphic.moveTo === "function" && typeof graphic.stroke === "function") {
    graphic.moveTo(x1, y1).lineTo(x2, y2).lineTo(x3, y3).stroke({ color, alpha: 0.98, width: 2.25 });
  } else {
    graphic.lineStyle(2.25, color, 0.98);
    graphic.moveTo(x1, y1);
    graphic.lineTo(x2, y2);
    graphic.lineTo(x3, y3);
  }
}

export function animatePlayerTrapOverlay(overlay, from, to, duration = 120, onComplete = null) {
  if (overlay?._easyTrapsAnimationFrame) cancelAnimationFrame(overlay._easyTrapsAnimationFrame);
  overlay.alpha = from;
  const start = performance.now();
  const tick = now => {
    if (overlay.destroyed) return;
    const progress = Math.min(1, Math.max(0, (now - start) / Math.max(1, duration)));
    const eased = progress * progress * (3 - 2 * progress);
    overlay.alpha = from + (to - from) * eased;
    if (progress < 1) overlay._easyTrapsAnimationFrame = requestAnimationFrame(tick);
    else {
      overlay._easyTrapsAnimationFrame = null;
      onComplete?.();
    }
  };
  overlay._easyTrapsAnimationFrame = requestAnimationFrame(tick);
}

export function destroyPlayerTrapHoverOverlay({ immediate = false } = {}) {
  const state = runtime.playerTrapInteraction;
  const overlay = state.overlay;
  state.overlay = null;
  if (!overlay) return;
  if (overlay._easyTrapsAnimationFrame) {
    cancelAnimationFrame(overlay._easyTrapsAnimationFrame);
    overlay._easyTrapsAnimationFrame = null;
  }
  const destroy = () => {
    try { overlay.destroy({ children: true }); } catch (_error) { /* already destroyed */ }
  };
  if (immediate) return destroy();
  animatePlayerTrapOverlay(overlay, Number(overlay.alpha) || 1, 0, PLAYER_TRAP_HOVER_FADE_MS, destroy);
}

export function pulsePlayerTrapInteraction() {
  const button = runtime.playerTrapInteraction.disarmControl?.querySelector?.('[data-et-action="disarm"]');
  if (!button?.animate) return;
  try {
    button.animate([
      { transform: "scale(1)" },
      { transform: "scale(.94)" },
      { transform: "scale(1)" }
    ], { duration: PLAYER_TRAP_PULSE_MS, easing: "ease-out" });
  } catch (_error) { /* animation is decorative */ }
}

export function destroyPlayerDisarmControl() {
  const state = runtime.playerTrapInteraction;
  if (state.disarmControlHideTimer) {
    clearTimeout(state.disarmControlHideTimer);
    state.disarmControlHideTimer = null;
  }
  const control = state.disarmControl;
  state.disarmControl = null;
  state.disarmControlTileId = null;
  state.disarmControlHovered = false;
  if (!control) return;
  try { control.remove(); } catch (_error) { /* already removed */ }
}

export function scenePointToClientPoint(point) {
  if (!point || !canvas?.app?.view || !canvas?.stage || !globalThis.PIXI?.Point) return null;
  const view = canvas.app.view;
  const rect = view.getBoundingClientRect?.();
  if (!rect) return null;
  let global;
  try {
    global = canvas.stage.toGlobal
      ? canvas.stage.toGlobal(new PIXI.Point(Number(point.x) || 0, Number(point.y) || 0))
      : canvas.stage.worldTransform?.apply?.(new PIXI.Point(Number(point.x) || 0, Number(point.y) || 0));
  } catch (_error) {
    global = null;
  }
  if (!global) return null;
  const screen = canvas.app.renderer?.screen ?? canvas.app.screen ?? { width: view.width, height: view.height };
  const screenWidth = Math.max(1, Number(screen?.width) || Number(view.width) || rect.width || 1);
  const screenHeight = Math.max(1, Number(screen?.height) || Number(view.height) || rect.height || 1);
  return {
    x: rect.left + Number(global.x) * (rect.width / screenWidth),
    y: rect.top + Number(global.y) * (rect.height / screenHeight)
  };
}

export function playerDisarmControlAnchor(tile, geometry, pointerPoint = null) {
  if (!geometry) return null;
  const type = normalizeTriggerType(trapData(tile)?.triggerType);

  if (type === TRIGGER_TYPES.DOOR && geometry.type === "segment") {
    const midpoint = {
      x: (Number(geometry.start?.x) + Number(geometry.end?.x)) / 2,
      y: (Number(geometry.start?.y) + Number(geometry.end?.y)) / 2
    };
    const startClient = scenePointToClientPoint(geometry.start);
    const endClient = scenePointToClientPoint(geometry.end);
    const midClient = scenePointToClientPoint(midpoint);
    if (!startClient || !endClient || !midClient) return null;

    const dx = endClient.x - startClient.x;
    const dy = endClient.y - startClient.y;
    const length = Math.hypot(dx, dy) || 1;
    let nx = -dy / length;
    let ny = dx / length;

    // DoorControl owns the midpoint. EasyTraps deliberately places DISARM on
    // one side of the Wall so the native door button always has visual and
    // pointer priority; moving over either side can still expose DISARM.
    const pointerClient = pointerPoint ? scenePointToClientPoint(pointerPoint) : null;
    if (pointerClient) {
      const side = (pointerClient.x - midClient.x) * nx + (pointerClient.y - midClient.y) * ny;
      if (side < 0) { nx *= -1; ny *= -1; }
    } else if (ny < -0.001 || (Math.abs(ny) <= 0.001 && nx < 0)) {
      nx *= -1;
      ny *= -1;
    }
    return { x: midClient.x + nx * 42, y: midClient.y + ny * 42, placement: "door" };
  }

  const rect = geometry.rect;
  if (!rect) return null;
  const width = Math.max(1, Number(rect.width) || 1);
  const height = Math.max(1, Number(rect.height) || 1);
  const centerX = (Number(rect.x) || 0) + width / 2;

  if (type === TRIGGER_TYPES.ITEM_PILE) {
    // The Item Pile owns its normal click/open affordance. Keep EasyTraps'
    // DISARM control on the opposite side of the source so it cannot cover
    // an OPEN/LOOT/SHOP control supplied by Item Piles, EasyLoot, or another
    // integration below the pile.
    const topCenter = scenePointToClientPoint({
      x: centerX,
      y: Number(rect.y) || 0
    });
    if (!topCenter) return null;
    return { x: topCenter.x, y: topCenter.y - 20, placement: "item-pile" };
  }

  const bottomCenter = scenePointToClientPoint({
    x: centerX,
    y: (Number(rect.y) || 0) + height
  });
  if (!bottomCenter) return null;
  return { x: bottomCenter.x, y: bottomCenter.y + 14, placement: "tile" };
}

export function repositionPlayerDisarmControl(tile = null, pointerPoint = null) {
  const state = runtime.playerTrapInteraction;
  const current = tile ?? (state.disarmControlTileId
    ? canvas.scene?.tiles?.get?.(state.disarmControlTileId)
      ?? canvas.scene?.tiles?.find?.(entry => entry.id === state.disarmControlTileId)
      ?? null
    : null);
  const control = state.disarmControl;
  if (!current || !control || state.disarmControlTileId !== current.id) return;

  const geometry = trapInteractionGeometry(current, trapData(current));
  const anchor = playerDisarmControlAnchor(current, geometry, pointerPoint ?? state.lastPointerPoint);
  if (!anchor) return;
  control.style.left = `${Math.round(anchor.x)}px`;
  control.style.top = `${Math.round(anchor.y)}px`;
  control.dataset.placement = anchor.placement;
}

export function createPlayerDisarmControlElement({ label = "DISARM", title = "Attempt to disarm the trap" } = {}) {
  const control = document.createElement("div");
  control.className = "easy-traps-player-disarm";
  control.setAttribute("role", "group");
  control.setAttribute("aria-label", "Trap disarm action");

  const button = document.createElement("button");
  button.type = "button";
  button.className = "et-player-disarm-action";
  button.dataset.etAction = "disarm";
  button.title = title;
  button.innerHTML = `<i class="fa-solid fa-screwdriver-wrench" aria-hidden="true"></i><span>${label}</span>`;
  control.appendChild(button);
  return { control, button };
}

export function ensurePlayerDisarmControl(tile) {
  if (game.user?.isGM || !tile || !isPlayerTrapInteractionCandidate(tile)) {
    destroyPlayerDisarmControl();
    return null;
  }
  const state = runtime.playerTrapInteraction;
  if (state.disarmControl && state.disarmControlTileId === tile.id) {
    repositionPlayerDisarmControl(tile, state.lastPointerPoint);
    return state.disarmControl;
  }

  destroyPlayerDisarmControl();
  const { control, button } = createPlayerDisarmControlElement();
  control.dataset.easyTrapsTileId = tile.id;

  button.addEventListener("click", event => {
    event.preventDefault();
    event.stopPropagation();
    const current = canvas.scene?.tiles?.get?.(tile.id)
      ?? canvas.scene?.tiles?.find?.(entry => entry.id === tile.id)
      ?? null;
    if (isPlayerTrapInteractionCandidate(current)) attemptPlayerTrapDisarm(current);
  });

  control.addEventListener("mouseenter", () => {
    state.disarmControlHovered = true;
    if (state.disarmControlHideTimer) {
      clearTimeout(state.disarmControlHideTimer);
      state.disarmControlHideTimer = null;
    }
  });
  control.addEventListener("mouseleave", () => {
    state.disarmControlHovered = false;
    if (state.disarmControlHideTimer) clearTimeout(state.disarmControlHideTimer);
    state.disarmControlHideTimer = setTimeout(() => {
      state.disarmControlHideTimer = null;
      if (!state.disarmControlHovered) setPlayerTrapHover(null);
    }, 90);
  });

  document.body.appendChild(control);
  state.disarmControl = control;
  state.disarmControlTileId = tile.id;
  repositionPlayerDisarmControl(tile, state.lastPointerPoint);
  requestAnimationFrame(() => { if (control.isConnected) control.classList.add("is-visible"); });
  return control;
}
