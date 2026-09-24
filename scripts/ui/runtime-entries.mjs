import { MODULE_ID } from "../core/constants.mjs";
import { runtimeSpellFlag } from "../core/trap-model.mjs";

export function hideRuntimeSpellEntries(application, html) {
  const actor = application?.actor ?? application?.document;
  if (actor?.documentName !== "Actor" || !actor.items) return;
  const root = html?.querySelectorAll ? html : html?.[0] ?? application?.element;
  if (!root?.querySelectorAll) return;
  const ids = actor.items.filter(item => Boolean(runtimeSpellFlag(item))).map(item => item.id);
  for (const id of ids) {
    const selectors = [
      `[data-item-id="${id}"]`,
      `[data-entry-id="${id}"]`,
      `[data-document-id="${id}"]`,
      `[data-uuid$=".Item.${id}"]`
    ];
    for (const element of root.querySelectorAll(selectors.join(","))) element.remove();
  }
}

export function hideInternalCasterEntries(html) {
  const root = html?.querySelectorAll ? html : html?.[0] ?? html?.element;
  if (!root?.querySelectorAll) return;
  const ids = game.actors
    .filter(actor => actor.getFlag(MODULE_ID, "internalCaster") === true)
    .map(actor => actor.id);
  for (const id of ids) {
    const selectors = [
      `[data-entry-id="${id}"]`,
      `[data-document-id="${id}"]`,
      `[data-entity-id="${id}"]`
    ];
    for (const element of root.querySelectorAll(selectors.join(","))) element.remove();
  }
}
