import { isPrimaryGM } from "../core/authority.mjs";
import { controllerPointForDoor } from "../core/canvas-geometry.mjs";
import { DOOR_TRIGGER_ACTIVATION_DELAY_MS } from "../core/constants.mjs";
import { linkTriggerSourceDocument } from "../core/source-documents.mjs";
import { createTrapTriggerTile } from "../core/trap-documents.mjs";
import { localTriggeringTokenDocument } from "../core/trigger-context.mjs";
import { controllerTileFromSource } from "../core/trigger-links.mjs";
import {
  TRIGGER_SOURCE_OWNERSHIP,
  TRIGGER_TYPES,
  createDoorInteractionContextData,
  validateDoorInteractionContext
} from "../trigger-sources.mjs";
import { activateTrapFromTriggerSource } from "./source-runtime.mjs";
import { syncDoorControllerToSource } from "./source-sync.mjs";

export async function createDoorTrapController(subject, start, end, controllerOptions) {
  const scene = canvas.scene;
  const doorType = CONST?.WALL_DOOR_TYPES?.DOOR ?? 1;
  const closedState = CONST?.WALL_DOOR_STATES?.CLOSED ?? 0;
  const normal = CONST?.WALL_RESTRICTION_TYPES?.NORMAL ?? 20;
  const [wall] = await scene.createEmbeddedDocuments("Wall", [{
    c: [start.x, start.y, end.x, end.y],
    move: normal,
    sight: normal,
    light: normal,
    sound: normal,
    door: doorType,
    ds: closedState
  }], { easyTrapsInternal: true });
  if (!wall) throw new Error("Foundry did not create the Door Wall.");

  let controller = null;
  try {
    controller = await createTrapTriggerTile(subject, controllerPointForDoor(start, end), {
      ...controllerOptions,
      widthCells: 1,
      heightCells: 1,
      triggerType: TRIGGER_TYPES.DOOR,
      triggerSourceId: wall.id,
      triggerSourceUuid: wall.uuid,
      triggerSourceOwnership: TRIGGER_SOURCE_OWNERSHIP.CREATED
    });
    await linkTriggerSourceDocument(wall, controller, TRIGGER_TYPES.DOOR);
    await syncDoorControllerToSource(wall, controller);
    return controller;
  } catch (error) {
    if (wall?.parent?.walls?.has?.(wall.id)) await wall.parent.deleteEmbeddedDocuments("Wall", [wall.id], { easyTrapsInternal: true }).catch(() => {});
    if (controller?.parent?.tiles?.has?.(controller.id)) await controller.parent.deleteEmbeddedDocuments("Tile", [controller.id], { easyTrapsInternal: true }).catch(() => {});
    throw error;
  }
}

export function createDoorInteractionContext(wallDocument, userId, tokenDocument = null) {
  return createDoorInteractionContextData({
    interactionId: foundry.utils.randomID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    sceneId: wallDocument?.parent?.id,
    wallId: wallDocument?.id,
    userId: userId ?? game.user?.id,
    tokenId: tokenDocument?.id
  });
}

export function doorInteractionContextForUpdate(wallDocument, options = {}, userId = null) {
  return validateDoorInteractionContext(options?.easyTrapsDoorContext, {
    sceneId: wallDocument?.parent?.id,
    wallId: wallDocument?.id,
    userId
  });
}

export function onPreUpdateDoorTriggerSource(wallDocument, changes, options = {}, userId = game.user?.id) {
  if (options?.easyTrapsInternal) return;
  const tile = controllerTileFromSource(wallDocument?.parent, wallDocument, TRIGGER_TYPES.DOOR);
  if (!tile) return;
  if (!Object.hasOwn(changes ?? {}, "ds")) return;
  const openState = CONST?.WALL_DOOR_STATES?.OPEN ?? 1;
  if (Number(changes.ds) !== Number(openState)) return;

  // Foundry v14 preserves custom Document update options from the client that
  // initiates preUpdateWall through to updateWall on the authoritative GM.
  // Capture the triggering token at the exact Door interaction seam instead of
  // reconstructing it later from socket timing or long-lived control history.
  const token = localTriggeringTokenDocument();
  options.easyTrapsDoorContext = createDoorInteractionContext(wallDocument, userId, token);
}

export function onUpdateDoorTriggerSource(wallDocument, changes, options = {}, userId = null) {
  const controller = controllerTileFromSource(wallDocument?.parent, wallDocument, TRIGGER_TYPES.DOOR);
  if (!controller) return;
  if (Array.isArray(changes?.c) && isPrimaryGM()) queueMicrotask(() => syncDoorControllerToSource(wallDocument, controller));
  if (!Object.hasOwn(changes ?? {}, "ds")) return;
  const openState = CONST?.WALL_DOOR_STATES?.OPEN ?? 1;
  if (Number(changes.ds) !== Number(openState) || !isPrimaryGM()) return;

  // Resolve and validate the interaction context synchronously before the
  // short activation delay. The delay remains only to let the Door document
  // finish its native open transition; it is no longer part of token identity.
  const context = doorInteractionContextForUpdate(wallDocument, options, userId);
  const contextTokenId = String(context?.tokenId ?? "");
  const contextUserId = String(context?.userId ?? userId ?? "");

  setTimeout(async () => {
    const scene = wallDocument.parent;
    const tile = controllerTileFromSource(scene, wallDocument, TRIGGER_TYPES.DOOR);
    if (!tile) return;

    let token = contextTokenId ? scene.tokens?.get?.(contextTokenId) ?? null : null;
    const user = contextUserId ? game.users.get?.(contextUserId) ?? null : null;
    if (token?.actor && user && !user.isGM && !token.actor.testUserPermission?.(user, "OWNER")) token = null;

    await activateTrapFromTriggerSource(tile, token, {
      sourceType: TRIGGER_TYPES.DOOR,
      sourceDocument: wallDocument
    });
  }, DOOR_TRIGGER_ACTIVATION_DELAY_MS);
}
