import { cantripScalingIncrease, normalizeCantripCasterLevel } from "../cantrip-scaling.mjs";
import { tileCenterPoint, tokenCenterPoint } from "../core/canvas-geometry.mjs";
import { safeTrapComplete } from "../core/completion.mjs";
import { AREA_MODES, MODULE_ID, ORIGIN_MODES, TARGET_MODES, WORKFLOW_MODES } from "../core/constants.mjs";
import {
  castScaling,
  isInstantaneousSpell,
  normalizeCastLevel,
  normalizeSpellBaseLevel
} from "../core/spell-model.mjs";
import { collectCustomZoneTargetIds, collectSavedAreaTargetIds } from "../core/target-selection.mjs";
import {
  ensureRuntimeOriginToken,
  scheduleMeasuredTemplateCleanup,
  scheduleRuntimeOriginVisualCleanup
} from "../core/trap-lifecycle.mjs";
import {
  normalizeAreaMode,
  normalizeOriginMode,
  normalizeSpellAttackBonus,
  normalizeSpellSaveDc,
  normalizeTargetMode,
  resolveOriginTile,
  trapData
} from "../core/trap-model.mjs";
import { pauseGameForTrap, setTrapEnabled } from "../core/trap-state.mjs";
import {
  activitySelectionErrorMessage,
  planSpellWorkflow,
  resolveActivitySelection,
  workflowUnsupportedMessage
} from "../integrations/dnd5e-activities.mjs";
import { deleteMeasuredTemplates, withSavedNativeTemplatePlacement } from "../integrations/dnd5e-templates.mjs";
import { ensureRuntimeSpell, sourceModifiedTime, useOriginalSpellItem } from "../integrations/dnd5e.mjs";
import { buildEasyFixMultiHitPlan, executeEasyFixMultiHit } from "../integrations/easy-fix.mjs";
import { cleanupPersistentRuntimeOriginVisuals } from "../integrations/sequencer.mjs";
import { filterRuntimeOriginTargetIds, withNativeSpellTargets } from "../integrations/targeting.mjs";

export async function postTrapActivationMessage(tile) {
  try {
    return await ChatMessage.create({
      speaker: { alias: "Trap" },
      content: '<div class="et-trap-activation-message"><i class="fa-solid fa-triangle-exclamation"></i><strong>A trap is triggered!</strong></div>',
      flags: { [MODULE_ID]: { trapActivation: true, triggerTileId: tile?.id ?? null } }
    });
  } catch (error) {
    console.warn(`${MODULE_ID} | Trap activation chat message could not be created`, error);
    return null;
  }
}

export async function executeNativeTrapSpell(tile, triggeringTokens, { onComplete = null } = {}) {
  const trap = trapData(tile);
  if (!trap?.armed) {
    const payload = { continue: false, reason: "disarmed" };
    safeTrapComplete(onComplete, payload);
    return payload;
  }
  if (trap.requiresReconfiguration) throw new Error("This trap must be recreated for the current native spell workflow.");

  const sourceSpell = await fromUuid(trap.spellUuid);
  if (!sourceSpell || sourceSpell.type !== "spell") throw new Error(`Spell not found: ${trap.spellName ?? trap.spellUuid}`);
  const sourceResolution = resolveActivitySelection(sourceSpell, trap.activityId);
  if (!sourceResolution.supported) throw new Error(activitySelectionErrorMessage(sourceSpell, sourceResolution));
  const savedRevision = Number(trap.sourceModifiedTime) || null;
  const currentRevision = sourceModifiedTime(sourceSpell);
  if (savedRevision && currentRevision && savedRevision !== currentRevision) {
    throw new Error(`${sourceSpell.name} changed after this trap was created. Recreate the trap so its saved launch inputs match the current Item.`);
  }
  const workflow = planSpellWorkflow(sourceSpell, sourceResolution.activity.id);
  if (workflow.mode === WORKFLOW_MODES.UNSUPPORTED) throw new Error(workflowUnsupportedMessage(workflow));

  const triggeringToken = triggeringTokens.find(token => token?.actor) ?? triggeringTokens[0] ?? null;
  const originMode = normalizeOriginMode(trap.originMode ?? ORIGIN_MODES.TRIGGERING_TOKEN);
  const targetMode = normalizeTargetMode(trap.targetMode ?? TARGET_MODES.NONE);
  const areaMode = normalizeAreaMode(trap.areaMode ?? AREA_MODES.NONE);
  const spellSaveDc = normalizeSpellSaveDc(trap.spellSaveDc);
  const spellAttackBonus = normalizeSpellAttackBonus(trap.spellAttackBonus);
  const baseSpellLevel = normalizeSpellBaseLevel(sourceSpell.system?.level);
  const castLevel = normalizeCastLevel(trap.castLevel, baseSpellLevel);
  const cantripCasterLevel = baseSpellLevel === 0
    ? normalizeCantripCasterLevel(trap.cantripCasterLevel, 1)
    : null;
  const scaling = baseSpellLevel === 0
    ? cantripScalingIncrease(cantripCasterLevel)
    : castScaling(castLevel, baseSpellLevel);
  let actor = null;
  let originPoint = null;
  let runtimeSpell = null;
  let technicalOriginToken = null;
  let activatedTemplates = [];
  let trapDisabled = false;

  try {
    if (originMode === ORIGIN_MODES.TRIGGERING_TOKEN) {
      actor = triggeringToken?.actor;
      originPoint = triggeringToken ? tokenCenterPoint(triggeringToken) : null;
      if (!actor || !originPoint) throw new Error("The triggering token has no actor to cast the spell.");
    } else {
      const originTile = resolveOriginTile(tile, trap, originMode);
      if (!originTile) throw new Error("The configured EasyTraps origin Tile could not be found.");
      originPoint = tileCenterPoint(originTile);
      const technicalToken = await ensureRuntimeOriginToken(originTile, tile);
      technicalOriginToken = technicalToken;
      actor = technicalToken.actor;
      if (!actor) throw new Error("The EasyTraps origin token has no synthetic actor.");
      // Remove stale persistent animation residue before starting another cast.
      // This never deletes the actor's mechanical ActiveEffects.
      await cleanupPersistentRuntimeOriginVisuals(technicalOriginToken);
    }

    if (targetMode === TARGET_MODES.SPELL_AREA && areaMode !== AREA_MODES.PREPLACED) {
      throw new Error("Creatures in spell area requires an area positioned during trap creation.");
    }

    // Resolve dynamic targets from the current scene immediately before the real Item use.
    // No token UUIDs from setup previews are persisted in the trap.
    let targetIds = targetMode === TARGET_MODES.TRIGGERING_TOKEN
      ? triggeringTokens.map(token => token?.id).filter(Boolean)
      : targetMode === TARGET_MODES.SPELL_AREA
        ? collectSavedAreaTargetIds(trap, originPoint, sourceResolution.activity)
        : targetMode === TARGET_MODES.CUSTOM_ZONE
          ? collectCustomZoneTargetIds(trap.selectionZone)
          : [];
    // Technical origin tokens can physically overlap the saved spell area.
    // Remove them before target-capacity and multi-hit planning so they never
    // count as victims even briefly. Midi hooks below remain a defensive layer.
    targetIds = filterRuntimeOriginTargetIds(targetIds);
    let targets = targetIds.map(id => canvas.scene.tokens.get(id)).filter(token => token?.actor);
    if ([TARGET_MODES.TRIGGERING_TOKEN, TARGET_MODES.CUSTOM_ZONE].includes(targetMode) && !targets.length) {
      throw new Error("No valid creature was found for this trap's direct-target workflow.");
    }

    // Each trap owns a hidden runtime copy of the real spell. Ordinary custom-
    // zone spells receive a target capacity equal to the current creature count,
    // allowing one stable native use instead of competing asynchronous casts.
    // EasyFix-configured multi-hit spells remain single-target at Item level;
    // their public API resolves the saved hit pool one target at a time.
    const preliminaryMultiHitPlan = buildEasyFixMultiHitPlan(
      sourceSpell,
      sourceResolution.activity,
      castLevel,
      targetIds,
      {
        hasTemplate: areaMode === AREA_MODES.PREPLACED,
        cantripCasterLevel
      }
    );
    const targetCapacity = preliminaryMultiHitPlan
      ? 1
      : targetMode === TARGET_MODES.CUSTOM_ZONE
        ? targetIds.length
        : null;
    runtimeSpell = await ensureRuntimeSpell(actor, sourceSpell, tile, sourceResolution.activity.id, {
      spellSaveDc,
      spellAttackBonus,
      targetCapacity,
      cantripCasterLevel
    });
    const runtimeResolution = resolveActivitySelection(runtimeSpell, sourceResolution.activity.id);
    if (!runtimeResolution.supported) throw new Error(activitySelectionErrorMessage(runtimeSpell, runtimeResolution));
    const activity = runtimeResolution.activity;
    const multiHitPlan = buildEasyFixMultiHitPlan(
      runtimeSpell,
      activity,
      castLevel,
      targetIds,
      {
        hasTemplate: areaMode === AREA_MODES.PREPLACED,
        // Reuse the configuration resolved from the original compendium/world
        // spell. The hidden runtime copy must not fall back to D&D5e's native
        // multi-target prompt merely because another module resolves presets
        // differently for an embedded synthetic Item.
        configurationOverride: preliminaryMultiHitPlan?.configuration ?? null,
        cantripCasterLevel
      }
    );
    if (preliminaryMultiHitPlan && !multiHitPlan) {
      throw new Error("EasyFix recognized this multi-hit spell, but its automatic runtime bridge could not be initialized.");
    }
    if (multiHitPlan) {
      targetIds = multiHitPlan.selectedTargetIds;
      targets = targetIds.map(id => canvas.scene.tokens.get(id)).filter(token => token?.actor);
    }

    // Temporarily disable the Tile while the native workflow is being started.
    // Single-use traps remain disabled; repeatable traps are rearmed only after a
    // successful Item use, preventing concurrent activations during this cast.
    await setTrapEnabled(tile, false);
    trapDisabled = true;
    await postTrapActivationMessage(tile);
    await pauseGameForTrap(trap);

    const useSpell = () => useOriginalSpellItem(runtimeSpell, {
      activityId: activity.id,
      createMeasuredTemplate: areaMode === AREA_MODES.PREPLACED,
      configure: Boolean(trap.requiresNativeInteraction),
      scaling,
      castLevel
    });
    let nativeResult;
    if (multiHitPlan) {
      nativeResult = await executeEasyFixMultiHit({
        spell: runtimeSpell,
        activity,
        actor,
        castLevel,
        scaling,
        plan: multiHitPlan
      });
    } else if (areaMode === AREA_MODES.PREPLACED) {
      const replay = await withNativeSpellTargets(targetIds, () => withSavedNativeTemplatePlacement({
        spell: runtimeSpell,
        activityId: activity.id,
        trap,
        originPoint,
        triggerTile: tile
      }, useSpell), { preserveOnSuccess: true });
      nativeResult = replay?.result;
      activatedTemplates = replay?.templates ?? [];
    } else nativeResult = await withNativeSpellTargets(targetIds, useSpell, { preserveOnSuccess: targetMode !== TARGET_MODES.NONE });

    if (!nativeResult) throw new Error("The original spell use was cancelled or could not be completed.");
    if (isInstantaneousSpell(sourceSpell) && technicalOriginToken) scheduleRuntimeOriginVisualCleanup(technicalOriginToken);
    if (activatedTemplates.length && isInstantaneousSpell(sourceSpell)) scheduleMeasuredTemplateCleanup(activatedTemplates);
    if (trap.disarmAfterTrigger === false) {
      await setTrapEnabled(tile, true, { resetDisarmAttempts: false });
      trapDisabled = false;
    }
    const payload = {
      continue: true,
      tokens: targets,
      nativeResult,
      passed: [],
      failed: [],
      tokenresults: [],
      workflow: workflow.mode
    };
    safeTrapComplete(onComplete, payload);
    return payload;
  } catch (error) {
    await deleteMeasuredTemplates(activatedTemplates);
    if (isInstantaneousSpell(sourceSpell) && technicalOriginToken) scheduleRuntimeOriginVisualCleanup(technicalOriginToken);
    if (trapDisabled) await setTrapEnabled(tile, true, { resetDisarmAttempts: false }).catch(rearmError => {
      console.warn(`${MODULE_ID} | Could not re-arm trap after a failed workflow`, rearmError);
    });
    throw error;
  }
}
