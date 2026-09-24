import { ALARM_MACRO_NAME, MACRO_NAME, MODULE_ID } from "../core/constants.mjs";

export async function ensureMacro() {
  const existing = game.macros.find(macro => macro.getFlag(MODULE_ID, "createWizard") === true);
  if (existing) {
    const changes = {};
    if (existing.name !== MACRO_NAME) changes.name = MACRO_NAME;
    if (existing.command !== macroCommand()) changes.command = macroCommand();
    if (Object.keys(changes).length) await existing.update(changes);
    return existing;
  }
  return Macro.create({
    name: MACRO_NAME,
    type: "script",
    img: "icons/magic/symbols/runes-star-pentagon-magenta.webp",
    command: macroCommand(),
    flags: { [MODULE_ID]: { createWizard: true } },
    ownership: { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE }
  }, { renderSheet: false });
}

export function macroCommand() {
  return `game.modules.get("${MODULE_ID}")?.api?.openWizard();`;
}

export async function ensureAlarmMacro() {
  const existing = game.macros.find(macro => macro.getFlag(MODULE_ID, "createAlarmWizard") === true);
  if (existing) {
    const changes = {};
    if (existing.name !== ALARM_MACRO_NAME) changes.name = ALARM_MACRO_NAME;
    if (existing.command !== alarmMacroCommand()) changes.command = alarmMacroCommand();
    if (Object.keys(changes).length) await existing.update(changes);
    return existing;
  }
  return Macro.create({
    name: ALARM_MACRO_NAME,
    type: "script",
    img: `modules/${MODULE_ID}/assets/trigger-floor.svg`,
    command: alarmMacroCommand(),
    flags: { [MODULE_ID]: { createAlarmWizard: true } },
    ownership: { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE }
  }, { renderSheet: false });
}

export function alarmMacroCommand() {
  return `game.modules.get("${MODULE_ID}")?.api?.openAlarmWizard();`;
}

export async function removeLegacyDevelopmentMacros() {
  const legacy = game.macros.filter(macro => macro.getFlag(MODULE_ID, "selfTest") === true);
  for (const macro of legacy) {
    try { await macro.delete(); }
    catch (error) { console.warn(`${MODULE_ID} | Could not remove legacy development macro`, error); }
  }
}
