

export function hasChange(changes, path) {
  return Object.hasOwn(changes, path) || foundry.utils.hasProperty(changes, path);
}

export function changedValue(changes, path, fallback) {
  if (Object.hasOwn(changes, path)) return changes[path];
  return foundry.utils.hasProperty(changes, path) ? foundry.utils.getProperty(changes, path) : fallback;
}
