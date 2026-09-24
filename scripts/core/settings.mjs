import {
  DEFAULT_DISARM_AFTER_TRIGGER,
  DEFAULT_ORIGIN_TEXTURE,
  DEFAULT_PAUSE_ON_TRIGGER,
  DEFAULT_SPELL_ATTACK_BONUS,
  DEFAULT_SPELL_SAVE_DC,
  DEFAULT_TRIGGER_TEXTURE,
  MODULE_ID,
  SETTINGS
} from "./constants.mjs";
import { normalizeSpellAttackBonus, normalizeSpellSaveDc } from "./trap-model.mjs";
import { DEFAULT_DISCOVERY_CONFIG, normalizeDiscoveryConfig } from "../discovery.mjs";

export function configuredImageSetting(key, fallback) {
  try {
    const value = String(game.settings.get(MODULE_ID, key) ?? "").trim();
    return value || fallback;
  } catch (_error) {
    return fallback;
  }
}

export function configuredTriggerTexture() {
  return configuredImageSetting(SETTINGS.TRIGGER_TEXTURE, DEFAULT_TRIGGER_TEXTURE);
}

export function configuredOriginTexture() {
  return configuredImageSetting(SETTINGS.ORIGIN_TEXTURE, DEFAULT_ORIGIN_TEXTURE);
}

export function getDiscoveryDefaults() {
  try { return normalizeDiscoveryConfig(game.settings.get(MODULE_ID, SETTINGS.DISCOVERY_DEFAULTS)); }
  catch (_error) { return normalizeDiscoveryConfig(DEFAULT_DISCOVERY_CONFIG); }
}

export function getCreationDefaults() {
  let spellSaveDc = DEFAULT_SPELL_SAVE_DC;
  let spellAttackBonus = DEFAULT_SPELL_ATTACK_BONUS;
  let pauseOnTrigger = DEFAULT_PAUSE_ON_TRIGGER;
  let disarmAfterTrigger = DEFAULT_DISARM_AFTER_TRIGGER;
  let discovery = normalizeDiscoveryConfig(DEFAULT_DISCOVERY_CONFIG);
  try { spellSaveDc = normalizeSpellSaveDc(game.settings.get(MODULE_ID, SETTINGS.LAST_SPELL_SAVE_DC)); }
  catch (_error) { /* setting may not be registered during early initialization */ }
  try { spellAttackBonus = normalizeSpellAttackBonus(game.settings.get(MODULE_ID, SETTINGS.LAST_SPELL_ATTACK_BONUS)); }
  catch (_error) { /* setting may not be registered during early initialization */ }
  try { pauseOnTrigger = Boolean(game.settings.get(MODULE_ID, SETTINGS.DEFAULT_PAUSE_ON_TRIGGER)); }
  catch (_error) { /* setting may not be registered during early initialization */ }
  try { disarmAfterTrigger = Boolean(game.settings.get(MODULE_ID, SETTINGS.DEFAULT_DISARM_AFTER_TRIGGER)); }
  catch (_error) { /* setting may not be registered during early initialization */ }
  try { discovery = getDiscoveryDefaults(); }
  catch (_error) { /* setting may not be registered during early initialization */ }
  return {
    spellSaveDc,
    spellAttackBonus,
    pauseOnTrigger,
    disarmAfterTrigger,
    discovery,
    triggerTexture: configuredTriggerTexture(),
    originTexture: configuredOriginTexture()
  };
}

export async function rememberCreationDefaults(selection = {}) {
  const spellSaveDc = normalizeSpellSaveDc(selection.spellSaveDc);
  const spellAttackBonus = normalizeSpellAttackBonus(selection.spellAttackBonus);
  const tasks = [];
  try {
    if (game.settings.get(MODULE_ID, SETTINGS.LAST_SPELL_SAVE_DC) !== spellSaveDc) {
      tasks.push(game.settings.set(MODULE_ID, SETTINGS.LAST_SPELL_SAVE_DC, spellSaveDc));
    }
  } catch (_error) { /* no registered setting */ }
  try {
    if (game.settings.get(MODULE_ID, SETTINGS.LAST_SPELL_ATTACK_BONUS) !== spellAttackBonus) {
      tasks.push(game.settings.set(MODULE_ID, SETTINGS.LAST_SPELL_ATTACK_BONUS, spellAttackBonus));
    }
  } catch (_error) { /* no registered setting */ }
  if (tasks.length) await Promise.all(tasks);
}
