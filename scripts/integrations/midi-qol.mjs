import { actorRuntimeOriginTokenDocument } from "../core/runtime-token-model.mjs";
import { runtimeOriginFlag, runtimeSpellFlag } from "../core/trap-model.mjs";

export function stripRuntimeOriginFromTokenSet(value) {
  if (!(value instanceof Set)) return 0;
  let removed = 0;
  for (const token of [...value]) {
    const document = token?.document ?? token;
    if (!runtimeOriginFlag(document)) continue;
    value.delete(token);
    removed += 1;
  }
  return removed;
}

export function stripRuntimeOriginFromMidiWorkflow(workflow) {
  if (!workflow) return;
  const runtimeSpell = runtimeSpellFlag(workflow.item);
  const runtimeCaster = actorRuntimeOriginTokenDocument(workflow.actor);
  if (!runtimeSpell && !runtimeCaster) return;

  for (const key of ["targets", "hitTargets", "hitTargetsEC", "saves", "failedSaves", "superSavers", "semiSuperSavers"]) {
    stripRuntimeOriginFromTokenSet(workflow[key]);
  }

  // Midi auto-targeting can add the invisible caster to the user's target set
  // after a template is placed. Remove only EasyTraps technical origins.
  for (const token of Array.from(game.user?.targets ?? [])) {
    if (!runtimeOriginFlag(token?.document ?? token)) continue;
    try { token.setTarget?.(false, { user: game.user, releaseOthers: false, groupSelection: true }); }
    catch (_error) { /* target cleanup is best effort */ }
  }
}
