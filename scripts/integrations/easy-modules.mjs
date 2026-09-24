import { MODULE_ID } from "../core/constants.mjs";
import { openConfiguration, resetSettings } from "../ui/configuration.mjs";
import { openWizard } from "../ui/launchers.mjs";

export function registerWithEasyModules() {
  const hub = game.easyModules;
  if (typeof hub?.register !== "function") return false;
  hub.register({
    id: MODULE_ID,
    moduleId: MODULE_ID,
    moduleIds: [MODULE_ID],
    globalApis: ["easyTraps"],
    title: "EasyTraps",
    description: "Create Spell Traps and Alarm Traps with Tile, Door, and Item Pile trigger sources.",
    actionLabel: "Create Spell Trap",
    configLabel: "Configure",
    resetLabel: "Restore Defaults",
    iconClass: "fas fa-dungeon",
    status: "available",
    order: 30,
    onClick: openWizard,
    onConfigure: openConfiguration,
    onReset: resetSettings
  });
  return true;
}
