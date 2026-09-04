import { DEFAULT_DISCOVERY_CONFIG, THIEVES_TOOLS_2024_REQUIREMENT, itemRequirementIdentity } from "./discovery.mjs";

/**
 * Reusable per-trap Discovery & Disarming settings.
 *
 * This application owns only configuration and persistence. Detection and
 * disarming runtime automation can consume the normalized flag shape without
 * coupling itself to this UI.
 */

export function openTrapAdvancedSettings({
  value,
  title = "Advanced Trap Settings",
  subtitle = "Discovery & Disarming",
  pauseOnTrigger,
  normalize,
  onSave,
  onApplyAll,
  resolveItem,
  history = [],
  onClearHistory
} = {}) {
  const suffix = foundry.utils.randomID?.(6) ?? Math.random().toString(36).slice(2, 8);
  const app = new TrapAdvancedSettings(
    { value, title, subtitle, pauseOnTrigger, normalize, onSave, onApplyAll, resolveItem, history, onClearHistory },
    { id: `easy-traps-advanced-${suffix}` }
  );
  app.render(true);
  return app;
}

class TrapAdvancedSettings extends FormApplication {
  constructor({
    value,
    title,
    subtitle,
    pauseOnTrigger,
    normalize,
    onSave,
    onApplyAll,
    resolveItem,
    history = [],
    onClearHistory
  } = {}, options = {}) {
    super({}, options);
    this._title = title;
    this.subtitle = subtitle;
    this.canConfigureTriggerBehavior = typeof pauseOnTrigger === "boolean";
    this.pauseOnTrigger = pauseOnTrigger === true;
    this.normalize = typeof normalize === "function" ? normalize : value => value;
    this.onSave = typeof onSave === "function" ? onSave : async () => {};
    this.onApplyAll = typeof onApplyAll === "function" ? onApplyAll : null;
    this.resolveItem = typeof resolveItem === "function" ? resolveItem : async () => null;
    this.history = Array.isArray(history) ? history : [];
    this.onClearHistory = typeof onClearHistory === "function" ? onClearHistory : null;
    this.value = this.normalize(value ?? {});
    this.tool = this._toolFromConfig(this.value?.disarm);
    if (!this._hasToolIdentity(this.tool)) this.tool = this._defaultTool();
  }

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "easy-traps-advanced",
      title: "Advanced Trap Settings",
      template: "modules/easy-traps/templates/advanced.hbs",
      classes: ["easy-traps-advanced-window"],
      width: 720,
      height: 720,
      resizable: true,
      closeOnSubmit: false,
      submitOnChange: false,
      submitOnClose: false
    });
  }

  get title() {
    return this._title || this.options.title || "Advanced Trap Settings";
  }

  async getData() {
    const value = this.normalize(this.value ?? {});
    const detection = value.detection ?? {};
    const disarm = value.disarm ?? {};
    return {
      subtitle: this.subtitle,
      enabled: value.enabled === true,
      detectionDC: detection.dc,
      detectionPerception: detection.skill !== "investigation",
      detectionInvestigation: detection.skill === "investigation",
      passiveDiscovery: detection.passive === true,
      detectionDistance: detection.distance,
      requireLOS: detection.requireLOS !== false,
      pauseOnDiscovery: detection.pauseOnDiscovery !== false,
      canConfigureTriggerBehavior: this.canConfigureTriggerBehavior,
      pauseOnTrigger: this.pauseOnTrigger,
      disarmDC: disarm.dc,
      requireDisarmProficiency: disarm.requireProficiency === true,
      oneAttemptPerActor: disarm.oneAttemptPerActor !== false,
      showDcInChat: disarm.showDcInChat === true,
      dangerousFailure: disarm.dangerousFailure === true,
      dangerousThreshold: disarm.dangerousThreshold,
      dangerousThresholdMax: Math.max(0, Number(disarm.dc) - 1),
      naturalOneTriggers: disarm.naturalOneTriggers === true,
      alwaysDisarmOnCritical: disarm.alwaysDisarmOnCritical === true,
      requireRequiredItem: disarm.requiredItemEnabled === true,
      requiredToolName: this.tool.name || THIEVES_TOOLS_2024_REQUIREMENT.name,
      requiredToolImg: this.tool.img || THIEVES_TOOLS_2024_REQUIREMENT.img,
      requiredToolUuid: this.tool.uuid || THIEVES_TOOLS_2024_REQUIREMENT.uuid,
      requiredToolIsDefault: this._isDefaultTool(this.tool),
      canApplyAll: Boolean(this.onApplyAll),
      attemptHistory: this.history,
      hasAttemptHistory: this.history.length > 0,
      canClearHistory: Boolean(this.onClearHistory)
    };
  }

  activateListeners(html) {
    super.activateListeners(html);

    html.find('[name="enabled"], [name="detectionSkill"], [name="dangerousFailure"], [name="disarmDC"], [name="requireRequiredItem"]').on("change.easyTrapsAdvanced", () => {
      this._syncConditionalState(html);
    });

    html.find('[data-action="close"]').on("click.easyTrapsAdvanced", event => {
      event.preventDefault();
      this.close();
    });

    html.find('[data-action="clear-attempt-history"]').on("click.easyTrapsAdvanced", async event => {
      event.preventDefault();
      if (!this.onClearHistory) return;
      await this.onClearHistory();
      this.history = [];
      this.render(false);
    });

    html.find('[data-action="restore-defaults"]').on("click.easyTrapsAdvanced", async event => {
      event.preventDefault();
      this.value = this.normalize(foundry.utils.deepClone(DEFAULT_DISCOVERY_CONFIG));
      this.tool = this._toolFromConfig(this.value?.disarm);
      if (!this._hasToolIdentity(this.tool)) this.tool = this._defaultTool();
      ui.notifications.info("SRD 5.2.1 baseline loaded. Click Apply to save it to this trap.");
      this.render(true);
    });

    html.find('[data-action="apply-all"]').on("click.easyTrapsAdvanced", async event => {
      event.preventDefault();
      await this._applyAll(html);
    });

    html.find('[data-required-tool-drag]').on("dragstart.easyTrapsAdvanced", event => {
      const original = event.originalEvent ?? event;
      const uuid = String(event.currentTarget?.dataset?.uuid ?? this.tool?.uuid ?? THIEVES_TOOLS_2024_REQUIREMENT.uuid);
      if (!uuid) return;
      const payload = JSON.stringify({ type: "Item", uuid });
      original.dataTransfer?.setData?.("text/plain", payload);
      original.dataTransfer?.setData?.("application/json", payload);
      if (original.dataTransfer) original.dataTransfer.effectAllowed = "copy";
    });

    const dropZone = html[0]?.querySelector?.("[data-required-tool-drop]");
    dropZone?.addEventListener("dragover", event => {
      event.preventDefault();
      dropZone.classList.add("is-dragover");
      if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
    });
    dropZone?.addEventListener("dragleave", event => {
      if (!dropZone.contains(event.relatedTarget)) dropZone.classList.remove("is-dragover");
    });
    dropZone?.addEventListener("drop", event => this._onToolDrop(event, html));

    html.find('[data-action="reset-required-tool"]').on("click.easyTrapsAdvanced", event => {
      event.preventDefault();
      event.stopPropagation();
      this._setToolState(html, this._defaultTool(), { enableRequirement: false });
      ui.notifications.info("Required item restored to Thieves' Tools.");
    });

    this._syncConditionalState(html);
  }

  async _updateObject(_event, _formData) {
    const value = await this._collectValue();
    if (!value) return;
    this.value = value;
    const meta = this._readMeta(this.form ?? document.getElementById(this.options.id)?.querySelector?.("form"));
    if (typeof meta.pauseOnTrigger === "boolean") this.pauseOnTrigger = meta.pauseOnTrigger;
    await this.onSave(value, meta);
    await this.close();
  }

  async _applyAll(_html) {
    if (!this.onApplyAll) return;
    const value = await this._collectValue();
    if (!value) return;

    const confirmed = await Dialog.confirm({
      title: "Apply all Advanced Settings to all traps?",
      content: `
        <p>Apply <b>every configurable setting on this Advanced Trap Settings page</b> to every EasyTraps trap in the current scene?</p>
        <p>Discovery, disarming, attempt rules, and Trigger behavior will also become the defaults for <b>new traps</b>. Attempt history is not copied.</p>
      `
    });
    if (!confirmed) return;

    const meta = this._readMeta(this.form ?? document.getElementById(this.options.id)?.querySelector?.("form"));
    if (typeof meta.pauseOnTrigger === "boolean") this.pauseOnTrigger = meta.pauseOnTrigger;
    const result = await this.onApplyAll(value, meta);
    if (result === false) return;
    this.value = value;
    await this.close();
  }

  async _collectValue() {
    const form = this.form ?? document.getElementById(this.options.id)?.querySelector?.("form");
    if (!form) return null;
    return this.normalize(this._readForm(form));
  }

  _readMeta(form) {
    if (!form || !this.canConfigureTriggerBehavior) return {};
    return { pauseOnTrigger: form.querySelector('[name="pauseOnTrigger"]')?.checked === true };
  }

  _readForm(form) {
    return {
      enabled: form.querySelector('[name="enabled"]')?.checked === true,
      detection: {
        dc: form.querySelector('[name="detectionDC"]')?.value,
        skill: form.querySelector('[name="detectionSkill"]')?.value,
        passive: form.querySelector('[name="passiveDiscovery"]')?.checked === true,
        distance: form.querySelector('[name="detectionDistance"]')?.value,
        requireLOS: form.querySelector('[name="requireLOS"]')?.checked === true,
        pauseOnDiscovery: form.querySelector('[name="pauseOnDiscovery"]')?.checked === true
      },
      disarm: {
        dc: form.querySelector('[name="disarmDC"]')?.value,
        skill: "sleightOfHand",
        requireProficiency: form.querySelector('[name="requireDisarmProficiency"]')?.checked === true,
        requiredItemEnabled: form.querySelector('[name="requireRequiredItem"]')?.checked === true,
        requiredToolUuid: this.tool?.uuid || THIEVES_TOOLS_2024_REQUIREMENT.uuid,
        requiredToolName: this.tool?.name || THIEVES_TOOLS_2024_REQUIREMENT.name,
        requiredToolImg: this.tool?.img || THIEVES_TOOLS_2024_REQUIREMENT.img,
        requiredToolType: this.tool?.type || THIEVES_TOOLS_2024_REQUIREMENT.type,
        requiredToolIdentifier: this.tool?.identifier || THIEVES_TOOLS_2024_REQUIREMENT.identifier,
        requiredToolSourceUuid: this.tool?.sourceUuid || THIEVES_TOOLS_2024_REQUIREMENT.sourceUuid,
        oneAttemptPerActor: form.querySelector('[name="oneAttemptPerActor"]')?.checked === true,
        showDcInChat: form.querySelector('[name="showDcInChat"]')?.checked === true,
        dangerousFailure: form.querySelector('[name="dangerousFailure"]')?.checked === true,
        dangerousThreshold: form.querySelector('[name="dangerousThreshold"]')?.value,
        naturalOneTriggers: form.querySelector('[name="naturalOneTriggers"]')?.checked === true,
        alwaysDisarmOnCritical: form.querySelector('[name="alwaysDisarmOnCritical"]')?.checked === true
      }
    };
  }

  _syncConditionalState(html) {
    const root = html[0];
    if (!root) return;

    const enabled = root.querySelector('[name="enabled"]')?.checked === true;
    root.querySelectorAll("[data-advanced-body] input, [data-advanced-body] select, [data-advanced-body] button").forEach(control => {
      if (control.closest?.("[data-always-enabled]")) return;
      control.disabled = !enabled;
    });
    root.querySelector("[data-advanced-body]")?.classList.toggle("is-disabled", !enabled);

    const skill = root.querySelector('[name="detectionSkill"]')?.value ?? "perception";
    const passive = root.querySelector('[name="passiveDiscovery"]');
    const passiveCard = passive?.closest?.(".et-advanced-toggle");
    const passiveSupported = skill === "perception";
    const passiveAvailable = enabled && passiveSupported;
    if (passive) {
      passive.disabled = !passiveAvailable;
      // Preserve the checkbox while the whole discovery feature is disabled;
      // only Investigation itself invalidates Passive Perception.
      if (!passiveSupported) passive.checked = false;
    }
    passiveCard?.classList.toggle("is-disabled", !passiveAvailable);

    const dangerous = root.querySelector('[name="dangerousFailure"]')?.checked === true;
    const threshold = root.querySelector('[name="dangerousThreshold"]');
    const disarmDc = Math.max(1, Math.min(99, Math.trunc(Number(root.querySelector('[name="disarmDC"]')?.value) || 15)));
    const dangerousMax = Math.max(0, disarmDc - 1);
    if (threshold) {
      threshold.disabled = !enabled || !dangerous;
      threshold.max = String(dangerousMax);
      if (Number(threshold.value) > dangerousMax) threshold.value = String(dangerousMax);
    }
    threshold?.closest?.(".et-advanced-threshold")?.classList.toggle("is-disabled", !enabled || !dangerous);

    const resetRequiredItem = root.querySelector('[data-action="reset-required-tool"]');
    if (resetRequiredItem) resetRequiredItem.disabled = !enabled || this._isDefaultTool(this.tool);
  }

  async _onToolDrop(event, html) {
    event.preventDefault();
    event.stopPropagation();
    const dropZone = event.currentTarget;
    dropZone?.classList?.remove("is-dragover");
    let data;
    try { data = TextEditor.getDragEventData(event); }
    catch (_error) { data = null; }
    const uuid = String(data?.uuid ?? "").trim();
    if (!uuid) return ui.notifications.warn("Drop an Item from the sidebar or a compendium here.");
    const item = await this.resolveItem(uuid);
    if (!item || item.documentName !== "Item") return ui.notifications.warn("Only Item documents can be used as the required item.");
    this._setToolState(html, this._toolFromItem(item), { enableRequirement: true });
    ui.notifications.info(`Required item set to ${item.name}.`);
  }

  _setToolState(html, tool, { enableRequirement = false } = {}) {
    this.tool = this._hasToolIdentity(tool) ? { ...tool } : this._defaultTool();
    const root = html[0];
    if (!root) return;

    const card = root.querySelector("[data-required-tool-card]");
    const drag = root.querySelector("[data-required-tool-drag]");
    const img = root.querySelector("[data-required-tool-img]");
    const name = root.querySelector("[data-required-tool-name]");
    const hint = root.querySelector("[data-required-tool-hint]");
    const reset = root.querySelector('[data-action="reset-required-tool"]');
    const checkbox = root.querySelector('[name="requireRequiredItem"]');

    card?.classList?.toggle("is-default", this._isDefaultTool(this.tool));
    if (drag) drag.dataset.uuid = this.tool.uuid || "";
    if (img) img.src = this.tool.img || "icons/svg/item-bag.svg";
    if (name) name.textContent = this.tool.name || "Required Item";
    if (hint) hint.textContent = "Drop another Item here to replace it · drag this item to a character sheet.";
    if (reset) reset.disabled = this._isDefaultTool(this.tool);
    if (enableRequirement && checkbox) checkbox.checked = true;

    this._syncConditionalState(html);
  }

  _toolFromConfig(disarm = {}) {
    return {
      uuid: String(disarm?.requiredToolUuid ?? ""),
      name: String(disarm?.requiredToolName ?? ""),
      img: String(disarm?.requiredToolImg ?? ""),
      type: String(disarm?.requiredToolType ?? ""),
      identifier: String(disarm?.requiredToolIdentifier ?? ""),
      sourceUuid: String(disarm?.requiredToolSourceUuid ?? "")
    };
  }

  _toolFromItem(item) {
    const identity = itemRequirementIdentity(item);
    return {
      uuid: identity.uuid,
      name: identity.name || "Required Item",
      img: identity.img || "icons/svg/item-bag.svg",
      type: identity.type,
      identifier: identity.identifier,
      sourceUuid: identity.sourceUuid
    };
  }

  _defaultTool() {
    return {
      uuid: THIEVES_TOOLS_2024_REQUIREMENT.uuid,
      name: THIEVES_TOOLS_2024_REQUIREMENT.name,
      img: THIEVES_TOOLS_2024_REQUIREMENT.img,
      type: THIEVES_TOOLS_2024_REQUIREMENT.type,
      identifier: THIEVES_TOOLS_2024_REQUIREMENT.identifier,
      sourceUuid: THIEVES_TOOLS_2024_REQUIREMENT.sourceUuid
    };
  }

  _hasToolIdentity(tool) {
    return Boolean(tool?.uuid || tool?.sourceUuid || tool?.identifier || tool?.name);
  }

  _isDefaultTool(tool) {
    if (!tool) return false;
    const identity = String(tool.identifier ?? "").trim().toLowerCase();
    const source = String(tool.sourceUuid ?? tool.uuid ?? "").trim();
    return identity === THIEVES_TOOLS_2024_REQUIREMENT.identifier
      || source === THIEVES_TOOLS_2024_REQUIREMENT.sourceUuid
      || source === THIEVES_TOOLS_2024_REQUIREMENT.uuid;
  }

}
