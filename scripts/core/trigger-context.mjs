import { runtimeOriginFlag } from "./trap-model.mjs";

export function localTriggeringTokenDocument() {
  const controlled = Array.from(canvas.tokens?.controlled ?? []).filter(token => {
    const document = token?.document;
    const actor = token?.actor;
    return document && actor?.isOwner === true && document.hidden !== true && !runtimeOriginFlag(document);
  });
  return controlled.length === 1 ? controlled[0].document : null;
}
