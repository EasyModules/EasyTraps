import { safeTrapComplete } from "../core/completion.mjs";
import { runtime } from "../core/runtime-state.mjs";
import { executeConfiguredTrap } from "../core/trap-runtime.mjs";

export async function executeMattTrap(tile, triggeringTokens, options = {}) {
  const key = tile.uuid ?? tile.id;
  if (runtime.triggering.has(key)) {
    const payload = { continue: false, reason: "already-running" };
    safeTrapComplete(options.onComplete, payload);
    return payload;
  }
  runtime.triggering.add(key);
  try {
    return await executeConfiguredTrap(tile, triggeringTokens, options);
  } finally {
    runtime.triggering.delete(key);
  }
}
