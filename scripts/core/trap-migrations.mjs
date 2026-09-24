import { cantripScalingIncrease, normalizeCantripCasterLevel } from "../cantrip-scaling.mjs";
import { isPrimaryGM } from "./authority.mjs";
import { sceneGeometry } from "./canvas-geometry.mjs";
import {
  AREA_MODES,
  DEFAULT_TRIGGER_TEXTURE,
  MODULE_ID,
  ORIGIN_MODES,
  TARGETING_PROFILES,
  TARGET_MODES,
  TRIGGER_SCHEMA,
  VERSION
} from "./constants.mjs";
import { castScaling, normalizeCastLevel, normalizeSpellBaseLevel } from "./spell-model.mjs";
import { normalizedTemplateSnapshot } from "./template-snapshots.mjs";
import {
  normalizeAreaMode,
  normalizeOriginMode,
  normalizeSpellAttackBonus,
  normalizeSpellSaveDc,
  normalizeTargetMode,
  normalizeTargetingProfile,
  originData,
  trapData,
  triggerDimensions
} from "./trap-model.mjs";
import { DEFAULT_DISCOVERY_CONFIG, migrateDiscoveryConfig } from "../discovery.mjs";
import {
  baseCellFromMarker,
  clampBaseCell,
  legacyAnchoredBaseCellFromMarker,
  legacyBaseCellFromMarker003,
  markerDataForBaseCell,
  rectangleOffsets
} from "../grid-trigger.mjs";
import {
  activityHasPromptedTemplate,
  activityLabel,
  activityNeedsNativeConfiguration,
  classifyTargetingProfile,
  planSpellWorkflow,
  resolveActivitySelection,
  resolveEffectiveTarget,
  templateSuppliesCreatureTargets,
  usableActivityList
} from "../integrations/dnd5e-activities.mjs";
import { sourceModifiedTime } from "../integrations/dnd5e.mjs";
import { mattActiveForTrap } from "../integrations/matt-state.mjs";
import {
  TRIGGER_SOURCE_OWNERSHIP,
  isExternalTriggerType,
  normalizeTriggerSourceOwnership,
  normalizeTriggerType,
  trapDiscoveryState
} from "../trigger-sources.mjs";

export async function migrateLegacyTriggers() {
  if (!canvas.scene || !isPrimaryGM()) return;
  const geometry = sceneGeometry();
  const updates = [];
  let invalidCount = 0;
  for (const tile of canvas.scene.tiles) {
    const trap = trapData(tile);
    if (!trap || Number(trap.schema) >= TRIGGER_SCHEMA) continue;

    const dimensions = triggerDimensions(trap);
    const offsets = rectangleOffsets(dimensions.width, dimensions.height);
    const recoveredCell = Number(trap.schema) < 3
      ? legacyBaseCellFromMarker003(tile, geometry)
      : Number(trap.schema) < 9
        ? legacyAnchoredBaseCellFromMarker(tile, geometry)
        : baseCellFromMarker(tile, geometry);
    const baseCell = clampBaseCell(recoveredCell, offsets, geometry);
    const marker = markerDataForBaseCell(baseCell, offsets, geometry);

    const originMode = normalizeOriginMode(trap.originMode ?? ORIGIN_MODES.TRIGGERING_TOKEN);
    const originTile = originMode === ORIGIN_MODES.SEPARATE_TILE
      ? canvas.scene.tiles.get(trap.originTileId) ?? canvas.scene.tiles.find(entry => entry.uuid === trap.originTileUuid)
      : null;
    const referenceOffsets = rectangleOffsets(1, 1);
    const originSchema = Number(originData(originTile)?.schema);
    const referenceMarker = originTile
      ? markerDataForBaseCell(
        clampBaseCell(
          originSchema >= 9 ? baseCellFromMarker(originTile, geometry) : legacyAnchoredBaseCellFromMarker(originTile, geometry),
          referenceOffsets,
          geometry
        ),
        referenceOffsets,
        geometry
      )
      : marker;
    const referencePoint = {
      x: referenceMarker.x + referenceMarker.width / 2,
      y: referenceMarker.y + referenceMarker.height / 2,
      elevation: Number(originTile?.elevation ?? tile.elevation) || 0
    };
    const templates = Array.isArray(trap.templates)
      ? trap.templates.map(snapshot => normalizedTemplateSnapshot(snapshot, referencePoint))
      : [];

    let compatible = false;
    let activityId = trap.activityId ?? null;
    let activityType = trap.activityType ?? null;
    let savedActivityLabel = trap.activityLabel ?? null;
    let activityCount = Number(trap.activityCount) || null;
    let sourceRevisionTime = Number(trap.sourceModifiedTime) || null;
    let spellImg = String(trap.spellImg ?? "").trim();
    let effectiveTarget = foundry.utils.deepClone(trap.effectiveTarget ?? {});
    let targetingProfile = normalizeTargetingProfile(trap.targetingProfile ?? (templates.length ? TARGETING_PROFILES.NATIVE_AREA : TARGETING_PROFILES.NONE));
    let targetMode = normalizeTargetMode(trap.targetMode ?? TARGET_MODES.NONE);
    let areaMode = normalizeAreaMode(trap.areaMode ?? (templates.length ? AREA_MODES.PREPLACED : AREA_MODES.NONE));
    let requiresNativeInteraction = Boolean(trap.requiresNativeInteraction);
    let workflow = trap.workflow;
    const spellSaveDc = normalizeSpellSaveDc(trap.spellSaveDc);
    const spellAttackBonus = normalizeSpellAttackBonus(trap.spellAttackBonus);
    let castLevel = Math.min(9, Math.max(0, Math.trunc(Number(trap.castLevel)) || 0));
    let cantripCasterLevel = trap.cantripCasterLevel == null ? null : normalizeCantripCasterLevel(trap.cantripCasterLevel, 1);
    let scaling = Math.max(0, Math.trunc(Number(trap.scaling)) || 0);

    try {
      const spell = trap.spellUuid ? await fromUuid(trap.spellUuid) : null;
      if (spell) spellImg = String(spell.img ?? spellImg ?? "").trim();
      let resolution = spell ? resolveActivitySelection(spell, activityId) : { supported: false, reason: "missing-activity", activityCount: 0 };
      if (!resolution.supported && spell && !activityId && usableActivityList(spell).length === 1) {
        resolution = resolveActivitySelection(spell, usableActivityList(spell)[0].id);
      }
      if (resolution.supported) {
        const activity = resolution.activity;
        activityId = activity.id;
        activityType = String(activity.type ?? "activity");
        savedActivityLabel = activityLabel(activity);
        activityCount = resolution.activityCount;
        sourceRevisionTime = sourceModifiedTime(spell);
        const baseLevel = normalizeSpellBaseLevel(spell.system?.level);
        if (baseLevel === 0) {
          castLevel = 0;
          cantripCasterLevel = normalizeCantripCasterLevel(trap.cantripCasterLevel, 1);
          scaling = cantripScalingIncrease(cantripCasterLevel);
        } else {
          castLevel = normalizeCastLevel(castLevel || baseLevel, baseLevel);
          cantripCasterLevel = null;
          scaling = castScaling(castLevel, baseLevel);
        }
        effectiveTarget = resolveEffectiveTarget(spell, activity);
        targetingProfile = classifyTargetingProfile(effectiveTarget, activity);
        const promptedTemplate = activityHasPromptedTemplate(activity, spell, effectiveTarget);
        areaMode = promptedTemplate ? AREA_MODES.PREPLACED : AREA_MODES.NONE;
        if (promptedTemplate) {
          targetMode = templateSuppliesCreatureTargets(effectiveTarget) ? TARGET_MODES.SPELL_AREA : TARGET_MODES.NONE;
          compatible = templates.length > 0;
        } else if (targetingProfile === TARGETING_PROFILES.DIRECT) {
          targetMode = [TARGET_MODES.TRIGGERING_TOKEN, TARGET_MODES.CUSTOM_ZONE].includes(targetMode)
            ? targetMode : TARGET_MODES.TRIGGERING_TOKEN;
          compatible = targetMode !== TARGET_MODES.CUSTOM_ZONE || Boolean(trap.selectionZone);
        } else {
          targetMode = TARGET_MODES.NONE;
          compatible = true;
        }
        requiresNativeInteraction = activityNeedsNativeConfiguration(activity, targetingProfile);
        workflow = planSpellWorkflow(spell, activity.id);
      } else {
        activityCount = resolution.activityCount;
        compatible = false;
      }
    } catch (error) {
      console.warn(`${MODULE_ID} | Could not validate legacy trap ${tile.name}`, error);
      compatible = false;
    }

    const armed = compatible && trap.armed !== false;
    if (!compatible) invalidCount += 1;
    updates.push({
      _id: tile.id,
      x: marker.x,
      y: marker.y,
      width: marker.width,
      height: marker.height,
      rotation: 0,
      hidden: Boolean(tile.hidden),
      "texture.anchorX": 0,
      "texture.anchorY": 0,
      [`flags.${MODULE_ID}.schema`]: TRIGGER_SCHEMA,
      [`flags.${MODULE_ID}.version`]: VERSION,
      [`flags.${MODULE_ID}.kind`]: "spell-grid",
      [`flags.${MODULE_ID}.spellImg`]: spellImg || DEFAULT_TRIGGER_TEXTURE,
      [`flags.${MODULE_ID}.armed`]: armed,
      [`flags.${MODULE_ID}.triggerType`]: normalizeTriggerType(trap.triggerType),
      [`flags.${MODULE_ID}.triggerSourceId`]: trap.triggerSourceId ?? null,
      [`flags.${MODULE_ID}.triggerSourceUuid`]: trap.triggerSourceUuid ?? null,
      [`flags.${MODULE_ID}.triggerSourceOwnership`]: isExternalTriggerType(trap.triggerType)
        ? normalizeTriggerSourceOwnership(trap.triggerSourceOwnership, TRIGGER_SOURCE_OWNERSHIP.CREATED)
        : null,
      [`flags.${MODULE_ID}.internalController`]: isExternalTriggerType(trap.triggerType),
      [`flags.${MODULE_ID}.discovered`]: trapDiscoveryState(tile, trap),
      [`flags.${MODULE_ID}.requiresReconfiguration`]: !compatible,
      [`flags.${MODULE_ID}.originMode`]: originMode,
      [`flags.${MODULE_ID}.originTileId`]: trap.originTileId ?? null,
      [`flags.${MODULE_ID}.originTileUuid`]: trap.originTileUuid ?? null,
      [`flags.${MODULE_ID}.activityId`]: activityId,
      [`flags.${MODULE_ID}.activityType`]: activityType,
      [`flags.${MODULE_ID}.activityLabel`]: savedActivityLabel ?? activityType ?? "Activity",
      [`flags.${MODULE_ID}.activityCount`]: activityCount,
      [`flags.${MODULE_ID}.sourceModifiedTime`]: sourceRevisionTime,
      [`flags.${MODULE_ID}.castLevel`]: castLevel,
      [`flags.${MODULE_ID}.cantripCasterLevel`]: cantripCasterLevel,
      [`flags.${MODULE_ID}.scaling`]: scaling,
      [`flags.${MODULE_ID}.spellSaveDc`]: spellSaveDc,
      [`flags.${MODULE_ID}.spellAttackBonus`]: spellAttackBonus,
      [`flags.${MODULE_ID}.pauseOnTrigger`]: Boolean(trap.pauseOnTrigger),
      [`flags.${MODULE_ID}.disarmAfterTrigger`]: trap.disarmAfterTrigger !== false,
      [`flags.${MODULE_ID}.discovery`]: migrateDiscoveryConfig(
        trap.discovery ?? { ...foundry.utils.deepClone(DEFAULT_DISCOVERY_CONFIG), enabled: false },
        { fromSchema: Number(trap.schema) || 0 }
      ),
      [`flags.${MODULE_ID}.targetMode`]: targetMode,
      [`flags.${MODULE_ID}.targetingProfile`]: targetingProfile,
      [`flags.${MODULE_ID}.effectiveTarget`]: effectiveTarget,
      [`flags.${MODULE_ID}.requiresNativeInteraction`]: requiresNativeInteraction,
      [`flags.${MODULE_ID}.areaMode`]: areaMode,
      [`flags.${MODULE_ID}.selectionZone`]: trap.selectionZone ?? null,
      [`flags.${MODULE_ID}.templates`]: templates,
      [`flags.${MODULE_ID}.backend`]: "matt-native-spell",
      [`flags.${MODULE_ID}.workflow`]: workflow,
      [`flags.${MODULE_ID}.triggerCells`]: offsets,
      [`flags.${MODULE_ID}.triggerWidth`]: dimensions.width,
      [`flags.${MODULE_ID}.triggerHeight`]: dimensions.height,
      "flags.monks-active-tiles.active": mattActiveForTrap(trap, armed)
    });
  }
  if (updates.length) await canvas.scene.updateEmbeddedDocuments("Tile", updates);

  const originUpdates = canvas.scene.tiles
    .filter(tile => originData(tile) && Number(originData(tile).schema) < TRIGGER_SCHEMA)
    .map(tile => {
      const offsets = rectangleOffsets(1, 1);
      const schema = Number(originData(tile)?.schema) || 0;
      const recoveredCell = schema >= 9 ? baseCellFromMarker(tile, geometry) : legacyAnchoredBaseCellFromMarker(tile, geometry);
      const baseCell = clampBaseCell(recoveredCell, offsets, geometry);
      const marker = markerDataForBaseCell(baseCell, offsets, geometry);
      return {
        _id: tile.id,
        x: marker.x,
        y: marker.y,
        width: marker.width,
        height: marker.height,
        rotation: 0,
        "texture.anchorX": 0,
        "texture.anchorY": 0,
        [`flags.${MODULE_ID}.schema`]: TRIGGER_SCHEMA,
        [`flags.${MODULE_ID}.version`]: VERSION
      };
    });
  if (originUpdates.length) await canvas.scene.updateEmbeddedDocuments("Tile", originUpdates);

  if (invalidCount) ui.notifications.warn(`${invalidCount} legacy trap${invalidCount === 1 ? "" : "s"} must be recreated because its saved Activity or placement data is no longer valid.`);
}
