import { MODULE_ID } from "../core/constants.mjs";
import { runtimeOriginFlag } from "../core/trap-model.mjs";

export async function cleanupPersistentRuntimeOriginVisuals(tokenDocument) {
  if (!tokenDocument || !runtimeOriginFlag(tokenDocument)) return 0;
  const manager = globalThis.Sequencer?.EffectManager;
  if (!(manager?.getEffects instanceof Function) || !(manager?.endEffects instanceof Function)) return 0;
  const object = tokenDocument.object ?? tokenDocument;
  try {
    const effects = [
      ...(manager.getEffects({ source: object }) ?? []),
      ...(manager.getEffects({ target: object }) ?? [])
    ];
    const persistent = [...new Map(effects
      .filter(effect => effect?.data?.persist === true)
      .map(effect => [effect.id, effect])).values()];
    if (!persistent.length) return 0;
    await manager.endEffects({ effects: persistent });
    return persistent.length;
  } catch (error) {
    console.warn(`${MODULE_ID} | Could not clean persistent visual effects from the technical origin`, error);
    return 0;
  }
}
