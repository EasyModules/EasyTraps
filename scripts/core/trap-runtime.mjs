import { isAlarmTrap, trapData } from "./trap-model.mjs";
import { executeAlarmTrap } from "../payloads/alarm-payload.mjs";
import { executeNativeTrapSpell } from "../payloads/spell-payload.mjs";

export async function executeConfiguredTrap(tile, triggeringTokens, options = {}) {
  const trap = trapData(tile);
  if (isAlarmTrap(trap)) return executeAlarmTrap(tile, triggeringTokens, options);
  return executeNativeTrapSpell(tile, triggeringTokens, options);
}
