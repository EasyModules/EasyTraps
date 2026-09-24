import { MODULE_ID, ORIGIN_MODES, TARGET_MODES } from "../core/constants.mjs";
import { normalizeOriginMode, normalizeTargetMode, runtimeOriginFlag, trapData } from "../core/trap-model.mjs";
import { executeMattTrap } from "../triggers/tile-trigger.mjs";

export function registerMattActions(matt) {
  try {
    matt.registerTileGroup(MODULE_ID, "EasyTraps");
    matt.registerTileAction(MODULE_ID, "execute-trap", {
      name: "EasyTraps: Execute configured trap",
      ctrls: [],
      fn: async args => {
        const tile = args.tile;
        if (!tile) return;
        let tokens = (args.tokens ?? []).map(token => token?.document ?? token).filter(Boolean);
        if (!tokens.length) {
          // MATT's "Manually Trigger Actions" can invoke an action without a
          // movement token. Reuse one explicitly controlled GM token as the
          // triggering-creature context when the trap needs one. Area/custom
          // traps with a technical origin can execute without any token.
          const controlled = Array.from(canvas.tokens?.controlled ?? [])
            .map(token => token?.document ?? token)
            .filter(token => token?.actor && token.hidden !== true && !runtimeOriginFlag(token));
          const trap = trapData(tile);
          const needsTriggeringToken = normalizeOriginMode(trap?.originMode) === ORIGIN_MODES.TRIGGERING_TOKEN
            || normalizeTargetMode(trap?.targetMode) === TARGET_MODES.TRIGGERING_TOKEN;
          if (needsTriggeringToken) {
            if (controlled.length !== 1) {
              ui.notifications.warn("Select exactly one creature token before using Manually Trigger Actions for this trap.");
              tile.resumeActions?.(args._id, { continue: false, reason: "manual-trigger-token-required" });
              return { pause: false };
            }
            tokens = controlled;
          } else if (controlled.length === 1) tokens = controlled;
        }
        executeMattTrap(tile, tokens, {
          onComplete: result => tile.resumeActions?.(args._id, result)
        }).catch(error => {
          console.error(`${MODULE_ID} | MATT trap execution failed`, error);
          ui.notifications.error(`The trap failed: ${error.message ?? error}`);
          tile.resumeActions?.(args._id, { continue: false, error: String(error) });
        });
        return { pause: true };
      },
      content: async () => `<span class="action-style">EasyTraps</span> <span class="details-style">Execute configured trap</span>`
    });
  } catch (error) {
    console.error(`${MODULE_ID} | Could not register MATT action`, error);
  }
}
