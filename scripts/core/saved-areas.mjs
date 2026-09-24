import {
  nativeGeometryForCurrentScene,
  normalizedTemplateSnapshot,
  templateSnapshotWorldState
} from "./template-snapshots.mjs";
import { resolveEffectiveTarget } from "../integrations/dnd5e-activities.mjs";
import { canonicalTemplateDataList } from "../integrations/dnd5e-templates.mjs";

export function savedAreaWorldStates(trap, referencePoint, activity = null) {
  const snapshots = Array.isArray(trap?.templates) ? trap.templates : [];
  const effectiveTarget = activity ? resolveEffectiveTarget(activity.item, activity) : trap?.effectiveTarget;
  const canonical = canonicalTemplateDataList(activity, effectiveTarget);
  return snapshots.map((rawSnapshot, index) => {
    const snapshot = normalizedTemplateSnapshot(rawSnapshot, referencePoint);
    const placement = templateSnapshotWorldState(snapshot, referencePoint);
    const data = foundry.utils.deepClone(canonical[index] ?? snapshot.data ?? {});
    data.direction = Number(placement.direction) || 0;
    if (Number.isFinite(Number(placement.angle)) && Object.hasOwn(data, "angle")) data.angle = Number(placement.angle);
    return {
      ...data,
      binding: snapshot.binding,
      nativeGeometry: nativeGeometryForCurrentScene(snapshot, data, canvas.scene),
      x: Number(placement.x),
      y: Number(placement.y),
      elevation: Number(placement.elevation) || 0
    };
  });
}
