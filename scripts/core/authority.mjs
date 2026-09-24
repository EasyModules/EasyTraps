

export function activeGmUsers() {
  return Array.from(game.users ?? [])
    .filter(user => user?.active && user?.isGM)
    .sort((a, b) => String(a.id).localeCompare(String(b.id)));
}

export function primaryActiveGMUser() {
  return activeGmUsers()[0] ?? null;
}

export function isPrimaryGM() {
  if (!game.user?.isGM || !game.user?.active) return false;
  return primaryActiveGMUser()?.id === game.user.id;
}
