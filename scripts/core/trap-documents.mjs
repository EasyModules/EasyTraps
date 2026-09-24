import { DEFAULT_ALARM_CONFIG, normalizeAlarmConfig } from "../alarm.mjs";
import { cantripScalingIncrease, normalizeCantripCasterLevel } from "../cantrip-scaling.mjs";
import { sceneGeometry } from "./canvas-geometry.mjs";
import {
  AREA_MODES,
  DEFAULT_DISARM_AFTER_TRIGGER,
  DEFAULT_ORIGIN_TEXTURE,
  DEFAULT_PAUSE_ON_TRIGGER,
  DEFAULT_SPELL_ATTACK_BONUS,
  DEFAULT_SPELL_SAVE_DC,
  DEFAULT_TRIGGER_TEXTURE,
  MODULE_ID,
  ORIGIN_MODES,
  TARGETING_PROFILES,
  TARGET_MODES,
  TRIGGER_SCHEMA,
  VERSION
} from "./constants.mjs";
import { refreshTriggerOverlays } from "./presentation.mjs";
import { configuredOriginTexture, configuredTriggerTexture } from "./settings.mjs";
import { castScaling, normalizeCastLevel, normalizeSpellBaseLevel } from "./spell-model.mjs";
import {
  normalizeAreaMode,
  normalizeOriginMode,
  normalizeSpellAttackBonus,
  normalizeSpellSaveDc,
  normalizeTargetMode,
  normalizeTargetingProfile,
  trapData,
  trapDisplayName,
  trapTypeOf
} from "./trap-model.mjs";
import { DEFAULT_DISCOVERY_CONFIG, normalizeDiscoveryConfig } from "../discovery.mjs";
import {
  clampBaseCell,
  clampCellCount,
  markerDataForBaseCell,
  rectangleOffsets,
  sceneCellFromPoint
} from "../grid-trigger.mjs";
import { planSpellWorkflow } from "../integrations/dnd5e-activities.mjs";
import { buildMattTriggerFlags } from "../integrations/matt-state.mjs";
import {
  TRIGGER_SOURCE_OWNERSHIP,
  TRIGGER_TYPES,
  isExternalTriggerType,
  normalizeTriggerSourceOwnership,
  normalizeTriggerType
} from "../trigger-sources.mjs";

export async function createTrapTriggerTile(subject, point, {
  trapType = "spell",
  widthCells = 1,
  heightCells = 1,
  originMode = ORIGIN_MODES.TRIGGER_TILE,
  activityId = null,
  targetMode = TARGET_MODES.NONE,
  areaMode = AREA_MODES.NONE,
  targetingProfile = TARGETING_PROFILES.NONE,
  effectiveTarget = null,
  requiresNativeInteraction = false,
  activityType = null,
  activityLabel = null,
  activityCount = 1,
  sourceModifiedTime = null,
  castLevel = null,
  cantripCasterLevel = null,
  scaling = null,
  spellSaveDc = DEFAULT_SPELL_SAVE_DC,
  spellAttackBonus = DEFAULT_SPELL_ATTACK_BONUS,
  alarm = DEFAULT_ALARM_CONFIG,
  pauseOnTrigger = DEFAULT_PAUSE_ON_TRIGGER,
  disarmAfterTrigger = DEFAULT_DISARM_AFTER_TRIGGER,
  discovery = DEFAULT_DISCOVERY_CONFIG,
  triggerType = TRIGGER_TYPES.TILE,
  triggerSourceId = null,
  triggerSourceUuid = null,
  triggerSourceOwnership = null
} = {}) {
  const geometry = sceneGeometry();
  const width = clampCellCount(widthCells);
  const height = clampCellCount(heightCells);
  const triggerCells = rectangleOffsets(width, height);
  const baseCell = clampBaseCell(sceneCellFromPoint(point, geometry), triggerCells, geometry);
  const marker = markerDataForBaseCell(baseCell, triggerCells, geometry);
  const normalizedOrigin = normalizeOriginMode(originMode);
  const normalizedTriggerType = normalizeTriggerType(triggerType);
  const externalController = isExternalTriggerType(normalizedTriggerType);
  const normalizedTrapType = trapType === "alarm" ? "alarm" : "spell";
  const displayName = String(subject?.name ?? (normalizedTrapType === "alarm" ? "Alarm" : "Spell")).trim() || "Trap";

  const commonFlags = {
    schema: TRIGGER_SCHEMA,
    version: VERSION,
    kind: `${normalizedTrapType}-grid`,
    trapType: normalizedTrapType,
    triggerType: normalizedTriggerType,
    triggerSourceId: triggerSourceId ? String(triggerSourceId) : null,
    triggerSourceUuid: triggerSourceUuid ? String(triggerSourceUuid) : null,
    triggerSourceOwnership: externalController
      ? normalizeTriggerSourceOwnership(triggerSourceOwnership, TRIGGER_SOURCE_OWNERSHIP.CREATED)
      : null,
    discovered: false,
    internalController: externalController,
    armed: false,
    pauseOnTrigger: Boolean(pauseOnTrigger),
    disarmAfterTrigger: Boolean(disarmAfterTrigger),
    discovery: normalizeDiscoveryConfig(discovery),
    requiresReconfiguration: false,
    triggerCells,
    triggerWidth: width,
    triggerHeight: height,
    originMode: normalizedOrigin,
    originTileId: null,
    originTileUuid: null,
    targetMode: normalizedTrapType === "alarm" ? TARGET_MODES.NONE : normalizeTargetMode(targetMode),
    targetingProfile: normalizedTrapType === "alarm" ? TARGETING_PROFILES.NONE : normalizeTargetingProfile(targetingProfile),
    effectiveTarget: normalizedTrapType === "alarm" ? {} : foundry.utils.deepClone(effectiveTarget ?? {}),
    requiresNativeInteraction: normalizedTrapType === "alarm" ? false : Boolean(requiresNativeInteraction),
    areaMode: normalizedTrapType === "alarm" ? AREA_MODES.NONE : normalizeAreaMode(areaMode),
    selectionZone: null,
    templates: []
  };

  if (normalizedTrapType === "alarm") {
    commonFlags.alarmName = displayName;
    commonFlags.alarmImg = String(subject?.img ?? DEFAULT_TRIGGER_TEXTURE) || DEFAULT_TRIGGER_TEXTURE;
    commonFlags.alarm = normalizeAlarmConfig(alarm);
    commonFlags.backend = "matt-alarm";
    commonFlags.workflow = { mode: "alarm", supported: true, reason: "native-foundry-audio" };
  } else {
    const spell = subject;
    commonFlags.spellUuid = spell?.uuid ?? null;
    commonFlags.spellName = displayName;
    commonFlags.spellImg = spell?.img || DEFAULT_TRIGGER_TEXTURE;
    commonFlags.activityId = activityId;
    commonFlags.activityType = String(activityType ?? "activity");
    commonFlags.activityLabel = String(activityLabel ?? activityType ?? "Activity");
    commonFlags.activityCount = Number(activityCount) || 1;
    commonFlags.sourceModifiedTime = sourceModifiedTime;
    commonFlags.castLevel = normalizeCastLevel(castLevel, spell?.system?.level);
    commonFlags.cantripCasterLevel = normalizeSpellBaseLevel(spell?.system?.level) === 0
      ? normalizeCantripCasterLevel(cantripCasterLevel, 1)
      : null;
    commonFlags.scaling = Number.isFinite(Number(scaling))
      ? Math.max(0, Math.trunc(Number(scaling)))
      : normalizeSpellBaseLevel(spell?.system?.level) === 0
        ? cantripScalingIncrease(cantripCasterLevel)
        : castScaling(castLevel, spell?.system?.level);
    commonFlags.spellSaveDc = normalizeSpellSaveDc(spellSaveDc);
    commonFlags.spellAttackBonus = normalizeSpellAttackBonus(spellAttackBonus);
    commonFlags.backend = "matt-native-spell";
    commonFlags.workflow = planSpellWorkflow(spell, activityId);
  }

  const [tile] = await canvas.scene.createEmbeddedDocuments("Tile", [{
    name: `EasyTraps · ${displayName} · ${width}×${height}`,
    x: marker.x,
    y: marker.y,
    width: marker.width,
    height: marker.height,
    rotation: 0,
    alpha: externalController ? 0 : 0.48,
    hidden: true,
    overhead: false,
    texture: { src: configuredTriggerTexture(), fit: "fill", anchorX: 0, anchorY: 0 },
    flags: {
      [MODULE_ID]: commonFlags,
      "monks-active-tiles": buildMattTriggerFlags()
    }
  }]);
  refreshTriggerOverlays();
  return tile;
}

export async function createTrapOriginTile(subject, triggerTile, point) {
  const geometry = sceneGeometry();
  const offsets = rectangleOffsets(1, 1);
  const baseCell = clampBaseCell(sceneCellFromPoint(point, geometry), offsets, geometry);
  const marker = markerDataForBaseCell(baseCell, offsets, geometry);
  const trap = trapData(triggerTile);
  const type = trapTypeOf(trap);
  const displayName = trapDisplayName(trap, triggerTile) || String(subject?.name ?? "Trap");
  const [tile] = await canvas.scene.createEmbeddedDocuments("Tile", [{
    name: `EasyTraps · ${displayName}`,
    x: marker.x,
    y: marker.y,
    width: marker.width,
    height: marker.height,
    rotation: 0,
    alpha: 0.52,
    hidden: true,
    overhead: false,
    texture: (() => {
      const src = configuredOriginTexture();
      return {
        src,
        fit: "fill",
        anchorX: 0,
        anchorY: 0,
        ...(src === DEFAULT_ORIGIN_TEXTURE ? { tint: "#67b7ff" } : {})
      };
    })(),
    flags: {
      [MODULE_ID]: {
        schema: TRIGGER_SCHEMA,
        version: VERSION,
        kind: `${type}-origin`,
        trapType: type,
        triggerTileId: triggerTile.id,
        triggerTileUuid: triggerTile.uuid,
        trapName: displayName
      }
    }
  }]);
  return tile;
}
