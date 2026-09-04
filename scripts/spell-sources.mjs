/**
 * Pure spell-compendium selection rules.
 *
 * v0.5.11 distinguishes an untouched/reset selection from an intentional empty
 * selection. Earlier builds used an empty array for both states, which made the
 * Configuration window's Clear action impossible to persist.
 */
export function defaultSpellCompendiumIds(packs = []) {
  const available = new Set(packs.map(pack => pack?.collection).filter(Boolean));
  const preferred = ["dnd5e.spells24", "dnd5e.spells"].filter(id => available.has(id));
  return preferred.length ? preferred : [...available];
}

export function resolveSelectedSpellCompendiumIds(packs = [], setting = null) {
  const available = new Set(packs.map(pack => pack?.collection).filter(Boolean));
  const saved = Array.isArray(setting) ? setting : setting?.selected;
  const selected = Array.isArray(saved)
    ? [...new Set(saved.filter(id => available.has(id)))]
    : [];

  if (setting?.configured === true) return selected;
  // Legacy settings had no `configured` bit. A non-empty legacy selection was
  // necessarily intentional; an empty one used the historical default-source
  // behavior and therefore continues to resolve to the standard defaults.
  if (selected.length) return selected;
  return defaultSpellCompendiumIds(packs);
}
