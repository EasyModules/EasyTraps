import { MODULE_ID, SETTINGS } from "./constants.mjs";
import {
  DEFAULT_DISCOVERY_CONFIG,
  isUnmodifiedV036DiscoveryDefaults,
  isUnmodifiedV040DiscoveryDefaults,
  isUnmodifiedV041DiscoveryDefaults,
  isUnmodifiedV043DiscoveryDefaults,
  migrateDiscoveryConfig,
  normalizeDiscoveryConfig
} from "../discovery.mjs";

export async function migrateDiscoveryDefaultsSetting() {
  let raw;
  try { raw = game.settings.get(MODULE_ID, SETTINGS.DISCOVERY_DEFAULTS); }
  catch (_error) { return; }

  const retiredToolProficiencyGate = Boolean(raw?.disarm && Object.hasOwn(raw.disarm, "requireToolProficiency"));
  const legacyDraft = Boolean(raw?.detection && Object.hasOwn(raw.detection, "requireProficiency"))
    || Boolean(raw?.disarm && !Object.hasOwn(raw.disarm, "naturalOneTriggers"))
    || Boolean(raw?.disarm && !Object.hasOwn(raw.disarm, "alwaysDisarmOnCritical"));
  if (retiredToolProficiencyGate) {
    await game.settings.set(MODULE_ID, SETTINGS.DISCOVERY_DEFAULTS, normalizeDiscoveryConfig(raw));
    return;
  }
  if (legacyDraft) {
    const migrated = migrateDiscoveryConfig(raw, { fromSchema: 23 });
    await game.settings.set(
      MODULE_ID,
      SETTINGS.DISCOVERY_DEFAULTS,
      isUnmodifiedV036DiscoveryDefaults(migrated)
        ? foundry.utils.deepClone(DEFAULT_DISCOVERY_CONFIG)
        : migrated
    );
    return;
  }

  // Move untouched historical factory defaults to the current rules-facing
  // baseline without overwriting a GM's customized defaults.
  if (isUnmodifiedV036DiscoveryDefaults(raw) || isUnmodifiedV040DiscoveryDefaults(raw) || isUnmodifiedV041DiscoveryDefaults(raw) || isUnmodifiedV043DiscoveryDefaults(raw)) {
    await game.settings.set(MODULE_ID, SETTINGS.DISCOVERY_DEFAULTS, foundry.utils.deepClone(DEFAULT_DISCOVERY_CONFIG));
  }
}
