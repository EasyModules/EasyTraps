import { DEFAULT_FAVORITE_SPELL_NAMES, MODULE_ID, SETTINGS } from "./constants.mjs";
import { runtime } from "./runtime-state.mjs";
import { normalize } from "./text.mjs";
import { resolveSelectedSpellCompendiumIds } from "../spell-sources.mjs";

export async function loadSpellCatalog() {
  const availablePacks = await spellCompendiumPacks();
  const selectedIds = new Set(getSelectedCompendiumIds(availablePacks));
  const packs = availablePacks
    .filter(pack => selectedIds.has(pack.collection))
    .sort((a, b) => packPriority(a) - packPriority(b) || packLabel(a).localeCompare(packLabel(b)));
  const rows = [];
  const seen = new Set();

  for (const pack of packs) {
    let index;
    try {
      index = await pack.getIndex({ fields: ["name", "img", "system.level", "system.school", "type"] });
    } catch (error) {
      console.warn(`${MODULE_ID} | Could not index ${pack.collection}`, error);
      continue;
    }
    for (const entry of index) {
      if (entry.type !== "spell") continue;
      const uuid = entry.uuid ?? `Compendium.${pack.collection}.Item.${entry._id}`;
      if (seen.has(uuid)) continue;
      seen.add(uuid);
      rows.push({
        id: entry._id,
        uuid,
        name: entry.name,
        img: entry.img,
        level: Number(foundry.utils.getProperty(entry, "system.level")) || 0,
        school: String(foundry.utils.getProperty(entry, "system.school") ?? ""),
        source: packLabel(pack)
      });
    }
  }
  return rows.sort((a, b) => a.level - b.level || a.name.localeCompare(b.name) || a.source.localeCompare(b.source));
}

export function readFavoriteSpellSetting() {
  let setting;
  try { setting = game.settings.get(MODULE_ID, SETTINGS.FAVORITE_SPELLS); }
  catch (_error) { setting = null; }
  return {
    customized: setting?.customized === true,
    selected: Array.isArray(setting?.selected) ? [...new Set(setting.selected.filter(Boolean))] : []
  };
}

export function favoriteSpellSourcePriority(spell) {
  const uuid = String(spell?.uuid ?? "");
  if (uuid.startsWith("Compendium.dnd5e.spells24.")) return 0;
  if (uuid.startsWith("Compendium.dnd5e.spells.")) return 1;
  return 2;
}

export function defaultFavoriteSpellUuids(catalog = []) {
  const result = [];
  for (const name of DEFAULT_FAVORITE_SPELL_NAMES) {
    const normalizedName = normalize(name);
    const spell = catalog
      .filter(entry => normalize(entry.name) === normalizedName)
      .sort((a, b) => favoriteSpellSourcePriority(a) - favoriteSpellSourcePriority(b))[0];
    if (spell && !result.includes(spell.uuid)) result.push(spell.uuid);
  }
  return result;
}

export function getFavoriteSpellUuids(catalog = []) {
  const setting = readFavoriteSpellSetting();
  const selected = setting.customized ? setting.selected : defaultFavoriteSpellUuids(catalog);
  const available = new Set(catalog.map(spell => spell.uuid));
  return selected.filter(uuid => available.has(uuid));
}

export async function getFavoriteSpells() {
  const catalog = await loadSpellCatalog();
  const favoriteIds = new Set(getFavoriteSpellUuids(catalog));
  return catalog.filter(spell => favoriteIds.has(spell.uuid));
}

export async function toggleFavoriteSpell(spellUuid, catalog = []) {
  const setting = readFavoriteSpellSetting();
  const selected = new Set(setting.customized ? setting.selected : defaultFavoriteSpellUuids(catalog));
  if (selected.has(spellUuid)) selected.delete(spellUuid);
  else selected.add(spellUuid);
  await game.settings.set(MODULE_ID, SETTINGS.FAVORITE_SPELLS, {
    customized: true,
    selected: [...selected]
  });
  return getFavoriteSpellUuids(catalog);
}

export async function restoreDefaultFavoriteSpells() {
  await game.settings.set(MODULE_ID, SETTINGS.FAVORITE_SPELLS, { customized: false, selected: [] });
}

export function packPriority(pack) {
  if (pack.collection === "dnd5e.spells24") return 0;
  if (pack.collection === "dnd5e.spells") return 1;
  return 2;
}

export function packLabel(pack) {
  return String(pack.metadata?.label ?? pack.title ?? pack.collection ?? "Compendium");
}

export function itemCompendiumPacks() {
  return Array.from(game.packs)
    .filter(pack => pack.documentName === "Item" || pack.metadata?.type === "Item")
    .sort((a, b) => packPriority(a) - packPriority(b) || packLabel(a).localeCompare(packLabel(b)));
}

export async function spellCompendiumPacks({ refresh = false } = {}) {
  if (!refresh && runtime.spellPackCache) return runtime.spellPackCache;
  const task = (async () => {
    const result = [];
    for (const pack of itemCompendiumPacks()) {
      try {
        const index = await pack.getIndex({ fields: ["type"] });
        if (Array.from(index).some(entry => entry.type === "spell")) result.push(pack);
      } catch (error) {
        console.warn(`${MODULE_ID} | Could not inspect ${pack.collection}`, error);
      }
    }
    return result.sort((a, b) => packPriority(a) - packPriority(b) || packLabel(a).localeCompare(packLabel(b)));
  })();
  runtime.spellPackCache = task;
  try { return await task; }
  catch (error) {
    runtime.spellPackCache = null;
    throw error;
  }
}

export function getSelectedCompendiumIds(packs = []) {
  let setting;
  try { setting = game.settings.get(MODULE_ID, SETTINGS.SPELL_COMPENDIUMS); }
  catch (_error) { setting = null; }
  return resolveSelectedSpellCompendiumIds(packs, setting);
}

export async function getSelectedCompendiums() {
  const packs = await spellCompendiumPacks();
  const selected = new Set(getSelectedCompendiumIds(packs));
  return packs
    .filter(pack => selected.has(pack.collection))
    .map(pack => ({ id: pack.collection, label: packLabel(pack), package: pack.metadata?.packageName ?? pack.metadata?.package ?? "" }));
}

export async function resolveItemReference(uuid) {
  const id = String(uuid ?? "").trim();
  if (!id) return null;
  try {
    const document = await fromUuid(id);
    return document?.documentName === "Item" ? document : null;
  } catch (_error) {
    return null;
  }
}
