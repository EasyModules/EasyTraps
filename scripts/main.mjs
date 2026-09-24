import { registerHooks } from "./bootstrap.mjs";
import { bindPresentation } from "./core/presentation.mjs";
import { refreshAreaOverlays, refreshTriggerOverlays } from "./ui/canvas-overlays.mjs";
import { refreshOpenSceneTrapManager } from "./ui/scene-manager.mjs";
import {
  pulsePlayerTrapInteraction,
  refreshPlayerTrapInteractionState,
  setPlayerTrapHover
} from "./ui/player-interaction.mjs";

// Bind views before init/ready callbacks can run. Every other dependency uses
// ordinary ES-module imports; no service registry or lazy forwarding is needed.
bindPresentation({
  refreshAreaOverlays,
  refreshOpenSceneTrapManager,
  refreshPlayerTrapInteractionState,
  refreshTriggerOverlays,
  pulsePlayerTrapInteraction,
  setPlayerTrapHover
});
registerHooks();
