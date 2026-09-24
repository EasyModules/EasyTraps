import { hasChange } from "./document-changes.mjs";
import { actorRuntimeOriginTokenDocument, isRuntimeOriginToken } from "./runtime-token-model.mjs";
import { runtimeOriginFlag } from "./trap-model.mjs";

export function makeRuntimeOriginNonInteractive(token) {
  const document = token?.document ?? token;
  if (!isRuntimeOriginToken(document)) return;
  try {
    token.eventMode = "none";
    token.interactive = false;
    token.interactiveChildren = false;
    token.buttonMode = false;
    token.cursor = "default";

    // Token alpha does not hide every canvas decoration from a GM. In
    // particular, Active Effect icons are rendered by their own container and
    // can remain visible over an otherwise transparent technical caster.
    // Preserve the effects mechanically, but hide their token decorations.
    // Foundry v14 exposes targetArrows (this User) and targetPips (other
    // Users) separately. Hide those public decorations directly and avoid the
    for (const decoration of [token.effects, token.nameplate, token.bars, token.tooltip, token.targetArrows, token.targetPips]) {
      if (!decoration) continue;
      decoration.visible = false;
      decoration.renderable = false;
      decoration.eventMode = "none";
    }
  } catch (_error) { /* rendering safety only */ }
}

export function refreshRuntimeOriginActorDecorations(actor) {
  if (!actor) return;
  const tokenDocument = actorRuntimeOriginTokenDocument(actor);
  if (!tokenDocument) return;
  makeRuntimeOriginNonInteractive(tokenDocument.object);
}

export function onTargetRuntimeOriginToken(user, token, targeted) {
  if (!targeted || !isRuntimeOriginToken(token)) return;
  queueMicrotask(() => {
    try { token.setTarget?.(false, { user, releaseOthers: false, groupSelection: true }); }
    catch (_error) { /* technical origins must never remain targeted */ }
  });
}

export function onControlRuntimeOriginToken(token, controlled) {
  if (!isRuntimeOriginToken(token) || !controlled) return;
  queueMicrotask(() => {
    try { token.release?.(); }
    catch (_error) { /* the token may already be released */ }
  });
}

export function closeRuntimeOriginTokenHud(hud) {
  if (!isRuntimeOriginToken(hud?.object)) return;
  queueMicrotask(() => hud?.close?.());
}

export function onPreUpdateToken(tokenDocument, changes, options = {}) {
  if (!runtimeOriginFlag(tokenDocument)) return;
  if (options?.easyTrapsInternal) return;
  const protectedFields = ["x", "y", "elevation", "rotation", "width", "height", "hidden", "alpha", "displayName", "displayBars", "locked"];
  if (protectedFields.some(path => hasChange(changes, path))) return false;
}
