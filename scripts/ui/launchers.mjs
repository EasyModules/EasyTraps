import { runtime } from "../core/runtime-state.mjs";
import { getFavoriteSpellUuids, loadSpellCatalog } from "../core/spell-catalog.mjs";
import { openAlarmCreationWizard, openCreationWizard } from "./trap-wizard.mjs";

export async function openWizard() {
  if (!game.user.isGM) return ui.notifications.warn("Only a GM can create spell traps.");
  if (!canvas.ready || !canvas.scene) return ui.notifications.warn("Open a scene before creating a trap.");
  if (runtime.placing) return ui.notifications.warn("Finish the current trigger placement first.");

  const catalog = await loadSpellCatalog();
  if (!catalog.length) return ui.notifications.error("No spells were found in the selected compendiums.");
  return openCreationWizard(catalog, getFavoriteSpellUuids(catalog));
}

export async function openAlarmWizard() {
  if (!game.user.isGM) return ui.notifications.warn("Only a GM can create alarm traps.");
  if (!canvas.ready || !canvas.scene) return ui.notifications.warn("Open a scene before creating a trap.");
  if (runtime.placing) return ui.notifications.warn("Finish the current trigger placement first.");
  return openAlarmCreationWizard();
}
