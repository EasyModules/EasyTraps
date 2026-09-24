import {
  ALARM_AUDIBILITY_MODES,
  ALARM_CHAT_MODES,
  normalizeAlarmConfig,
  playAlarmLocally,
  startSpatialAlarm
} from "../alarm.mjs";
import { isPrimaryGM } from "../core/authority.mjs";
import { tileCenterPoint } from "../core/canvas-geometry.mjs";
import { safeTrapComplete } from "../core/completion.mjs";
import { MODULE_ID, ORIGIN_MODES, SOCKET_CHANNEL } from "../core/constants.mjs";
import { runtime } from "../core/runtime-state.mjs";
import { escapeHtml } from "../core/text.mjs";
import { isAlarmTrap, normalizeOriginMode, resolveOriginTile, trapData, trapDisplayName } from "../core/trap-model.mjs";
import { pauseGameForTrap, setTrapEnabled } from "../core/trap-state.mjs";

export function alarmOriginPoint(tile, trap) {
  const originMode = normalizeOriginMode(trap?.originMode ?? ORIGIN_MODES.TRIGGER_TILE);
  if (originMode === ORIGIN_MODES.SEPARATE_TILE) {
    const originTile = resolveOriginTile(tile, trap, ORIGIN_MODES.SEPARATE_TILE);
    return originTile ? tileCenterPoint(originTile) : null;
  }
  return tile ? tileCenterPoint(tile) : null;
}

export function alarmCooldownKey(tile) {
  return String(tile?.uuid ?? tile?.id ?? "");
}

export function alarmCooldownRemainingMs(tile) {
  const key = alarmCooldownKey(tile);
  const until = Number(runtime.alarmCooldownUntil.get(key)) || 0;
  const remaining = Math.max(0, until - Date.now());
  if (!remaining && key) runtime.alarmCooldownUntil.delete(key);
  return remaining;
}

export function setAlarmCooldown(tile, seconds) {
  const key = alarmCooldownKey(tile);
  if (!key) return;
  const duration = Math.max(0, Number(seconds) || 0) * 1000;
  if (!duration) runtime.alarmCooldownUntil.delete(key);
  else runtime.alarmCooldownUntil.set(key, Date.now() + duration);
}

export async function postAlarmActivationMessage(tile, trap, config) {
  const mode = normalizeAlarmConfig(config).chat.mode;
  if (mode === ALARM_CHAT_MODES.OFF || !globalThis.ChatMessage?.create) return null;
  const content = `<div class="et-trap-activation-message et-alarm-activation-message"><i class="fa-solid fa-bell"></i><strong>Alarm triggered!</strong><span>${escapeHtml(trapDisplayName(trap, tile))}</span></div>`;
  const data = {
    speaker: { alias: "Alarm" },
    content,
    flags: { [MODULE_ID]: { alarmActivation: true, triggerTileId: tile?.id ?? null } }
  };
  if (mode === ALARM_CHAT_MODES.GM_ONLY) {
    const recipients = ChatMessage.getWhisperRecipients?.("GM") ?? [];
    data.whisper = recipients.map(user => user.id ?? user).filter(Boolean);
  }
  try { return await ChatMessage.create(data); }
  catch (error) {
    console.warn(`${MODULE_ID} | Alarm activation chat message could not be created`, error);
    return null;
  }
}

export function alarmSocketMessage(config, sceneId, { gmOnly = false } = {}) {
  return {
    type: "alarm-play",
    userId: game.user?.id ?? null,
    sceneId,
    gmOnly: Boolean(gmOnly),
    alarm: normalizeAlarmConfig(config)
  };
}

export async function receiveAlarmPlaybackMessage(message) {
  const sender = game.users?.get?.(message?.userId);
  if (!sender?.isGM) return false;
  if (message?.sceneId !== canvas.scene?.id) return false;
  if (message?.gmOnly === true && !game.user?.isGM) return false;
  await playAlarmLocally(message.alarm);
  return true;
}

export function reportAlarmPlaybackFailure(error) {
  console.warn(`${MODULE_ID} | Alarm sound could not be played`, error);
  if (isPrimaryGM()) ui.notifications.warn(`Alarm triggered, but its sound could not be played: ${error?.message ?? error}`);
}

export function startConfiguredAlarm(tile, config, originPoint) {
  const normalized = normalizeAlarmConfig(config);
  try {
    if (normalized.audibility.mode === ALARM_AUDIBILITY_MODES.SPATIAL) {
      const playback = startSpatialAlarm(normalized, originPoint);
      playback.completion.catch(reportAlarmPlaybackFailure);
      return true;
    }

    const message = alarmSocketMessage(normalized, tile?.parent?.id ?? canvas.scene?.id, {
      gmOnly: normalized.audibility.mode === ALARM_AUDIBILITY_MODES.GM_ONLY
    });
    // Module sockets do not echo to the sender. Start local playback and emit
    // to the other clients without blocking trap lifecycle on audio loading or
    // playback duration. Receivers reject messages that do not claim a GM
    // sender and ignore messages for a different viewed Scene.
    receiveAlarmPlaybackMessage(message).catch(reportAlarmPlaybackFailure);
    game.socket?.emit?.(SOCKET_CHANNEL, message);
    return true;
  } catch (error) {
    reportAlarmPlaybackFailure(error);
    return false;
  }
}

export async function executeAlarmTrap(tile, triggeringTokens, { onComplete = null } = {}) {
  const trap = trapData(tile);
  if (!trap?.armed) {
    const payload = { continue: false, reason: "disarmed" };
    safeTrapComplete(onComplete, payload);
    return payload;
  }
  if (!isAlarmTrap(trap)) throw new Error("This trap is not configured as an Alarm Trap.");
  if (trap.requiresReconfiguration) throw new Error("This trap must be recreated before it can activate.");

  const config = normalizeAlarmConfig(trap.alarm);
  if (trap.disarmAfterTrigger === false && alarmCooldownRemainingMs(tile) > 0) {
    const payload = { continue: false, reason: "cooldown" };
    safeTrapComplete(onComplete, payload);
    return payload;
  }
  const originPoint = config.audibility.mode === ALARM_AUDIBILITY_MODES.SPATIAL
    ? alarmOriginPoint(tile, trap)
    : null;
  if (config.audibility.mode === ALARM_AUDIBILITY_MODES.SPATIAL && !originPoint) {
    throw new Error("The configured EasyTraps alarm origin could not be found.");
  }

  let trapDisabled = false;
  try {
    // Disable first to protect against duplicate MATT/Item Piles callbacks while
    // the sound is being emitted. Repeatable alarms are rearmed below.
    await setTrapEnabled(tile, false);
    trapDisabled = true;
    await postAlarmActivationMessage(tile, trap, config);
    await pauseGameForTrap(trap);

    const soundDispatched = startConfiguredAlarm(tile, config, originPoint);

    if (trap.disarmAfterTrigger === false) {
      // Cooldown starts at activation time, not after the audio ends. Long or
      // sustained alarms therefore cannot hold the trigger workflow open.
      setAlarmCooldown(tile, config.cooldownSeconds);
      await setTrapEnabled(tile, true, { resetDisarmAttempts: false });
      trapDisabled = false;
    }

    const tokens = (triggeringTokens ?? []).map(token => token?.document ?? token).filter(Boolean);
    const payload = {
      continue: true,
      tokens,
      soundDispatched,
      passed: [],
      failed: [],
      tokenresults: [],
      workflow: "alarm"
    };
    Hooks.callAll("easyTrapsAlarmTriggered", { tile, trap, config, originPoint, triggeringTokens: tokens, soundDispatched });
    safeTrapComplete(onComplete, payload);
    return payload;
  } catch (error) {
    if (trapDisabled) await setTrapEnabled(tile, true, { resetDisarmAttempts: false }).catch(rearmError => {
      console.warn(`${MODULE_ID} | Could not re-arm Alarm Trap after a failed workflow`, rearmError);
    });
    throw error;
  }
}
