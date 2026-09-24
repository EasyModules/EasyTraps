import { MODULE_ID } from "../core/constants.mjs";
import { runtime } from "../core/runtime-state.mjs";
import { convertConfiguredLength } from "../length-units.mjs";

export function convertLengthUnits(value, fromUnits, toUnits, { fallback = null } = {}) {
  const movementUnits = globalThis.dnd5e?.config?.movementUnits
    ?? globalThis.game?.dnd5e?.config?.movementUnits
    ?? globalThis.CONFIG?.DND5E?.movementUnits
    ?? {};
  const result = convertConfiguredLength(value, fromUnits, toUnits, movementUnits, { fallback });
  if (result.supported) return result.value;

  const warningKey = `${String(result.from || fromUnits || "").trim()}->${String(result.to || toUnits || "").trim()}:${result.reason}`;
  if (!runtime.unitWarnings.has(warningKey)) {
    runtime.unitWarnings.add(warningKey);
    console.warn(
      `${MODULE_ID} | Unsupported D&D5e length conversion ${result.from || fromUnits || "(blank)"} -> ${result.to || toUnits || "(blank)"}; preserving the numeric value.`
    );
  }
  return result.value;
}
