export const ALARM_AUDIBILITY_MODES = Object.freeze({
  SPATIAL: "spatial",
  SCENE: "scene",
  GM_ONLY: "gm-only"
});

export const ALARM_PLAYBACK_MODES = Object.freeze({
  ONCE: "once",
  SUSTAINED: "sustained"
});

export const ALARM_CHAT_MODES = Object.freeze({
  OFF: "off",
  GM_ONLY: "gm-only",
  EVERYONE: "everyone"
});

export const DEFAULT_ALARM_SOUND = "modules/easy-traps/assets/audio/alarm-clock.ogg";

export const DEFAULT_ALARM_CONFIG = Object.freeze({
  sound: Object.freeze({
    path: DEFAULT_ALARM_SOUND,
    custom: false,
    volume: 0.8
  }),
  audibility: Object.freeze({
    mode: ALARM_AUDIBILITY_MODES.SPATIAL,
    radius: 60,
    easing: true,
    walls: true,
    gmAlways: true
  }),
  playback: Object.freeze({
    mode: ALARM_PLAYBACK_MODES.ONCE,
    duration: 15
  }),
  chat: Object.freeze({
    mode: ALARM_CHAT_MODES.GM_ONLY
  }),
  cooldownSeconds: 5
});

function numberInRange(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function bool(value, fallback = false) {
  return value === undefined || value === null ? fallback : Boolean(value);
}

export function normalizeAlarmAudibilityMode(value) {
  return Object.values(ALARM_AUDIBILITY_MODES).includes(value)
    ? value
    : ALARM_AUDIBILITY_MODES.SPATIAL;
}

export function normalizeAlarmPlaybackMode(value) {
  return Object.values(ALARM_PLAYBACK_MODES).includes(value)
    ? value
    : ALARM_PLAYBACK_MODES.ONCE;
}

export function normalizeAlarmChatMode(value) {
  return Object.values(ALARM_CHAT_MODES).includes(value)
    ? value
    : ALARM_CHAT_MODES.GM_ONLY;
}

export function normalizeAlarmConfig(source = {}) {
  const sound = source?.sound ?? {};
  const audibility = source?.audibility ?? {};
  const playback = source?.playback ?? {};
  const chat = source?.chat ?? {};
  const path = String(sound.path ?? DEFAULT_ALARM_SOUND).trim() || DEFAULT_ALARM_SOUND;
  return {
    sound: {
      path,
      custom: bool(sound.custom, path !== DEFAULT_ALARM_SOUND),
      volume: numberInRange(sound.volume, DEFAULT_ALARM_CONFIG.sound.volume, 0, 1)
    },
    audibility: {
      mode: normalizeAlarmAudibilityMode(audibility.mode),
      radius: numberInRange(audibility.radius, DEFAULT_ALARM_CONFIG.audibility.radius, 1, 9999),
      easing: bool(audibility.easing, DEFAULT_ALARM_CONFIG.audibility.easing),
      walls: bool(audibility.walls, DEFAULT_ALARM_CONFIG.audibility.walls),
      gmAlways: bool(audibility.gmAlways, DEFAULT_ALARM_CONFIG.audibility.gmAlways)
    },
    playback: {
      mode: normalizeAlarmPlaybackMode(playback.mode),
      duration: numberInRange(playback.duration, DEFAULT_ALARM_CONFIG.playback.duration, 1, 300)
    },
    chat: {
      mode: normalizeAlarmChatMode(chat.mode)
    },
    cooldownSeconds: numberInRange(source?.cooldownSeconds, DEFAULT_ALARM_CONFIG.cooldownSeconds, 0, 300)
  };
}

export function alarmAudibilityLabel(value) {
  const mode = normalizeAlarmAudibilityMode(value);
  if (mode === ALARM_AUDIBILITY_MODES.SCENE) return "Entire Scene";
  if (mode === ALARM_AUDIBILITY_MODES.GM_ONLY) return "GM Only";
  return "Spatial";
}

export function alarmPlaybackLabel(config) {
  const normalized = normalizeAlarmConfig(config);
  return normalized.playback.mode === ALARM_PLAYBACK_MODES.SUSTAINED
    ? `Repeat · ${normalized.playback.duration}s`
    : "Play once";
}

export function alarmChatLabel(value) {
  const mode = normalizeAlarmChatMode(value);
  if (mode === ALARM_CHAT_MODES.OFF) return "Off";
  if (mode === ALARM_CHAT_MODES.EVERYONE) return "Everyone";
  return "GM Only";
}

export function alarmSoundLabel(config) {
  const normalized = normalizeAlarmConfig(config);
  if (!normalized.sound.custom || normalized.sound.path === DEFAULT_ALARM_SOUND) return "Clock Alarm";
  const tail = normalized.sound.path.split(/[\\/]/).pop();
  return tail || "Custom sound";
}

export function alarmRangePixelRadius(radius, { gridSize = 100, gridDistance = 5 } = {}) {
  const normalizedRadius = Math.max(0, Number(radius) || 0);
  const size = Number(gridSize);
  const distance = Number(gridDistance);
  if (!Number.isFinite(size) || size <= 0 || !Number.isFinite(distance) || distance <= 0) return 0;
  return normalizedRadius * (size / distance);
}

export function hasSupportedAudioExtension(path) {
  const src = String(path ?? "").trim();
  if (!src) return false;
  const AudioHelperClass = globalThis.foundry?.audio?.AudioHelper ?? globalThis.AudioHelper;
  if (typeof AudioHelperClass?.hasAudioExtension === "function") return AudioHelperClass.hasAudioExtension(src);
  return /\.(?:aac|flac|m4a|mp3|mp4|ogg|opus|wav|webm)$/i.test(src.split(/[?#]/)[0]);
}

function playbackOptions(config) {
  const normalized = normalizeAlarmConfig(config);
  if (normalized.playback.mode !== ALARM_PLAYBACK_MODES.SUSTAINED) {
    return { loop: false };
  }
  return {
    loop: true,
    duration: normalized.playback.duration
  };
}

export async function playAlarmLocally(config, { forceOnce = false } = {}) {
  const normalized = normalizeAlarmConfig(config);
  const src = normalized.sound.path;
  if (!hasSupportedAudioExtension(src)) throw new Error("The configured alarm sound path is not a supported audio file.");
  const options = forceOnce
    ? { volume: normalized.sound.volume, loop: false }
    : { volume: normalized.sound.volume, ...playbackOptions(normalized) };

  if (typeof game?.audio?.create === "function") {
    const sound = game.audio.create({
      src,
      context: game.audio.environment ?? game.audio.interface,
      preload: true,
      singleton: false
    });
    await sound.load?.();
    await sound.play?.(options);
    return sound;
  }

  const AudioHelperClass = globalThis.foundry?.audio?.AudioHelper ?? game?.audio?.constructor ?? globalThis.AudioHelper;
  if (typeof AudioHelperClass?.play !== "function") throw new Error("Foundry's audio playback API is unavailable.");
  const sound = AudioHelperClass.play({
    src,
    volume: normalized.sound.volume,
    autoplay: true,
    loop: forceOnce ? false : normalized.playback.mode === ALARM_PLAYBACK_MODES.SUSTAINED,
    channel: "environment"
  }, false);
  if (!forceOnce && normalized.playback.mode === ALARM_PLAYBACK_MODES.SUSTAINED && sound?.stop) {
    setTimeout(() => {
      try {
        const result = sound.stop();
        result?.catch?.(() => {});
      } catch (_error) { /* best-effort fallback cleanup */ }
    }, normalized.playback.duration * 1000);
  }
  return sound ?? null;
}

export function startSpatialAlarm(config, origin) {
  const normalized = normalizeAlarmConfig(config);
  if (!origin || !Number.isFinite(Number(origin.x)) || !Number.isFinite(Number(origin.y))) {
    throw new Error("The alarm origin could not be resolved.");
  }
  if (!hasSupportedAudioExtension(normalized.sound.path)) {
    throw new Error("The configured alarm sound path is not a supported audio file.");
  }
  if (typeof canvas?.sounds?.emitAtPosition !== "function") {
    throw new Error("Foundry's positional sound API is unavailable.");
  }

  // Foundry v14 intentionally resolves emitAtPosition() only after playback on
  // the initiating client has completed. Trap lifecycle must not wait for a
  // long alarm to finish, so return the completion Promise to the caller while
  // starting emission immediately.
  const completion = Promise.resolve(canvas.sounds.emitAtPosition(
    normalized.sound.path,
    { x: Number(origin.x), y: Number(origin.y) },
    normalized.audibility.radius,
    {
      volume: normalized.sound.volume,
      easing: normalized.audibility.easing,
      walls: normalized.audibility.walls,
      gmAlways: normalized.audibility.gmAlways,
      playbackOptions: playbackOptions(normalized)
    }
  ));

  return { started: true, completion };
}
