import { runtimeOriginFlag } from "./trap-model.mjs";

export function isRuntimeOriginToken(document) {
  return Boolean(runtimeOriginFlag(document?.document ?? document));
}

export function actorRuntimeOriginTokenDocument(actor) {
  const direct = actor?.token?.document ?? actor?.token ?? null;
  if (direct && runtimeOriginFlag(direct)) return direct;
  for (const token of canvas?.scene?.tokens ?? []) {
    if (!runtimeOriginFlag(token)) continue;
    if (token.actor === actor || token.actor?.id === actor?.id) return token;
  }
  return null;
}
