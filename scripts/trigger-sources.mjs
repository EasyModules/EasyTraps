export const TRIGGER_TYPES = Object.freeze({
  TILE: "tile",
  DOOR: "door",
  ITEM_PILE: "item-pile"
});

export const TRIGGER_SOURCE_OWNERSHIP = Object.freeze({
  CREATED: "created-by-easytraps",
  ATTACHED: "attached-existing"
});


export const DOOR_INTERACTION_CONTEXT_SCHEMA = 1;

export function createDoorInteractionContextData({ interactionId, sceneId, wallId, userId, tokenId } = {}) {
  return {
    schema: DOOR_INTERACTION_CONTEXT_SCHEMA,
    interactionId: String(interactionId ?? ""),
    sceneId: String(sceneId ?? ""),
    wallId: String(wallId ?? ""),
    userId: String(userId ?? ""),
    tokenId: String(tokenId ?? "")
  };
}

export function validateDoorInteractionContext(value, { sceneId, wallId, userId } = {}) {
  if (!value || Number(value.schema) !== DOOR_INTERACTION_CONTEXT_SCHEMA) return null;
  const expectedSceneId = String(sceneId ?? "");
  const expectedWallId = String(wallId ?? "");
  const expectedUserId = String(userId ?? "");
  const interactionId = String(value.interactionId ?? "");
  if (!interactionId) return null;
  if (String(value.sceneId ?? "") !== expectedSceneId) return null;
  if (String(value.wallId ?? "") !== expectedWallId) return null;
  if (expectedUserId && String(value.userId ?? "") !== expectedUserId) return null;
  return createDoorInteractionContextData({
    interactionId,
    sceneId: expectedSceneId,
    wallId: expectedWallId,
    userId: value.userId ?? expectedUserId,
    tokenId: value.tokenId
  });
}

export function normalizeTriggerSourceOwnership(value, fallback = TRIGGER_SOURCE_OWNERSHIP.CREATED) {
  return Object.values(TRIGGER_SOURCE_OWNERSHIP).includes(value) ? value : fallback;
}

export function normalizeTriggerType(value) {
  return Object.values(TRIGGER_TYPES).includes(value) ? value : TRIGGER_TYPES.TILE;
}

export function triggerTypeLabel(value) {
  const type = normalizeTriggerType(value);
  if (type === TRIGGER_TYPES.DOOR) return "Door";
  if (type === TRIGGER_TYPES.ITEM_PILE) return "Item Pile";
  return "Tile";
}

export function isExternalTriggerType(value) {
  return normalizeTriggerType(value) !== TRIGGER_TYPES.TILE;
}

export function trapDiscoveryState(document, trap = document?.flags?.["easy-traps"]) {
  if (!document || !trap) return false;
  const type = normalizeTriggerType(trap.triggerType);
  return type === TRIGGER_TYPES.TILE ? document.hidden === false : trap.discovered === true;
}

export function sourceLinkFlag({ type, controllerTileId, controllerTileUuid, ownership } = {}) {
  return {
    schema: 2,
    type: normalizeTriggerType(type),
    controllerTileId: String(controllerTileId ?? ""),
    controllerTileUuid: String(controllerTileUuid ?? ""),
    ownership: normalizeTriggerSourceOwnership(ownership)
  };
}

export function sourceLinkFromDocument(document, moduleId = "easy-traps") {
  const value = document?.flags?.[moduleId]?.triggerSource;
  if (!value?.controllerTileId) return null;
  return {
    schema: Number(value.schema) || 1,
    type: normalizeTriggerType(value.type),
    controllerTileId: String(value.controllerTileId),
    controllerTileUuid: String(value.controllerTileUuid ?? ""),
    ownership: normalizeTriggerSourceOwnership(value.ownership)
  };
}


export function trapMatchesTriggerSource(trap, sourceDocument, expectedType = null) {
  if (!trap || !sourceDocument) return false;
  const sourceId = String(sourceDocument.id ?? "");
  const sourceUuid = String(sourceDocument.uuid ?? "");
  if (!sourceId && !sourceUuid) return false;
  const type = normalizeTriggerType(expectedType ?? trap.triggerType);
  if (normalizeTriggerType(trap.triggerType) !== type || !isExternalTriggerType(type)) return false;
  const trapSourceId = String(trap.triggerSourceId ?? "");
  const trapSourceUuid = String(trap.triggerSourceUuid ?? "");
  return Boolean(
    (trapSourceId && sourceId && trapSourceId === sourceId)
    || (trapSourceUuid && sourceUuid && trapSourceUuid === sourceUuid)
  );
}

export function trapRequiresTriggeringToken(trap, {
  triggeringOrigin = "triggering-token",
  triggeringTarget = "triggering-token"
} = {}) {
  return trap?.originMode === triggeringOrigin || trap?.targetMode === triggeringTarget;
}

/**
 * Return TileDocument geometry for an invisible Door controller whose center and
 * long axis are locked to the real Wall segment. The controller remains purely
 * technical, but its GM selection bounds now match the source instead of an
 * unrelated grid square.
 */
export function doorControllerTileGeometry(start = {}, end = {}, { thickness = 16, minLength = 1 } = {}) {
  const ax = Number(start.x);
  const ay = Number(start.y);
  const bx = Number(end.x);
  const by = Number(end.y);
  if (![ax, ay, bx, by].every(Number.isFinite)) return null;
  const dx = bx - ax;
  const dy = by - ay;
  const length = Math.hypot(dx, dy);
  if (!Number.isFinite(length) || length < Math.max(0, Number(minLength) || 0)) return null;

  const safeThickness = Math.max(1, Number(thickness) || 1);
  const ux = dx / length;
  const uy = dy / length;

  // EasyTraps technical controller Tiles are created with texture anchor (0, 0).
  // Foundry therefore rotates the rectangular Tile around its document origin.
  // Put that origin at the Wall start, shifted by half the controller thickness
  // along the local -Y axis. This keeps the rotated rectangle centered on the
  // Wall for horizontal, vertical, diagonal, and reversed Door segments.
  const perpX = -uy;
  const perpY = ux;
  return {
    x: ax - (perpX * safeThickness / 2),
    y: ay - (perpY * safeThickness / 2),
    width: length,
    height: safeThickness,
    rotation: Math.atan2(dy, dx) * 180 / Math.PI
  };
}
