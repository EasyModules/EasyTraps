function finite(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : Number(fallback) || 0;
}

/**
 * Reconstruct the visual footprint of a standard D&D5e measured template from
 * its canonical document data. This is intentionally independent of PIXI's
 * transient `shape` object: that object can represent placement controls rather
 * than the final AoE in some Foundry/D&D5e combinations.
 */
export function templatePreviewGeometry(data = {}, origin = {}, {
  gridSize = 100,
  gridDistance = 5,
  defaultConeAngle = 53.13
} = {}) {
  const shape = String(data?.t ?? data?.type ?? "").toLowerCase();
  const size = finite(gridSize, 100);
  const distancePerGrid = finite(gridDistance, 5);
  if (!(size > 0) || !(distancePerGrid > 0)) return null;
  const scale = size / distancePerGrid;
  const distance = Math.max(0, finite(data?.distance)) * scale;
  const width = Math.max(0, finite(data?.width, distancePerGrid)) * scale;
  const direction = finite(data?.direction) * Math.PI / 180;
  const x = finite(origin?.x);
  const y = finite(origin?.y);

  if (shape === "circle") return { type: "circle", x, y, radius: distance };

  if (shape === "ray" || shape === "line") {
    const forward = { x: Math.cos(direction), y: Math.sin(direction) };
    const side = { x: -forward.y * width / 2, y: forward.x * width / 2 };
    return { type: "polygon", points: [
      { x: x + side.x, y: y + side.y },
      { x: x - side.x, y: y - side.y },
      { x: x + forward.x * distance - side.x, y: y + forward.y * distance - side.y },
      { x: x + forward.x * distance + side.x, y: y + forward.y * distance + side.y }
    ] };
  }

  if (shape === "cone") {
    const angle = finite(data?.angle, defaultConeAngle) * Math.PI / 180;
    const segments = Math.max(16, Math.ceil(angle * 24));
    const points = [{ x, y }];
    for (let index = 0; index <= segments; index += 1) {
      const theta = direction - angle / 2 + angle * index / segments;
      points.push({ x: x + Math.cos(theta) * distance, y: y + Math.sin(theta) * distance });
    }
    return { type: "polygon", points };
  }

  if (["rect", "rectangle", "cube", "square"].includes(shape)) {
    const end = {
      x: x + Math.cos(direction) * distance,
      y: y + Math.sin(direction) * distance
    };
    return {
      type: "rect",
      x: Math.min(x, end.x),
      y: Math.min(y, end.y),
      width: Math.abs(end.x - x),
      height: Math.abs(end.y - y)
    };
  }

  return null;
}
