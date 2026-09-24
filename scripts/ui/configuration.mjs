import { openEasyTrapsConfiguration } from "../config.mjs";
import {
  DEFAULT_DISARM_AFTER_TRIGGER,
  DEFAULT_ORIGIN_TEXTURE,
  DEFAULT_PAUSE_ON_TRIGGER,
  DEFAULT_SPELL_ATTACK_BONUS,
  DEFAULT_SPELL_SAVE_DC,
  DEFAULT_TRIGGER_TEXTURE,
  MODULE_ID,
  SETTINGS,
  VERSION
} from "../core/constants.mjs";
import { runtime } from "../core/runtime-state.mjs";
import { getCreationDefaults } from "../core/settings.mjs";
import {
  getSelectedCompendiumIds,
  packLabel,
  restoreDefaultFavoriteSpells,
  spellCompendiumPacks
} from "../core/spell-catalog.mjs";
import { normalize } from "../core/text.mjs";
import { normalizeSpellAttackBonus, normalizeSpellSaveDc } from "../core/trap-model.mjs";
import { DEFAULT_DISCOVERY_CONFIG, normalizeDiscoveryConfig } from "../discovery.mjs";
import { defaultSpellCompendiumIds } from "../spell-sources.mjs";
import { formatSignedModifier } from "./format.mjs";

export async function loadConfigurationData() {
  const packs = await spellCompendiumPacks();
  const selectedIds = new Set(getSelectedCompendiumIds(packs));
  const defaultIds = new Set(defaultSpellCompendiumIds(packs));
  const defaults = getCreationDefaults();
  return {
    version: VERSION,
    packCount: packs.length,
    hasSpellPacks: packs.length > 0,
    selectedPackCount: packs.filter(pack => selectedIds.has(pack.collection)).length,
    noSelectedSpellPacks: packs.length > 0 && !packs.some(pack => selectedIds.has(pack.collection)),
    packs: packs.map(pack => {
      const id = pack.collection;
      const label = packLabel(pack);
      const packageLabel = String(pack.metadata?.packageName ?? pack.metadata?.package ?? pack.metadata?.packageType ?? "");
      return {
        id,
        label,
        packageLabel,
        selected: selectedIds.has(id),
        isDefault: defaultIds.has(id),
        search: normalize(`${label} ${id} ${packageLabel}`)
      };
    }),
    spellSaveDc: normalizeSpellSaveDc(defaults.spellSaveDc),
    spellAttackBonus: formatSignedModifier(defaults.spellAttackBonus),
    pauseOnTrigger: Boolean(defaults.pauseOnTrigger),
    disarmAfterTrigger: Boolean(defaults.disarmAfterTrigger),
    discovery: normalizeDiscoveryConfig(defaults.discovery),
    triggerTexture: defaults.triggerTexture || DEFAULT_TRIGGER_TEXTURE,
    originTexture: defaults.originTexture || DEFAULT_ORIGIN_TEXTURE,
    defaultTriggerTexture: DEFAULT_TRIGGER_TEXTURE,
    defaultOriginTexture: DEFAULT_ORIGIN_TEXTURE
  };
}

export async function saveConfigurationData(values = {}) {
  const availablePacks = await spellCompendiumPacks();
  const availableIds = new Set(availablePacks.map(pack => pack.collection));
  const compendiums = Array.isArray(values.compendiums)
    ? [...new Set(values.compendiums.filter(id => availableIds.has(id)))]
    : [];

  const spellSaveDc = normalizeSpellSaveDc(values.spellSaveDc);
  const spellAttackBonus = normalizeSpellAttackBonus(values.spellAttackBonus);
  const triggerTexture = String(values.triggerTexture ?? "").trim() || DEFAULT_TRIGGER_TEXTURE;
  const originTexture = String(values.originTexture ?? "").trim() || DEFAULT_ORIGIN_TEXTURE;
  const discovery = normalizeDiscoveryConfig(values.discovery ?? DEFAULT_DISCOVERY_CONFIG);

  const settingWrites = [
    game.settings.set(MODULE_ID, SETTINGS.LAST_SPELL_SAVE_DC, spellSaveDc),
    game.settings.set(MODULE_ID, SETTINGS.LAST_SPELL_ATTACK_BONUS, spellAttackBonus),
    game.settings.set(MODULE_ID, SETTINGS.DEFAULT_PAUSE_ON_TRIGGER, Boolean(values.pauseOnTrigger)),
    game.settings.set(MODULE_ID, SETTINGS.DEFAULT_DISARM_AFTER_TRIGGER, Boolean(values.disarmAfterTrigger)),
    game.settings.set(MODULE_ID, SETTINGS.DISCOVERY_DEFAULTS, discovery),
    game.settings.set(MODULE_ID, SETTINGS.TRIGGER_TEXTURE, triggerTexture),
    game.settings.set(MODULE_ID, SETTINGS.ORIGIN_TEXTURE, originTexture)
  ];
  // If no spell packs exist, the Spell Sources tab has no controls. Saving an
  // unrelated setting must not silently convert the world into an intentional
  // "no sources" configuration. When packs are present, an empty selection is
  // deliberate and is persisted normally.
  if (values.spellSourcesEditable !== false) {
    settingWrites.unshift(game.settings.set(MODULE_ID, SETTINGS.SPELL_COMPENDIUMS, { configured: true, selected: compendiums }));
  }
  await Promise.all(settingWrites);
  runtime.spellPackCache = null;
  return true;
}

export function configurationServices() {
  return {
    load: loadConfigurationData,
    save: saveConfigurationData,
    reset: () => resetSettings({ notify: false })
  };
}

export async function openConfiguration() {
  if (!game.user?.isGM) return ui.notifications.warn("Only a GM can configure EasyTraps.");
  return openEasyTrapsConfiguration(configurationServices());
}

export async function resetSettings({ notify = true } = {}) {
  if (!game.user?.isGM) return ui.notifications.warn("Only a GM can restore settings.");
  await Promise.all([
    game.settings.set(MODULE_ID, SETTINGS.SPELL_COMPENDIUMS, { configured: false, selected: [] }),
    game.settings.set(MODULE_ID, SETTINGS.LAST_SPELL_SAVE_DC, DEFAULT_SPELL_SAVE_DC),
    game.settings.set(MODULE_ID, SETTINGS.LAST_SPELL_ATTACK_BONUS, DEFAULT_SPELL_ATTACK_BONUS),
    game.settings.set(MODULE_ID, SETTINGS.DEFAULT_PAUSE_ON_TRIGGER, DEFAULT_PAUSE_ON_TRIGGER),
    game.settings.set(MODULE_ID, SETTINGS.DEFAULT_DISARM_AFTER_TRIGGER, DEFAULT_DISARM_AFTER_TRIGGER),
    game.settings.set(MODULE_ID, SETTINGS.DISCOVERY_DEFAULTS, foundry.utils.deepClone(DEFAULT_DISCOVERY_CONFIG)),
    game.settings.set(MODULE_ID, SETTINGS.TRIGGER_TEXTURE, DEFAULT_TRIGGER_TEXTURE),
    game.settings.set(MODULE_ID, SETTINGS.ORIGIN_TEXTURE, DEFAULT_ORIGIN_TEXTURE)
  ]);
  await restoreDefaultFavoriteSpells();
  runtime.spellPackCache = null;
  if (notify) ui.notifications.info("Factory defaults restored.");
  return true;
}
