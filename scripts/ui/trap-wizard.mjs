import { openTrapAdvancedSettings } from "../advanced.mjs";
import {
  ALARM_AUDIBILITY_MODES,
  ALARM_CHAT_MODES,
  ALARM_PLAYBACK_MODES,
  DEFAULT_ALARM_CONFIG,
  DEFAULT_ALARM_SOUND,
  alarmAudibilityLabel,
  alarmChatLabel,
  alarmPlaybackLabel,
  alarmSoundLabel,
  hasSupportedAudioExtension,
  normalizeAlarmConfig,
  playAlarmLocally
} from "../alarm.mjs";
import {
  buildCantripCasterLevelOptions,
  cantripScalingIncrease,
  normalizeCantripCasterLevel
} from "../cantrip-scaling.mjs";
import { sceneDistanceUnits } from "../core/canvas-geometry.mjs";
import { AREA_MODES, DEFAULT_TRIGGER_TEXTURE, MODULE_ID, ORIGIN_MODES, TARGET_MODES } from "../core/constants.mjs";
import { runtime } from "../core/runtime-state.mjs";
import { getCreationDefaults, getDiscoveryDefaults } from "../core/settings.mjs";
import {
  getFavoriteSpellUuids,
  resolveItemReference,
  restoreDefaultFavoriteSpells,
  toggleFavoriteSpell
} from "../core/spell-catalog.mjs";
import { castScaling, normalizeCastLevel, normalizeSpellBaseLevel } from "../core/spell-model.mjs";
import { escapeHtml, normalize } from "../core/text.mjs";
import { ensureInternalCaster } from "../core/trap-lifecycle.mjs";
import { normalizeOriginMode, normalizeSpellAttackBonus, normalizeSpellSaveDc } from "../core/trap-model.mjs";
import { discoverySummary, normalizeDiscoveryConfig } from "../discovery.mjs";
import { clampCellCount } from "../grid-trigger.mjs";
import { TRIGGER_TYPES, normalizeTriggerType, triggerTypeLabel } from "../trigger-sources.mjs";
import {
  areaModeLabel,
  buildCastLevelOptions,
  cantripCasterLevelLabel,
  castLevelLabel,
  formatSignedModifier,
  originModeLabel,
  targetModeLabel
} from "./format.mjs";
import { analyzeSpellAfterPlaceClick } from "./spell-options.mjs";
import { placeAlarmTrap, placeFloorTrigger } from "./trap-placement.mjs";

export function updateWizardAdvancedSummary(form) {
  const value = normalizeDiscoveryConfig(form?._easyTrapsDiscovery ?? getDiscoveryDefaults());
  const summary = form?.querySelector?.("[data-wizard-advanced-summary]");
  if (summary) summary.textContent = discoverySummary(value);
  const button = form?.querySelector?.("[data-wizard-action='advanced']");
  button?.classList?.toggle("is-enabled", value.enabled);
}

export function openAdvancedSettingsForWizard(form) {
  const value = normalizeDiscoveryConfig(form?._easyTrapsDiscovery ?? getDiscoveryDefaults());
  return openTrapAdvancedSettings({
    value,
    title: "Advanced Trap Settings",
    subtitle: "New trap",
    normalize: normalizeDiscoveryConfig,
    resolveItem: resolveItemReference,
    onSave: async next => {
      form._easyTrapsDiscovery = normalizeDiscoveryConfig(next);
      updateWizardAdvancedSummary(form);
    }
  });
}

export function updateWizardCastLevel(form, catalog) {
  const input = form?.querySelector?.("select[name='castLevel']");
  if (!input) return;
  const selectedUuid = form.querySelector("input[name='spellUuid']:checked")?.value ?? null;
  const spell = catalog.find(entry => entry.uuid === selectedUuid);
  const base = normalizeSpellBaseLevel(spell?.level);
  const cantrip = base === 0;
  const label = form.querySelector("[data-spell-level-label]");
  const suffix = form.querySelector("[data-spell-level-suffix]");
  const wrapper = form.querySelector("[data-spell-level-wrapper]");
  const hint = form.querySelector("[data-spell-level-hint]");

  input.innerHTML = cantrip
    ? buildCantripCasterLevelOptions(1)
    : buildCastLevelOptions(base, base);
  input.disabled = !cantrip && base >= 9;
  input.dataset.baseLevel = String(base);
  input.dataset.levelMode = cantrip ? "caster" : "slot";
  if (label) label.textContent = cantrip ? "Caster Level" : "Spell slot";
  if (suffix) suffix.hidden = cantrip;
  wrapper?.classList?.toggle("is-no-suffix", cantrip);
  if (hint) {
    hint.hidden = !cantrip;
    hint.textContent = cantrip ? "Determines cantrip scaling." : "";
  }
  input.title = cantrip
    ? `Choose the caster level used to scale ${spell?.name ?? "this cantrip"}.`
    : base >= 9
      ? "This spell is already level 9."
      : `Cast ${spell?.name ?? "the spell"} using a level ${base}–9 slot.`;
}

export function spellDisplayMeta(spell) {
  if (!spell) return "";
  const level = spell.level === 0 ? "Cantrip" : `Level ${spell.level}`;
  return `${level}${spell.school ? ` · ${spell.school}` : ""} · ${spell.source}`;
}

export function buildSpellRow(spell, index, { selectedUuid, favoriteUuids, wizardId }) {
  const details = spellDisplayMeta(spell);
  const search = normalize(`${spell.name} ${details}`);
  const inputId = `${wizardId}-spell-${index}`;
  const favorite = favoriteUuids.has(spell.uuid);
  return `<div class="et-spell-option" data-spell-row data-search="${escapeHtml(search)}">
    <input id="${inputId}" type="radio" name="spellUuid" value="${escapeHtml(spell.uuid)}" ${spell.uuid === selectedUuid ? "checked" : ""}>
    <label class="et-spell-card" for="${inputId}">
      <img src="${escapeHtml(spell.img || DEFAULT_TRIGGER_TEXTURE)}" alt="">
      <span class="et-spell-copy"><b>${escapeHtml(spell.name)}</b><small>${escapeHtml(details)}</small></span>
      <i class="fa-solid fa-check et-spell-check" aria-hidden="true"></i>
    </label>
    <button type="button" class="et-favorite-toggle ${favorite ? "is-favorite" : ""}" data-favorite-toggle="${escapeHtml(spell.uuid)}" title="${favorite ? "Remove from favorites" : "Add to favorites"}" aria-label="${favorite ? "Remove from favorites" : "Add to favorites"}">
      <i class="${favorite ? "fa-solid" : "fa-regular"} fa-star"></i>
    </button>
  </div>`;
}

export function buildFavoriteCards(catalog, favoriteUuids, selectedUuid) {
  const byUuid = new Map(catalog.map(spell => [spell.uuid, spell]));
  const spells = favoriteUuids.map(uuid => byUuid.get(uuid)).filter(Boolean);
  if (!spells.length) {
    return `<div class="et-favorites-empty"><i class="fa-regular fa-star"></i><span><b>No favorites yet</b><small>Use the star beside any spell below.</small></span></div>`;
  }
  return spells.map(spell => `<div class="et-favorite-item ${spell.uuid === selectedUuid ? "is-selected" : ""}">
    <button type="button" class="et-favorite-select" data-favorite-select="${escapeHtml(spell.uuid)}" title="Select ${escapeHtml(spell.name)}">
      <img src="${escapeHtml(spell.img || DEFAULT_TRIGGER_TEXTURE)}" alt="">
      <span><b>${escapeHtml(spell.name)}</b><small>${escapeHtml(spell.level === 0 ? "Cantrip" : `Level ${spell.level}`)}</small></span>
      <i class="fa-solid fa-check"></i>
    </button>
    <button type="button" class="et-favorite-remove" data-favorite-toggle="${escapeHtml(spell.uuid)}" title="Remove from favorites" aria-label="Remove ${escapeHtml(spell.name)} from favorites"><i class="fa-solid fa-star"></i></button>
  </div>`).join("");
}

export function buildWizardContent(catalog, favoriteUuids = [], creationDefaults = getCreationDefaults()) {
  const favorites = new Set(favoriteUuids);
  const wizardId = `et-${foundry.utils.randomID?.(8) ?? Math.random().toString(36).slice(2, 10)}`;
  const selectedUuid = favoriteUuids.find(uuid => catalog.some(spell => spell.uuid === uuid)) ?? catalog[0]?.uuid ?? null;
  const selectedSpell = catalog.find(spell => spell.uuid === selectedUuid) ?? catalog[0];
  const rows = catalog.map((spell, index) => buildSpellRow(spell, index, { selectedUuid, favoriteUuids: favorites, wizardId })).join("");

  return `<form class="easy-traps-wizard">
    <section class="et-wizard-setup" data-wizard-stage="setup">
      <div class="et-wizard-scroll" data-wizard-scroll>
      <div class="et-note">
        <i class="fa-solid fa-wand-sparkles"></i>
        <span><b>Native spell trap</b><small>Select a spell, its origin, and the trigger size. EasyTraps loads it only after Place trigger. When a spell has multiple usable Activities, you choose the exact one before placement.</small></span>
      </div>

      <section class="et-favorites-panel">
        <header><span><i class="fa-solid fa-star"></i><b>Favorites</b><small data-favorite-count>${favoriteUuids.length} saved</small></span><button type="button" data-favorite-action="defaults" title="Restore the default SRD favorites"><i class="fa-solid fa-rotate-left"></i></button></header>
        <div class="et-favorite-list" data-favorite-list>${buildFavoriteCards(catalog, favoriteUuids, selectedUuid)}</div>
      </section>

      <div class="et-spell-browser">
        <label class="et-spell-search"><span>All spells</span><span class="et-search-control"><i class="fa-solid fa-magnifying-glass"></i><input type="search" name="search" placeholder="Name, level, school, or compendium"></span></label>
        <div class="et-spell-list" role="listbox">${rows}</div>
        <p class="et-spell-list-count" data-spell-count></p>
      </div>

      <fieldset class="et-origin-fieldset">
        <legend>Where does the spell originate?</legend>
        <div class="et-origin-grid">
          <label class="et-origin-option">
            <input type="radio" name="originMode" value="${ORIGIN_MODES.SEPARATE_TILE}" checked>
            <span><i class="fa-solid fa-location-dot"></i><b>From another point</b><small>Place a second movable Tile as the origin.</small></span>
          </label>
          <label class="et-origin-option">
            <input type="radio" name="originMode" value="${ORIGIN_MODES.TRIGGER_TILE}">
            <span><i class="fa-solid fa-bullseye"></i><b class="et-origin-label">From the trap <i class="fa-solid fa-circle-info et-origin-info" data-tooltip="Animations may fail or show warnings when the target and spell origin occupy the same point (zero distance)." title="Animations may fail or show warnings when the target and spell origin occupy the same point (zero distance)." aria-label="Zero-distance animation warning"></i></b><small>The trigger Tile itself is the spell origin.</small></span>
          </label>
          <label class="et-origin-option">
            <input type="radio" name="originMode" value="${ORIGIN_MODES.TRIGGERING_TOKEN}">
            <span><i class="fa-solid fa-person-rays"></i><b>From the creature</b><small>The creature that activates the trap uses the spell.</small></span>
          </label>
        </div>
      </fieldset>

      <div class="et-trigger-size-grid">
        <label><span>Trigger width</span><div class="et-number-suffix"><input type="number" name="widthCells" min="1" max="20" step="1" value="1"><b>cells</b></div></label>
        <label><span>Trigger height</span><div class="et-number-suffix"><input type="number" name="heightCells" min="1" max="20" step="1" value="1"><b>cells</b></div></label>
      </div>
      <div class="et-trigger-size-grid et-spell-stat-grid">
        <label data-spell-level-control><span data-spell-level-label>${normalizeSpellBaseLevel(selectedSpell?.level) === 0 ? "Caster Level" : "Spell slot"}</span><div class="et-number-suffix ${normalizeSpellBaseLevel(selectedSpell?.level) === 0 ? "is-no-suffix" : ""}" data-spell-level-wrapper><select name="castLevel" aria-label="Spell execution level">${normalizeSpellBaseLevel(selectedSpell?.level) === 0 ? buildCantripCasterLevelOptions(1) : buildCastLevelOptions(selectedSpell?.level ?? 0)}</select><b data-spell-level-suffix ${normalizeSpellBaseLevel(selectedSpell?.level) === 0 ? "hidden" : ""}>slot</b></div><small class="et-level-hint" data-spell-level-hint ${normalizeSpellBaseLevel(selectedSpell?.level) === 0 ? "" : "hidden"}>${normalizeSpellBaseLevel(selectedSpell?.level) === 0 ? "Determines cantrip scaling." : ""}</small></label>
        <label><span>Spell save DC</span><div class="et-number-suffix"><input type="number" name="spellSaveDc" min="1" max="99" step="1" value="${normalizeSpellSaveDc(creationDefaults.spellSaveDc)}"><b>DC</b></div></label>
        <label><span>Spell attack bonus</span><div class="et-number-suffix"><input type="text" inputmode="numeric" name="spellAttackBonus" value="${formatSignedModifier(creationDefaults.spellAttackBonus)}" aria-label="Spell attack bonus"><b>to hit</b></div></label>
      </div>
      <div class="et-activation-option-grid">
        <label class="et-pause-option">
          <input type="checkbox" name="pauseOnTrigger" ${creationDefaults.pauseOnTrigger ? "checked" : ""}>
          <span><i class="fa-solid fa-pause"></i><b>Pause the game when triggered</b><small>The game remains paused until the GM resumes it.</small></span>
        </label>
        <label class="et-pause-option">
          <input type="checkbox" name="disarmAfterTrigger" ${creationDefaults.disarmAfterTrigger ? "checked" : ""}>
          <span><i class="fa-solid fa-power-off"></i><b>Disarm after triggering</b><small>Disable this to keep the trap repeatable.</small></span>
        </label>
      </div>
      <button type="button" class="et-wizard-advanced ${creationDefaults.discovery?.enabled ? "is-enabled" : ""}" data-wizard-action="advanced">
        <span><i class="fa-solid fa-sliders"></i><span><b>Advanced settings</b><small data-wizard-advanced-summary>${escapeHtml(discoverySummary(creationDefaults.discovery))}</small></span></span>
        <i class="fa-solid fa-chevron-right"></i>
      </button>
      </div>
      <footer class="et-wizard-actions">
        <button type="button" data-wizard-action="cancel">Cancel</button>
        <button type="button" data-wizard-action="place" class="et-primary"><i class="fa-solid fa-location-crosshairs"></i> Place trigger</button>
      </footer>
    </section>

    <section class="et-wizard-placement" data-wizard-stage="placement" hidden>
      <div class="et-wizard-scroll et-placement-scroll" data-wizard-scroll>
      <div class="et-selected-spell" data-selected-spell>
        <img data-selected-img src="${escapeHtml(selectedSpell?.img || DEFAULT_TRIGGER_TEXTURE)}" alt="">
        <span><small>Selected spell</small><b data-selected-name>${escapeHtml(selectedSpell?.name ?? "Spell")}</b><em data-selected-meta></em></span>
        <i class="fa-solid fa-check-circle"></i>
      </div>
      <div class="et-trigger-type-picker" data-trigger-type-picker>
        <button type="button" class="is-selected" data-trigger-type="tile"><i class="fa-solid fa-border-all"></i><span><b>Tile</b><small>Floor / area trigger</small></span></button>
        <button type="button" data-trigger-type="door"><i class="fa-solid fa-door-open"></i><span><b>Door</b><small>Create a Foundry door</small></span></button>
        <button type="button" data-trigger-type="item-pile"><i class="fa-solid fa-box-open"></i><span><b>Item Pile</b><small>Create an Item Pile</small></span></button>
      </div>
      <div class="et-placement-step" data-placement-step>
        <i class="fa-solid fa-location-crosshairs" data-placement-icon></i>
        <span><small data-placement-kicker>Place trigger</small><b data-placement-title>Choose the trigger cells on the scene</b><em data-placement-instruction>Click the top-left grid cell. Press Esc to return.</em></span>
      </div>
      <div class="et-placement-facts">
        <span><small>Execution</small><b data-placement-execution>Original spell item</b></span>
        <span><small>Trigger</small><b data-placement-size>Tile · 1×1 cells</b></span>
        <span><small>Origin</small><b data-placement-origin>From another point</b></span>
        <span><small>Target</small><b data-placement-target>Triggering creature</b></span>
        <span><small>Area</small><b data-placement-area>Positioned during creation</b></span>
        <span><small data-placement-level-label>${normalizeSpellBaseLevel(selectedSpell?.level) === 0 ? "Caster Level" : "Spell slot"}</small><b data-placement-cast-level>${normalizeSpellBaseLevel(selectedSpell?.level) === 0 ? cantripCasterLevelLabel(1) : castLevelLabel(selectedSpell?.level ?? 0, selectedSpell?.level ?? 0)}</b></span>
        <span><small>Save DC</small><b data-placement-dc>${normalizeSpellSaveDc(creationDefaults.spellSaveDc)}</b></span>
        <span><small>Spell attack</small><b data-placement-attack>${formatSignedModifier(creationDefaults.spellAttackBonus)}</b></span>
        <span><small>Pause</small><b data-placement-pause>${creationDefaults.pauseOnTrigger ? "Yes" : "No"}</b></span>
        <span><small>Disarm after trigger</small><b data-placement-disarm>${creationDefaults.disarmAfterTrigger ? "Yes" : "No"}</b></span>
        <span><small>Discovery</small><b data-placement-discovery>${escapeHtml(discoverySummary(creationDefaults.discovery))}</b></span>
      </div>
      </div>
      <footer class="et-wizard-actions et-placement-actions">
        <button type="button" data-wizard-action="cancel-placement"><i class="fa-solid fa-arrow-left"></i> Cancel placement</button>
      </footer>
    </section>
  </form>`;
}

export function readWizardSelection(form) {
  return {
    spellUuid: form.querySelector("input[name='spellUuid']:checked")?.value ?? null,
    activityId: null,
    triggerType: TRIGGER_TYPES.TILE,
    widthCells: clampCellCount(form.querySelector("input[name='widthCells']")?.value),
    heightCells: clampCellCount(form.querySelector("input[name='heightCells']")?.value),
    originMode: normalizeOriginMode(form.querySelector("input[name='originMode']:checked")?.value),
    targetMode: TARGET_MODES.NONE,
    areaMode: AREA_MODES.NONE,
    targetingProfile: null,
    effectiveTarget: null,
    selectionZoneWidth: 1,
    selectionZoneHeight: 1,
    requiresNativeInteraction: false,
    castLevel: Math.trunc(Number(form.querySelector("select[name='castLevel']")?.value)) || 0,
    cantripCasterLevel: Math.trunc(Number(form.querySelector("select[name='castLevel']")?.value)) || 1,
    scaling: 0,
    spellSaveDc: normalizeSpellSaveDc(form.querySelector("input[name='spellSaveDc']")?.value),
    spellAttackBonus: normalizeSpellAttackBonus(form.querySelector("input[name='spellAttackBonus']")?.value),
    pauseOnTrigger: form.querySelector("input[name='pauseOnTrigger']")?.checked === true,
    disarmAfterTrigger: form.querySelector("input[name='disarmAfterTrigger']")?.checked === true,
    discovery: normalizeDiscoveryConfig(form._easyTrapsDiscovery ?? getDiscoveryDefaults())
  };
}

export function selectedSpellMeta(spell) {
  return spellDisplayMeta(spell);
}

export function updateWizardTriggerTypeControls(form, selection) {
  const type = normalizeTriggerType(selection?.triggerType);
  for (const button of form?.querySelectorAll?.("[data-trigger-type]") ?? []) {
    const buttonType = normalizeTriggerType(button.dataset.triggerType);
    const requiresItemPiles = buttonType === TRIGGER_TYPES.ITEM_PILE;
    const itemPilesAvailable = game.modules.get("item-piles")?.active === true && typeof game.itempiles?.API?.createItemPile === "function";
    button.disabled = requiresItemPiles && !itemPilesAvailable;
    button.classList.toggle("is-selected", buttonType === type);
    if (requiresItemPiles && !itemPilesAvailable) {
      button.title = "Requires the Item Piles module.";
      button.dataset.tooltip = button.title;
    } else {
      button.removeAttribute("title");
      delete button.dataset.tooltip;
    }
  }
  const size = form?.querySelector?.("[data-placement-size]");
  if (size) {
    size.textContent = type === TRIGGER_TYPES.TILE
      ? `Tile · ${selection.widthCells}×${selection.heightCells} cells`
      : triggerTypeLabel(type);
  }
}

export function setWizardPlacementState(form, spell, selection, phase = "trigger") {
  const setup = form.querySelector("[data-wizard-stage='setup']");
  const placement = form.querySelector("[data-wizard-stage='placement']");
  if (setup) setup.hidden = true;
  if (placement) placement.hidden = false;
  form.classList.add("et-placement-active");
  const img = form.querySelector("[data-selected-img]");
  if (img) img.src = spell.img || DEFAULT_TRIGGER_TEXTURE;
  const name = form.querySelector("[data-selected-name]");
  if (name) name.textContent = spell.name;
  const meta = form.querySelector("[data-selected-meta]");
  if (meta) meta.textContent = selectedSpellMeta(spell);
  const execution = form.querySelector("[data-placement-execution]");
  if (execution) execution.textContent = "Original spell item";
  updateWizardTriggerTypeControls(form, selection);
  const origin = form.querySelector("[data-placement-origin]");
  if (origin) origin.textContent = originModeLabel(selection.originMode).replace(/^origin:\s*/i, "");
  const target = form.querySelector("[data-placement-target]");
  if (target) target.textContent = targetModeLabel(selection.targetMode);
  const area = form.querySelector("[data-placement-area]");
  if (area) area.textContent = areaModeLabel(selection.areaMode);
  const castLevel = form.querySelector("[data-placement-cast-level]");
  const placementLevelLabel = form.querySelector("[data-placement-level-label]");
  const cantrip = normalizeSpellBaseLevel(spell.level) === 0;
  if (placementLevelLabel) placementLevelLabel.textContent = cantrip ? "Caster Level" : "Spell slot";
  if (castLevel) castLevel.textContent = cantrip
    ? cantripCasterLevelLabel(selection.cantripCasterLevel)
    : castLevelLabel(selection.castLevel, spell.level);
  const saveDc = form.querySelector("[data-placement-dc]");
  if (saveDc) saveDc.textContent = String(normalizeSpellSaveDc(selection.spellSaveDc));
  const attack = form.querySelector("[data-placement-attack]");
  if (attack) attack.textContent = formatSignedModifier(selection.spellAttackBonus);
  const pause = form.querySelector("[data-placement-pause]");
  if (pause) pause.textContent = selection.pauseOnTrigger ? "Yes" : "No";
  const disarm = form.querySelector("[data-placement-disarm]");
  if (disarm) disarm.textContent = selection.disarmAfterTrigger ? "Yes" : "No";
  const discovery = form.querySelector("[data-placement-discovery]");
  if (discovery) discovery.textContent = discoverySummary(selection.discovery);
  updateWizardPlacementPhase(form, spell, selection, phase);
}

export function updateWizardPlacementPhase(form, spell, selection, phase) {
  const isOrigin = phase === "origin";
  const isArea = phase === "area";
  const isTargets = phase === "targets";
  form.classList.toggle("et-origin-placement", isOrigin);
  form.classList.toggle("et-area-placement", isArea);
  form.classList.toggle("et-target-placement", isTargets);
  const kicker = form.querySelector("[data-placement-kicker]");
  const title = form.querySelector("[data-placement-title]");
  const instruction = form.querySelector("[data-placement-instruction]");
  const icon = form.querySelector("[data-placement-icon]");
  if (isArea) {
    if (kicker) kicker.textContent = "Place spell area";
    if (title) title.textContent = `Position the original ${spell.name} template`;
    if (instruction) instruction.textContent = "Move and rotate the D&D5e template. Left-click to confirm; right-click or Esc to return.";
    if (icon) icon.className = "fa-solid fa-draw-polygon";
    return;
  }
  if (isTargets) {
    if (kicker) kicker.textContent = "Place target zone";
    if (title) title.textContent = `Choose the ${selection.selectionZoneWidth}×${selection.selectionZoneHeight} creature-selection zone`;
    if (instruction) instruction.textContent = "Click its top-left grid cell. Creatures occupying the selected cells will be targeted; merely touching an outer edge does not count.";
    if (icon) icon.className = "fa-solid fa-crosshairs";
    return;
  }
  if (kicker) kicker.textContent = isOrigin ? "Place spell origin" : "Place trigger";
  if (isOrigin) {
    if (title) title.textContent = `Choose where ${spell.name} originates`;
    if (instruction) instruction.textContent = "Click one grid cell for the separate origin. Press Esc to return.";
    if (icon) icon.className = "fa-solid fa-location-dot";
    return;
  }
  const triggerType = normalizeTriggerType(selection.triggerType);
  updateWizardTriggerTypeControls(form, selection);
  if (triggerType === TRIGGER_TYPES.DOOR) {
    if (title) title.textContent = "Draw the trapped door";
    if (instruction) instruction.textContent = "Click the first endpoint, then click the second endpoint. The door itself becomes the trigger.";
    if (icon) icon.className = "fa-solid fa-door-open";
  } else if (triggerType === TRIGGER_TYPES.ITEM_PILE) {
    if (title) title.textContent = "Place the trapped Item Pile";
    if (instruction) instruction.textContent = "Click one grid cell. EasyTraps creates a real Item Pile there.";
    if (icon) icon.className = "fa-solid fa-box-open";
  } else {
    if (title) title.textContent = `Choose the ${selection.widthCells}×${selection.heightCells} trigger area`;
    if (instruction) instruction.textContent = "Click the top-left grid cell. Press Esc to return.";
    if (icon) icon.className = "fa-solid fa-location-crosshairs";
  }
}

export function restoreWizardSetup(form) {
  const setup = form.querySelector("[data-wizard-stage='setup']");
  const placement = form.querySelector("[data-wizard-stage='placement']");
  if (setup) setup.hidden = false;
  if (placement) placement.hidden = true;
  form.classList.remove("et-placement-active", "et-origin-placement", "et-area-placement", "et-target-placement");
  form._easyTrapsPlacementSelection = null;
  form._easyTrapsPlacementSpell = null;
}

export function setWizardWindowPosition(dialog, compact) {
  if (typeof dialog?.setPosition !== "function") return;
  if (compact) {
    dialog.setPosition({
      width: 470,
      height: "auto",
      top: 72,
      left: Math.max(18, Math.min(120, window.innerWidth - 490))
    });
  } else {
    const width = Math.min(720, Math.max(600, window.innerWidth - 160));
    dialog.setPosition({
      width,
      height: Math.min(760, window.innerHeight - 90),
      top: 45,
      left: Math.max(18, Math.round((window.innerWidth - width) / 2))
    });
  }
}

export function activateCreationWizard(root, catalog, { dialog, finish, isClosed }) {
  const form = root?.matches?.("form.easy-traps-wizard") ? root : root?.querySelector?.("form.easy-traps-wizard");
  if (!form || form.dataset.activated === "true") return;
  form.dataset.activated = "true";
  const appElement = dialog?.element?.[0] ?? form.closest?.(".app, .application, .window-app");
  form._easyTrapsDiscovery = normalizeDiscoveryConfig(getDiscoveryDefaults());
  appElement?.classList?.add("easy-traps-wizard-window");
  form.closest?.(".window-content")?.classList?.add("easy-traps-wizard-content");
  const search = form.querySelector("input[name='search']");
  const rows = [...form.querySelectorAll("[data-spell-row]")];
  const count = form.querySelector("[data-spell-count]");
  const renderFavorites = () => {
    const favoriteUuids = getFavoriteSpellUuids(catalog);
    const selectedUuid = form.querySelector("input[name='spellUuid']:checked")?.value ?? null;
    const favoriteList = form.querySelector("[data-favorite-list]");
    if (favoriteList) favoriteList.innerHTML = buildFavoriteCards(catalog, favoriteUuids, selectedUuid);
    const favoriteCount = form.querySelector("[data-favorite-count]");
    if (favoriteCount) favoriteCount.textContent = `${favoriteUuids.length} saved`;
    const favoriteSet = new Set(favoriteUuids);
    form.querySelectorAll("[data-favorite-toggle]").forEach(button => {
      if (!button.closest("[data-spell-row]")) return;
      const favorite = favoriteSet.has(button.dataset.favoriteToggle);
      button.classList.toggle("is-favorite", favorite);
      button.title = favorite ? "Remove from favorites" : "Add to favorites";
      button.setAttribute("aria-label", button.title);
      const icon = button.querySelector("i");
      if (icon) icon.className = `${favorite ? "fa-solid" : "fa-regular"} fa-star`;
    });
  };

  const updateFilter = () => {
    const term = normalize(search?.value);
    let visible = 0;
    for (const row of rows) {
      row.hidden = Boolean(term) && !row.dataset.search.includes(term);
      if (!row.hidden) visible += 1;
    }
    if (count) count.textContent = `${visible} spell${visible === 1 ? "" : "s"} shown`;
  };


  form.addEventListener("click", async event => {
    const triggerTypeButton = event.target?.closest?.("[data-trigger-type]");
    if (triggerTypeButton) {
      event.preventDefault();
      if (triggerTypeButton.disabled) return ui.notifications.warn("Item Piles must be active to place an Item Pile trigger.");
      const selection = form._easyTrapsPlacementSelection;
      if (!selection) return;
      selection.triggerType = normalizeTriggerType(triggerTypeButton.dataset.triggerType);
      updateWizardPlacementPhase(form, form._easyTrapsPlacementSpell ?? { name: "Spell" }, selection, "trigger");
      return;
    }
    const toggle = event.target?.closest?.("[data-favorite-toggle]");
    if (toggle) {
      event.preventDefault();
      event.stopPropagation();
      await toggleFavoriteSpell(toggle.dataset.favoriteToggle, catalog);
      renderFavorites();
      return;
    }
    const favoriteSelect = event.target?.closest?.("[data-favorite-select]");
    if (favoriteSelect) {
      const input = [...form.querySelectorAll("input[name='spellUuid']")].find(entry => entry.value === favoriteSelect.dataset.favoriteSelect);
      if (input) {
        input.checked = true;
        input.dispatchEvent(new Event("change", { bubbles: true }));
        renderFavorites();
      }
      return;
    }
    const favoriteAction = event.target?.closest?.("[data-favorite-action]");
    if (favoriteAction?.dataset.favoriteAction === "defaults") {
      await restoreDefaultFavoriteSpells();
      renderFavorites();
      ui.notifications.info("Favorite spells restored to the SRD defaults.");
    }
  });
  search?.addEventListener("input", updateFilter);
  form.addEventListener("change", event => {
    if (event.target?.matches?.("input[name='spellUuid']")) {
      renderFavorites();
      updateWizardCastLevel(form, catalog);
    }
  });
  updateFilter();
  renderFavorites();
  updateWizardCastLevel(form, catalog);
  updateWizardAdvancedSummary(form);
  form.addEventListener("submit", event => event.preventDefault());

  form.querySelector("[data-wizard-action='cancel']")?.addEventListener("click", () => dialog.close());
  form.querySelector("[data-wizard-action='cancel-placement']")?.addEventListener("click", () => runtime.cancelPlacement?.());
  form.querySelector("[data-wizard-action='advanced']")?.addEventListener("click", () => openAdvancedSettingsForWizard(form));
  form.querySelector("[data-wizard-action='place']")?.addEventListener("click", async event => {
    const button = event.currentTarget;
    if (button.disabled || runtime.placing) return;
    const selection = readWizardSelection(form);
    if (!selection.spellUuid) return ui.notifications.warn("Select a spell first.");
    const catalogSpell = catalog.find(entry => entry.uuid === selection.spellUuid);
    button.disabled = true;
    button.setAttribute("aria-busy", "true");
    let spell;
    let analyzed;
    try {
      spell = await fromUuid(selection.spellUuid);
      if (!spell || spell.type !== "spell") return ui.notifications.error("The selected spell could not be loaded.");
      const baseLevel = normalizeSpellBaseLevel(spell.system?.level);
      if (baseLevel === 0) {
        selection.cantripCasterLevel = normalizeCantripCasterLevel(selection.cantripCasterLevel ?? selection.castLevel, 1);
        selection.castLevel = 0;
        selection.scaling = cantripScalingIncrease(selection.cantripCasterLevel);
      } else {
        selection.castLevel = normalizeCastLevel(selection.castLevel, baseLevel);
        selection.cantripCasterLevel = null;
        selection.scaling = castScaling(selection.castLevel, baseLevel);
      }
      analyzed = await analyzeSpellAfterPlaceClick(spell);
      if (!analyzed) return;
      Object.assign(selection, analyzed);
      if (selection.originMode !== ORIGIN_MODES.TRIGGERING_TOKEN) await ensureInternalCaster();
    } finally {
      button.disabled = false;
      button.removeAttribute("aria-busy");
    }

    button.setAttribute("aria-busy", "true");
    form._easyTrapsPlacementSelection = selection;
    form._easyTrapsPlacementSpell = { ...catalogSpell, name: spell.name, img: spell.img };
    setWizardPlacementState(form, form._easyTrapsPlacementSpell, selection, "trigger");
    setWizardWindowPosition(dialog, true);
    const placementUi = {
      setPhase: phase => updateWizardPlacementPhase(form, { ...catalogSpell, name: spell.name, img: spell.img }, selection, phase)
    };
    let trigger = null;
    try {
      trigger = await placeFloorTrigger(spell, selection, placementUi);
    } finally {
      button.removeAttribute("aria-busy");
    }
    if (trigger) {
      finish(trigger);
      await dialog.close();
      return;
    }
    if (!isClosed()) {
      restoreWizardSetup(form);
      setWizardWindowPosition(dialog, false);
    }
  });
}

export function openCreationWizard(catalog, favoriteUuids = getFavoriteSpellUuids(catalog)) {
  if (!globalThis.Dialog) {
    ui.notifications.error("The trap creator could not open because the Foundry Dialog API is unavailable.");
    return null;
  }
  const content = buildWizardContent(catalog, favoriteUuids);
  return new Promise(resolve => {
    let settled = false;
    let closed = false;
    const finish = value => {
      if (settled) return;
      settled = true;
      resolve(value ?? null);
    };
    const dialog = new Dialog({
      title: "EasyTraps — Spell Trap",
      content,
      buttons: {},
      render: html => {
        const root = html?.[0] ?? html;
        activateCreationWizard(root, catalog, { dialog, finish, isClosed: () => closed });
        setWizardWindowPosition(dialog, false);
      },
      close: () => {
        closed = true;
        runtime.cancelPlacement?.();
        finish(null);
      }
    }, {
      width: Math.min(720, Math.max(600, window.innerWidth - 160)),
      height: Math.min(760, window.innerHeight - 90),
      resizable: true
    });
    dialog.render(true);
  });
}

export function buildAlarmWizardContent() {
  const discovery = normalizeDiscoveryConfig(getDiscoveryDefaults());
  const alarm = normalizeAlarmConfig(DEFAULT_ALARM_CONFIG);
  return `<form class="easy-traps-wizard easy-traps-alarm-wizard">
    <section class="et-wizard-setup" data-wizard-stage="setup">
      <div class="et-wizard-scroll" data-wizard-scroll>
        <div class="et-note et-alarm-note">
          <i class="fa-solid fa-bell"></i>
          <span><b>Alarm trap</b><small>Choose how the alarm sounds, where it can be heard, its origin, and the trigger. Discovery, disarming, Door, and Item Pile behavior use the same EasyTraps infrastructure as Spell Traps.</small></span>
        </div>

        <fieldset class="et-alarm-fieldset">
          <legend>Alarm sound</legend>
          <div class="et-alarm-choice-grid">
            <label class="et-origin-option">
              <input type="radio" name="alarmSoundMode" value="default" checked>
              <span><i class="fa-solid fa-clock"></i><b>Clock Alarm</b><small>Bundled EasyTraps alarm sound.</small></span>
            </label>
            <label class="et-origin-option">
              <input type="radio" name="alarmSoundMode" value="custom">
              <span><i class="fa-solid fa-file-audio"></i><b>Custom Sound</b><small>Choose any supported audio file available to Foundry.</small></span>
            </label>
          </div>
          <div class="et-alarm-file-row" data-alarm-custom-row hidden>
            <label><span>Custom audio path</span><div class="et-alarm-file-control"><input type="text" name="alarmSoundPath" placeholder="sounds/alarm.ogg"><button type="button" data-alarm-action="browse" title="Browse audio"><i class="fa-solid fa-folder-open"></i></button></div></label>
          </div>
          <div class="et-alarm-audio-controls">
            <label><span>Volume</span><div class="et-number-suffix"><input type="number" name="alarmVolume" min="0" max="1" step="0.05" value="${alarm.sound.volume}"><b>0–1</b></div></label>
            <button type="button" class="et-alarm-preview" data-alarm-action="preview"><i class="fa-solid fa-play"></i><span>Preview locally</span></button>
          </div>
        </fieldset>

        <fieldset class="et-alarm-fieldset">
          <legend>Who can hear it?</legend>
          <div class="et-alarm-choice-grid et-alarm-three-grid">
            <label class="et-origin-option">
              <input type="radio" name="alarmAudibility" value="${ALARM_AUDIBILITY_MODES.SPATIAL}" checked>
              <span><i class="fa-solid fa-volume-high"></i><b>Spatial</b><small>Native positional sound with radius and walls.</small></span>
            </label>
            <label class="et-origin-option">
              <input type="radio" name="alarmAudibility" value="${ALARM_AUDIBILITY_MODES.SCENE}">
              <span><i class="fa-solid fa-users"></i><b>Entire Scene</b><small>Every connected user viewing this Scene hears it.</small></span>
            </label>
            <label class="et-origin-option">
              <input type="radio" name="alarmAudibility" value="${ALARM_AUDIBILITY_MODES.GM_ONLY}">
              <span><i class="fa-solid fa-user-secret"></i><b>GM Only</b><small>Silent alarm for players.</small></span>
            </label>
          </div>
          <div class="et-alarm-spatial-options" data-alarm-spatial-options>
            <div class="et-trigger-size-grid">
              <label><span>Hearing radius</span><div class="et-number-suffix"><input type="number" name="alarmRadius" min="1" max="9999" step="1" value="${alarm.audibility.radius}"><b>${escapeHtml(sceneDistanceUnits())}</b></div></label>
            </div>
            <div class="et-activation-option-grid">
              <label class="et-pause-option"><input type="checkbox" name="alarmEasing" checked><span><i class="fa-solid fa-wave-square"></i><b>Fade with distance</b><small>Volume decreases toward the edge of the radius.</small></span></label>
              <label class="et-pause-option"><input type="checkbox" name="alarmWalls" checked><span><i class="fa-solid fa-wall-brick"></i><b>Constrained by walls</b><small>Use Foundry's native sound propagation through walls and surfaces.</small></span></label>
              <label class="et-pause-option"><input type="checkbox" name="alarmGmAlways" checked><span><i class="fa-solid fa-headphones"></i><b>GM always hears</b><small>GM clients hear the positional alarm regardless of listener position.</small></span></label>
            </div>
          </div>
        </fieldset>

        <fieldset class="et-alarm-fieldset">
          <legend>Playback</legend>
          <div class="et-alarm-choice-grid">
            <label class="et-origin-option"><input type="radio" name="alarmPlayback" value="${ALARM_PLAYBACK_MODES.ONCE}" checked><span><i class="fa-solid fa-play"></i><b>Play once</b><small>Play the sound file a single time.</small></span></label>
            <label class="et-origin-option"><input type="radio" name="alarmPlayback" value="${ALARM_PLAYBACK_MODES.SUSTAINED}"><span><i class="fa-solid fa-repeat"></i><b>Repeat for a Duration</b><small>Repeats until the configured duration expires.</small></span></label>
          </div>
          <div class="et-trigger-size-grid" data-alarm-duration-row hidden>
            <label><span>Duration</span><div class="et-number-suffix"><input type="number" name="alarmDuration" min="1" max="300" step="1" value="${alarm.playback.duration}"><b>seconds</b></div></label>
          </div>
        </fieldset>

        <fieldset class="et-origin-fieldset" data-alarm-origin-options>
          <legend>Where does the alarm originate?</legend>
          <div class="et-origin-grid">
            <label class="et-origin-option"><input type="radio" name="originMode" value="${ORIGIN_MODES.TRIGGER_TILE}" checked><span><i class="fa-solid fa-bullseye"></i><b>From the trigger</b><small>Sound originates from the Tile, Door, or Item Pile itself.</small></span></label>
            <label class="et-origin-option"><input type="radio" name="originMode" value="${ORIGIN_MODES.SEPARATE_TILE}"><span><i class="fa-solid fa-location-dot"></i><b>From another point</b><small>Place a separate movable Origin Tile.</small></span></label>
          </div>
        </fieldset>

        <div class="et-trigger-size-grid">
          <label><span>Trigger width</span><div class="et-number-suffix"><input type="number" name="widthCells" min="1" max="20" step="1" value="1"><b>cells</b></div></label>
          <label><span>Trigger height</span><div class="et-number-suffix"><input type="number" name="heightCells" min="1" max="20" step="1" value="1"><b>cells</b></div></label>
        </div>

        <fieldset class="et-alarm-fieldset">
          <legend>Chat notification</legend>
          <div class="et-alarm-choice-grid et-alarm-three-grid">
            <label class="et-origin-option"><input type="radio" name="alarmChat" value="${ALARM_CHAT_MODES.OFF}"><span><i class="fa-solid fa-comment-slash"></i><b>Off</b><small>No alarm message.</small></span></label>
            <label class="et-origin-option"><input type="radio" name="alarmChat" value="${ALARM_CHAT_MODES.GM_ONLY}" checked><span><i class="fa-solid fa-eye"></i><b>GM Only</b><small>Private confirmation for GMs.</small></span></label>
            <label class="et-origin-option"><input type="radio" name="alarmChat" value="${ALARM_CHAT_MODES.EVERYONE}"><span><i class="fa-solid fa-comments"></i><b>Everyone</b><small>Post the alarm to public chat.</small></span></label>
          </div>
        </fieldset>

        <div class="et-activation-option-grid">
          <label class="et-pause-option"><input type="checkbox" name="pauseOnTrigger"><span><i class="fa-solid fa-pause"></i><b>Pause the game when triggered</b><small>Off by default for alarms.</small></span></label>
          <label class="et-pause-option"><input type="checkbox" name="disarmAfterTrigger" checked><span><i class="fa-solid fa-power-off"></i><b>Disarm after triggering</b><small>Disable this to keep the alarm repeatable.</small></span></label>
        </div>
        <div class="et-trigger-size-grid" data-alarm-cooldown-row hidden>
          <label><span>Repeat cooldown</span><div class="et-number-suffix"><input type="number" name="alarmCooldown" min="0" max="300" step="1" value="${alarm.cooldownSeconds}"><b>seconds</b></div><small class="et-level-hint">Prevents repeated activations from spamming audio.</small></label>
        </div>

        <button type="button" class="et-wizard-advanced ${discovery.enabled ? "is-enabled" : ""}" data-wizard-action="advanced"><span><i class="fa-solid fa-sliders"></i><span><b>Advanced settings</b><small data-wizard-advanced-summary>${escapeHtml(discoverySummary(discovery))}</small></span></span><i class="fa-solid fa-chevron-right"></i></button>
      </div>
      <footer class="et-wizard-actions"><button type="button" data-wizard-action="cancel">Cancel</button><button type="button" data-wizard-action="place" class="et-primary"><i class="fa-solid fa-location-crosshairs"></i> Place trigger</button></footer>
    </section>

    <section class="et-wizard-placement" data-wizard-stage="placement" hidden>
      <div class="et-wizard-scroll et-placement-scroll" data-wizard-scroll>
        <div class="et-selected-spell et-selected-alarm"><div class="et-alarm-selected-icon"><i class="fa-solid fa-bell"></i></div><span><small>Alarm Trap</small><b data-selected-name>Clock Alarm</b><em data-selected-meta>Spatial alarm</em></span><i class="fa-solid fa-check-circle"></i></div>
        <div class="et-trigger-type-picker" data-trigger-type-picker>
          <button type="button" class="is-selected" data-trigger-type="tile"><i class="fa-solid fa-border-all"></i><span><b>Tile</b><small>Floor / area trigger</small></span></button>
          <button type="button" data-trigger-type="door"><i class="fa-solid fa-door-open"></i><span><b>Door</b><small>Create a Foundry door</small></span></button>
          <button type="button" data-trigger-type="item-pile"><i class="fa-solid fa-box-open"></i><span><b>Item Pile</b><small>Create an Item Pile</small></span></button>
        </div>
        <div class="et-placement-step" data-placement-step><i class="fa-solid fa-location-crosshairs" data-placement-icon></i><span><small data-placement-kicker>Place trigger</small><b data-placement-title>Choose the trigger cells on the scene</b><em data-placement-instruction>Click the top-left grid cell. Press Esc to return.</em></span></div>
        <div class="et-placement-facts">
          <span><small>Sound</small><b data-placement-alarm-sound>Clock Alarm</b></span>
          <span><small>Audibility</small><b data-placement-alarm-audibility>Spatial · 60 ${escapeHtml(sceneDistanceUnits())}</b></span>
          <span><small>Playback</small><b data-placement-alarm-playback>Play once</b></span>
          <span><small>Trigger</small><b data-placement-size>Tile · 1×1 cells</b></span>
          <span><small>Origin</small><b data-placement-origin>From the trigger</b></span>
          <span><small>Pause</small><b data-placement-pause>No</b></span>
          <span><small>After trigger</small><b data-placement-disarm>Disarm</b></span>
          <span><small>Chat</small><b data-placement-alarm-chat>GM Only</b></span>
          <span><small>Discovery</small><b data-placement-discovery>${escapeHtml(discoverySummary(discovery))}</b></span>
        </div>
      </div>
      <footer class="et-wizard-actions et-placement-actions"><button type="button" data-wizard-action="cancel-placement"><i class="fa-solid fa-arrow-left"></i> Cancel placement</button></footer>
    </section>
  </form>`;
}

export function readAlarmConfigFromForm(form) {
  const custom = form.querySelector('input[name="alarmSoundMode"]:checked')?.value === "custom";
  const customPath = String(form.querySelector('input[name="alarmSoundPath"]')?.value ?? "").trim();
  return normalizeAlarmConfig({
    sound: {
      path: custom ? customPath : DEFAULT_ALARM_SOUND,
      custom,
      volume: form.querySelector('input[name="alarmVolume"]')?.value
    },
    audibility: {
      mode: form.querySelector('input[name="alarmAudibility"]:checked')?.value,
      radius: form.querySelector('input[name="alarmRadius"]')?.value,
      easing: form.querySelector('input[name="alarmEasing"]')?.checked === true,
      walls: form.querySelector('input[name="alarmWalls"]')?.checked === true,
      gmAlways: form.querySelector('input[name="alarmGmAlways"]')?.checked === true
    },
    playback: {
      mode: form.querySelector('input[name="alarmPlayback"]:checked')?.value,
      duration: form.querySelector('input[name="alarmDuration"]')?.value
    },
    chat: { mode: form.querySelector('input[name="alarmChat"]:checked')?.value },
    cooldownSeconds: form.querySelector('input[name="alarmCooldown"]')?.value
  });
}

export function readAlarmWizardSelection(form) {
  const alarm = readAlarmConfigFromForm(form);
  const spatial = alarm.audibility.mode === ALARM_AUDIBILITY_MODES.SPATIAL;
  return {
    trapType: "alarm",
    triggerType: TRIGGER_TYPES.TILE,
    widthCells: clampCellCount(form.querySelector('input[name="widthCells"]')?.value),
    heightCells: clampCellCount(form.querySelector('input[name="heightCells"]')?.value),
    originMode: spatial
      ? normalizeOriginMode(form.querySelector('input[name="originMode"]:checked')?.value)
      : ORIGIN_MODES.TRIGGER_TILE,
    targetMode: TARGET_MODES.NONE,
    areaMode: AREA_MODES.NONE,
    alarm,
    pauseOnTrigger: form.querySelector('input[name="pauseOnTrigger"]')?.checked === true,
    disarmAfterTrigger: form.querySelector('input[name="disarmAfterTrigger"]')?.checked === true,
    discovery: normalizeDiscoveryConfig(form._easyTrapsDiscovery ?? getDiscoveryDefaults())
  };
}

export function updateAlarmWizardConditionalFields(form) {
  const custom = form.querySelector('input[name="alarmSoundMode"]:checked')?.value === "custom";
  const customRow = form.querySelector('[data-alarm-custom-row]');
  if (customRow) customRow.hidden = !custom;
  const spatial = form.querySelector('input[name="alarmAudibility"]:checked')?.value === ALARM_AUDIBILITY_MODES.SPATIAL;
  const spatialOptions = form.querySelector('[data-alarm-spatial-options]');
  if (spatialOptions) spatialOptions.hidden = !spatial;
  const originOptions = form.querySelector('[data-alarm-origin-options]');
  if (originOptions) originOptions.hidden = !spatial;
  if (!spatial) {
    const triggerOrigin = form.querySelector(`input[name="originMode"][value="${ORIGIN_MODES.TRIGGER_TILE}"]`);
    if (triggerOrigin) triggerOrigin.checked = true;
  }
  const sustained = form.querySelector('input[name="alarmPlayback"]:checked')?.value === ALARM_PLAYBACK_MODES.SUSTAINED;
  const durationRow = form.querySelector('[data-alarm-duration-row]');
  if (durationRow) durationRow.hidden = !sustained;
  const repeatable = form.querySelector('input[name="disarmAfterTrigger"]')?.checked !== true;
  const cooldownRow = form.querySelector('[data-alarm-cooldown-row]');
  if (cooldownRow) cooldownRow.hidden = !repeatable;
}

export async function browseAlarmSound(form) {
  const input = form?.querySelector?.('input[name="alarmSoundPath"]');
  if (!input) return false;
  const FilePickerClass = foundry?.applications?.apps?.FilePicker?.implementation
    ?? foundry?.applications?.apps?.FilePicker
    ?? globalThis.FilePicker;
  if (!FilePickerClass) return ui.notifications.warn("Foundry's audio browser is unavailable.");
  try {
    const picker = new FilePickerClass({
      type: "audio",
      current: input.value || "",
      callback: path => {
        input.value = String(path ?? "");
        const custom = form.querySelector('input[name="alarmSoundMode"][value="custom"]');
        if (custom) custom.checked = true;
        updateAlarmWizardConditionalFields(form);
      }
    });
    picker.render?.(true);
    return true;
  } catch (error) {
    console.warn(`${MODULE_ID} | Could not open Foundry audio browser`, error);
    ui.notifications.warn("The audio browser could not be opened.");
    return false;
  }
}

export async function previewAlarmFromForm(form) {
  const config = readAlarmConfigFromForm(form);
  if (!hasSupportedAudioExtension(config.sound.path)) return ui.notifications.warn("Choose a supported alarm audio file first.");
  try {
    await playAlarmLocally(config, { forceOnce: true });
    return true;
  } catch (error) {
    console.warn(`${MODULE_ID} | Alarm preview failed`, error);
    ui.notifications.warn(`The alarm preview could not be played: ${error?.message ?? error}`);
    return false;
  }
}

export function setAlarmWizardPlacementState(form, selection, phase = "trigger") {
  const setup = form.querySelector('[data-wizard-stage="setup"]');
  const placement = form.querySelector('[data-wizard-stage="placement"]');
  if (setup) setup.hidden = true;
  if (placement) placement.hidden = false;
  form.classList.add("et-placement-active");
  updateWizardTriggerTypeControls(form, selection);
  const config = normalizeAlarmConfig(selection.alarm);
  const name = form.querySelector('[data-selected-name]');
  if (name) name.textContent = alarmSoundLabel(config);
  const meta = form.querySelector('[data-selected-meta]');
  if (meta) meta.textContent = `${alarmAudibilityLabel(config.audibility.mode)} · ${alarmPlaybackLabel(config)}`;
  const sound = form.querySelector('[data-placement-alarm-sound]');
  if (sound) sound.textContent = alarmSoundLabel(config);
  const audibility = form.querySelector('[data-placement-alarm-audibility]');
  if (audibility) audibility.textContent = config.audibility.mode === ALARM_AUDIBILITY_MODES.SPATIAL
    ? `Spatial · ${config.audibility.radius} ${sceneDistanceUnits()}`
    : alarmAudibilityLabel(config.audibility.mode);
  const playback = form.querySelector('[data-placement-alarm-playback]');
  if (playback) playback.textContent = alarmPlaybackLabel(config);
  const origin = form.querySelector('[data-placement-origin]');
  if (origin) {
    const spatial = config.audibility.mode === ALARM_AUDIBILITY_MODES.SPATIAL;
    const row = origin.closest("span");
    if (row) row.hidden = !spatial;
    origin.textContent = selection.originMode === ORIGIN_MODES.SEPARATE_TILE ? "From another point" : "From the trigger";
  }
  const pause = form.querySelector('[data-placement-pause]');
  if (pause) pause.textContent = selection.pauseOnTrigger ? "Yes" : "No";
  const disarm = form.querySelector('[data-placement-disarm]');
  if (disarm) disarm.textContent = selection.disarmAfterTrigger ? "Disarm" : `Stay armed · ${config.cooldownSeconds}s cooldown`;
  const chat = form.querySelector('[data-placement-alarm-chat]');
  if (chat) chat.textContent = alarmChatLabel(config.chat.mode);
  const discovery = form.querySelector('[data-placement-discovery]');
  if (discovery) discovery.textContent = discoverySummary(selection.discovery);
  updateAlarmWizardPlacementPhase(form, selection, phase);
}

export function updateAlarmWizardPlacementPhase(form, selection, phase) {
  const isOrigin = phase === "origin";
  form.classList.toggle("et-origin-placement", isOrigin);
  form.classList.remove("et-area-placement", "et-target-placement");
  const kicker = form.querySelector('[data-placement-kicker]');
  const title = form.querySelector('[data-placement-title]');
  const instruction = form.querySelector('[data-placement-instruction]');
  const icon = form.querySelector('[data-placement-icon]');
  if (kicker) kicker.textContent = isOrigin ? "Place alarm origin" : "Place trigger";
  if (isOrigin) {
    if (title) title.textContent = "Choose where the alarm originates";
    if (instruction) instruction.textContent = "Click one grid cell for the separate origin. Press Esc to return.";
    if (icon) icon.className = "fa-solid fa-volume-high";
    return;
  }
  updateWizardTriggerTypeControls(form, selection);
  const type = normalizeTriggerType(selection.triggerType);
  if (type === TRIGGER_TYPES.DOOR) {
    if (title) title.textContent = "Draw the alarmed door";
    if (instruction) instruction.textContent = "Click the first endpoint, then the second. Opening this Door activates the alarm.";
    if (icon) icon.className = "fa-solid fa-door-open";
  } else if (type === TRIGGER_TYPES.ITEM_PILE) {
    if (title) title.textContent = "Place the alarmed Item Pile";
    if (instruction) instruction.textContent = "Click one grid cell. EasyTraps creates a real Item Pile there.";
    if (icon) icon.className = "fa-solid fa-box-open";
  } else {
    if (title) title.textContent = `Choose the ${selection.widthCells}×${selection.heightCells} trigger area`;
    if (instruction) instruction.textContent = "Click the top-left grid cell. Press Esc to return.";
    if (icon) icon.className = "fa-solid fa-location-crosshairs";
  }
}

export function activateAlarmCreationWizard(root, { dialog, finish, isClosed }) {
  const form = root?.matches?.("form.easy-traps-alarm-wizard") ? root : root?.querySelector?.("form.easy-traps-alarm-wizard");
  if (!form || form.dataset.activated === "true") return;
  form.dataset.activated = "true";
  const appElement = dialog?.element?.[0] ?? form.closest?.(".app, .application, .window-app");
  form._easyTrapsDiscovery = normalizeDiscoveryConfig(getDiscoveryDefaults());
  appElement?.classList?.add("easy-traps-wizard-window", "easy-traps-alarm-wizard-window");
  form.closest?.(".window-content")?.classList?.add("easy-traps-wizard-content");
  form.addEventListener("submit", event => event.preventDefault());
  form.addEventListener("change", event => {
    if (event.target?.matches?.('input[name="alarmSoundMode"], input[name="alarmAudibility"], input[name="alarmPlayback"], input[name="disarmAfterTrigger"]')) {
      updateAlarmWizardConditionalFields(form);
    }
  });
  form.addEventListener("click", async event => {
    const triggerTypeButton = event.target?.closest?.("[data-trigger-type]");
    if (triggerTypeButton) {
      event.preventDefault();
      if (triggerTypeButton.disabled) return ui.notifications.warn("Item Piles must be active to place an Item Pile trigger.");
      const selection = form._easyTrapsPlacementSelection;
      if (!selection) return;
      selection.triggerType = normalizeTriggerType(triggerTypeButton.dataset.triggerType);
      updateAlarmWizardPlacementPhase(form, selection, "trigger");
      return;
    }
    const alarmAction = event.target?.closest?.("[data-alarm-action]")?.dataset.alarmAction;
    if (alarmAction === "browse") {
      event.preventDefault();
      await browseAlarmSound(form);
      return;
    }
    if (alarmAction === "preview") {
      event.preventDefault();
      await previewAlarmFromForm(form);
    }
  });
  updateAlarmWizardConditionalFields(form);
  updateWizardAdvancedSummary(form);
  form.querySelector('[data-wizard-action="cancel"]')?.addEventListener("click", () => dialog.close());
  form.querySelector('[data-wizard-action="cancel-placement"]')?.addEventListener("click", () => runtime.cancelPlacement?.());
  form.querySelector('[data-wizard-action="advanced"]')?.addEventListener("click", () => openAdvancedSettingsForWizard(form));
  form.querySelector('[data-wizard-action="place"]')?.addEventListener("click", async event => {
    const button = event.currentTarget;
    if (button.disabled || runtime.placing) return;
    const rawCustom = form.querySelector('input[name="alarmSoundMode"]:checked')?.value === "custom";
    const rawPath = String(form.querySelector('input[name="alarmSoundPath"]')?.value ?? "").trim();
    if (rawCustom && !rawPath) return ui.notifications.warn("Choose a custom alarm sound file first.");
    const selection = readAlarmWizardSelection(form);
    if (!hasSupportedAudioExtension(selection.alarm.sound.path)) return ui.notifications.warn("Choose a supported alarm audio file before placing the trap.");
    button.disabled = true;
    button.setAttribute("aria-busy", "true");
    form._easyTrapsPlacementSelection = selection;
    setAlarmWizardPlacementState(form, selection, "trigger");
    setWizardWindowPosition(dialog, true);
    const placementUi = { setPhase: phase => updateAlarmWizardPlacementPhase(form, selection, phase) };
    let trigger = null;
    try {
      trigger = await placeAlarmTrap(selection, placementUi);
    } finally {
      button.disabled = false;
      button.removeAttribute("aria-busy");
    }
    if (trigger) {
      finish(trigger);
      await dialog.close();
      return;
    }
    if (!isClosed()) {
      restoreWizardSetup(form);
      setWizardWindowPosition(dialog, false);
    }
  });
}

export function openAlarmCreationWizard() {
  if (!globalThis.Dialog) {
    ui.notifications.error("The alarm trap creator could not open because the Foundry Dialog API is unavailable.");
    return null;
  }
  const content = buildAlarmWizardContent();
  return new Promise(resolve => {
    let settled = false;
    let closed = false;
    const finish = value => {
      if (settled) return;
      settled = true;
      resolve(value ?? null);
    };
    const dialog = new Dialog({
      title: "EasyTraps — Alarm Trap",
      content,
      buttons: {},
      render: html => {
        const root = html?.[0] ?? html;
        activateAlarmCreationWizard(root, { dialog, finish, isClosed: () => closed });
        setWizardWindowPosition(dialog, false);
      },
      close: () => {
        closed = true;
        runtime.cancelPlacement?.();
        finish(null);
      }
    }, {
      width: Math.min(720, Math.max(600, window.innerWidth - 160)),
      height: Math.min(760, window.innerHeight - 90),
      resizable: true
    });
    dialog.render(true);
  });
}
