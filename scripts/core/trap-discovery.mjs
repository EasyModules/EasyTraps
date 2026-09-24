import { isPrimaryGM } from "./authority.mjs";
import { DISCOVERY_VISION_RECHECK_DELAY_MS, MODULE_ID } from "./constants.mjs";
import { hasChange } from "./document-changes.mjs";
import { refreshAreaOverlays, refreshOpenSceneTrapManager, refreshTriggerOverlays } from "./presentation.mjs";
import { runtime } from "./runtime-state.mjs";
import { escapeHtml } from "./text.mjs";
import { isWithinTrapRange, measureTokenToTrapDistance, trapHasLineOfSightFromToken } from "./trap-geometry.mjs";
import { runtimeOriginFlag, sceneTrapDocuments, trapData, trapIsDiscovered } from "./trap-model.mjs";
import {
  actorEffectivePassivePerception,
  evaluatePassiveDiscovery,
  isPassiveDiscoveryCandidate,
  normalizeDiscoveryConfig
} from "../discovery.mjs";
import { TRIGGER_TYPES, normalizeTriggerType } from "../trigger-sources.mjs";

/**
 * Passive discovery can become newly valid without token movement: a door can
 * open, a wall can move/change sight restriction, or a Token vision source can
 * be refreshed. Foundry's sightRefresh hook is the broad signal; Wall hooks
 * and vision-relevant Token updates are retained as reliable document seams.
 * Rechecks are throttled and always resolved by the primary GM.
 */
export function onSightRefreshDiscovery() {
  scheduleVisionDiscoveryRecheck();
}

export function onTokenVisionChangedDiscovery(tokenDocument, changes = {}) {
  if (!tokenDocument?.actor?.hasPlayerOwner || runtimeOriginFlag(tokenDocument)) return;
  const relevant = ["x", "y", "elevation", "width", "height", "hidden", "sight", "detectionModes"]
    .some(path => hasChange(changes, path));
  if (relevant) scheduleVisionDiscoveryRecheck();
}

export function scheduleVisionDiscoveryRecheck() {
  if (!isPrimaryGM() || !canvas.ready || !canvas.scene) return;
  if (runtime.discoveryVisionRecheckRunning) {
    runtime.discoveryVisionRecheckAgain = true;
    return;
  }
  if (runtime.discoveryVisionRecheckTimer) return;
  runtime.discoveryVisionRecheckTimer = setTimeout(() => {
    runtime.discoveryVisionRecheckTimer = null;
    reevaluatePassiveDiscoveryForScene().catch(error => {
      console.error(`${MODULE_ID} | Vision-change passive discovery recheck failed`, error);
    });
  }, DISCOVERY_VISION_RECHECK_DELAY_MS);
}

export async function reevaluatePassiveDiscoveryForScene() {
  if (!isPrimaryGM() || !canvas.ready || !canvas.scene) return [];
  if (runtime.discoveryVisionRecheckRunning) {
    runtime.discoveryVisionRecheckAgain = true;
    return [];
  }
  runtime.discoveryVisionRecheckRunning = true;
  const found = [];
  try {
    const tokens = Array.from(canvas.scene.tokens ?? []).filter(token =>
      token?.actor?.hasPlayerOwner && token.hidden !== true && !runtimeOriginFlag(token)
    );
    for (const token of tokens) {
      const discovered = await evaluateMovedTokenDiscovery(token);
      if (discovered?.length) found.push(...discovered);
    }
    return found;
  } finally {
    runtime.discoveryVisionRecheckRunning = false;
    if (runtime.discoveryVisionRecheckAgain) {
      runtime.discoveryVisionRecheckAgain = false;
      scheduleVisionDiscoveryRecheck();
    }
  }
}

/**
 * Movement remains an immediate discovery signal. sightRefresh also covers it,
 * but retaining moveToken avoids waiting for the throttled broad recheck.
 */
export function onMoveTokenDiscovery(tokenDocument) {
  if (!isPrimaryGM()) return;
  if (!canvas.ready || tokenDocument?.parent?.id !== canvas.scene?.id) return;
  if (runtimeOriginFlag(tokenDocument)) return;
  if (!tokenDocument?.actor?.hasPlayerOwner) return;

  queueMicrotask(() => {
    evaluateMovedTokenDiscovery(tokenDocument).catch(error => {
      console.error(`${MODULE_ID} | Passive discovery failed`, error);
    });
  });
}

export async function evaluateMovedTokenDiscovery(tokenDocument) {
  const scene = canvas.scene;
  const actor = tokenDocument?.actor;
  if (!scene || !actor?.hasPlayerOwner) return [];

  const candidates = sceneTrapDocuments(scene).filter(tile => isPassiveDiscoveryCandidate({
    trap: trapData(tile),
    hidden: !trapIsDiscovered(tile, trapData(tile)),
    busy: runtime.discovering.has(tile.id)
  }));
  if (!candidates.length) return [];

  const discoveries = [];
  for (const tile of candidates) {
    const trap = trapData(tile);
    const config = normalizeDiscoveryConfig(trap.discovery);
    const distance = measureTokenToTrapDistance(tokenDocument, tile);

    // Distance is intentionally evaluated before any wall collision work.
    if (!isWithinTrapRange(distance, config.detection.distance)) continue;

    const hasLOS = !config.detection.requireLOS || trapHasLineOfSightFromToken(tokenDocument, tile);
    const result = evaluatePassiveDiscovery({ actor, config, distance, hasLOS });
    if (!result.discovered) continue;

    runtime.discovering.add(tile.id);
    discoveries.push({ tile, trap, config, result });
  }
  if (!discoveries.length) return [];

  try {
    const updates = discoveries.map(({ tile, trap }) => ({
      _id: tile.id,
      [`flags.${MODULE_ID}.discovered`]: true,
      hidden: normalizeTriggerType(trap.triggerType) === TRIGGER_TYPES.TILE ? false : true
    }));
    await scene.updateEmbeddedDocuments("Tile", updates, { easyTrapsDiscovery: true });

    refreshTriggerOverlays();
    refreshAreaOverlays();
    refreshOpenSceneTrapManager();

    if (discoveries.some(entry => entry.config.detection.pauseOnDiscovery) && !game.paused) {
      game.togglePause(true, { broadcast: true });
    }

    try {
      const discoverer = escapeHtml(actor?.name ?? tokenDocument?.name ?? "A character");
      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker?.({ actor, token: tokenDocument }) ?? {},
        content: discoveries.length === 1
          ? `<p><strong>${discoverer}</strong> discovered a hidden trap.</p>`
          : `<p><strong>${discoverer}</strong> discovered hidden traps.</p>`
      });
    } catch (error) {
      console.warn(`${MODULE_ID} | Could not create discovery chat message`, error);
    }

    Hooks.callAll("easyTrapsTrapDiscovered", {
      token: tokenDocument,
      actor,
      passivePerception: actorEffectivePassivePerception(actor),
      traps: discoveries.map(entry => entry.tile)
    });
    return discoveries;
  } finally {
    for (const { tile } of discoveries) runtime.discovering.delete(tile.id);
  }
}
