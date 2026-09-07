export type LayerTransform = {
  x: number;
  y: number;
  scale: number;
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
