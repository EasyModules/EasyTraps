import { waitForCanvasFrames } from "../core/timing.mjs";
import { runtimeOriginFlag } from "../core/trap-model.mjs";

/**
 * Supply the live Foundry targets expected by the native spell workflow.
 *
 * Successful targeted casts deliberately keep the workflow's resulting target
 * state. D&D5e chat actions and automation modules may resolve saves, damage,
 * effects, or macros after Item.use() has already returned. Restoring the GM's
 * previous targets on a timer can therefore erase the spell targets before the
 * native workflow is finished. Cancelled and failed casts still restore the
 * previous selection transactionally.
 */
export async function withNativeSpellTargets(ids, callback, { preserveOnSuccess = false } = {}) {
  const previous = currentTargetIds();
  await setUserTargetIds(ids);
  try {
    const result = await callback();
    if (!result || !preserveOnSuccess) await setUserTargetIds(previous);
    return result;
  } catch (error) {
    await setUserTargetIds(previous);
    throw error;
  }
}

export function filterRuntimeOriginTargetIds(ids) {
  return [...new Set(ids ?? [])].filter(id => {
    const token = canvas.scene?.tokens?.get?.(id);
    return Boolean(token?.actor) && !runtimeOriginFlag(token);
  });
}

export function currentTargetIds() {
  const targets = game.user?.targets;
  if (Array.isArray(targets?.ids)) return [...targets.ids];
  return Array.from(targets ?? []).map(token => token.id ?? token.document?.id).filter(Boolean);
}

export async function setUserTargetIds(ids) {
  const unique = [...new Set((ids ?? []).filter(id => canvas.tokens?.get?.(id)))];
  if (typeof game.user?.updateTokenTargets === "function") {
    await Promise.resolve(game.user.updateTokenTargets(unique));
    await waitForCanvasFrames(1);
    return;
  }
  const desired = new Set(unique);
  for (const token of Array.from(game.user?.targets ?? [])) {
    if (!desired.has(token.id)) {
      await Promise.resolve(token.setTarget?.(false, { user: game.user, releaseOthers: false, groupSelection: true }));
    }
  }
  for (const id of desired) {
    await Promise.resolve(canvas.tokens?.get?.(id)?.setTarget?.(true, { user: game.user, releaseOthers: false, groupSelection: true }));
  }
  await waitForCanvasFrames(1);
}
