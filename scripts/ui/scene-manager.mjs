import { openTrapAdvancedSettings } from "../advanced.mjs";
import {
  ALARM_AUDIBILITY_MODES,
  ALARM_CHAT_MODES,
  ALARM_PLAYBACK_MODES,
  DEFAULT_ALARM_SOUND,
  alarmAudibilityLabel,
  alarmChatLabel,
  alarmPlaybackLabel,
  alarmSoundLabel,
  hasSupportedAudioExtension,
  normalizeAlarmConfig
} from "../alarm.mjs";
import {
  buildCantripCasterLevelOptions,
  cantripScalingIncrease,
  normalizeCantripCasterLevel
} from "../cantrip-scaling.mjs";
import { sceneDistanceUnits, tileCenterPoint } from "../core/canvas-geometry.mjs";
import {
  AREA_MODES,
  CANVAS_PAN_DURATION_MS,
  DEFAULT_TRIGGER_TEXTURE,
  MODULE_ID,
  TEMPLATE_BINDINGS
} from "../core/constants.mjs";
import { refreshAreaOverlays, refreshTriggerOverlays } from "../core/presentation.mjs";
import { runtime } from "../core/runtime-state.mjs";
import { resolveItemReference } from "../core/spell-catalog.mjs";
import { castScaling, normalizeCastLevel, normalizeSpellBaseLevel } from "../core/spell-model.mjs";
import { escapeHtml } from "../core/text.mjs";
import { collapseNonSpatialAlarmOrigin } from "../core/trap-lifecycle.mjs";
import {
  isAlarmTrap,
  normalizeAreaMode,
  normalizeSpellAttackBonus,
  normalizeSpellSaveDc,
  sceneTrapDocuments,
  trapData,
  trapDisplayImage,
  trapDisplayName,
  trapIsDiscovered
} from "../core/trap-model.mjs";
import {
  applyAdvancedSettingsToAllTraps,
  setTrapDiscovered,
  setTrapEnabled,
  trapArmBlockReason,
  trapCanArm
} from "../core/trap-state.mjs";
import { normalizeDisarmAttempts } from "../disarm.mjs";
import { detectionSkillLabel, normalizeDiscoveryConfig } from "../discovery.mjs";
import { activityLabel, findActivity } from "../integrations/dnd5e-activities.mjs";
import { mattActiveForTrap } from "../integrations/matt-state.mjs";
import { setAlarmCooldown } from "../payloads/alarm-payload.mjs";
import { TRIGGER_TYPES, normalizeTriggerType, triggerTypeLabel } from "../trigger-sources.mjs";
import {
  buildCastLevelOptions,
  formatSignedModifier,
  originModeLabel,
  targetModeLabel,
  trapExecutionLevelLabel
} from "./format.mjs";
import { openAlarmWizard, openWizard } from "./launchers.mjs";
import {
  browseAlarmSound,
  previewAlarmFromForm,
  readAlarmConfigFromForm,
  updateAlarmWizardConditionalFields
} from "./trap-wizard.mjs";

export function registerSceneControlButtons(controls) {
  if (!game.user?.isGM || !controls?.tiles?.tools) return;
  controls.tiles.tools.easyTrapsManager = {
    name: "easyTrapsManager",
    title: "EasyTraps Scene Manager",
    icon: "fa-solid fa-dungeon",
    order: Object.keys(controls.tiles.tools).length,
    button: true,
    visible: true,
    onChange: () => openSceneTrapManager()
  };
}

export function disarmHistoryView(trap) {
  const history = normalizeDisarmAttempts(trap?.disarmAttempts);
  return Object.entries(history)
    .map(([actorId, record]) => {
      const worldActor = game.actors?.get?.(actorId);
      const sceneToken = Array.from(canvas?.scene?.tokens ?? []).find(token => String(token?.actor?.id ?? token?.actorId ?? "") === String(actorId));
      const actorName = worldActor?.name ?? sceneToken?.actor?.name ?? `Actor ${actorId.slice(0, 6)}`;
      return {
        actorId,
        actorName,
        count: record.count,
        total: record.lastTotal,
        naturalD20: record.lastNatural,
        success: record.lastSuccess,
        triggered: record.lastTriggered,
        status: record.lastSuccess ? "Success" : record.lastTriggered ? "Triggered" : "Failed"
      };
    })
    .sort((a, b) => a.actorName.localeCompare(b.actorName));
}

export async function openAdvancedSettingsForTile(tile) {
  const trap = trapData(tile);
  if (!tile || !trap) return null;
  const displayName = trapDisplayName(trap, tile);
  return openTrapAdvancedSettings({
    value: normalizeDiscoveryConfig(trap.discovery),
    title: `Advanced — ${displayName}`,
    subtitle: isAlarmTrap(trap) ? "Alarm trap" : "Spell trap",
    pauseOnTrigger: trap.pauseOnTrigger === true,
    normalize: normalizeDiscoveryConfig,
    resolveItem: resolveItemReference,
    history: disarmHistoryView(trap),
    onClearHistory: async () => {
      await tile.update({ [`flags.${MODULE_ID}.-=disarmAttempts`]: null });
      refreshOpenSceneTrapManager();
      ui.notifications.info(`${displayName} disarm attempt history cleared.`);
    },
    onSave: async (value, meta = {}) => {
      const update = { [`flags.${MODULE_ID}.discovery`]: normalizeDiscoveryConfig(value) };
      if (typeof meta.pauseOnTrigger === "boolean") update[`flags.${MODULE_ID}.pauseOnTrigger`] = meta.pauseOnTrigger;
      await tile.update(update);
      refreshOpenSceneTrapManager();
      ui.notifications.info(`${displayName} advanced settings saved.`);
    },
    // Apply every editable setting on this page. Attempt history is state, not
    // configuration, so it is deliberately never copied between traps.
    onApplyAll: async (value, meta) => applyAdvancedSettingsToAllTraps(value, meta)
  });
}

export function templateBindingSummary(trap) {
  if (trap?.selectionZone) return "Custom creature target zone";
  const bindings = new Set((Array.isArray(trap?.templates) ? trap.templates : []).map(template => template?.binding).filter(Boolean));
  if (bindings.has(TEMPLATE_BINDINGS.SCENE_FIXED) && bindings.has(TEMPLATE_BINDINGS.ORIGIN_LINKED)) return "Mixed saved areas";
  if (bindings.has(TEMPLATE_BINDINGS.SCENE_FIXED)) return "Fixed spell area";
  if (bindings.has(TEMPLATE_BINDINGS.ORIGIN_LINKED)) return "Area linked to origin";
  return normalizeAreaMode(trap?.areaMode) === AREA_MODES.ON_TRIGGER ? "Area placed on trigger" : "No saved area";
}

export function buildSceneTrapManagerInner(scene = canvas.scene) {
  const traps = sceneTrapDocuments(scene);
  const armedCount = traps.filter(tile => trapData(tile)?.armed !== false && !trapData(tile)?.requiresReconfiguration).length;
  const disarmedCount = traps.length - armedCount;
  const discoveredCount = traps.filter(tile => trapIsDiscovered(tile, trapData(tile))).length;
  const hiddenCount = traps.length - discoveredCount;
  const armableCount = traps.filter(tile => trapData(tile)?.armed === false && trapCanArm(tile, trapData(tile))).length;
  const spellCount = traps.filter(tile => !isAlarmTrap(trapData(tile))).length;
  const alarmCount = traps.length - spellCount;

  const rows = traps.map(tile => {
    const trap = trapData(tile);
    const alarmTrap = isAlarmTrap(trap);
    const type = alarmTrap ? "alarm" : "spell";
    const displayName = trapDisplayName(trap, tile);
    const needsReconfiguration = Boolean(trap?.requiresReconfiguration);
    const armed = trap?.armed !== false && !needsReconfiguration;
    const discovered = trapIsDiscovered(tile, trap);
    const canArm = trapCanArm(tile, trap);
    const origin = originModeLabel(trap?.originMode).replace(/^origin:\s*/i, "");
    const triggerType = normalizeTriggerType(trap?.triggerType);
    const size = triggerType === TRIGGER_TYPES.TILE
      ? `${Number(trap?.triggerWidth) || 1}×${Number(trap?.triggerHeight) || 1}`
      : triggerTypeLabel(triggerType);
    const pause = trap?.pauseOnTrigger ? "Yes" : "No";
    const oneShot = trap?.disarmAfterTrigger !== false ? "Yes" : "No";
    const discovery = normalizeDiscoveryConfig(trap?.discovery);
    const discoveryEnabled = discovery.enabled;
    const detection = `${detectionSkillLabel(discovery.detection.skill)} DC ${discovery.detection.dc}`;
    const disarmRule = `Sleight of Hand DC ${discovery.disarm.dc}`;
    const icon = alarmTrap
      ? '<i class="fa-solid fa-bell" aria-hidden="true"></i>'
      : `<img src="${escapeHtml(trapDisplayImage(trap))}" alt="${escapeHtml(displayName)}">`;
    const chips = alarmTrap
      ? (() => {
          const config = normalizeAlarmConfig(trap.alarm);
          const audibility = config.audibility.mode === ALARM_AUDIBILITY_MODES.SPATIAL
            ? `${alarmAudibilityLabel(config.audibility.mode)} · ${config.audibility.radius} ${sceneDistanceUnits()}`
            : alarmAudibilityLabel(config.audibility.mode);
          return `<span class="et-stat-chip et-level-chip"><i class="fa-solid fa-volume-high"></i><strong>${escapeHtml(alarmSoundLabel(config))}</strong></span>
            <span class="et-stat-chip"><i class="fa-solid fa-ear-listen"></i><strong>${escapeHtml(audibility)}</strong></span>
            <span class="et-stat-chip"><i class="fa-solid fa-gauge"></i><strong>${Math.round(config.sound.volume * 100)}%</strong></span>`;
        })()
      : `<span class="et-stat-chip et-level-chip"><i class="fa-solid fa-arrow-up-right-dots"></i><strong>${escapeHtml(trapExecutionLevelLabel(trap))}</strong></span>
          <span class="et-stat-chip"><b>DC</b><strong>${normalizeSpellSaveDc(trap?.spellSaveDc)}</strong></span>
          <span class="et-stat-chip"><i class="fa-solid fa-crosshairs"></i><strong>${escapeHtml(formatSignedModifier(trap?.spellAttackBonus))}</strong></span>`;
    const details = alarmTrap
      ? (() => {
          const config = normalizeAlarmConfig(trap.alarm);
          const audibility = config.audibility.mode === ALARM_AUDIBILITY_MODES.SPATIAL
            ? `${alarmAudibilityLabel(config.audibility.mode)} · ${config.audibility.radius} ${sceneDistanceUnits()}${config.audibility.walls ? " · walls" : ""}`
            : alarmAudibilityLabel(config.audibility.mode);
          const originDetail = config.audibility.mode === ALARM_AUDIBILITY_MODES.SPATIAL
            ? `<span><small>Origin</small><b>${escapeHtml(origin)}</b></span>`
            : "";
          return `<span><small>Payload</small><b>Alarm</b></span>
            <span><small>Trigger</small><b>${escapeHtml(size)}${triggerType === TRIGGER_TYPES.TILE ? " cells" : ""}</b></span>
            ${originDetail}
            <span><small>Sound</small><b>${escapeHtml(alarmSoundLabel(config))}</b></span>
            <span><small>Audibility</small><b>${escapeHtml(audibility)}</b></span>
            <span><small>Playback</small><b>${escapeHtml(alarmPlaybackLabel(config))}</b></span>
            <span><small>Chat</small><b>${escapeHtml(alarmChatLabel(config.chat.mode))}</b></span>
            <span><small>Visibility</small><b>${discovered ? "Discovered by players" : "Hidden from players"}</b></span>
            <span><small>Pause</small><b>${pause}</b></span>
            <span><small>Disarm after trigger</small><b>${oneShot}</b></span>
            ${trap?.disarmAfterTrigger === false ? `<span><small>Repeat cooldown</small><b>${config.cooldownSeconds}s</b></span>` : ""}
            <span><small>Discovery</small><b>${discoveryEnabled ? escapeHtml(detection) : "Disabled"}</b></span>
            <span><small>Disarm check</small><b>${discoveryEnabled ? escapeHtml(disarmRule) : "Disabled"}</b></span>`;
        })()
      : (() => {
          const target = targetModeLabel(trap?.targetMode);
          const area = templateBindingSummary(trap);
          const activity = String(trap?.activityLabel ?? trap?.activityType ?? "Activity");
          return `<span><small>Activity</small><b>${escapeHtml(activity)}</b></span>
            <span><small>Trigger</small><b>${escapeHtml(size)}${triggerType === TRIGGER_TYPES.TILE ? " cells" : ""}</b></span>
            <span><small>Origin</small><b>${escapeHtml(origin)}</b></span>
            <span><small>Targets</small><b>${escapeHtml(target)}</b></span>
            <span><small>Area</small><b>${escapeHtml(area)}</b></span>
            <span><small>Visibility</small><b>${discovered ? "Discovered by players" : "Hidden from players"}</b></span>
            <span><small>Pause</small><b>${pause}</b></span>
            <span><small>Disarm after trigger</small><b>${oneShot}</b></span>
            <span><small>Discovery</small><b>${discoveryEnabled ? escapeHtml(detection) : "Disabled"}</b></span>
            <span><small>Disarm check</small><b>${discoveryEnabled ? escapeHtml(disarmRule) : "Disabled"}</b></span>`;
        })();

    return `<article class="et-manager-row ${armed ? "is-armed" : "is-disarmed"} ${discovered ? "is-discovered" : "is-hidden"} is-${type}" data-trap-id="${escapeHtml(tile.id)}" data-trap-type="${type}">
      <div class="et-manager-main">
      <div class="et-manager-icon ${alarmTrap ? "is-alarm" : "is-spell"}">${icon}</div>
      <div class="et-manager-copy">
        <div class="et-manager-title">
          <b>${escapeHtml(displayName)}</b>
          <span class="et-manager-badges">
            <span class="et-manager-type is-${type}">${alarmTrap ? "Alarm" : "Spell"}</span>
            <span class="et-manager-status ${needsReconfiguration ? "is-invalid" : armed ? "is-armed" : "is-disarmed"}">${needsReconfiguration ? "Recreate" : armed ? "Armed" : "Disarmed"}</span>
            <span class="et-manager-visibility ${discovered ? "is-discovered" : "is-hidden"}"><i class="fa-solid ${discovered ? "fa-eye" : "fa-eye-slash"}"></i>${discovered ? "Discovered" : "Hidden"}</span>
          </span>
        </div>
        <div class="et-manager-chips">${chips}</div>
        <div class="et-manager-secondary">
          <button type="button" class="et-manager-more" data-trap-action="details" data-trap-id="${escapeHtml(tile.id)}" aria-expanded="false"><i class="fa-solid fa-chevron-right"></i><span>More information</span></button>
          <button type="button" class="et-manager-advanced ${discoveryEnabled ? "is-enabled" : ""}" data-trap-action="advanced" data-trap-id="${escapeHtml(tile.id)}" title="Discovery & disarming settings"><i class="fa-solid fa-sliders"></i><span>Advanced</span></button>
        </div>
      </div>
      <div class="et-manager-actions">
        <button type="button" data-trap-action="locate" data-trap-id="${escapeHtml(tile.id)}" title="Locate and select this trap"><i class="fa-solid fa-location-crosshairs"></i><span>Locate</span></button>
        <button type="button" data-trap-action="edit" data-trap-id="${escapeHtml(tile.id)}" title="Edit safe trap settings"><i class="fa-solid fa-pen-to-square"></i><span>Edit</span></button>
        <button type="button" data-trap-action="visibility" data-trap-id="${escapeHtml(tile.id)}" class="et-visibility-action ${discovered ? "is-discovered" : "is-hidden"}" title="${discovered ? "Hide this trap from players" : "Reveal this trap to players"}"><i class="fa-solid ${discovered ? "fa-eye-slash" : "fa-eye"}"></i><span>${discovered ? "Hide" : "Reveal"}</span></button>
        <button type="button" data-trap-action="toggle" data-trap-id="${escapeHtml(tile.id)}" class="${armed ? "et-danger" : "et-primary"}" ${!armed && !canArm ? "disabled" : ""} title="${armed ? "Disarm this trap" : canArm ? "Rearm this trap" : escapeHtml(trapArmBlockReason(tile, trap) ?? "This trap cannot be rearmed.")}"><i class="fa-solid ${armed ? "fa-power-off" : "fa-rotate-right"}"></i><span>${armed ? "Disarm" : "Rearm"}</span></button>
      </div>
      </div>
      <div class="et-manager-details-panel" data-trap-details="${escapeHtml(tile.id)}" hidden>${details}</div>
    </article>`;
  }).join("");

  const createButtons = `<button type="button" data-manager-action="create-spell" class="et-primary"><i class="fa-solid fa-wand-magic-sparkles"></i> Spell trap</button><button type="button" data-manager-action="create-alarm"><i class="fa-solid fa-bell"></i> Alarm trap</button>`;

  return `<header class="et-manager-header">
    <div><small>Current scene</small><b>${escapeHtml(scene?.name ?? "Scene")}</b><span>${traps.length} trap${traps.length === 1 ? "" : "s"} · ${armedCount} armed · ${disarmedCount} disarmed · ${hiddenCount} hidden · ${discoveredCount} discovered</span></div>
    <div class="et-manager-header-actions"><button type="button" data-manager-action="refresh" title="Refresh"><i class="fa-solid fa-arrows-rotate"></i></button>${createButtons}</div>
  </header>
  <div class="et-manager-filterbar" data-manager-filterbar>
    <button type="button" data-manager-action="filter" data-trap-filter="all" class="is-active">All <em>${traps.length}</em></button>
    <button type="button" data-manager-action="filter" data-trap-filter="spell"><i class="fa-solid fa-wand-magic-sparkles"></i> Spell <em>${spellCount}</em></button>
    <button type="button" data-manager-action="filter" data-trap-filter="alarm"><i class="fa-solid fa-bell"></i> Alarm <em>${alarmCount}</em></button>
  </div>
  <div class="et-manager-bulkbar">
    <span><i class="fa-solid fa-layer-group"></i><b>Scene controls</b><small>Arm or disarm every valid trap in this scene.</small></span>
    <div>
      <button type="button" data-manager-action="arm-all" class="et-bulk-arm" ${armableCount ? "" : "disabled"}><i class="fa-solid fa-rotate-right"></i><span>Rearm all</span><em>${armableCount}</em></button>
      <button type="button" data-manager-action="disarm-all" class="et-bulk-disarm" ${armedCount ? "" : "disabled"}><i class="fa-solid fa-power-off"></i><span>Disarm all</span><em>${armedCount}</em></button>
    </div>
  </div>
  <div class="et-manager-list">${rows || `<div class="et-manager-empty"><i class="fa-solid fa-dungeon"></i><b>No traps in this scene</b><small>Create a Spell Trap or Alarm Trap to begin managing it here.</small><div class="et-manager-empty-actions">${createButtons}</div></div>`}</div>
  <footer class="et-manager-footer"><button type="button" data-manager-action="close"><i class="fa-solid fa-xmark"></i> Close</button></footer>`;
}

export function closeSceneManagerForCanvasTearDown() {
  const manager = runtime.sceneManager;
  runtime.sceneManager = null;
  if (!manager?.dialog?.close) return;
  try {
    const result = manager.dialog.close();
    if (result?.catch) result.catch(() => {});
  } catch (_error) { /* the dialog may already be closing with the old canvas */ }
}

export function buildSceneTrapManagerContent(scene = canvas.scene) {
  return `<form class="easy-traps-manager"><div data-manager-content>${buildSceneTrapManagerInner(scene)}</div></form>`;
}

export function refreshOpenSceneTrapManager() {
  const manager = runtime.sceneManager;
  if (!manager?.root?.isConnected || manager.sceneId !== canvas.scene?.id) return;
  const filter = manager.root.dataset.trapFilter || "all";
  const content = manager.root.querySelector("[data-manager-content]");
  if (content) content.innerHTML = buildSceneTrapManagerInner(canvas.scene);
  applySceneManagerFilter(manager.root, filter);
}

export function applySceneManagerFilter(form, filter = "all") {
  if (!form) return;
  const normalized = ["spell", "alarm"].includes(filter) ? filter : "all";
  form.dataset.trapFilter = normalized;
  for (const button of form.querySelectorAll?.("[data-manager-action='filter']") ?? []) {
    button.classList.toggle("is-active", button.dataset.trapFilter === normalized);
  }
  for (const row of form.querySelectorAll?.("[data-trap-type]") ?? []) {
    row.hidden = normalized !== "all" && row.dataset.trapType !== normalized;
  }
}

export async function locateSceneTrap(tile) {
  if (!tile || tile.parent?.id !== canvas.scene?.id) return;
  try { await canvas.tiles?.activate?.(); } catch (_error) { /* layer activation is best effort */ }
  const point = tileCenterPoint(tile);
  const scale = Math.max(0.8, Math.min(1.35, Number(canvas.stage?.scale?.x) || 1));
  if (canvas.animatePan instanceof Function) await canvas.animatePan({ x: point.x, y: point.y, scale, duration: CANVAS_PAN_DURATION_MS });
  else canvas.pan?.({ x: point.x, y: point.y, scale });
  tile.object?.control?.({ releaseOthers: true });
  refreshTriggerOverlays();
  refreshAreaOverlays();
}

export async function setSceneTrapsEnabled(tiles, enabled) {
  const scene = canvas.scene;
  const documents = (tiles ?? []).filter(tile => tile?.parent?.id === scene?.id && trapData(tile));
  if (!scene || !documents.length) return 0;
  const updates = documents.map(tile => ({
    _id: tile.id,
    [`flags.${MODULE_ID}.armed`]: Boolean(enabled),
    ...(enabled ? { [`flags.${MODULE_ID}.-=disarmAttempts`]: null } : {}),
    "flags.monks-active-tiles.active": mattActiveForTrap(trapData(tile), enabled)
  }));
  await scene.updateEmbeddedDocuments("Tile", updates);
  refreshTriggerOverlays();
  refreshAreaOverlays();
  return updates.length;
}

export function activateSceneTrapManager(root, dialog) {
  const form = root?.matches?.("form.easy-traps-manager") ? root : root?.querySelector?.("form.easy-traps-manager");
  if (!form || form.dataset.activated === "true") return;
  form.dataset.activated = "true";
  runtime.sceneManager = { dialog, root: form, sceneId: canvas.scene?.id };
  form.addEventListener("submit", event => event.preventDefault());
  form.addEventListener("click", async event => {
    const managerAction = event.target?.closest?.("[data-manager-action]")?.dataset.managerAction;
    if (managerAction === "close") {
      await dialog.close();
      return;
    }
    if (managerAction === "refresh") {
      refreshOpenSceneTrapManager();
      return;
    }
    if (managerAction === "filter") {
      applySceneManagerFilter(form, event.target?.closest?.("[data-trap-filter]")?.dataset.trapFilter);
      return;
    }
    if (managerAction === "arm-all") {
      const all = sceneTrapDocuments(canvas.scene);
      const candidates = all.filter(tile => trapData(tile)?.armed === false && trapCanArm(tile, trapData(tile)));
      const skipped = all.filter(tile => trapData(tile)?.armed === false && !trapCanArm(tile, trapData(tile))).length;
      const count = await setSceneTrapsEnabled(candidates, true);
      if (count || skipped) ui.notifications.info(`${count} trap${count === 1 ? "" : "s"} rearmed${skipped ? ` · ${skipped} skipped` : ""}.`);
      refreshOpenSceneTrapManager();
      return;
    }
    if (managerAction === "disarm-all") {
      const candidates = sceneTrapDocuments(canvas.scene).filter(tile => trapData(tile)?.armed !== false);
      const count = await setSceneTrapsEnabled(candidates, false);
      if (count) ui.notifications.info(`${count} trap${count === 1 ? "" : "s"} disarmed.`);
      refreshOpenSceneTrapManager();
      return;
    }
    if (managerAction === "create-spell") {
      await dialog.close();
      await openWizard();
      return;
    }
    if (managerAction === "create-alarm") {
      await dialog.close();
      await openAlarmWizard();
      return;
    }
    const actionButton = event.target?.closest?.("[data-trap-action]");
    if (!actionButton) return;
    if (actionButton.dataset.trapAction === "details") {
      const row = actionButton.closest?.(".et-manager-row");
      const panel = row?.querySelector?.("[data-trap-details]");
      if (!panel) return;
      const open = panel.hidden;
      panel.hidden = !open;
      actionButton.setAttribute("aria-expanded", String(open));
      return;
    }
    const tile = canvas.scene?.tiles?.get?.(actionButton.dataset.trapId);
    const trap = trapData(tile);
    if (!tile || !trap) {
      ui.notifications.warn("That trap could not be found in the current scene.");
      refreshOpenSceneTrapManager();
      return;
    }
    if (actionButton.dataset.trapAction === "locate") {
      await locateSceneTrap(tile);
      return;
    }
    if (actionButton.dataset.trapAction === "edit") {
      await openTrapQuickEditor(tile);
      refreshOpenSceneTrapManager();
      return;
    }
    if (actionButton.dataset.trapAction === "advanced") {
      openAdvancedSettingsForTile(tile);
      return;
    }
    if (actionButton.dataset.trapAction === "visibility") {
      const discovered = !trapIsDiscovered(tile, trap);
      await setTrapDiscovered(tile, discovered);
      ui.notifications.info(`${trapDisplayName(trap, tile)} ${discovered ? "revealed to players" : "hidden from players"}.`);
      return;
    }
    if (actionButton.dataset.trapAction === "toggle") {
      const nextArmed = trap.armed === false;
      if (trap.requiresReconfiguration) return ui.notifications.warn("This legacy trap cannot be rearmed because its spell is not compatible with the selected Activity workflow. Recreate it.");
      if (nextArmed && !trapCanArm(tile, trap)) return ui.notifications.warn(trapArmBlockReason(tile, trap) ?? "This trap cannot be rearmed.");
      await setTrapEnabled(tile, nextArmed);
      ui.notifications.info(`${trapDisplayName(trap, tile)} ${nextArmed ? "rearmed" : "disarmed"}.`);
      refreshOpenSceneTrapManager();
    }
  });
}

export async function openAlarmTrapQuickEditor(tile, trap = trapData(tile)) {
  if (!tile || !trap || !isAlarmTrap(trap) || !globalThis.Dialog) return null;
  const config = normalizeAlarmConfig(trap.alarm);
  const customSound = config.sound.custom && config.sound.path !== DEFAULT_ALARM_SOUND;
  const canArm = trapCanArm(tile, trap);
  const content = `<form class="easy-traps-context et-trap-editor easy-traps-alarm-editor">
    <div class="et-editor-heading et-alarm-editor-heading"><span class="et-editor-alarm-icon"><i class="fa-solid fa-bell"></i></span><span><small>Editing trap</small><b>${escapeHtml(trapDisplayName(trap, tile))}</b><em>${escapeHtml(alarmSoundLabel(config))} · ${escapeHtml(alarmAudibilityLabel(config.audibility.mode))}</em></span></div>

    <fieldset class="et-alarm-fieldset">
      <legend>Alarm sound</legend>
      <div class="et-alarm-choice-grid">
        <label class="et-origin-option"><input type="radio" name="alarmSoundMode" value="default" ${customSound ? "" : "checked"}><span><i class="fa-solid fa-clock"></i><b>Clock Alarm</b><small>Bundled EasyTraps sound.</small></span></label>
        <label class="et-origin-option"><input type="radio" name="alarmSoundMode" value="custom" ${customSound ? "checked" : ""}><span><i class="fa-solid fa-file-audio"></i><b>Custom Sound</b><small>Use any supported Foundry audio path.</small></span></label>
      </div>
      <div class="et-alarm-file-row" data-alarm-custom-row ${customSound ? "" : "hidden"}>
        <label><span>Custom audio path</span><div class="et-alarm-file-control"><input type="text" name="alarmSoundPath" value="${escapeHtml(customSound ? config.sound.path : "")}" placeholder="sounds/alarm.ogg"><button type="button" data-alarm-action="browse" title="Browse audio"><i class="fa-solid fa-folder-open"></i></button></div></label>
      </div>
      <div class="et-alarm-audio-controls">
        <label><span>Volume</span><div class="et-number-suffix"><input type="number" name="alarmVolume" min="0" max="1" step="0.05" value="${config.sound.volume}"><b>0–1</b></div></label>
        <button type="button" class="et-alarm-preview" data-alarm-action="preview"><i class="fa-solid fa-play"></i><span>Preview locally</span></button>
      </div>
    </fieldset>

    <fieldset class="et-alarm-fieldset">
      <legend>Who can hear it?</legend>
      <div class="et-alarm-choice-grid et-alarm-three-grid">
        <label class="et-origin-option"><input type="radio" name="alarmAudibility" value="${ALARM_AUDIBILITY_MODES.SPATIAL}" ${config.audibility.mode === ALARM_AUDIBILITY_MODES.SPATIAL ? "checked" : ""}><span><i class="fa-solid fa-volume-high"></i><b>Spatial</b><small>Radius, distance fade, and walls.</small></span></label>
        <label class="et-origin-option"><input type="radio" name="alarmAudibility" value="${ALARM_AUDIBILITY_MODES.SCENE}" ${config.audibility.mode === ALARM_AUDIBILITY_MODES.SCENE ? "checked" : ""}><span><i class="fa-solid fa-users"></i><b>Entire Scene</b><small>Everyone viewing this Scene.</small></span></label>
        <label class="et-origin-option"><input type="radio" name="alarmAudibility" value="${ALARM_AUDIBILITY_MODES.GM_ONLY}" ${config.audibility.mode === ALARM_AUDIBILITY_MODES.GM_ONLY ? "checked" : ""}><span><i class="fa-solid fa-user-secret"></i><b>GM Only</b><small>Silent alarm for players.</small></span></label>
      </div>
      <div class="et-alarm-spatial-options" data-alarm-spatial-options ${config.audibility.mode === ALARM_AUDIBILITY_MODES.SPATIAL ? "" : "hidden"}>
        <div class="et-trigger-size-grid"><label><span>Hearing radius</span><div class="et-number-suffix"><input type="number" name="alarmRadius" min="1" max="9999" step="1" value="${config.audibility.radius}"><b>${escapeHtml(sceneDistanceUnits())}</b></div></label></div>
        <div class="et-activation-option-grid">
          <label class="et-pause-option"><input type="checkbox" name="alarmEasing" ${config.audibility.easing ? "checked" : ""}><span><i class="fa-solid fa-wave-square"></i><b>Fade with distance</b><small>Reduce volume toward the edge.</small></span></label>
          <label class="et-pause-option"><input type="checkbox" name="alarmWalls" ${config.audibility.walls ? "checked" : ""}><span><i class="fa-solid fa-wall-brick"></i><b>Constrained by walls</b><small>Use Foundry sound propagation.</small></span></label>
          <label class="et-pause-option"><input type="checkbox" name="alarmGmAlways" ${config.audibility.gmAlways ? "checked" : ""}><span><i class="fa-solid fa-headphones"></i><b>GM always hears</b><small>Ignore listener position for GMs.</small></span></label>
        </div>
      </div>
    </fieldset>

    <fieldset class="et-alarm-fieldset">
      <legend>Playback & notification</legend>
      <div class="et-alarm-choice-grid">
        <label class="et-origin-option"><input type="radio" name="alarmPlayback" value="${ALARM_PLAYBACK_MODES.ONCE}" ${config.playback.mode === ALARM_PLAYBACK_MODES.ONCE ? "checked" : ""}><span><i class="fa-solid fa-play"></i><b>Play once</b><small>Play one complete alarm sound.</small></span></label>
        <label class="et-origin-option"><input type="radio" name="alarmPlayback" value="${ALARM_PLAYBACK_MODES.SUSTAINED}" ${config.playback.mode === ALARM_PLAYBACK_MODES.SUSTAINED ? "checked" : ""}><span><i class="fa-solid fa-repeat"></i><b>Repeat for a Duration</b><small>Repeats until the configured duration expires.</small></span></label>
      </div>
      <div class="et-trigger-size-grid" data-alarm-duration-row ${config.playback.mode === ALARM_PLAYBACK_MODES.SUSTAINED ? "" : "hidden"}><label><span>Duration</span><div class="et-number-suffix"><input type="number" name="alarmDuration" min="1" max="300" step="1" value="${config.playback.duration}"><b>seconds</b></div></label></div>
      <div class="et-alarm-choice-grid et-alarm-three-grid et-alarm-chat-grid">
        <label class="et-origin-option"><input type="radio" name="alarmChat" value="${ALARM_CHAT_MODES.OFF}" ${config.chat.mode === ALARM_CHAT_MODES.OFF ? "checked" : ""}><span><i class="fa-solid fa-comment-slash"></i><b>Chat Off</b></span></label>
        <label class="et-origin-option"><input type="radio" name="alarmChat" value="${ALARM_CHAT_MODES.GM_ONLY}" ${config.chat.mode === ALARM_CHAT_MODES.GM_ONLY ? "checked" : ""}><span><i class="fa-solid fa-eye"></i><b>GM Only</b></span></label>
        <label class="et-origin-option"><input type="radio" name="alarmChat" value="${ALARM_CHAT_MODES.EVERYONE}" ${config.chat.mode === ALARM_CHAT_MODES.EVERYONE ? "checked" : ""}><span><i class="fa-solid fa-comments"></i><b>Everyone</b></span></label>
      </div>
    </fieldset>

    <div class="et-editor-toggles">
      <label><input type="checkbox" name="pauseOnTrigger" ${trap.pauseOnTrigger ? "checked" : ""}><span><i class="fa-solid fa-pause"></i><b>Pause when triggered</b><small>The GM resumes the game manually.</small></span></label>
      <label><input type="checkbox" name="disarmAfterTrigger" ${trap.disarmAfterTrigger !== false ? "checked" : ""}><span><i class="fa-solid fa-power-off"></i><b>Disarm after triggering</b><small>Disable this for a repeatable alarm.</small></span></label>
      <label><input type="checkbox" name="armed" ${trap.armed !== false && !trap.requiresReconfiguration ? "checked" : ""} ${trap.requiresReconfiguration || !canArm ? "disabled" : ""}><span><i class="fa-solid fa-shield-halved"></i><b>Armed</b><small>${trap.requiresReconfiguration ? "This trap must be recreated." : !canArm ? escapeHtml(trapArmBlockReason(tile, trap) ?? "This trap cannot be armed.") : "Ready to activate in the scene."}</small></span></label>
    </div>
    <div class="et-trigger-size-grid" data-alarm-cooldown-row ${trap.disarmAfterTrigger === false ? "" : "hidden"}><label><span>Repeat cooldown</span><div class="et-number-suffix"><input type="number" name="alarmCooldown" min="0" max="300" step="1" value="${config.cooldownSeconds}"><b>seconds</b></div></label></div>
  </form>`;

  const result = await new Promise(resolve => {
    let settled = false;
    const finish = value => { if (!settled) { settled = true; resolve(value ?? null); } };
    const dialog = new Dialog({
      title: `Edit trap — ${trapDisplayName(trap, tile)}`,
      content,
      buttons: {
        cancel: { label: "Cancel", callback: () => finish(null) },
        save: { icon: '<i class="fa-solid fa-floppy-disk"></i>', label: "Save changes", callback: html => {
          const root = html?.[0] ?? html;
          const custom = root?.querySelector?.('input[name="alarmSoundMode"]:checked')?.value === "custom";
          const rawPath = String(root?.querySelector?.('input[name="alarmSoundPath"]')?.value ?? "").trim();
          if (custom && !rawPath) {
            ui.notifications.warn("Choose a custom alarm sound file first.");
            return false;
          }
          const nextAlarm = readAlarmConfigFromForm(root);
          if (!hasSupportedAudioExtension(nextAlarm.sound.path)) {
            ui.notifications.warn("Choose a supported alarm audio file before saving.");
            return false;
          }
          finish({
            alarm: nextAlarm,
            pauseOnTrigger: root?.querySelector?.('input[name="pauseOnTrigger"]')?.checked === true,
            disarmAfterTrigger: root?.querySelector?.('input[name="disarmAfterTrigger"]')?.checked === true,
            armed: root?.querySelector?.('input[name="armed"]')?.checked === true
          });
        } }
      },
      default: "save",
      render: html => {
        const root = html?.[0] ?? html;
        updateAlarmWizardConditionalFields(root);
        root?.addEventListener?.("change", event => {
          if (event.target?.matches?.('input[name="alarmSoundMode"], input[name="alarmAudibility"], input[name="alarmPlayback"], input[name="disarmAfterTrigger"]')) {
            updateAlarmWizardConditionalFields(root);
          }
        });
        root?.addEventListener?.("click", async event => {
          const action = event.target?.closest?.("[data-alarm-action]")?.dataset.alarmAction;
          if (!action) return;
          event.preventDefault();
          if (action === "browse") await browseAlarmSound(root);
          else if (action === "preview") await previewAlarmFromForm(root);
        });
      },
      close: () => finish(null)
    }, { width: 700, resizable: true });
    dialog.render(true);
  });
  if (!result) return null;
  if (result.armed && !trapCanArm(tile, trap)) return ui.notifications.warn(trapArmBlockReason(tile, trap) ?? "This trap cannot be armed.");
  await tile.update({
    [`flags.${MODULE_ID}.alarm`]: normalizeAlarmConfig(result.alarm),
    [`flags.${MODULE_ID}.pauseOnTrigger`]: result.pauseOnTrigger,
    [`flags.${MODULE_ID}.disarmAfterTrigger`]: result.disarmAfterTrigger,
    [`flags.${MODULE_ID}.armed`]: result.armed,
    ...(result.armed && trap.armed === false ? { [`flags.${MODULE_ID}.-=disarmAttempts`]: null } : {}),
    "flags.monks-active-tiles.active": mattActiveForTrap(trap, result.armed)
  });
  await collapseNonSpatialAlarmOrigin(tile, { ...trap, alarm: result.alarm }, normalizeAlarmConfig(result.alarm));
  if (result.disarmAfterTrigger !== false) setAlarmCooldown(tile, 0);
  refreshTriggerOverlays();
  refreshAreaOverlays();
  ui.notifications.info(`${trapDisplayName(trap, tile)} updated.`);
  return result;
}

export async function openTrapQuickEditor(tile) {
  const trap = trapData(tile);
  if (!tile || !trap || !globalThis.Dialog) return null;
  if (isAlarmTrap(trap)) return openAlarmTrapQuickEditor(tile, trap);
  let spell = null;
  try { spell = trap.spellUuid ? await fromUuid(trap.spellUuid) : null; }
  catch (_error) { /* the editor can still expose stored values */ }
  const baseLevel = normalizeSpellBaseLevel(spell?.system?.level ?? trap.castLevel);
  const isCantrip = baseLevel === 0;
  const selectedCastLevel = normalizeCastLevel(trap.castLevel, baseLevel);
  const selectedCantripCasterLevel = normalizeCantripCasterLevel(trap.cantripCasterLevel, 1);
  const activity = spell ? findActivity(spell, trap.activityId) : null;
  const activityName = String(trap.activityLabel ?? (activity ? activityLabel(activity) : trap.activityType ?? "Activity"));
  const canArm = trapCanArm(tile, trap);
  const content = `<form class="easy-traps-context et-trap-editor">
    <div class="et-editor-heading"><img src="${escapeHtml(spell?.img || DEFAULT_TRIGGER_TEXTURE)}" alt=""><span><small>Editing trap</small><b>${escapeHtml(trap.spellName ?? spell?.name ?? "Spell trap")}</b><em>${escapeHtml(activityName)}</em></span></div>
    <div class="et-editor-grid">
      <label><span>${isCantrip ? "Caster Level" : "Spell slot"}</span><div class="et-number-suffix ${isCantrip ? "is-no-suffix" : ""}"><select name="castLevel" ${!isCantrip && baseLevel >= 9 ? "disabled" : ""}>${isCantrip ? buildCantripCasterLevelOptions(selectedCantripCasterLevel) : buildCastLevelOptions(baseLevel, selectedCastLevel)}</select><b ${isCantrip ? "hidden" : ""}>slot</b></div>${isCantrip ? '<small class="et-level-hint">Determines cantrip scaling.</small>' : ""}</label>
      <label><span>Spell save DC</span><div class="et-number-suffix"><input type="number" name="spellSaveDc" min="1" max="99" step="1" value="${normalizeSpellSaveDc(trap.spellSaveDc)}"><b>DC</b></div></label>
      <label><span>Spell attack bonus</span><div class="et-number-suffix"><input type="text" inputmode="numeric" name="spellAttackBonus" value="${escapeHtml(formatSignedModifier(trap.spellAttackBonus))}"><b>to hit</b></div></label>
    </div>
    <div class="et-editor-toggles">
      <label><input type="checkbox" name="pauseOnTrigger" ${trap.pauseOnTrigger ? "checked" : ""}><span><i class="fa-solid fa-pause"></i><b>Pause when triggered</b><small>The GM resumes the game manually.</small></span></label>
      <label><input type="checkbox" name="disarmAfterTrigger" ${trap.disarmAfterTrigger !== false ? "checked" : ""}><span><i class="fa-solid fa-power-off"></i><b>Disarm after triggering</b><small>Disable this for a repeatable trap.</small></span></label>
      <label><input type="checkbox" name="armed" ${trap.armed !== false && !trap.requiresReconfiguration ? "checked" : ""} ${trap.requiresReconfiguration || !canArm ? "disabled" : ""}><span><i class="fa-solid fa-shield-halved"></i><b>Armed</b><small>${trap.requiresReconfiguration ? "This trap must be recreated." : !canArm ? escapeHtml(trapArmBlockReason(tile, trap) ?? "This trap cannot be armed.") : "Ready to activate in the scene."}</small></span></label>
    </div>
  </form>`;

  const result = await new Promise(resolve => {
    let settled = false;
    const finish = value => { if (!settled) { settled = true; resolve(value ?? null); } };
    const dialog = new Dialog({
      title: `Edit trap — ${trap.spellName ?? "Spell"}`,
      content,
      buttons: {
        cancel: { label: "Cancel", callback: () => finish(null) },
        save: { icon: '<i class="fa-solid fa-floppy-disk"></i>', label: "Save changes", callback: html => {
          const root = html?.[0] ?? html;
          const selectedLevelValue = root?.querySelector?.('select[name="castLevel"]')?.value;
          finish({
            castLevel: isCantrip ? 0 : normalizeCastLevel(selectedLevelValue ?? selectedCastLevel, baseLevel),
            cantripCasterLevel: isCantrip ? normalizeCantripCasterLevel(selectedLevelValue ?? selectedCantripCasterLevel, 1) : null,
            spellSaveDc: normalizeSpellSaveDc(root?.querySelector?.('input[name="spellSaveDc"]')?.value),
            spellAttackBonus: normalizeSpellAttackBonus(root?.querySelector?.('input[name="spellAttackBonus"]')?.value),
            pauseOnTrigger: root?.querySelector?.('input[name="pauseOnTrigger"]')?.checked === true,
            disarmAfterTrigger: root?.querySelector?.('input[name="disarmAfterTrigger"]')?.checked === true,
            armed: root?.querySelector?.('input[name="armed"]')?.checked === true
          });
        } }
      },
      default: "save",
      close: () => finish(null)
    }, { width: 560, resizable: true });
    dialog.render(true);
  });
  if (!result) return null;
  if (result.armed && !trapCanArm(tile, trap)) return ui.notifications.warn(trapArmBlockReason(tile, trap) ?? "This trap cannot be armed.");
  await tile.update({
    [`flags.${MODULE_ID}.castLevel`]: result.castLevel,
    [`flags.${MODULE_ID}.cantripCasterLevel`]: result.cantripCasterLevel,
    [`flags.${MODULE_ID}.scaling`]: isCantrip
      ? cantripScalingIncrease(result.cantripCasterLevel)
      : castScaling(result.castLevel, baseLevel),
    [`flags.${MODULE_ID}.spellSaveDc`]: result.spellSaveDc,
    [`flags.${MODULE_ID}.spellAttackBonus`]: result.spellAttackBonus,
    [`flags.${MODULE_ID}.pauseOnTrigger`]: result.pauseOnTrigger,
    [`flags.${MODULE_ID}.disarmAfterTrigger`]: result.disarmAfterTrigger,
    [`flags.${MODULE_ID}.armed`]: result.armed,
    ...(result.armed && trap.armed === false ? { [`flags.${MODULE_ID}.-=disarmAttempts`]: null } : {}),
    "flags.monks-active-tiles.active": mattActiveForTrap(trap, result.armed)
  });
  // Runtime spell copies are fingerprinted by source revision, Activity, save DC,
  // attack bonus, target capacity, and Scene units. Let ensureRuntimeSpell()
  // create a new compatible copy when needed so an older Item can remain valid
  // for concentration, effects, summons, macros, or chat references.
  refreshTriggerOverlays();
  refreshAreaOverlays();
  ui.notifications.info(`${trap.spellName ?? "Trap"} updated.`);
  return result;
}

export async function openSceneTrapManager() {
  if (!game.user?.isGM) return ui.notifications.warn("Only a GM can manage traps.");
  if (!canvas.ready || !canvas.scene) return ui.notifications.warn("Open a scene before managing traps.");
  if (runtime.sceneManager?.dialog) {
    try { await runtime.sceneManager.dialog.close(); } catch (_error) { /* stale dialog */ }
    runtime.sceneManager = null;
  }
  if (!globalThis.Dialog) return ui.notifications.error("The scene manager could not open because the Foundry Dialog API is unavailable.");
  const dialog = new Dialog({
    title: "EasyTraps — Scene Manager",
    content: buildSceneTrapManagerContent(canvas.scene),
    buttons: {},
    render: html => {
      const root = html?.[0] ?? html;
      const appElement = dialog?.element?.[0] ?? root?.closest?.(".app, .application, .window-app");
      appElement?.classList?.add("easy-traps-manager-window");
      root?.closest?.(".window-content")?.classList?.add("easy-traps-manager-content");
      activateSceneTrapManager(root, dialog);
    },
    close: () => {
      if (runtime.sceneManager?.dialog === dialog) runtime.sceneManager = null;
    }
  }, {
    width: Math.min(1080, Math.max(820, window.innerWidth - 120)),
    height: Math.min(820, window.innerHeight - 80),
    resizable: true
  });
  dialog.render(true);
  return dialog;
}
