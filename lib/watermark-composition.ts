export type LayerTransform = {
  x: number;
  y: number;
  scale: number;
  scaleX?: number;
  scaleY?: number;
  rotation: number;
  opacity: number;
  crop: { top: number; right: number; bottom: number; left: number };
  locked?: boolean;
};
export type WatermarkComposition = {
  canvasWidth: number;
  canvasHeight: number;
  background: string;
  source: LayerTransform;
  sourceIndex: number;
  fitContent?: boolean;
};
export const SOURCE_LAYER_ID = '__prism_source__';
export const defaultComposition = (): WatermarkComposition => ({
  canvasWidth: 1,
  canvasHeight: 1,
  background: 'transparent',
  sourceIndex: 0,
  source: {
    x: 0.5,
    y: 0.5,
    scale: 1,
    scaleX: 1,
    scaleY: 1,
    rotation: 0,
    opacity: 1,
    locked: true,
    crop: { top: 0, right: 0, bottom: 0, left: 0 },
  },
});
export function resolveComposition(
  value?: WatermarkComposition,
): WatermarkComposition {
  const defaults = defaultComposition();
  return {
    ...defaults,
    ...value,
    source: {
      ...defaults.source,
      ...value?.source,
      crop: { ...defaults.source.crop, ...value?.source?.crop },
    },
  };
}
export function compositionSize(
  width: number,
  height: number,
  value?: WatermarkComposition,
) {
  const c = resolveComposition(value);
  const w = Math.round(width * c.canvasWidth),
    h = Math.round(height * c.canvasHeight);
  if (
    ![w, h].every((n) => Number.isFinite(n) && n > 0 && n <= 16384) ||
    w * h > 64_000_000
  )
    throw new Error(
      '画布尺寸超出本机安全处理范围（单边最多 16384 像素，总计 6400 万像素）。请缩小画布或原图。',
    );
  return { width: w, height: h };
}
/** Bottom-to-top paint order. Original images are genuine layers, not the canvas. */
export function compositionStack<T>(
  watermarks: T[],
  source: T,
  sourceIndex: number,
) {
  const stack = [...watermarks];
  stack.splice(
    Math.max(0, Math.min(stack.length, Math.trunc(sourceIndex) || 0)),
    0,
    source,
  );
  return stack;
}

export type ContentBounds = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};
export type LayerDimensions = {
  width: number;
  height: number;
  bounds?: ContentBounds | null;
};

/** The editor, still-image renderer and video renderer share this pixel geometry. */
export function layerGeometry(
  layer: LayerTransform,
  naturalWidth: number,
  naturalHeight: number,
  referenceWidth: number,
) {
  const crop = (value: number) => Math.max(0, Math.min(0.49, value));
  const sx = naturalWidth * crop(layer.crop.left);
  const sy = naturalHeight * crop(layer.crop.top);
  const sw =
    naturalWidth *
    Math.max(0.02, 1 - crop(layer.crop.left) - crop(layer.crop.right));
  const sh =
    naturalHeight *
    Math.max(0.02, 1 - crop(layer.crop.top) - crop(layer.crop.bottom));
  const uniformWidth =
    referenceWidth * Math.max(0.01, Math.min(6, layer.scale));
  const width = uniformWidth * layerStretch(layer.scaleX);
  return {
    sx,
    sy,
    sw,
    sh,
    width,
    height: ((uniformWidth * sh) / sw) * layerStretch(layer.scaleY),
  };
}

export const layerStretch = (value?: number) =>
  Math.max(0.01, Math.min(6, value ?? 1));

export function layerBounds(
  layer: LayerTransform,
  dimensions: LayerDimensions,
  referenceWidth: number,
  canvasWidth: number,
  canvasHeight: number,
): ContentBounds | null {
  if (layer.opacity <= 0 || dimensions.bounds === null) return null;
  const g = layerGeometry(
    layer,
    dimensions.width,
    dimensions.height,
    referenceWidth,
  );
  const b = dimensions.bounds ?? { left: 0, top: 0, right: 1, bottom: 1 };
  const left = Math.max(g.sx, b.left * dimensions.width);
  const top = Math.max(g.sy, b.top * dimensions.height);
  const right = Math.min(g.sx + g.sw, b.right * dimensions.width);
  const bottom = Math.min(g.sy + g.sh, b.bottom * dimensions.height);
  if (right <= left || bottom <= top) return null;
  const angle = (layer.rotation * Math.PI) / 180;
  const cos = Math.cos(angle),
    sin = Math.sin(angle);
  const points = [
    [left, top],
    [right, top],
    [right, bottom],
    [left, bottom],
  ].map(([x, y]) => {
    const dx = ((x - g.sx) / g.sw) * g.width - g.width / 2;
    const dy = ((y - g.sy) / g.sh) * g.height - g.height / 2;
    return {
      x: canvasWidth * layer.x + dx * cos - dy * sin,
      y: canvasHeight * layer.y + dx * sin + dy * cos,
    };
  });
  return {
    left: Math.min(...points.map((p) => p.x)),
    top: Math.min(...points.map((p) => p.y)),
    right: Math.max(...points.map((p) => p.x)),
    bottom: Math.max(...points.map((p) => p.y)),
  };
}

/** Reframe the union of all visible layers, including content outside the old canvas.
 * Translation changes; scale, crop, rotation, opacity, locks and stacking do not.
 */
export function fitCompositionToContent<T extends LayerTransform>(
  width: number,
  height: number,
  layers: T[],
  dimensions: LayerDimensions[],
  value?: WatermarkComposition,
  sourceBounds?: ContentBounds | null,
) {
  const c = resolveComposition(value);
  const old = compositionSize(width, height, c);
  if (layers.length !== dimensions.length)
    throw new Error('图层尚未加载完成，请稍后重试');
  const bounds = [
    layerBounds(
      c.source,
      { width, height, bounds: sourceBounds },
      width,
      old.width,
      old.height,
    ),
    ...layers.map((layer, i) =>
      layerBounds(layer, dimensions[i], width, old.width, old.height),
    ),
  ].filter((b): b is ContentBounds => b !== null);
  if (!bounds.length)
    throw new Error('当前没有可见内容，请先提高原图或水印的不透明度');
  // Snap outward, with a small tolerance so repeated fits do not add empty pixels.
  const left = Math.floor(Math.min(...bounds.map((b) => b.left)) + 1e-7);
  const top = Math.floor(Math.min(...bounds.map((b) => b.top)) + 1e-7);
  const right = Math.ceil(Math.max(...bounds.map((b) => b.right)) - 1e-7);
  const bottom = Math.ceil(Math.max(...bounds.map((b) => b.bottom)) - 1e-7);
  const nextWidth = Math.max(1, right - left),
    nextHeight = Math.max(1, bottom - top);
  const translate = <L extends LayerTransform>(layer: L): L => ({
    ...layer,
    x: (layer.x * old.width - left) / nextWidth,
    y: (layer.y * old.height - top) / nextHeight,
  });
  const composition = {
    ...c,
    canvasWidth: nextWidth / width,
    canvasHeight: nextHeight / height,
    source: translate(c.source),
    fitContent: true,
  };
  compositionSize(width, height, composition);
  return { layers: layers.map(translate), composition };
}

/** Only opaque source pixels can make the canvas background irrelevant. */
export function sourceCoversCanvas(
  width: number,
  height: number,
  value?: WatermarkComposition,
) {
  const c = resolveComposition(value);
  if (c.source.opacity < 1) return false;
  const size = compositionSize(width, height, c);
  const g = layerGeometry(c.source, width, height, width);
  const angle = (c.source.rotation * Math.PI) / 180;
  return [
    [0, 0],
    [size.width, 0],
    [size.width, size.height],
    [0, size.height],
  ].every(([x, y]) => {
    const dx = x - size.width * c.source.x,
      dy = y - size.height * c.source.y;
    return (
      Math.abs(dx * Math.cos(angle) + dy * Math.sin(angle)) <=
        g.width / 2 + 1e-7 &&
      Math.abs(-dx * Math.sin(angle) + dy * Math.cos(angle)) <=
        g.height / 2 + 1e-7
    );
  });
}
