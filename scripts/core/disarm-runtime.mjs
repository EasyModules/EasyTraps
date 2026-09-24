import { isPrimaryGM, primaryActiveGMUser } from "./authority.mjs";
import {
  DISARM_ATTEMPT_SOUND,
  DISARM_CANCELLED_PREFLIGHT_TTL_MS,
  DISARM_INTERACTION_LOCK_TIMEOUT_MS,
  DISARM_MAX_DISTANCE_FT,
  DISARM_PREFLIGHT_TIMEOUT_MS,
  DISARM_RESOLUTION_TIMEOUT_MS,
  MODULE_ID,
  SOCKET_CHANNEL
} from "./constants.mjs";
import {
  pulsePlayerTrapInteraction,
  refreshAreaOverlays,
  refreshOpenSceneTrapManager,
  refreshPlayerTrapInteractionState,
  refreshTriggerOverlays,
  setPlayerTrapHover
} from "./presentation.mjs";
import { runtime } from "./runtime-state.mjs";
import { escapeHtml } from "./text.mjs";
import { scheduleVisionDiscoveryRecheck } from "./trap-discovery.mjs";
import { isWithinTrapRange, measureTokenToTrapDisarmDistance } from "./trap-geometry.mjs";
import { runtimeOriginFlag, trapData, trapIsDiscovered } from "./trap-model.mjs";
import { executeConfiguredTrap } from "./trap-runtime.mjs";
import { setTrapEnabled } from "./trap-state.mjs";
import {
  disarmDcFromTrap,
  evaluateDisarmAttempt,
  evaluateDisarmEligibility,
  firstUsableDisarmRoll,
  naturalD20FromRoll,
  normalizeDisarmAttempts,
  recordDisarmAttempt
} from "../disarm.mjs";
import { normalizeDiscoveryConfig } from "../discovery.mjs";
import { receiveAlarmPlaybackMessage } from "../payloads/alarm-payload.mjs";
import { isPlayerTrapInteractionCandidate } from "../player-interaction.mjs";
import { resolveGmItemPileTriggerActivation } from "../triggers/item-pile-trigger.mjs";

export async function attemptPlayerTrapDisarm(tile) {

  if (!isPlayerTrapInteractionCandidate(tile) || game.user?.isGM) return;
  const state = runtime.playerTrapInteraction;
  if (state.disarmBusy) return;

  pulsePlayerTrapInteraction();
  // Keep the original hook for compatibility with early EasyTraps integrations,
  // but expose the semantically correct hook for new consumers.
  Hooks.callAll("easyTrapsPlayerTrapClick", tile, game.user);
  Hooks.callAll("easyTrapsPlayerDisarmAttempt", tile, game.user);

  const controlled = Array.from(canvas.tokens?.controlled ?? []).filter(token => {
    const actor = token?.actor;
    return actor?.isOwner === true && token.document?.hidden !== true && !runtimeOriginFlag(token.document);
  });
  if (controlled.length !== 1) {
    ui.notifications.warn(controlled.length
      ? "Select only one of your tokens before attempting to disarm the trap."
      : "Select one of your tokens before attempting to disarm the trap.");
    return;
  }

  const token = controlled[0];
  const actor = token.actor;
  if (!(actor?.rollSkill instanceof Function)) {
    ui.notifications.error("D&D5e's native Sleight of Hand roll is unavailable for this Actor.");
    return;
  }
  if (!primaryActiveGMUser()) {
    ui.notifications.warn("A GM must be connected to resolve the disarm attempt.");
    return;
  }

  const trap = trapData(tile);
  if (state.lockedTrapIds.has(tile.id)) {
    return ui.notifications.warn("Another character is already attempting to disarm this trap.");
  }
  const distance = measureTokenToTrapDisarmDistance(token.document, tile, canvas.scene);
  if (!isWithinTrapRange(distance, DISARM_MAX_DISTANCE_FT)) {
    return ui.notifications.warn(`Move within ${DISARM_MAX_DISTANCE_FT} ft of the trap to attempt to disarm it.`);
  }
  const config = normalizeDiscoveryConfig(trap?.discovery);
  if (!config.enabled) {
    refreshPlayerTrapInteractionState();
    return ui.notifications.warn("Disarming is disabled for this trap.");
  }

  // Fast local rejection for the common case. The authoritative GM preflight
  // below is still mandatory so stale player data can never open a roll that
  // the GM already knows is invalid (missing tool, prior attempt, etc.).
  const localEligibility = evaluateDisarmEligibility({
    actor,
    config,
    attempts: trap?.disarmAttempts
  });
  if (!localEligibility.allowed) return ui.notifications.warn(localEligibility.message);

  state.disarmBusy = true;
  try {
    const preflight = await requestGmDisarmPreflight({ tile, token, actor });
    if (!preflight?.ok) {
      if (preflight?.error) ui.notifications.warn(preflight.error);
      return;
    }
    const lockId = String(preflight.lockId ?? "");
    state.activeLockId = lockId || null;
    state.activeLockTileId = lockId ? tile.id : null;
    state.activeLockSceneId = lockId ? canvas.scene?.id ?? null : null;

    // A genuine attempt begins only after every non-roll gate was approved by
    // the GM. This ensures denied attempts never produce a meaningless d20.
    playDisarmAttemptSound();
    const returned = await actor.rollSkill({ skill: "slt" });
    const roll = firstUsableDisarmRoll(returned);
    if (!roll) {
      releasePlayerDisarmInteractionLock({ tileId: tile.id, lockId });
      return;
    }
    const naturalD20 = naturalD20FromRoll(roll);

    const requestId = foundry.utils.randomID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    state.pendingRequestId = requestId;

    const timeoutId = setTimeout(() => {
      const pending = runtime.pendingDisarmRequests.get(requestId);
      if (!pending) return;
      runtime.pendingDisarmRequests.delete(requestId);
      if (state.pendingRequestId === requestId) state.pendingRequestId = null;
      state.disarmBusy = false;
      releasePlayerDisarmInteractionLock({ tileId: tile.id, lockId });
      ui.notifications.warn("The GM client did not finish resolving the disarm attempt in time. Please try again.");
    }, DISARM_RESOLUTION_TIMEOUT_MS);

    runtime.pendingDisarmRequests.set(requestId, { timeoutId, tileId: tile.id, lockId });
    game.socket.emit(SOCKET_CHANNEL, {
      type: "disarm-request",
      requestId,
      userId: game.user.id,
      sceneId: canvas.scene?.id,
      tileId: tile.id,
      tokenId: token.id,
      actorId: actor.id,
      lockId,
      skill: "slt",
      total: Number(roll.total),
      naturalD20
    });
  } catch (error) {
    if (state.activeLockId) releasePlayerDisarmInteractionLock({ tileId: tile.id, lockId: state.activeLockId });
    console.error(`${MODULE_ID} | Native disarm roll failed`, error);
    ui.notifications.error("The Sleight of Hand check could not be rolled.");
  } finally {
    if (!state.pendingRequestId) {
      state.disarmBusy = false;
      state.activeLockId = null;
      state.activeLockTileId = null;
      state.activeLockSceneId = null;
    }
  }
}

export function releasePlayerDisarmInteractionLock({ sceneId = canvas.scene?.id, tileId, lockId } = {}) {
  const id = String(lockId ?? "").trim();
  if (!id || !game.socket?.emit) return;
  game.socket.emit(SOCKET_CHANNEL, {
    type: "disarm-cancel",
    userId: game.user?.id,
    sceneId,
    tileId,
    lockId: id
  });
  if (runtime.playerTrapInteraction.activeLockId === id) {
    runtime.playerTrapInteraction.activeLockId = null;
    runtime.playerTrapInteraction.activeLockTileId = null;
    runtime.playerTrapInteraction.activeLockSceneId = null;
  }
}

export function playDisarmAttemptSound() {
  const data = {
    src: DISARM_ATTEMPT_SOUND,
    volume: 0.7,
    autoplay: true,
    loop: false,
    channel: "interface"
  };
  try {
    const AudioHelperClass = globalThis.foundry?.audio?.AudioHelper ?? game.audio?.constructor ?? globalThis.AudioHelper;
    if (typeof AudioHelperClass?.play === "function") {
      AudioHelperClass.play(data, true);
      return true;
    }
    game.audio?.play?.(DISARM_ATTEMPT_SOUND);
    return true;
  } catch (error) {
    console.warn(`${MODULE_ID} | Could not play disarm-attempt sound`, error);
    return false;
  }
}

export function requestGmDisarmPreflight({ tile, token, actor }) {
  return new Promise(resolve => {
    const requestId = foundry.utils.randomID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const timeoutId = setTimeout(() => {
      const pending = runtime.pendingDisarmPreflights.get(requestId);
      if (!pending) return;
      runtime.pendingDisarmPreflights.delete(requestId);
      game.socket?.emit?.(SOCKET_CHANNEL, {
        type: "disarm-preflight-cancel",
        requestId,
        userId: game.user.id,
        sceneId: canvas.scene?.id,
        tileId: tile.id
      });
      resolve({
        ok: false,
        error: "The GM client did not process the disarm request in time. Please try again."
      });
    }, DISARM_PREFLIGHT_TIMEOUT_MS);

    runtime.pendingDisarmPreflights.set(requestId, { timeoutId, resolve, tileId: tile.id, sceneId: canvas.scene?.id });
    game.socket.emit(SOCKET_CHANNEL, {
      type: "disarm-preflight",
      requestId,
      userId: game.user.id,
      sceneId: canvas.scene?.id,
      tileId: tile.id,
      tokenId: token.id,
      actorId: actor.id
    });
  });
}

export function setupGmAuthorityResumeHandling() {
  if (runtime.gmAuthorityResumeInstalled || !globalThis.document?.addEventListener) return;
  const resume = () => {
    if (globalThis.document?.hidden || !isPrimaryGM()) return;
    cleanupExpiredGmDisarmInteractionLocks();
    if (canvas?.ready && canvas?.scene) scheduleVisionDiscoveryRecheck();
  };
  globalThis.document.addEventListener("visibilitychange", resume);
  globalThis.window?.addEventListener?.("focus", resume);
  runtime.gmAuthorityResumeInstalled = true;
}

export function setupDisarmSocket() {
  if (runtime.disarmSocketInstalled || !game.socket?.on) return;
  game.socket.on(SOCKET_CHANNEL, message => {
    if (!message || typeof message !== "object") return;

    if (message.type === "alarm-play") {
      receiveAlarmPlaybackMessage(message).catch(error => console.warn(`${MODULE_ID} | Alarm socket playback failed`, error));
      return;
    }
    if (message.type === "trigger-source-activate") {
      if (!isPrimaryGM()) return;
      resolveGmItemPileTriggerActivation(message).catch(error => console.error(`${MODULE_ID} | Item Pile trigger activation failed`, error));
      return;
    }
    if (message.type === "disarm-preflight") {
      if (!isPrimaryGM()) return;
      resolveGmDisarmPreflight(message).catch(error => {
        console.error(`${MODULE_ID} | Could not resolve disarm preflight`, error);
        emitDisarmPreflightResult(message, { ok: false, error: "The GM could not validate the disarm attempt." });
      });
      return;
    }
    if (message.type === "disarm-preflight-result") {
      receivePlayerDisarmPreflightResult(message);
      return;
    }
    if (message.type === "disarm-preflight-cancel") {
      if (isPrimaryGM()) cancelGmDisarmPreflight(message);
      return;
    }
    if (message.type === "disarm-lock-state") {
      receiveDisarmLockState(message);
      return;
    }
    if (message.type === "disarm-cancel") {
      if (isPrimaryGM()) releaseGmDisarmInteractionLock(message);
      return;
    }
    if (message.type === "disarm-request") {
      if (!isPrimaryGM()) return;
      resolveGmDisarmRequest(message).catch(error => {
        console.error(`${MODULE_ID} | Could not resolve player disarm request`, error);
        emitDisarmResult(message, { ok: false, error: "The GM could not resolve the disarm attempt." });
      });
      return;
    }
    if (message.type === "disarm-result") receivePlayerDisarmResult(message);
  });
  runtime.disarmSocketInstalled = true;
}

export function gmDisarmContext(message) {
  const user = game.users.get?.(message?.userId);
  const scene = game.scenes.get?.(message?.sceneId);
  const tile = scene?.tiles?.get?.(message?.tileId);
  const token = scene?.tokens?.get?.(message?.tokenId);
  const actor = token?.actor;
  const trap = trapData(tile);
  const config = normalizeDiscoveryConfig(trap?.discovery);

  if (!user || user.isGM) return { ok: false, error: "The requesting player could not be validated." };
  if (!scene || !tile || !trap || !token || !actor) return { ok: false, error: "The trap or attempting token is no longer available." };
  if (String(actor.id) !== String(message?.actorId)) return { ok: false, error: "The attempting Actor no longer matches the selected token." };
  if (!actor.testUserPermission?.(user, "OWNER")) return { ok: false, error: "You do not own the selected Actor." };
  if (token.hidden === true || runtimeOriginFlag(token)) return { ok: false, error: "The selected token cannot attempt to disarm this trap." };
  if (!trapIsDiscovered(tile, trap)) return { ok: false, error: "The trap is no longer discovered." };
  if (trap.armed === false) return { ok: false, error: "The trap has already been disarmed." };
  if (trap.requiresReconfiguration === true) return { ok: false, error: "This trap must be recreated before it can be disarmed." };
  if (!config.enabled) return { ok: false, error: "Disarming is disabled for this trap." };
  const distance = measureTokenToTrapDisarmDistance(token, tile, scene);
  if (!isWithinTrapRange(distance, DISARM_MAX_DISTANCE_FT)) {
    return { ok: false, error: `Move within ${DISARM_MAX_DISTANCE_FT} ft of the trap to attempt to disarm it.`, reason: "out-of-range" };
  }

  const eligibility = evaluateDisarmEligibility({
    actor,
    config,
    attempts: trap.disarmAttempts
  });
  if (!eligibility.allowed) return { ok: false, error: eligibility.message, reason: eligibility.reason };

  return { ok: true, user, scene, tile, token, actor, trap, config, eligibility };
}

export async function resolveGmDisarmPreflight(message) {
  if (!isPrimaryGM()) return;
  if (gmDisarmPreflightWasCancelled(message)) return;
  const context = gmDisarmContext(message);
  if (!context.ok) {
    emitDisarmPreflightResult(message, { ok: false, error: context.error, reason: context.reason });
    return;
  }
  const acquired = acquireGmDisarmInteractionLock(message);
  if (!acquired.ok) {
    emitDisarmPreflightResult(message, { ok: false, error: acquired.error, reason: "busy" });
    return;
  }
  emitDisarmPreflightResult(message, { ok: true, lockId: acquired.lockId });
}

export function disarmInteractionLockKey(sceneId, tileId) {
  return `${String(sceneId ?? "")}:${String(tileId ?? "")}`;
}

export function pruneCancelledDisarmPreflights(now = Date.now()) {
  for (const [requestId, entry] of runtime.cancelledDisarmPreflights) {
    if (!entry || Number(entry.expiresAt) <= now) runtime.cancelledDisarmPreflights.delete(requestId);
  }
}

export function gmDisarmPreflightWasCancelled(message) {
  pruneCancelledDisarmPreflights();
  const requestId = String(message?.requestId ?? "");
  if (!requestId) return false;
  const entry = runtime.cancelledDisarmPreflights.get(requestId);
  if (!entry) return false;
  return (!entry.userId || String(entry.userId) === String(message?.userId ?? ""))
    && (!entry.tileId || String(entry.tileId) === String(message?.tileId ?? ""));
}

export function currentGmDisarmInteractionLock(key, now = Date.now()) {
  const existing = runtime.disarmInteractionLocks.get(key);
  if (!existing) return null;
  if (Number(existing.expiresAt) > now) return existing;
  releaseGmDisarmInteractionLock({
    sceneId: existing.sceneId,
    tileId: existing.tileId,
    lockId: existing.lockId,
    userId: existing.userId
  });
  return null;
}

export function cleanupExpiredGmDisarmInteractionLocks(now = Date.now()) {
  for (const key of Array.from(runtime.disarmInteractionLocks.keys())) currentGmDisarmInteractionLock(key, now);
  pruneCancelledDisarmPreflights(now);
}

export function cancelGmDisarmPreflight(message = {}) {
  const requestId = String(message.requestId ?? "").trim();
  if (!requestId) return false;
  const now = Date.now();
  pruneCancelledDisarmPreflights(now);
  runtime.cancelledDisarmPreflights.set(requestId, {
    userId: String(message.userId ?? ""),
    tileId: String(message.tileId ?? ""),
    expiresAt: now + DISARM_CANCELLED_PREFLIGHT_TTL_MS
  });

  const key = disarmInteractionLockKey(message.sceneId, message.tileId);
  const existing = currentGmDisarmInteractionLock(key, now);
  if (existing && String(existing.requestId ?? "") === requestId
    && (!message.userId || String(existing.userId) === String(message.userId))) {
    releaseGmDisarmInteractionLock({
      sceneId: message.sceneId, tileId: message.tileId, lockId: existing.lockId, userId: existing.userId
    });
  }
  return true;
}

export function acquireGmDisarmInteractionLock(message) {
  const key = disarmInteractionLockKey(message?.sceneId, message?.tileId);
  const existing = currentGmDisarmInteractionLock(key);
  if (existing) return { ok: false, error: "Another character is already attempting to disarm this trap." };
  const lockId = foundry.utils.randomID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const expiresAt = Date.now() + DISARM_INTERACTION_LOCK_TIMEOUT_MS;
  const timeoutId = setTimeout(() => releaseGmDisarmInteractionLock({
    sceneId: message.sceneId, tileId: message.tileId, lockId, userId: message.userId
  }), DISARM_INTERACTION_LOCK_TIMEOUT_MS);
  runtime.disarmInteractionLocks.set(key, {
    requestId: String(message.requestId ?? ""),
    lockId, userId: message.userId, actorId: message.actorId, tokenId: message.tokenId,
    sceneId: message.sceneId, tileId: message.tileId, expiresAt, timeoutId
  });
  emitDisarmLockState({ sceneId: message.sceneId, tileId: message.tileId, userId: message.userId, locked: true });
  return { ok: true, lockId };
}

export function releaseGmDisarmInteractionLock(message = {}) {
  const key = disarmInteractionLockKey(message.sceneId, message.tileId);
  const existing = runtime.disarmInteractionLocks.get(key);
  if (!existing) return false;
  if (message.lockId && String(message.lockId) !== String(existing.lockId)) return false;
  if (message.userId && String(message.userId) !== String(existing.userId)) return false;
  clearTimeout(existing.timeoutId);
  runtime.disarmInteractionLocks.delete(key);
  emitDisarmLockState({ sceneId: message.sceneId, tileId: message.tileId, userId: existing.userId, locked: false });
  return true;
}

export function emitDisarmLockState({ sceneId, tileId, userId, locked } = {}) {
  if (!game.socket?.emit || !tileId) return;
  game.socket.emit(SOCKET_CHANNEL, { type: "disarm-lock-state", sceneId, tileId, userId, locked: locked === true });
}

export function receiveDisarmLockState(message) {
  if (game.user?.isGM || message?.sceneId !== canvas.scene?.id || !message?.tileId) return;
  const locks = runtime.playerTrapInteraction.lockedTrapIds;
  if (message.locked === true) locks.add(message.tileId);
  else locks.delete(message.tileId);
}

export function emitDisarmPreflightResult(request, result) {
  if (!game.socket?.emit || !request?.requestId || !request?.userId) return;
  game.socket.emit(SOCKET_CHANNEL, {
    type: "disarm-preflight-result",
    requestId: request.requestId,
    userId: request.userId,
    sceneId: request.sceneId,
    tileId: request.tileId,
    ok: result?.ok === true,
    reason: result?.reason ? String(result.reason) : "",
    error: result?.error ? String(result.error) : "",
    lockId: result?.lockId ? String(result.lockId) : ""
  });
}

export function receivePlayerDisarmPreflightResult(message) {
  if (game.user?.isGM || message?.userId !== game.user?.id) return;
  const pending = runtime.pendingDisarmPreflights.get(message.requestId);
  if (!pending) {
    // A delayed GM response can arrive after the player's local timeout. If
    // that late answer created a lock, release it immediately instead of
    // leaving the trap falsely busy until the GM timer eventually wakes up.
    if (message.ok === true && message.lockId) {
      releasePlayerDisarmInteractionLock({
        sceneId: message.sceneId, tileId: message.tileId, lockId: message.lockId
      });
    }
    return;
  }
  clearTimeout(pending.timeoutId);
  runtime.pendingDisarmPreflights.delete(message.requestId);
  pending.resolve?.({
    ok: message.ok === true,
    reason: message.reason || null,
    error: message.error || "",
    lockId: message.lockId || ""
  });
}

export async function resolveGmDisarmRequest(message) {
  if (!isPrimaryGM()) return;

  const lockKey = `${message?.sceneId ?? ""}:${message?.tileId ?? ""}`;
  if (runtime.disarmGmLocks.has(lockKey)) {
    return emitDisarmResult(message, { ok: false, error: "Another disarm attempt is already being resolved for this trap." });
  }
  runtime.disarmGmLocks.add(lockKey);

  try {
    const interaction = currentGmDisarmInteractionLock(lockKey);
    if (!interaction
      || String(interaction.lockId) !== String(message?.lockId ?? "")
      || String(interaction.userId) !== String(message?.userId ?? "")) {
      return emitDisarmResult(message, { ok: false, error: "This disarm interaction is no longer reserved for your character." });
    }
    const context = gmDisarmContext(message);
    const reject = error => emitDisarmResult(message, { ok: false, error });
    if (!context.ok) return reject(context.error);

    const { user, tile, token, actor, trap, config } = context;
    const total = Number(message.total);
    const naturalD20 = Number.isInteger(Number(message.naturalD20)) ? Number(message.naturalD20) : null;
    if (!Number.isFinite(total)) return reject("The Sleight of Hand result was invalid.");
    if (!["slt", "sleightOfHand"].includes(String(message.skill ?? ""))) return reject("The requested disarm skill was invalid.");

    const dc = disarmDcFromTrap(trap);
    const outcome = evaluateDisarmAttempt({ total, dc, naturalD20, config });
    if (!outcome.valid) return reject("The Sleight of Hand result was invalid.");

    const attempts = recordDisarmAttempt(trap.disarmAttempts, actor.id, {
      total: outcome.total,
      naturalD20: outcome.naturalD20,
      success: outcome.success,
      triggered: outcome.triggerTrap,
      userId: user.id,
      timestamp: Date.now()
    });

    // Persist the attempt before any consequence. A dangerous activation can
    // itself disarm/re-arm the Tile, but must not erase the one-attempt record.
    await tile.update({ [`flags.${MODULE_ID}.disarmAttempts`]: attempts }, { easyTrapsPlayerDisarm: true });

    if (outcome.success) {
      await setTrapEnabled(tile, false, { resetDisarmAttempts: false });
      refreshTriggerOverlays();
      refreshAreaOverlays();
      refreshOpenSceneTrapManager();
    } else if (outcome.triggerTrap) {
      try {
        await executeConfiguredTrap(tile, [token]);
      } catch (error) {
        console.error(`${MODULE_ID} | Dangerous disarm failure could not activate trap`, error);
        await postDisarmResolutionMessage({ tile, trap, actor, token, outcome, attempts, activationError: true }).catch(() => {});
        return emitDisarmResult(message, {
          ok: false,
          error: "The disarm failed, but the trap could not complete its activation. Check the GM console.",
          triggered: true,
          triggerReason: outcome.triggerReason
        });
      }
    }

    await postDisarmResolutionMessage({ tile, trap, actor, token, outcome, attempts }).catch(error => {
      console.warn(`${MODULE_ID} | Could not post disarm result card`, error);
    });

    console.info(`${MODULE_ID} | Player disarm resolved`, {
      tileId: tile.id,
      actorId: actor.id,
      userId: user.id,
      total: outcome.total,
      naturalD20: outcome.naturalD20,
      dc: outcome.dc,
      success: outcome.success,
      triggered: outcome.triggerTrap,
      triggerReason: outcome.triggerReason
    });
    emitDisarmResult(message, {
      ok: true,
      success: outcome.success,
      triggered: outcome.triggerTrap,
      triggerReason: outcome.triggerReason,
      total: outcome.total,
      dc: config.disarm.showDcInChat === true ? outcome.dc : null
    });
  } finally {
    releaseGmDisarmInteractionLock(message);
    runtime.disarmGmLocks.delete(lockKey);
  }
}

export async function postDisarmResolutionMessage({ tile, trap, actor, token, outcome, attempts, activationError = false } = {}) {
  if (!globalThis.ChatMessage?.create || !outcome?.valid) return null;
  const record = normalizeDisarmAttempts(attempts)?.[actor?.id];
  const triggered = outcome.triggerTrap === true;
  const status = outcome.success ? "Disarmed" : triggered ? "Trap Triggered" : "Failed";
  const cardClass = outcome.success ? "is-success" : triggered ? "is-triggered" : "is-failure";
  const icon = outcome.success ? "fa-circle-check" : triggered ? "fa-burst" : "fa-circle-xmark";
  const natural = outcome.naturalD20 === 1 ? "Natural 1 · " : "";
  const showDc = normalizeDiscoveryConfig(trap?.discovery).disarm.showDcInChat === true;
  const rollDisplay = showDc
    ? `${natural}${escapeHtml(outcome.total)} vs DC ${escapeHtml(outcome.dc)}`
    : `${natural}${escapeHtml(outcome.total)}`;
  const consequence = outcome.success
    ? "The trap is now disarmed."
    : triggered
      ? activationError
        ? "The failed attempt triggered the trap, but its activation could not complete."
        : "The failed attempt triggered the trap."
      : "The trap remains armed.";
  const content = `<article class="easy-traps-disarm-card ${cardClass}">
    <header><i class="fa-solid ${icon}"></i><span><b>Trap</b><small>${escapeHtml(actor?.name ?? "Character")} · Disarm attempt</small></span></header>
    <div class="et-disarm-card-result"><strong>${escapeHtml(status)}</strong><em>${rollDisplay}</em></div>
    <footer>${escapeHtml(consequence)}${record?.count ? ` · Attempt ${escapeHtml(record.count)}` : ""}</footer>
  </article>`;
  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker?.({ actor, token }) ?? {},
    content,
    flags: {
      [MODULE_ID]: {
        disarmResult: true,
        tileId: tile?.id ?? null,
        actorId: actor?.id ?? null,
        total: outcome.total,
        ...(showDc ? { dc: outcome.dc } : {}),
        naturalD20: outcome.naturalD20,
        success: outcome.success,
        triggered,
        triggerReason: outcome.triggerReason
      }
    }
  });
}

export function emitDisarmResult(request, result) {
  if (!game.socket?.emit || !request?.requestId || !request?.userId) return;
  game.socket.emit(SOCKET_CHANNEL, {
    type: "disarm-result",
    requestId: request.requestId,
    userId: request.userId,
    tileId: request.tileId,
    ok: result.ok === true,
    success: result.success === true,
    triggered: result.triggered === true,
    triggerReason: result.triggerReason ? String(result.triggerReason) : "",
    total: Number.isFinite(Number(result.total)) ? Number(result.total) : null,
    dc: Number.isFinite(Number(result.dc)) ? Number(result.dc) : null,
    error: result.error ? String(result.error) : ""
  });
}

export function receivePlayerDisarmResult(message) {
  if (game.user?.isGM || message?.userId !== game.user?.id) return;
  const pending = runtime.pendingDisarmRequests.get(message.requestId);
  if (!pending) return;

  clearTimeout(pending.timeoutId);
  runtime.pendingDisarmRequests.delete(message.requestId);
  const state = runtime.playerTrapInteraction;
  if (state.pendingRequestId === message.requestId) state.pendingRequestId = null;
  state.activeLockId = null;
  state.activeLockTileId = null;
  state.activeLockSceneId = null;
  state.disarmBusy = false;

  if (!message.ok) {
    if (message.error) ui.notifications.warn(message.error);
    return;
  }
  if (message.success) {
    setPlayerTrapHover(null);
    ui.notifications.info("The trap has been disarmed.");
  } else if (message.triggered) {
    ui.notifications.warn(message.triggerReason === "natural-one"
      ? "Natural 1 — the disarm failed and triggered the trap."
      : "The disarm failed and triggered the trap.");
  } else {
    ui.notifications.warn("The disarm attempt failed.");
  }
  Hooks.callAll("easyTrapsPlayerDisarmResolved", {
    requestId: message.requestId,
    tileId: message.tileId,
    success: message.success === true,
    triggered: message.triggered === true,
    triggerReason: message.triggerReason || null,
    total: message.total,
    dc: message.dc
  });
}
