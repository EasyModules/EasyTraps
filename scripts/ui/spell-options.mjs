import { AREA_MODES, TARGETING_PROFILES, TARGET_MODES } from "../core/constants.mjs";
import { escapeHtml } from "../core/text.mjs";
import { normalizeTargetMode } from "../core/trap-model.mjs";
import { clampCellCount } from "../grid-trigger.mjs";
import {
  activityHasPromptedTemplate,
  activityLabel,
  activityNeedsNativeConfiguration,
  activitySelectionErrorMessage,
  classifyTargetingProfile,
  plainData,
  resolveEffectiveTarget,
  templateSuppliesCreatureTargets,
  usableActivityList
} from "../integrations/dnd5e-activities.mjs";

export function activityChoiceDetails(activity) {
  const type = String(activity?.type ?? "activity");
  const activation = String(activity?.activation?.type ?? "").trim();
  const target = plainData(activity?.target);
  const targetType = String(target?.template?.type ?? target?.affects?.type ?? "").trim();
  return [type, activation && activation !== "none" ? activation : null, targetType || null]
    .filter(Boolean)
    .join(" · ");
}

export async function chooseSpellActivity(spell, activities) {
  if (!Array.isArray(activities) || !activities.length) return null;
  if (activities.length === 1) return activities[0];
  if (!globalThis.Dialog) return null;
  const rows = activities.map((activity, index) => `<label class="et-choice-option">
    <input type="radio" name="activityId" value="${escapeHtml(activity.id)}" ${index === 0 ? "checked" : ""}>
    <span><b>${escapeHtml(activityLabel(activity))}</b><small>${escapeHtml(activityChoiceDetails(activity) || "D&D5e Activity")}</small></span>
  </label>`).join("");
  return new Promise(resolve => {
    let settled = false;
    const finish = value => { if (!settled) { settled = true; resolve(value ?? null); } };
    const dialog = new Dialog({
      title: `${spell.name} — choose Activity`,
      content: `<form class="easy-traps-context"><div class="et-note"><i class="fa-solid fa-list-check"></i><span><b>${escapeHtml(spell.name)} has ${activities.length} usable Activities</b><small>Choose the exact native Activity this trap should use. EasyTraps will still execute the original spell Item through D&D5e.</small></span></div><fieldset class="et-choice-fieldset"><legend>Activity</legend>${rows}</fieldset></form>`,
      buttons: {
        cancel: { label: "Cancel", callback: () => finish(null) },
        continue: { label: "Continue", callback: html => {
          const root = html?.[0] ?? html;
          const id = root?.querySelector?.("input[name='activityId']:checked")?.value;
          finish(activities.find(activity => activity.id === id) ?? null);
        } }
      },
      default: "continue",
      close: () => finish(null)
    }, { width: 540 });
    dialog.render(true);
  });
}

export async function chooseDirectTargetPolicy(spell) {
  if (!globalThis.Dialog) return { targetMode: TARGET_MODES.TRIGGERING_TOKEN, selectionZoneWidth: 1, selectionZoneHeight: 1 };
  return new Promise(resolve => {
    let settled = false;
    const finish = value => { if (!settled) { settled = true; resolve(value ?? null); } };
    const dialog = new Dialog({
      title: `${spell.name} — target selection`,
      content: `<form class="easy-traps-context et-target-policy">
        <div class="et-target-policy-heading">
          <span class="et-target-policy-icon"><i class="fa-solid fa-crosshairs"></i></span>
          <span><small>Targeting</small><b>How should this trap choose creatures?</b><em>${escapeHtml(spell.name)} needs one or more creature targets.</em></span>
        </div>
        <div class="et-target-policy-options" role="radiogroup" aria-label="Trap target mode">
          <label class="et-target-policy-option">
            <input type="radio" name="targetMode" value="${TARGET_MODES.TRIGGERING_TOKEN}" checked>
            <span><i class="fa-solid fa-person-walking-arrow-right"></i><span><b>Triggering creature</b><small>Target only the creature that activates the trap.</small></span><i class="fa-solid fa-circle-check et-target-policy-check"></i></span>
          </label>
          <label class="et-target-policy-option">
            <input type="radio" name="targetMode" value="${TARGET_MODES.CUSTOM_ZONE}">
            <span><i class="fa-solid fa-vector-square"></i><span><b>Creatures in a zone</b><small>Place a rectangular zone and target every creature currently inside it.</small></span><i class="fa-solid fa-circle-check et-target-policy-check"></i></span>
          </label>
        </div>
        <section class="et-target-zone-settings" data-target-zone-settings hidden>
          <header><span><b>Target zone size</b><small>You will place this zone on the scene after Continue.</small></span></header>
          <div class="et-target-zone-grid">
            <label><span>Width</span><div class="et-number-suffix"><input type="number" name="zoneWidth" min="1" max="20" step="1" value="1"><b>cells</b></div></label>
            <label><span>Height</span><div class="et-number-suffix"><input type="number" name="zoneHeight" min="1" max="20" step="1" value="1"><b>cells</b></div></label>
          </div>
        </section>
      </form>`,
      buttons: {
        cancel: { label: "Cancel", callback: () => finish(null) },
        continue: { label: "Continue", callback: html => {
          const root = html?.[0] ?? html;
          const mode = normalizeTargetMode(root?.querySelector?.("input[name='targetMode']:checked")?.value);
          finish({
            targetMode: mode,
            selectionZoneWidth: clampCellCount(root?.querySelector?.("input[name='zoneWidth']")?.value),
            selectionZoneHeight: clampCellCount(root?.querySelector?.("input[name='zoneHeight']")?.value)
          });
        } }
      },
      default: "continue",
      render: html => {
        const root = html?.[0] ?? html;
        const zone = root?.querySelector?.("[data-target-zone-settings]");
        const sync = () => {
          const mode = normalizeTargetMode(root?.querySelector?.("input[name='targetMode']:checked")?.value);
          const showZone = mode === TARGET_MODES.CUSTOM_ZONE;
          if (zone) zone.hidden = !showZone;
          for (const input of zone?.querySelectorAll?.("input") ?? []) input.disabled = !showZone;
        };
        root?.querySelectorAll?.("input[name='targetMode']")?.forEach(input => input.addEventListener("change", sync));
        sync();
      },
      close: () => finish(null)
    }, { width: 600, resizable: false });
    dialog.render(true);
  });
}

export async function analyzeSpellAfterPlaceClick(spell) {
  const activities = usableActivityList(spell);
  if (!activities.length) {
    ui.notifications.warn(activitySelectionErrorMessage(spell, { reason: "missing-activity", activityCount: 0 }));
    return null;
  }
  const activity = await chooseSpellActivity(spell, activities);
  if (!activity) return null;
  const effectiveTarget = resolveEffectiveTarget(spell, activity);
  const targetingProfile = classifyTargetingProfile(effectiveTarget, activity);
  const promptedTemplate = activityHasPromptedTemplate(activity, spell, effectiveTarget);
  const plan = {
    activityId: activity.id,
    activityLabel: activityLabel(activity),
    activityType: String(activity.type ?? "activity"),
    activityCount: activities.length,
    effectiveTarget,
    targetingProfile,
    targetMode: TARGET_MODES.NONE,
    areaMode: AREA_MODES.NONE,
    selectionZoneWidth: 1,
    selectionZoneHeight: 1,
    requiresNativeInteraction: activityNeedsNativeConfiguration(activity, targetingProfile),
    sourceModifiedTime: Number(spell?._stats?.modifiedTime ?? spell?.toObject?.()?._stats?.modifiedTime) || null
  };
  if (promptedTemplate) {
    plan.areaMode = AREA_MODES.PREPLACED;
    plan.targetMode = templateSuppliesCreatureTargets(effectiveTarget) ? TARGET_MODES.SPELL_AREA : TARGET_MODES.NONE;
  } else if (targetingProfile === TARGETING_PROFILES.DIRECT) {
    const targetPolicy = await chooseDirectTargetPolicy(spell);
    if (!targetPolicy) return null;
    Object.assign(plan, targetPolicy);
  }
  return plan;
}
