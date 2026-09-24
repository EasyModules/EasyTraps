import { sceneDistanceUnits, sceneGeometry } from "./canvas-geometry.mjs";
import { MODULE_ID, TEMPLATE_BINDINGS } from "./constants.mjs";
import { geometryFromTemplateData } from "./geometry-shapes.mjs";
import { convertLengthUnits } from "../integrations/dnd5e-units.mjs";

export function templateSnapshotWorldState(snapshot, referencePoint) {
  const linked = snapshot.binding === TEMPLATE_BINDINGS.ORIGIN_LINKED;
  return {
    ...snapshot.data,
    binding: snapshot.binding,
    x: linked ? Number(referencePoint.x) + Number(snapshot.offsetX || 0) : Number(snapshot.x),
    y: linked ? Number(referencePoint.y) + Number(snapshot.offsetY || 0) : Number(snapshot.y),
    elevation: linked
      ? Number(referencePoint.elevation || 0) + Number(snapshot.elevationOffset || 0)
      : Number(snapshot.elevation || 0)
  };
}

export function serializePlacedTemplateGeometry(document) {
  const object = document?.object
    ?? canvas?.templates?.get?.(document?.id)
    ?? canvas?.templates?.placeables?.find?.(entry => entry?.document?.id === document?.id)
    ?? null;
  let shape = object?.shape ?? object?._shape ?? object?.template?.shape ?? null;
  if (!shape && object?._computeShape instanceof Function) {
    try { shape = object._computeShape(); }
    catch (_error) { /* fall through to canonical geometry */ }
  }
  if (!shape) return null;
  const origin = { x: Number(document?.x) || 0, y: Number(document?.y) || 0 };
  return serializeCanvasShape(shape, origin);
}

export function serializeCanvasShape(shape, documentOrigin) {
  const rawPoints = shape?.points;
  if (rawPoints && typeof rawPoints[Symbol.iterator] === "function") {
    const values = Array.from(rawPoints, Number).filter(Number.isFinite);
    if (values.length >= 6 && values.length % 2 === 0) {
      const points = [];
      for (let index = 0; index < values.length; index += 2) points.push({ x: values[index], y: values[index + 1] });
      return { version: 1, space: "local", type: "polygon", points: normalizeShapePointsToLocal(points, documentOrigin) };
    }
  }

  const shapeName = String(shape?.constructor?.name ?? "").toLowerCase();
  if (shapeName.includes("ellipse")) {
    const center = normalizeShapePointsToLocal([{ x: Number(shape?.x) || 0, y: Number(shape?.y) || 0 }], documentOrigin)[0];
    const radiusX = Math.max(0, Number(shape?.halfWidth ?? shape?.radiusX ?? shape?.width / 2) || 0);
    const radiusY = Math.max(0, Number(shape?.halfHeight ?? shape?.radiusY ?? shape?.height / 2) || 0);
    if (radiusX && radiusY) {
      const points = [];
      for (let index = 0; index < 48; index += 1) {
        const angle = index * Math.PI * 2 / 48;
        points.push({ x: center.x + Math.cos(angle) * radiusX, y: center.y + Math.sin(angle) * radiusY });
      }
      return { version: 1, space: "local", type: "polygon", points };
    }
  }

  const radius = Number(shape?.radius);
  if (Number.isFinite(radius) && radius >= 0) {
    const [center] = normalizeShapePointsToLocal([{ x: Number(shape?.x) || 0, y: Number(shape?.y) || 0 }], documentOrigin);
    return { version: 1, space: "local", type: "circle", x: center.x, y: center.y, radius };
  }

  const width = Number(shape?.width);
  const height = Number(shape?.height);
  if (Number.isFinite(width) && Number.isFinite(height) && width >= 0 && height >= 0) {
    const [topLeft] = normalizeShapePointsToLocal([{ x: Number(shape?.x) || 0, y: Number(shape?.y) || 0 }], documentOrigin);
    return { version: 1, space: "local", type: "rect", x: topLeft.x, y: topLeft.y, width, height };
  }

  return null;
}

export function normalizeShapePointsToLocal(points, documentOrigin) {
  const clean = points.map(point => ({ x: Number(point.x) || 0, y: Number(point.y) || 0 }));
  if (!clean.length) return clean;
  const origin = { x: Number(documentOrigin?.x) || 0, y: Number(documentOrigin?.y) || 0 };
  const distanceToZero = Math.min(...clean.map(point => Math.hypot(point.x, point.y)));
  const distanceToDocument = Math.min(...clean.map(point => Math.hypot(point.x - origin.x, point.y - origin.y)));
  const tolerance = Math.max(2, (Number(canvas?.dimensions?.size) || 100) * 0.25);
  // Foundry template shapes are normally local. Only translate when the shape is
  // clearly expressed in scene coordinates, which some integrations may expose.
  if (distanceToDocument + tolerance < distanceToZero) {
    return clean.map(point => ({ x: point.x - origin.x, y: point.y - origin.y }));
  }
  return clean;
}

export function templateMeasurementMetadata(scene = canvas.scene) {
  return {
    version: 1,
    sceneUnits: sceneDistanceUnits(scene),
    gridDistance: Number(scene?.grid?.distance) || 5,
    gridSize: Number(scene?.grid?.size) || Number(canvas?.grid?.size) || 100
  };
}

export function scaleSerializedNativeGeometry(nativeGeometry, factor) {
  const scale = Number(factor);
  if (!nativeGeometry || !Number.isFinite(scale) || scale <= 0 || Math.abs(scale - 1) < 0.000001) {
    return foundry.utils.deepClone(nativeGeometry ?? null);
  }
  const native = foundry.utils.deepClone(nativeGeometry);
  if (native.type === "circle") {
    native.x = (Number(native.x) || 0) * scale;
    native.y = (Number(native.y) || 0) * scale;
    native.radius = Math.max(0, Number(native.radius) || 0) * scale;
  } else if (native.type === "rect") {
    native.x = (Number(native.x) || 0) * scale;
    native.y = (Number(native.y) || 0) * scale;
    native.width = Math.max(0, Number(native.width) || 0) * scale;
    native.height = Math.max(0, Number(native.height) || 0) * scale;
  } else if (native.type === "polygon" && Array.isArray(native.points)) {
    native.points = native.points.map(point => ({
      x: (Number(point?.x) || 0) * scale,
      y: (Number(point?.y) || 0) * scale
    }));
  }
  return native;
}

export function nativeGeometryScaleForCurrentScene(snapshot, canonicalData, scene = canvas.scene) {
  const saved = snapshot?.measurement;
  if (saved && Number(saved.version) >= 1) {
    const savedGridSize = Number(saved.gridSize);
    const savedGridDistance = Number(saved.gridDistance);
    const currentGridSize = Number(scene?.grid?.size ?? canvas?.grid?.size);
    const currentGridDistance = Number(scene?.grid?.distance);
    const savedFeet = convertLengthUnits(savedGridDistance, saved.sceneUnits, "ft", { fallback: savedGridDistance });
    const currentFeet = convertLengthUnits(currentGridDistance, sceneDistanceUnits(scene), "ft", { fallback: currentGridDistance });
    const savedPixelsPerFoot = savedGridSize / savedFeet;
    const currentPixelsPerFoot = currentGridSize / currentFeet;
    const factor = currentPixelsPerFoot / savedPixelsPerFoot;
    if ([savedPixelsPerFoot, currentPixelsPerFoot, factor].every(value => Number.isFinite(value) && value > 0)) return factor;
  }

  // Pre-0.5.5 snapshots have no measurement metadata. Their native PIXI
  // geometry was generated from whatever numeric distance EasyTraps handed to
  // Foundry at creation time. If that number differs from today's canonical,
  // unit-normalized distance, scale the local shape instead of forcing the GM
  // to recreate an otherwise valid trap.
  const storedData = snapshot?.data ?? {};
  for (const key of ["distance", "width"]) {
    const stored = Number(storedData?.[key]);
    const current = Number(canonicalData?.[key]);
    if (!Number.isFinite(stored) || !Number.isFinite(current) || stored <= 0 || current <= 0) continue;
    const factor = current / stored;
    if (Number.isFinite(factor) && factor > 0) return factor;
  }
  return 1;
}

export function nativeGeometryForCurrentScene(snapshot, canonicalData, scene = canvas.scene) {
  const native = snapshot?.nativeGeometry ?? null;
  if (!native) return null;
  return scaleSerializedNativeGeometry(native, nativeGeometryScaleForCurrentScene(snapshot, canonicalData, scene));
}

export function geometryFromSavedAreaState(state) {
  const origin = { x: Number(state?.x) || 0, y: Number(state?.y) || 0 };

  // The GM overlay is a deterministic visual summary of the canonical template
  // data. Prefer that stable model over PIXI's transient `shape` object: on
  // Foundry 14 / D&D5e 5.3.x some line/circle placements expose a control shape
  // that is not the final AoE footprint, producing tiny or missing previews even
  // though the saved native cast itself is correct.
  const canonical = geometryFromTemplateData(state, origin);
  if (canonical) return canonical;

  const native = state?.nativeGeometry;
  if (native?.type === "circle") {
    return {
      type: "circle",
      x: origin.x + (Number(native.x) || 0),
      y: origin.y + (Number(native.y) || 0),
      radius: Math.max(0, Number(native.radius) || 0)
    };
  }
  if (native?.type === "rect") {
    return {
      type: "rect",
      x: origin.x + (Number(native.x) || 0),
      y: origin.y + (Number(native.y) || 0),
      width: Math.max(0, Number(native.width) || 0),
      height: Math.max(0, Number(native.height) || 0)
    };
  }
  if (native?.type === "polygon" && Array.isArray(native.points) && native.points.length >= 3) {
    return {
      type: "polygon",
      points: native.points.map(point => ({
        x: origin.x + (Number(point?.x) || 0),
        y: origin.y + (Number(point?.y) || 0)
      }))
    };
  }
  return null;
}

export function inferTemplateBinding(data, referencePoint, targetType = "") {
  const shape = String(data?.t ?? data?.type ?? "").toLowerCase();
  const semanticType = String(targetType ?? "").toLowerCase();
  if (["cone", "line"].includes(semanticType) || shape === "cone") return TEMPLATE_BINDINGS.ORIGIN_LINKED;
  if (shape === "ray" && semanticType !== "cube" && semanticType !== "square") return TEMPLATE_BINDINGS.ORIGIN_LINKED;
  const dx = Number(data?.x) - Number(referencePoint?.x);
  const dy = Number(data?.y) - Number(referencePoint?.y);
  const tolerance = Math.max(10, sceneGeometry().gridSize * 0.75);
  return Math.hypot(dx, dy) <= tolerance ? TEMPLATE_BINDINGS.ORIGIN_LINKED : TEMPLATE_BINDINGS.SCENE_FIXED;
}

export function serializeTemplateSnapshot(document, referencePoint, targetType = "", canonicalData = null) {
  const placed = document.toObject();
  const data = foundry.utils.deepClone(canonicalData ?? placed);
  data.direction = Number(placed.direction) || 0;
  if (Number.isFinite(Number(placed.angle)) && Object.hasOwn(data, "angle")) data.angle = Number(placed.angle);
  const binding = inferTemplateBinding({ ...data, x: placed.x, y: placed.y }, referencePoint, targetType);
  const snapshot = {
    binding,
    targetType: String(targetType ?? ""),
    // Store the exact final Foundry/PIXI shape produced after native snapping.
    // This geometry is design-time data only; the real spell still recreates its
    // template from the current Activity when the trap fires.
    nativeGeometry: serializePlacedTemplateGeometry(document),
    measurement: templateMeasurementMetadata(document?.parent ?? canvas.scene),
    offsetX: Number(placed.x) - Number(referencePoint.x),
    offsetY: Number(placed.y) - Number(referencePoint.y),
    elevationOffset: (Number(placed.elevation) || 0) - (Number(referencePoint.elevation) || 0),
    x: Number(placed.x),
    y: Number(placed.y),
    elevation: Number(placed.elevation) || 0,
    data
  };
  delete data._id;
  delete data._stats;
  delete data.x;
  delete data.y;
  delete data.elevation;
  const moduleFlags = data.flags?.[MODULE_ID];
  if (moduleFlags && typeof moduleFlags === "object") {
    delete moduleFlags.setupPreview;
    if (!Object.keys(moduleFlags).length) delete data.flags[MODULE_ID];
  }
  if (data.flags && !Object.keys(data.flags).length) delete data.flags;
  return snapshot;
}

export function normalizedTemplateSnapshot(snapshot, referencePoint = null) {
  const copy = foundry.utils.deepClone(snapshot ?? {});
  const data = copy.data ?? {};
  let binding = Object.values(TEMPLATE_BINDINGS).includes(copy.binding) ? copy.binding : null;
  const reconstructed = {
    x: Number.isFinite(Number(copy.x)) ? Number(copy.x) : Number(referencePoint?.x || 0) + Number(copy.offsetX || 0),
    y: Number.isFinite(Number(copy.y)) ? Number(copy.y) : Number(referencePoint?.y || 0) + Number(copy.offsetY || 0),
    elevation: Number.isFinite(Number(copy.elevation)) ? Number(copy.elevation) : Number(referencePoint?.elevation || 0) + Number(copy.elevationOffset || 0)
  };
  if (!binding) binding = inferTemplateBinding({ ...data, ...reconstructed }, referencePoint ?? reconstructed, copy.targetType);
  return {
    ...copy,
    binding,
    x: reconstructed.x,
    y: reconstructed.y,
    elevation: reconstructed.elevation,
    offsetX: Number(copy.offsetX || 0),
    offsetY: Number(copy.offsetY || 0),
    elevationOffset: Number(copy.elevationOffset || 0),
    data
  };
}

export function savedTemplatePlacements(trap, originPoint, triggerTile) {
  const snapshots = Array.isArray(trap.templates) ? trap.templates : [];
  return snapshots.map(rawSnapshot => {
    const snapshot = normalizedTemplateSnapshot(rawSnapshot, originPoint);
    const state = templateSnapshotWorldState(snapshot, originPoint);
    return {
      x: Number(state.x),
      y: Number(state.y),
      elevation: Number(state.elevation) || 0,
      direction: Number(state.direction) || 0,
      flags: {
        [MODULE_ID]: {
          activatedTemplate: true,
          binding: snapshot.binding,
          triggerTileId: triggerTile.id,
          triggerTileUuid: triggerTile.uuid
        }
      }
    };
  });
}
