import {
  layerGeometry,
  layerStretch,
  layerBounds,
  type LayerTransform,
  type LayerDimensions,
} from './watermark-composition';

export type SceneSize = {
  width: number;
  height: number;
  referenceWidth: number;
};
export type Point = { x: number; y: number };
export type AlignmentGuides = {
  outline: Point[];
  lines: { from: Point; to: Point; label: string }[];
};
export type StretchEdge = 'left' | 'right' | 'top' | 'bottom';

/** Pointer deltas are scene pixels. The opposite edge stays fixed, even after rotation. */
export function stretchLayer<T extends LayerTransform>(
  layer: T,
  dimensions: LayerDimensions,
  scene: SceneSize,
  edge: StretchEdge,
  delta: Point,
): T {
  const g = layerGeometry(
    layer,
    dimensions.width,
    dimensions.height,
    scene.referenceWidth,
  );
  const angle = (layer.rotation * Math.PI) / 180,
    cos = Math.cos(angle),
    sin = Math.sin(angle);
  const horizontal = edge === 'left' || edge === 'right';
  const sign = edge === 'left' || edge === 'top' ? -1 : 1;
  const movement = horizontal
    ? delta.x * cos + delta.y * sin
    : -delta.x * sin + delta.y * cos;
  const oldSize = horizontal ? g.width : g.height;
  const oldStretch = layerStretch(horizontal ? layer.scaleX : layer.scaleY);
  const nextStretch = layerStretch(
    (oldStretch * Math.max(0.01, oldSize + movement * sign)) / oldSize,
  );
  const shift = (((oldSize * nextStretch) / oldStretch - oldSize) * sign) / 2;
  return {
    ...layer,
    [horizontal ? 'scaleX' : 'scaleY']: nextStretch,
    x: layer.x + (horizontal ? shift * cos : -shift * sin) / scene.width,
    y: layer.y + (horizontal ? shift * sin : shift * cos) / scene.height,
  };
}

/** Magnetic guides use the original image's local axes, including its rotation and crop.
 * They only attract within a small screen-distance threshold: crossing an edge is always allowed.
 */
export function alignLayerToSource<T extends LayerTransform>(
  layer: T,
  dimensions: LayerDimensions,
  source: LayerTransform,
  sourceDimensions: LayerDimensions,
  scene: SceneSize,
  threshold: number,
  snap = true,
): { layer: T; guides: AlignmentGuides } {
  const angle = (source.rotation * Math.PI) / 180,
    cos = Math.cos(angle),
    sin = Math.sin(angle);
  const center = { x: source.x * scene.width, y: source.y * scene.height };
  const dx = layer.x * scene.width - center.x,
    dy = layer.y * scene.height - center.y;
  const local = {
    ...layer,
    x: (dx * cos + dy * sin) / scene.width,
    y: (-dx * sin + dy * cos) / scene.height,
    rotation: layer.rotation - source.rotation,
  };
  const bounds = layerBounds(
    local,
    dimensions,
    scene.referenceWidth,
    scene.width,
    scene.height,
  );
  const original = layerGeometry(
    source,
    sourceDimensions.width,
    sourceDimensions.height,
    scene.referenceWidth,
  );
  const toScene = (x: number, y: number): Point => ({
    x: center.x + x * cos - y * sin,
    y: center.y + x * sin + y * cos,
  });
  const outline = [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ].map(([x, y]) =>
    toScene((x * original.width) / 2, (y * original.height) / 2),
  );
  const guides: AlignmentGuides = { outline, lines: [] };
  if (!bounds || source.opacity <= 0) return { layer, guides };
  const closest = (anchors: number[], targets: number[]) => {
    let best: { delta: number; target: number; index: number } | undefined;
    targets.forEach((target, index) =>
      anchors.forEach((anchor) => {
        const delta = target - anchor;
        if (
          Math.abs(delta) <= threshold &&
          (!best || Math.abs(delta) < Math.abs(best.delta))
        )
          best = { delta, target, index };
      }),
    );
    return best;
  };
  const x = closest(
    [bounds.left, (bounds.left + bounds.right) / 2, bounds.right],
    [-original.width / 2, 0, original.width / 2],
  );
  const y = closest(
    [bounds.top, (bounds.top + bounds.bottom) / 2, bounds.bottom],
    [-original.height / 2, 0, original.height / 2],
  );
  if (x)
    guides.lines.push({
      from: toScene(x.target, -original.height / 2),
      to: toScene(x.target, original.height / 2),
      label: ['原图左边缘', '原图垂直中线', '原图右边缘'][x.index],
    });
  if (y)
    guides.lines.push({
      from: toScene(-original.width / 2, y.target),
      to: toScene(original.width / 2, y.target),
      label: ['原图上边缘', '原图水平中线', '原图下边缘'][y.index],
    });
  const sx = snap ? (x?.delta ?? 0) : 0,
    sy = snap ? (y?.delta ?? 0) : 0;
  return {
    layer: {
      ...layer,
      x: layer.x + (sx * cos - sy * sin) / scene.width,
      y: layer.y + (sx * sin + sy * cos) / scene.height,
    },
    guides,
  };
}

/** Stretch the visible watermark to the source frame, accounting for PNG padding. */
export function fitLayerToSource<T extends LayerTransform>(
  layer: T,
  dimensions: LayerDimensions,
  source: LayerTransform,
  sourceDimensions: LayerDimensions,
  scene: SceneSize,
): T {
  const original = layerGeometry(
    source,
    sourceDimensions.width,
    sourceDimensions.height,
    scene.referenceWidth,
  );
  const base = {
    ...layer,
    scale: 1,
    scaleX: 1,
    scaleY: 1,
    x: 0,
    y: 0,
    rotation: 0,
    opacity: 1,
  };
  const bounds = layerBounds(
    base,
    dimensions,
    scene.referenceWidth,
    scene.width,
    scene.height,
  );
  if (!bounds) throw new Error('此水印没有可见内容，无法贴合边框');
  const ratioX = original.width / (bounds.right - bounds.left),
    ratioY = original.height / (bounds.bottom - bounds.top);
  const scale = Math.max(0.01, Math.min(6, Math.max(ratioX, ratioY)));
  const scaleX = ratioX / scale,
    scaleY = ratioY / scale;
  if (scaleX < 0.01 || scaleY < 0.01 || scaleX > 6 || scaleY > 6)
    throw new Error('此水印的留白或长宽比过大，请先裁切后再贴合');
  const cx = ((bounds.left + bounds.right) / 2) * ratioX,
    cy = ((bounds.top + bounds.bottom) / 2) * ratioY;
  const angle = (source.rotation * Math.PI) / 180;
  return {
    ...layer,
    scale,
    scaleX,
    scaleY,
    rotation: source.rotation,
    x: source.x - (cx * Math.cos(angle) - cy * Math.sin(angle)) / scene.width,
    y: source.y - (cx * Math.sin(angle) + cy * Math.cos(angle)) / scene.height,
  };
}
