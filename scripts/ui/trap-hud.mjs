import { refreshOpenSceneTrapManager, refreshTriggerOverlays } from "../core/presentation.mjs";
import { originData, trapData, trapIsDiscovered } from "../core/trap-model.mjs";
import { setTrapDiscovered, setTrapEnabled, trapArmBlockReason, trapCanArm } from "../core/trap-state.mjs";
import { normalizeDiscoveryConfig } from "../discovery.mjs";
import { openAdvancedSettingsForTile, openTrapQuickEditor } from "./scene-manager.mjs";

export function removeOriginalTileImageHudAction(root) {
  if (!root?.querySelectorAll) return;
  for (const element of root.querySelectorAll(".control-icon, [title], [data-tooltip], [aria-label]")) {
    const label = [element.getAttribute("title"), element.getAttribute("data-tooltip"), element.getAttribute("aria-label"), element.textContent].filter(Boolean).join(" ");
    if (/(original.*(image|object|tile)|(image|object|tile).*original)/i.test(label)) (element.closest(".control-icon") ?? element).remove();
  }
}

export function removeNativeTileVisibilityHudAction(root) {
  if (!root?.querySelectorAll) return;
  const candidates = root.querySelectorAll(".control-icon, [data-action], [data-control], [title], [data-tooltip], [aria-label]");
  for (const element of candidates) {
    if (element.closest?.("[data-easy-traps-hud-controls]")) continue;
    const action = String(element.getAttribute?.("data-action") ?? element.getAttribute?.("data-control") ?? "").toLowerCase();
    const label = [
      element.getAttribute?.("title"),
      element.getAttribute?.("data-tooltip"),
      element.getAttribute?.("aria-label"),
      element.textContent
    ].filter(Boolean).join(" ");
    const icon = element.querySelector?.("i");
    const eyeIcon = Boolean(icon?.classList?.contains("fa-eye") || icon?.classList?.contains("fa-eye-slash"));
    const visibilityAction = ["visibility", "hidden", "togglevisibility", "toggle-visibility"].includes(action);
    const visibilityLabel = /(visibility|visible|hidden|show|hide)/i.test(label);
    if (visibilityAction || (eyeIcon && visibilityLabel)) {
      (element.closest?.(".control-icon") ?? element).remove();
      return;
    }
  }
}

export function htmlRoot(root) {
  if (root instanceof HTMLElement) return root;
  if (root?.[0] instanceof HTMLElement) return root[0];
  if (root?.element instanceof HTMLElement) return root.element;
  if (root?.element?.[0] instanceof HTMLElement) return root.element[0];
  return null;
}

export function renderTrapTileHud(hud, html) {
  if (!game.user?.isGM) return;
  const tile = hud?.object?.document ?? hud?.object;
  const trap = trapData(tile);
  const origin = originData(tile);
  if (!trap && !origin) return;
  const root = htmlRoot(html) ?? html?.[0] ?? html;
  if (!root?.querySelector) return;

  // Keep trap visuals in EasyTraps Configuration instead of exposing MATT's
  // original-image shortcut on either trigger or separate-origin Tile HUDs.
  // Run once immediately and once after the current render cycle so later HUD
  // hooks are covered.
  removeOriginalTileImageHudAction(root);
  removeNativeTileVisibilityHudAction(root);
  queueMicrotask(() => {
    removeOriginalTileImageHudAction(root);
    removeNativeTileVisibilityHudAction(root);
  });

  // Origin Tiles only need the MATT visual shortcut removed. Armed/Advanced
  // controls belong exclusively to the trigger Tile.
  if (!trap) return;
  if (root.querySelector("[data-easy-traps-hud-controls]")) return;
  const column = root.querySelector(".col.right") ?? root.querySelector(".col.left") ?? root;
  const controls = document.createElement("div");
  controls.className = "easy-traps-hud-controls";
  controls.dataset.easyTrapsHudControls = "true";

  const discovered = trapIsDiscovered(tile, trap);
  const visibilityControl = document.createElement("div");
  visibilityControl.className = `control-icon easy-traps-hud-visibility ${discovered ? "is-discovered" : "is-hidden"}`;
  visibilityControl.dataset.easyTrapsHudToggle = "visibility";
  visibilityControl.title = discovered ? "Hide trap from players" : "Reveal trap to players";
  visibilityControl.setAttribute("aria-label", visibilityControl.title);
  visibilityControl.dataset.tooltip = visibilityControl.title;
  visibilityControl.innerHTML = `<i class="fa-solid ${discovered ? "fa-eye" : "fa-eye-slash"}"></i>`;
  visibilityControl.addEventListener("click", async event => {
    event.preventDefault();
    event.stopPropagation();
    const current = trapData(tile);
    if (!current) return;
    await setTrapDiscovered(tile, !trapIsDiscovered(tile, current));
    try { hud?.render?.(); } catch (_error) { /* HUD refresh is best effort */ }
  });

  const armed = trap.armed !== false && !trap.requiresReconfiguration;
  const armedControl = document.createElement("div");
  armedControl.className = `control-icon easy-traps-hud-toggle ${armed ? "is-armed" : "is-disarmed"}`;
  armedControl.dataset.easyTrapsHudToggle = "armed";
  armedControl.title = trap.requiresReconfiguration ? "This trap must be recreated" : armed ? "Disarm trap" : "Rearm trap";
  armedControl.setAttribute("aria-label", armedControl.title);
  armedControl.dataset.tooltip = armedControl.title;
  armedControl.innerHTML = `<i class="fa-solid ${armed ? "fa-shield-halved" : "fa-rotate-right"}"></i>`;
  if (trap.requiresReconfiguration || (!armed && !trapCanArm(tile, trap))) armedControl.classList.add("disabled");
  armedControl.addEventListener("click", async event => {
    event.preventDefault();
    event.stopPropagation();
    if (armedControl.classList.contains("disabled")) return;
    const current = trapData(tile);
    const next = current?.armed === false;
    if (next && !trapCanArm(tile, current)) return ui.notifications.warn(trapArmBlockReason(tile, current) ?? "This trap cannot be rearmed.");
    await setTrapEnabled(tile, next);
    try { hud?.render?.(); } catch (_error) { /* HUD refresh is best effort */ }
    refreshTriggerOverlays();
    refreshOpenSceneTrapManager();
  });

  const editControl = document.createElement("div");
  editControl.className = "control-icon easy-traps-hud-edit";
  editControl.dataset.easyTrapsHudToggle = "edit";
  editControl.title = "Edit trap";
  editControl.setAttribute("aria-label", editControl.title);
  editControl.dataset.tooltip = editControl.title;
  editControl.innerHTML = '<i class="fa-solid fa-pen-to-square"></i>';
  editControl.addEventListener("click", event => {
    event.preventDefault();
    event.stopPropagation();
    openTrapQuickEditor(tile);
  });

  const advancedControl = document.createElement("div");
  advancedControl.className = `control-icon easy-traps-hud-advanced ${normalizeDiscoveryConfig(trap.discovery).enabled ? "is-enabled" : ""}`;
  advancedControl.dataset.easyTrapsHudToggle = "advanced";
  advancedControl.title = "Discovery & disarming settings";
  advancedControl.setAttribute("aria-label", advancedControl.title);
  advancedControl.dataset.tooltip = advancedControl.title;
  advancedControl.innerHTML = '<i class="fa-solid fa-sliders"></i>';
  advancedControl.addEventListener("click", event => {
    event.preventDefault();
    event.stopPropagation();
    openAdvancedSettingsForTile(tile);
  });

  // Keep EasyTraps controls together and ordered by intent: edit/configuration
  // first, then visibility/state toggles. Native Foundry/MATT controls remain
  // untouched above this group.
  controls.append(editControl, advancedControl, visibilityControl, armedControl);
  column.append(controls);
}
