import { itemRequirementIdentity, THIEVES_TOOLS_2024_REQUIREMENT } from "./discovery.mjs";

/**
 * EasyTraps configuration application.
 *
 * This deliberately uses Foundry's proven FormApplication lifecycle instead of
 * embedding a complex form inside Dialog/DialogV2. It mirrors the interaction
 * model used by EasyWounds: one persistent form, explicit tabs, native submit,
 * and listeners bound once from activateListeners.
 */

export function openEasyTrapsConfiguration(services) {
  const app = new EasyTrapsConfiguration(services);
  app.render(true);
  return app;
}

/**
 * Foundry settings menus instantiate their application class without custom
 * constructor arguments. Keep the actual FormApplication implementation in one
 * place while binding EasyTraps' load/save/reset services for registerMenu().
 */
export function createEasyTrapsConfigurationMenuType(services) {
  return class EasyTrapsConfigurationMenu extends EasyTrapsConfiguration {
    constructor(options = {}) { super(services, options); }
  };
}

class EasyTrapsConfiguration extends FormApplication {
  constructor(services, options = {}) {
    super({}, options);
    this.services = services;
    this.activeTab = "visuals";
  }

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "easy-traps-config",
      title: "EasyTraps — Configuration",
      template: "modules/easy-traps/templates/config.hbs",
      classes: ["easy-traps-config-window"],
      width: 760,
      height: 760,
      resizable: true,
      closeOnSubmit: false,
      submitOnChange: false,
      submitOnClose: false
    });
  }

  async getData() {
    const data = await this.services.load();
    const disarm = data.discovery?.disarm ?? {};
    const hasRequiredItem = disarm.requiredItemEnabled === true;
    const selectedTool = {
      uuid: disarm.requiredToolUuid || THIEVES_TOOLS_2024_REQUIREMENT.uuid,
      name: disarm.requiredToolName || THIEVES_TOOLS_2024_REQUIREMENT.name,
      img: disarm.requiredToolImg || THIEVES_TOOLS_2024_REQUIREMENT.img,
      type: disarm.requiredToolType || THIEVES_TOOLS_2024_REQUIREMENT.type,
      identifier: disarm.requiredToolIdentifier || THIEVES_TOOLS_2024_REQUIREMENT.identifier,
      sourceUuid: disarm.requiredToolSourceUuid || THIEVES_TOOLS_2024_REQUIREMENT.sourceUuid
    };
    return {
      ...data,
      activeTab: this.activeTab,
      visualsActive: this.activeTab === "visuals",
      sourcesActive: this.activeTab === "sources",
      defaultsActive: this.activeTab === "defaults",
      discoveryActive: this.activeTab === "discovery",
      detectionPerception: data.discovery?.detection?.skill !== "investigation",
      detectionInvestigation: data.discovery?.detection?.skill === "investigation",
      requireRequiredItem: hasRequiredItem,
      showDcInChat: disarm.showDcInChat === true,
      requiredToolUuid: selectedTool.uuid,
      requiredToolName: selectedTool.name,
      requiredToolImg: selectedTool.img,
      requiredToolType: selectedTool.type,
      requiredToolIdentifier: selectedTool.identifier,
      requiredToolSourceUuid: selectedTool.sourceUuid,
      requiredToolIsDefault: selectedTool.identifier === THIEVES_TOOLS_2024_REQUIREMENT.identifier
    };
  }

  activateListeners(html) {
    super.activateListeners(html);

    html.find("[data-tab-target]").on("click.easyTrapsConfig", event => {
      event.preventDefault();
      this._activateTab(html, event.currentTarget.dataset.tabTarget);
    });

    html.find('[name="packSearch"]').on("input.easyTrapsConfig", () => this._filterPacks(html));
    html.find('input[name="compendium"]').on("change.easyTrapsConfig", () => this._updatePackCount(html));

    html.find("[data-pack-action]").on("click.easyTrapsConfig", event => {
      event.preventDefault();
      this._applyPackAction(html, event.currentTarget.dataset.packAction);
    });

    html.find('[name="triggerTexture"], [name="originTexture"]').on("input.easyTrapsConfig change.easyTrapsConfig", () => {
      this._refreshImagePreviews(html);
    });

    html.find('[data-action="browse-image"]').on("click.easyTrapsConfig", async event => {
      event.preventDefault();
      await this._browseImage(html, event.currentTarget);
    });

    html.find('[data-action="reset-image"]').on("click.easyTrapsConfig", event => {
      event.preventDefault();
      const button = event.currentTarget;
      const target = button.dataset.target;
      const input = html[0]?.querySelector?.(`[name="${target}"]`);
      if (!input) return;
      input.value = button.dataset.defaultImage ?? "";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });

    html.find('[name="discoveryEnabled"], [name="detectionSkill"], [name="dangerousFailure"], [name="disarmDC"]').on("change.easyTrapsConfig", () => {
      this._syncDiscoveryState(html);
    });

    html.find('[data-required-tool-drag]').on("dragstart.easyTrapsConfig", event => {
      const original = event.originalEvent ?? event;
      const uuid = String(event.currentTarget?.dataset?.uuid ?? THIEVES_TOOLS_2024_REQUIREMENT.uuid);
      const payload = JSON.stringify({ type: "Item", uuid });
      original.dataTransfer?.setData?.("text/plain", payload);
      original.dataTransfer?.setData?.("application/json", payload);
      if (original.dataTransfer) original.dataTransfer.effectAllowed = "copy";
    });

    html.find('[data-action="reset-default-tool"]').on("click.easyTrapsConfig", event => {
      event.preventDefault();
      this._setDefaultTool(html, THIEVES_TOOLS_2024_REQUIREMENT);
    });

    const dropZone = html[0]?.querySelector?.("[data-default-tool-drop-zone]");
    dropZone?.addEventListener("dragover", event => {
      event.preventDefault();
      dropZone.classList.add("is-dragover");
    });
    dropZone?.addEventListener("dragleave", () => dropZone.classList.remove("is-dragover"));
    dropZone?.addEventListener("drop", event => this._onDefaultToolDrop(event, html));

    html.find('[data-action="reset-defaults"]').on("click.easyTrapsConfig", async event => {
      event.preventDefault();
      const confirmed = await Dialog.confirm({
        title: "Reset EasyTraps",
        content: "<p>Restore spell sources, trap images, favorites, spell defaults, and discovery/disarming defaults?</p><p><b>This replaces the current EasyTraps configuration.</b></p>"
      });
      if (!confirmed) return;
      await this.services.reset();
      ui.notifications.info("EasyTraps factory defaults restored.");
      this.render(true);
    });

    this._activateTab(html, this.activeTab, { focus: false });
    this._refreshImagePreviews(html);
    this._filterPacks(html);
    this._syncDiscoveryState(html);
  }

  async _updateObject(_event, _formData) {
    const form = this.form ?? document.getElementById(this.options.id)?.querySelector?.("form");
    if (!form) return;
    // Required Item identity is validated at the moment an Item is dropped into
    // the form. Do not re-resolve its UUID on every unrelated settings save:
    // compendium source IDs can legitimately be unavailable later, while the
    // stored identifier/name metadata remains useful for owned-item matching.
    const values = this._readForm(form);
    const saved = await this.services.save(values);
    if (saved === false) return;
    ui.notifications.info("EasyTraps configuration saved.");
  }

  _readForm(form) {
    const compendiumInputs = [...form.querySelectorAll('input[name="compendium"]')];
    return {
      spellSourcesEditable: compendiumInputs.length > 0,
      compendiums: compendiumInputs.filter(input => input.checked).map(input => input.value),
      spellSaveDc: form.querySelector('[name="defaultSpellSaveDc"]')?.value,
      spellAttackBonus: form.querySelector('[name="defaultSpellAttackBonus"]')?.value,
      pauseOnTrigger: form.querySelector('[name="defaultPauseOnTrigger"]')?.checked === true,
      disarmAfterTrigger: form.querySelector('[name="defaultDisarmAfterTrigger"]')?.checked === true,
      discovery: {
        enabled: form.querySelector('[name="discoveryEnabled"]')?.checked === true,
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
          requiredToolUuid: String(form.querySelector('[name="requiredToolUuid"]')?.value ?? THIEVES_TOOLS_2024_REQUIREMENT.uuid).trim(),
          requiredToolName: String(form.querySelector('[name="requiredToolName"]')?.value ?? THIEVES_TOOLS_2024_REQUIREMENT.name).trim(),
          requiredToolImg: String(form.querySelector('[name="requiredToolImg"]')?.value ?? THIEVES_TOOLS_2024_REQUIREMENT.img).trim(),
          requiredToolType: String(form.querySelector('[name="requiredToolType"]')?.value ?? THIEVES_TOOLS_2024_REQUIREMENT.type).trim(),
          requiredToolIdentifier: String(form.querySelector('[name="requiredToolIdentifier"]')?.value ?? THIEVES_TOOLS_2024_REQUIREMENT.identifier).trim(),
          requiredToolSourceUuid: String(form.querySelector('[name="requiredToolSourceUuid"]')?.value ?? THIEVES_TOOLS_2024_REQUIREMENT.sourceUuid).trim(),
            oneAttemptPerActor: form.querySelector('[name="oneAttemptPerActor"]')?.checked === true,
          showDcInChat: form.querySelector('[name="showDcInChat"]')?.checked === true,
          dangerousFailure: form.querySelector('[name="dangerousFailure"]')?.checked === true,
          dangerousThreshold: form.querySelector('[name="dangerousThreshold"]')?.value,
          naturalOneTriggers: form.querySelector('[name="naturalOneTriggers"]')?.checked === true,
          alwaysDisarmOnCritical: form.querySelector('[name="alwaysDisarmOnCritical"]')?.checked === true
        }
      },
      triggerTexture: String(form.querySelector('[name="triggerTexture"]')?.value ?? "").trim(),
      originTexture: String(form.querySelector('[name="originTexture"]')?.value ?? "").trim()
    };
  }

  _activateTab(html, target, { focus = true } = {}) {
    const tabs = [...(html[0]?.querySelectorAll?.("[data-tab-target]") ?? [])];
    const panels = [...(html[0]?.querySelectorAll?.("[data-tab]") ?? [])];
    if (!panels.some(panel => panel.dataset.tab === target)) target = "visuals";
    this.activeTab = target;

    for (const tab of tabs) {
      const active = tab.dataset.tabTarget === target;
      tab.classList.toggle("active", active);
      tab.setAttribute("aria-selected", String(active));
      tab.tabIndex = active ? 0 : -1;
    }
    for (const panel of panels) panel.classList.toggle("active", panel.dataset.tab === target);

    if (focus) html[0]?.querySelector?.(`[data-tab="${target}"]`)?.scrollTo?.({ top: 0 });
  }

  _filterPacks(html) {
    const root = html[0];
    if (!root) return;
    const query = String(root.querySelector('[name="packSearch"]')?.value ?? "").trim().toLocaleLowerCase();
    let shown = 0;
    for (const row of root.querySelectorAll("[data-pack-row]")) {
      const match = !query || String(row.dataset.search ?? "").includes(query);
      row.hidden = !match;
      if (match) shown += 1;
    }
    const shownLabel = root.querySelector("[data-pack-shown]");
    if (shownLabel) shownLabel.textContent = query ? `${shown} shown` : `${shown} available`;
    this._updatePackCount(html);
  }

  _updatePackCount(html) {
    const root = html[0];
    if (!root) return;
    const selected = root.querySelectorAll('input[name="compendium"]:checked').length;
    const count = root.querySelector("[data-pack-count]");
    if (count) count.textContent = String(selected);
    const warning = root.querySelector("[data-pack-empty-warning]");
    if (warning) warning.hidden = selected > 0 || root.querySelectorAll('input[name="compendium"]').length === 0;
  }

  _applyPackAction(html, action) {
    const root = html[0];
    if (!root) return;
    const inputs = [...root.querySelectorAll('input[name="compendium"]')];
    for (const input of inputs) {
      if (action === "all") input.checked = true;
      else if (action === "none") input.checked = false;
      else if (action === "defaults") input.checked = input.dataset.defaultPack === "true";
    }
    this._updatePackCount(html);
  }

  _refreshImagePreviews(html) {
    const root = html[0];
    if (!root) return;
    for (const preview of root.querySelectorAll("[data-image-preview]")) {
      const target = preview.dataset.imagePreview;
      const input = root.querySelector(`[name="${target}"]`);
      const fallback = preview.dataset.fallback ?? "";
      const next = String(input?.value ?? "").trim() || fallback;
      if (preview.getAttribute("src") !== next) preview.setAttribute("src", next);
    }
  }

  _syncDiscoveryState(html) {
    const root = html[0];
    if (!root) return;
    const enabled = root.querySelector('[name="discoveryEnabled"]')?.checked === true;
    const body = root.querySelector("[data-config-discovery-body]");
    body?.classList.toggle("is-disabled", !enabled);
    body?.querySelectorAll?.("input, select, button")?.forEach(control => { control.disabled = !enabled; });

    const skill = root.querySelector('[name="detectionSkill"]')?.value ?? "perception";
    const passive = root.querySelector('[name="passiveDiscovery"]');
    const passiveSupported = skill === "perception";
    const passiveEnabled = enabled && passiveSupported;
    if (passive) {
      passive.disabled = !passiveEnabled;
      // Turning the entire feature off should not erase the GM's previous
      // Passive Perception preference. Investigation itself cannot use it.
      if (!passiveSupported) passive.checked = false;
    }
    passive?.closest?.(".et-toggle-card")?.classList.toggle("is-disabled", !passiveEnabled);

    const dangerous = root.querySelector('[name="dangerousFailure"]')?.checked === true;
    const threshold = root.querySelector('[name="dangerousThreshold"]');
    const disarmDc = Math.max(1, Math.min(99, Math.trunc(Number(root.querySelector('[name="disarmDC"]')?.value) || 15)));
    const dangerousMax = Math.max(0, disarmDc - 1);
    if (threshold) {
      threshold.disabled = !enabled || !dangerous;
      threshold.max = String(dangerousMax);
      if (Number(threshold.value) > dangerousMax) threshold.value = String(dangerousMax);
    }

    const requireTools = root.querySelector('[name="requireRequiredItem"]');
    if (requireTools) requireTools.disabled = !enabled;

    const resetRequiredItem = root.querySelector('[data-action="reset-default-tool"]');
    const requiredItemCard = root.querySelector('[data-default-tool-card]');
    if (resetRequiredItem) resetRequiredItem.disabled = !enabled || requiredItemCard?.classList?.contains("is-default") === true;
  }

  async _onDefaultToolDrop(event, html) {
    event.preventDefault();
    event.currentTarget?.classList?.remove("is-dragover");
    let data;
    try { data = TextEditor.getDragEventData(event); }
    catch (_error) { data = null; }
    if (!data?.uuid) return ui.notifications.warn("Drop an Item from the sidebar or a compendium here.");
    let item = null;
    try { item = await fromUuid(data.uuid); }
    catch (_error) { item = null; }
    if (item?.documentName !== "Item") return ui.notifications.warn("Only Item documents can be used as the required item.");
    this._setDefaultTool(html, item);
    const checkbox = html[0]?.querySelector?.('[name="requireRequiredItem"]');
    if (checkbox) checkbox.checked = true;
    this._syncDiscoveryState(html);
    ui.notifications.info(`Default required item set to ${item.name}.`);
  }

  _setDefaultTool(html, item) {
    const root = html[0];
    if (!root) return;
    const identity = item?.documentName === "Item"
      ? itemRequirementIdentity(item)
      : (item?.uuid || item?.identifier || item?.name)
        ? {
            uuid: String(item.uuid ?? ""),
            name: String(item.name ?? "Required Item"),
            img: String(item.img ?? "icons/svg/item-bag.svg"),
            type: String(item.type ?? ""),
            identifier: String(item.identifier ?? ""),
            sourceUuid: String(item.sourceUuid ?? item.uuid ?? "")
          }
        : { ...THIEVES_TOOLS_2024_REQUIREMENT };
    const { uuid, name, img, type, identifier, sourceUuid } = identity;
    const uuidInput = root.querySelector('[name="requiredToolUuid"]');
    const nameInput = root.querySelector('[name="requiredToolName"]');
    const imgInput = root.querySelector('[name="requiredToolImg"]');
    const typeInput = root.querySelector('[name="requiredToolType"]');
    const identifierInput = root.querySelector('[name="requiredToolIdentifier"]');
    const sourceUuidInput = root.querySelector('[name="requiredToolSourceUuid"]');
    if (uuidInput) uuidInput.value = uuid;
    if (nameInput) nameInput.value = name;
    if (imgInput) imgInput.value = img;
    if (typeInput) typeInput.value = type;
    if (identifierInput) identifierInput.value = identifier;
    if (sourceUuidInput) sourceUuidInput.value = sourceUuid;
    const card = root.querySelector("[data-default-tool-card]");
    if (card) {
      card.classList.toggle("has-tool", Boolean(uuid));
      card.classList.toggle("is-default", identifier === THIEVES_TOOLS_2024_REQUIREMENT.identifier);
      const image = card.querySelector("img");
      if (image) { image.src = img || "icons/svg/item-bag.svg"; image.hidden = false; }
      const label = card.querySelector("[data-default-tool-name]");
      if (label) label.textContent = name || "Required Item";
      const drag = card.querySelector("[data-required-tool-drag]");
      if (drag) drag.dataset.uuid = uuid || "";
      const reset = card.querySelector('[data-action="reset-default-tool"]');
      if (reset) reset.disabled = identifier === THIEVES_TOOLS_2024_REQUIREMENT.identifier;
    }
    this._syncDiscoveryState(html);
  }

  async _browseImage(html, button) {
    const target = button.dataset.target;
    const input = html[0]?.querySelector?.(`[name="${target}"]`);
    if (!input) return;

    const FilePickerClass = foundry?.applications?.apps?.FilePicker?.implementation
      ?? foundry?.applications?.apps?.FilePicker
      ?? globalThis.FilePicker;
    if (!FilePickerClass) {
      ui.notifications.warn("Foundry's image browser is unavailable.");
      return;
    }

    const applyPath = path => {
      input.value = String(path ?? "").trim();
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
      this._refreshImagePreviews(html);
    };

    try {
      let picker;
      if (typeof FilePickerClass.fromButton === "function") {
        picker = FilePickerClass.fromButton(button);
        picker.field = input;
        picker.callback = applyPath;
      } else {
        picker = new FilePickerClass({
          type: "image",
          current: input.value,
          field: input,
          button,
          callback: applyPath
        });
      }
      await picker.render(true);
    } catch (error) {
      console.warn("easy-traps | Could not open Foundry image browser", error);
      ui.notifications.warn("The image browser could not be opened.");
    }
  }
}
