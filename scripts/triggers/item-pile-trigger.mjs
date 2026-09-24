import { isPrimaryGM } from "../core/authority.mjs";
import { snapCell } from "../core/canvas-geometry.mjs";
import {
  ITEM_PILE_INTERACTION_DEDUPE_MS,
  ITEM_PILE_INTERACTION_DEDUPE_WINDOW_MS,
  MODULE_ID,
  SOCKET_CHANNEL
} from "../core/constants.mjs";
import { runtime } from "../core/runtime-state.mjs";
import { linkTriggerSourceDocument } from "../core/source-documents.mjs";
import { createTrapTriggerTile } from "../core/trap-documents.mjs";
import { runtimeOriginFlag } from "../core/trap-model.mjs";
import { localTriggeringTokenDocument } from "../core/trigger-context.mjs";
import { controllerTileFromSource } from "../core/trigger-links.mjs";
import { deleteItemPileDocument } from "../integrations/item-piles.mjs";
import {
  TRIGGER_SOURCE_OWNERSHIP,
  TRIGGER_TYPES,
  normalizeTriggerType,
  sourceLinkFromDocument
} from "../trigger-sources.mjs";
import { activateTrapFromTriggerSource } from "./source-runtime.mjs";
import { syncItemPileControllerToSource } from "./source-sync.mjs";

export async function createItemPileTrapController(subject, point, controllerOptions) {
  const api = game.itempiles?.API;
  if (!game.modules.get("item-piles")?.active || typeof api?.createItemPile !== "function") {
    throw new Error("Item Piles must be active to create an Item Pile trigger.");
  }
  const scene = canvas.scene;
  const position = snapCell(point);
  const created = await api.createItemPile({ position, sceneId: scene.id });
  // Item Piles versions have returned either the created Token UUID directly
  // or a small result object. Accept both public shapes without depending on
  // private implementation details.
  const tokenUuid = String(typeof created === "string" ? created : (created?.tokenUuid ?? created?.uuid ?? "")).trim();
  const source = tokenUuid ? await fromUuid(tokenUuid) : null;
  const tokenDocument = source?.document ?? source;
  if (!tokenDocument || tokenDocument.documentName !== "Token") throw new Error("Item Piles did not return the created Token document.");

  let controller = null;
  try {
    controller = await createTrapTriggerTile(subject, { x: Number(tokenDocument.x), y: Number(tokenDocument.y) }, {
      ...controllerOptions,
      widthCells: 1,
      heightCells: 1,
      triggerType: TRIGGER_TYPES.ITEM_PILE,
      triggerSourceId: tokenDocument.id,
      triggerSourceUuid: tokenDocument.uuid,
      triggerSourceOwnership: TRIGGER_SOURCE_OWNERSHIP.CREATED
    });
    await linkTriggerSourceDocument(tokenDocument, controller, TRIGGER_TYPES.ITEM_PILE);
    await syncItemPileControllerToSource(tokenDocument, controller);
    return controller;
  } catch (error) {
    await deleteItemPileDocument(tokenDocument).catch(() => {});
    if (controller?.parent?.tiles?.has?.(controller.id)) await controller.parent.deleteEmbeddedDocuments("Tile", [controller.id], { easyTrapsInternal: true }).catch(() => {});
    throw error;
  }
}

export function setupTriggerSourceHooks() {
  if (runtime.itemPileHookInstalled) return;
  // Item Piles exposes two useful families of public hooks. The dedicated
  // openItemPile hooks are the strongest seam because they provide the real
  // pile TokenDocument plus the interacting TokenDocument. The interface hooks
  // cover ordinary inventory UI opens. All are deduped into one EasyTraps
  // activation so a single click can never cast twice.
  Hooks.on("item-piles-preOpenItemPile", (source, interactingToken) => onItemPileTriggerInteraction(source, interactingToken));
  Hooks.on("item-piles-openItemPile", (source, interactingToken) => onItemPileTriggerInteraction(source, interactingToken));
  Hooks.on("item-piles-preOpenInterface", (source, recipient) => onItemPileTriggerInteraction(source, recipient));
  Hooks.on("item-piles-openInterface", (_app, source, recipient) => onItemPileTriggerInteraction(source, recipient));
  Hooks.on("item-piles-preOpenItemPileInventory", onItemPileTriggerInteraction);

  // Item Piles can update its Token through its own API. Mirror that movement
  // immediately in addition to Foundry's ordinary updateToken hook so the
  // invisible controller always follows the visible pile.
  Hooks.on("item-piles-updateItemPile", source => {
    if (!isPrimaryGM()) return;
    const tokenDocument = source?.document ?? source;
    queueMicrotask(() => syncItemPileControllerToSource(tokenDocument).catch(error => console.warn(`${MODULE_ID} | Could not sync Item Pile controller from Item Piles hook`, error)));
  });
  runtime.itemPileHookInstalled = true;
}

export function itemPileTokenDocumentFromContext(value, scene = canvas.scene, { requireSourceLink = false } = {}) {
  const isAcceptedSourceToken = token => {
    if (!token) return false;
    if (!requireSourceLink) return true;
    return Boolean(controllerTileFromSource(scene, token, TRIGGER_TYPES.ITEM_PILE));
  };

  const direct = value?.document ?? value ?? null;
  const directName = String(direct?.documentName ?? direct?.constructor?.documentName ?? "");
  if (directName === "Token" && isAcceptedSourceToken(direct)) return direct;

  const actor = directName === "Actor" ? direct : (direct?.actor ?? null);
  const syntheticToken = actor?.token?.document ?? actor?.token ?? null;
  const syntheticName = String(syntheticToken?.documentName ?? syntheticToken?.constructor?.documentName ?? "");
  if (syntheticName === "Token" && isAcceptedSourceToken(syntheticToken)) return syntheticToken;

  const actorId = actor?.id ?? direct?.actorId ?? direct?.actor?.id ?? null;
  if (!scene || !actorId) return null;
  const candidates = Array.from(scene.tokens ?? []).filter(token => {
    if (token?.actor?.id !== actorId) return false;
    return isAcceptedSourceToken(token);
  });
  if (candidates.length === 1) return candidates[0];

  if (!requireSourceLink) {
    const controlled = Array.from(canvas.tokens?.controlled ?? [])
      .map(token => token?.document ?? token)
      .filter(token => token?.actor?.id === actorId && token?.actor?.isOwner === true && token?.hidden !== true && !runtimeOriginFlag(token));
    if (controlled.length === 1) return controlled[0];
  }
  return null;
}

export function itemPileInteractionIsDuplicate(source, userId = game.user?.id) {
  const key = `${String(source?.parent?.id ?? canvas.scene?.id ?? "")}:${String(source?.id ?? "")}:${String(userId ?? "")}`;
  const now = Date.now();
  const previous = Number(runtime.itemPileInteractionDedupe.get(key)) || 0;
  runtime.itemPileInteractionDedupe.set(key, now);
  for (const [entry, at] of runtime.itemPileInteractionDedupe) {
    if (now - Number(at) > ITEM_PILE_INTERACTION_DEDUPE_MS) runtime.itemPileInteractionDedupe.delete(entry);
  }
  return previous > 0 && now - previous < ITEM_PILE_INTERACTION_DEDUPE_WINDOW_MS;
}

export function onItemPileTriggerInteraction(itemPileSource, interactingSource) {
  const scene = canvas.scene;
  const source = itemPileTokenDocumentFromContext(itemPileSource, scene, { requireSourceLink: true });
  if (!source) return;
  const sourceScene = source.parent ?? scene;
  if (!sourceScene || itemPileInteractionIsDuplicate(source)) return;

  let tokenDocument = itemPileTokenDocumentFromContext(interactingSource, sourceScene);
  // Current Item Piles can provide only the recipient Actor to its interface
  // hook. When that Actor has multiple Scene tokens, never guess; exactly one
  // locally controlled owned token is the same safety rule used by Door traps.
  if (!tokenDocument) tokenDocument = localTriggeringTokenDocument();

  if (isPrimaryGM()) {
    const tile = controllerTileFromSource(sourceScene, source, TRIGGER_TYPES.ITEM_PILE);
    if (tile) queueMicrotask(() => activateTrapFromTriggerSource(tile, tokenDocument, { sourceType: TRIGGER_TYPES.ITEM_PILE, sourceDocument: source }));
    return;
  }
  if (!game.user?.isGM && game.socket?.emit) {
    game.socket.emit(SOCKET_CHANNEL, {
      type: "trigger-source-activate",
      sourceType: TRIGGER_TYPES.ITEM_PILE,
      sceneId: sourceScene.id,
      sourceId: source.id,
      userId: game.user.id,
      tokenId: tokenDocument?.id ?? ""
    });
  }
}

export async function resolveGmItemPileTriggerActivation(message) {
  if (!isPrimaryGM()) return;
  const scene = game.scenes.get?.(message?.sceneId);
  const user = game.users.get?.(message?.userId);
  if (!scene || !user || user.isGM) return;
  const type = normalizeTriggerType(message?.sourceType);
  if (type !== TRIGGER_TYPES.ITEM_PILE) return;
  const source = scene.tokens?.get?.(message?.sourceId) ?? null;
  const tile = source ? controllerTileFromSource(scene, source, TRIGGER_TYPES.ITEM_PILE) : null;
  if (!source || !tile) return;
  const token = message?.tokenId ? scene.tokens?.get?.(message.tokenId) ?? null : null;
  if (token?.actor && !token.actor.testUserPermission?.(user, "OWNER")) return;
  await activateTrapFromTriggerSource(tile, token, { sourceType: type, sourceDocument: source });
}

export function syncVisibleItemPileController(token) {
  if (!isPrimaryGM()) return;
  const tokenDocument = token?.document ?? token;
  if (!tokenDocument || String(tokenDocument.documentName ?? "") !== "Token") return;
  const link = sourceLinkFromDocument(tokenDocument, MODULE_ID);
  if (link?.type !== TRIGGER_TYPES.ITEM_PILE) return;
  const tile = controllerTileFromSource(tokenDocument.parent, tokenDocument, TRIGGER_TYPES.ITEM_PILE);
  if (!tile) return;
  void syncItemPileControllerToSource(tokenDocument, tile).catch(error => console.warn(`${MODULE_ID} | Could not keep Item Pile controller attached`, error));
}

export function onUpdateItemPileTriggerSource(tokenDocument, changes, options = {}) {
  if (options?.easyTrapsInternal || !isPrimaryGM()) return;
  const tile = controllerTileFromSource(tokenDocument?.parent, tokenDocument, TRIGGER_TYPES.ITEM_PILE);
  if (!tile) return;
  if (!["x", "y", "width", "height", "rotation", "elevation"].some(key => Object.hasOwn(changes ?? {}, key))) return;
  queueMicrotask(() => syncItemPileControllerToSource(tokenDocument, tile).catch(error => console.warn(`${MODULE_ID} | Could not sync Item Pile controller`, error)));
}
