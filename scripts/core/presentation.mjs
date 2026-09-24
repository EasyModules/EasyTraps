/**
 * Synchronous presentation callbacks keep state/workflows independent of UI
 * modules. main.mjs binds the real views before any Foundry hook is registered.
 * Calls retain their original ordering, return values and error propagation;
 * this is deliberately not an asynchronous event bus.
 */
let views;

export function bindPresentation(handlers) {
  if (views) throw new Error("EasyTraps presentation is already bound.");
  for (const name of [
    "refreshAreaOverlays", "refreshOpenSceneTrapManager",
    "refreshPlayerTrapInteractionState", "refreshTriggerOverlays",
    "pulsePlayerTrapInteraction", "setPlayerTrapHover"
  ]) {
    if (typeof handlers?.[name] !== "function") {
      throw new TypeError(`EasyTraps presentation callback is missing: ${name}`);
    }
  }
  views = Object.freeze({ ...handlers });
}

export function refreshAreaOverlays(...args) { return views.refreshAreaOverlays(...args); }
export function refreshOpenSceneTrapManager(...args) { return views.refreshOpenSceneTrapManager(...args); }
export function refreshPlayerTrapInteractionState(...args) { return views.refreshPlayerTrapInteractionState(...args); }
export function refreshTriggerOverlays(...args) { return views.refreshTriggerOverlays(...args); }
export function pulsePlayerTrapInteraction(...args) { return views.pulsePlayerTrapInteraction(...args); }
export function setPlayerTrapHover(...args) { return views.setPlayerTrapHover(...args); }
