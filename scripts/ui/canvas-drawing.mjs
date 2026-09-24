

export function overlayHost() {
  return canvas.interface ?? canvas.controls ?? canvas.stage;
}

export function createPlacementPreview() {
  if (!globalThis.PIXI?.Graphics) return null;
  const host = overlayHost();
  if (!host?.addChild) return null;
  const graphic = new PIXI.Graphics();
  graphic.eventMode = "none";
  graphic.zIndex = 1100;
  host.addChild(graphic);
  return graphic;
}

export function drawGridCells(graphic, cells, geometry, { preview = false, armed = true, origin = false } = {}) {
  const fillColor = origin ? 0x67b7ff : (preview ? 0xf0c879 : 0xd9ad60);
  const strokeColor = armed ? fillColor : 0x8a7f72;
  const fillAlpha = preview ? 0.17 : (armed ? 0.08 : 0.035);
  const strokeAlpha = preview ? 0.96 : 0.82;
  const padding = preview ? 3 : 2;
  for (const cell of cells) {
    const x = geometry.sceneX + cell.column * geometry.gridSize + padding;
    const y = geometry.sceneY + cell.row * geometry.gridSize + padding;
    const width = geometry.gridSize - padding * 2;
    const height = geometry.gridSize - padding * 2;
    if (typeof graphic.rect === "function" && typeof graphic.fill === "function") {
      graphic.rect(x, y, width, height);
      graphic.fill({ color: fillColor, alpha: fillAlpha });
      graphic.stroke({ color: strokeColor, alpha: strokeAlpha, width: preview ? 3 : 2 });
    } else {
      graphic.lineStyle(preview ? 3 : 2, strokeColor, strokeAlpha);
      graphic.beginFill(fillColor, fillAlpha);
      graphic.drawRect(x, y, width, height);
      graphic.endFill();
    }
  }
}

export function drawOverlayLine(graphic, x1, y1, x2, y2, color, alpha = 1, width = 2) {
  if (typeof graphic.moveTo === "function" && typeof graphic.stroke === "function") {
    graphic.moveTo(x1, y1).lineTo(x2, y2).stroke({ color, alpha, width });
  } else {
    graphic.lineStyle(width, color, alpha);
    graphic.moveTo(x1, y1);
    graphic.lineTo(x2, y2);
  }
}

export function drawOverlayCircle(graphic, x, y, radius, color, alpha = 1, fillAlpha = 0) {
  if (typeof graphic.circle === "function" && typeof graphic.stroke === "function") {
    graphic.circle(x, y, radius);
    if (fillAlpha) graphic.fill({ color, alpha: fillAlpha });
    graphic.stroke({ color, alpha, width: 2 });
  } else {
    graphic.lineStyle(2, color, alpha);
    if (fillAlpha) graphic.beginFill(color, fillAlpha);
    graphic.drawCircle(x, y, radius);
    if (fillAlpha) graphic.endFill();
  }
}

export function drawOverlayRect(graphic, x, y, width, height, color, alpha = 1, fillAlpha = 0) {
  if (typeof graphic.rect === "function" && typeof graphic.stroke === "function") {
    graphic.rect(x, y, width, height);
    if (fillAlpha) graphic.fill({ color, alpha: fillAlpha });
    graphic.stroke({ color, alpha, width: 2 });
  } else {
    graphic.lineStyle(2, color, alpha);
    if (fillAlpha) graphic.beginFill(color, fillAlpha);
    graphic.drawRect(x, y, width, height);
    if (fillAlpha) graphic.endFill();
  }
}

export function drawOverlayPolygon(graphic, points, color, alpha = 1, fillAlpha = 0) {
  const flat = points.flatMap(point => [point.x, point.y]);
  if (typeof graphic.poly === "function" && typeof graphic.stroke === "function") {
    graphic.poly(flat, true);
    if (fillAlpha) graphic.fill({ color, alpha: fillAlpha });
    graphic.stroke({ color, alpha, width: 2 });
  } else {
    graphic.lineStyle(2, color, alpha);
    if (fillAlpha) graphic.beginFill(color, fillAlpha);
    graphic.drawPolygon(flat);
    if (fillAlpha) graphic.endFill();
  }
}
