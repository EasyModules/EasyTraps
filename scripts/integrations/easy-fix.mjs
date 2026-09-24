import { buildCantripCountActor } from "../cantrip-scaling.mjs";
import { MODULE_ID, VERSION } from "../core/constants.mjs";
import { normalizeSpellBaseLevel } from "../core/spell-model.mjs";
import { currentTargetIds, setUserTargetIds } from "./targeting.mjs";

export function easyFixMultiHitApi() {
  const module = game.modules.get("easy-fix");
  if (module?.active !== true) return null;
  return game.easyFix?.multiHit
    ?? module.api?.multiHit
    ?? null;
}

export function easyFixMultiHitApiIsCompatible(api = easyFixMultiHitApi()) {
  return Boolean(api
    && (api.id == null || api.id === "easy-fix")
    && typeof api.getEffectiveSpellConfig === "function"
    && typeof api.computeExtraHitCount === "function"
    && typeof api.runtime?.createCastContext === "function"
    && typeof api.resolveRemainingExtraHits === "function");
}

export function easyFixMultiHitEnabled(api = easyFixMultiHitApi()) {
  if (!api) return false;
  const settingKey = api.settings?.MASTER;
  if (typeof settingKey !== "string" || !settingKey) return true;
  const settingId = `easy-fix.${settingKey}`;
  if (!game.settings?.settings?.has?.(settingId)) return true;
  try { return Boolean(game.settings.get("easy-fix", settingKey)); }
  catch (_error) { return true; }
}

export function warnAboutOptionalIntegrationCompatibility() {
  const module = game.modules.get("easy-fix");
  if (module?.active !== true || easyFixMultiHitApiIsCompatible()) return;
  ui.notifications.warn(
    `EasyTraps ${VERSION}: EasyFix ${module.version ?? "unknown"} is active, but its public Multi-Hit API is unavailable or incompatible. `
    + `Automatic multi-hit Spell Traps will use the normal dnd5e spell path until a compatible EasyFix build is active.`
  );
}

export function easyFixAcceptsActivity(configuration, activityId) {
  const accepted = [
    configuration?.hitActivityId,
    configuration?.baseActivityId,
    configuration?.extraActivityId
  ].filter(value => typeof value === "string" && value.trim()).map(value => value.trim());
  return !accepted.length || accepted.includes(activityId);
}

export function createEasyFixTargetSnapshot(token) {
  const document = token?.document ?? token;
  if (!document?.uuid || !document?.id) return null;
  return {
    tokenId: document.id,
    tokenUuid: document.uuid,
    actorUuid: document.actor?.uuid ?? null,
    sceneId: document.parent?.id ?? canvas.scene?.id ?? null,
    name: document.name ?? document.actor?.name ?? ""
  };
}

export function buildEasyFixMultiHitPlan(spell, activity, castLevel, targetIds, { hasTemplate = false, configurationOverride = null, cantripCasterLevel = null } = {}) {
  const api = easyFixMultiHitApi();
  if (!api || hasTemplate || !targetIds?.length || !easyFixMultiHitApiIsCompatible(api) || !easyFixMultiHitEnabled(api)) return null;

  let configuration = configurationOverride;
  try {
    if (!configuration) {
      const resolved = api.getEffectiveSpellConfig(spell, {
        includeBuiltInPreset: true,
        ignoreAutoPresetSetting: true
      });
      // The proposed public API returns the effective config directly. Accept a
      // { config, source } wrapper as well so EasyTraps is not coupled to API
      // presentation metadata. In both cases EasyFix remains the sole preset owner.
      configuration = resolved?.config && typeof resolved.config === "object"
        ? resolved.config
        : resolved;
    }
  } catch (error) {
    console.warn(`${MODULE_ID} | EasyFix effective spell configuration could not be read`, error);
    return null;
  }
  if (!configuration || configuration?.enabled === false || !easyFixAcceptsActivity(configuration, activity?.id)) return null;

  // EasyFix's public counter intentionally derives CANTRIP_SCALING from actor
  // level, not from castLevel. EasyTraps' hidden technical caster is level 1,
  // while the trap stores an explicit Caster Level. Feed a minimal read-only
  // actor-like level source to the count API for cantrips, while keeping the
  // spell's real castLevel at 0. Leveled spells keep their normal slot level.
  const isCantrip = normalizeSpellBaseLevel(spell?.system?.level) === 0;
  const countActor = isCantrip ? buildCantripCountActor(cantripCasterLevel) : null;
  const countCastLevel = isCantrip ? 0 : castLevel;
  const summary = api.computeExtraHitCount({
    item: spell,
    ...(countActor ? { actor: countActor } : {}),
    spellConfig: configuration,
    castLevel: countCastLevel
  });
  const totalHits = Math.max(1, Math.trunc(Number(summary?.totalHits) || 1));
  if (totalHits <= 1) return null;

  const availableIds = [...new Set(targetIds)].filter(id => canvas.scene?.tokens?.get?.(id)?.actor);
  if (!availableIds.length) return null;
  const selectedTargetIds = availableIds.slice(0, totalHits);
  const allocation = Array.from({ length: totalHits }, (_unused, index) => selectedTargetIds[index % selectedTargetIds.length]);
  return { api, configuration, summary, totalHits, selectedTargetIds, allocation };
}

export function resolveCasterToken(actor, activity = null) {
  return actor?.getActiveTokens?.()?.[0]
    ?? actor?.token
    ?? activity?.token
    ?? null;
}

export async function prepareEasyFixControlledVfx(plan, { spell, activity, actor, sourceToken, hitSnapshots } = {}) {
  // Enhanced VFX is an optional EasyFix capability, not an EasyTraps requirement.
  // EasyTraps never reads EasyFix settings or internal VFX flags directly.
  // Await the public helper so both current synchronous implementations and
  // future asynchronous implementations remain compatible.
  const prepareVolley = plan?.api?.vfx?.magicMissile?.prepareControlledVolley;
  if (typeof prepareVolley !== "function") return null;

  try {
    const prepared = await prepareVolley({
      activity,
      actor,
      item: spell,
      sourceToken,
      targetSnapshots: hitSnapshots
    });
    return prepared?.contextVfx ?? null;
  } catch (error) {
    console.warn(`${MODULE_ID} | EasyFix controlled Magic Missile VFX preparation failed; mechanics will continue normally.`, error);
    return null;
  }
}

export async function executeEasyFixMultiHit({ spell, activity, actor, castLevel, scaling, plan }) {
  const previousTargetIds = currentTargetIds();
  const snapshots = new Map(plan.selectedTargetIds.map(id => {
    const snapshot = createEasyFixTargetSnapshot(canvas.scene?.tokens?.get?.(id));
    return [id, snapshot];
  }).filter(([_id, snapshot]) => snapshot));
  const hitSnapshots = plan.allocation.map(id => snapshots.get(id)).filter(Boolean);
  if (hitSnapshots.length !== plan.totalHits) {
    throw new Error("One or more automatic spell targets could not be resolved for every hit.");
  }

  let context = null;
  try {
    // Do not make a native base cast here. EasyFix deliberately guards a
    // configured multi-hit spell's ordinary preUseActivity path. Instead,
    // create the public cast context with zero resolved hits and let EasyFix
    // execute the full saved hit pool through its isExtraHit workflow, which
    // is explicitly designed to bypass that guard without opening target UI.
    const contextUsageConfig = {
      consume: false,
      scaling: Math.max(0, Number(scaling) || 0),
      ...(castLevel > 0 ? { spell: { slot: `spell${castLevel}` } } : {})
    };
    const sourceToken = resolveCasterToken(actor, activity);
    const contextVfx = await prepareEasyFixControlledVfx(plan, {
      spell,
      activity,
      actor,
      sourceToken,
      hitSnapshots
    });
    context = plan.api.runtime.createCastContext({
      activity,
      actor,
      item: spell,
      token: sourceToken,
      spellConfig: plan.configuration,
      usageConfig: contextUsageConfig,
      spellLevel: castLevel,
      extraHitSummary: plan.summary,
      resolvedHitCount: 0,
      results: {},
      userId: game.user?.id ?? null,
      createdFrom: MODULE_ID,
      vfx: contextVfx
    });
    if (!context?.id) throw new Error("EasyFix did not create a multi-hit cast context.");

    const resolution = await plan.api.resolveRemainingExtraHits(context.id, { targetSnapshots: hitSnapshots });
    if (!resolution?.ok || !resolution?.completed) {
      plan.api.runtime?.deleteCastContext?.(context.id);
      throw new Error("The configured multi-hit spell did not finish resolving all of its hits.");
    }

    await setUserTargetIds(plan.selectedTargetIds);
    const lastResults = resolution.iterations?.at?.(-1)?.results ?? {};
    return {
      ...lastResults,
      easyFix: {
        automatic: true,
        totalHits: plan.totalHits,
        targetIds: plan.selectedTargetIds,
        resolution
      }
    };
  } catch (error) {
    if (context?.id) plan.api.runtime?.deleteCastContext?.(context.id);
    await setUserTargetIds(previousTargetIds);
    throw error;
  }
}
