export type TouchPoint = { x: number; y: number };
export type PreviewView = { zoom: number; x: number; y: number };
const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));
export function touchPair(a: TouchPoint, b: TouchPoint) {
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
    distance: Math.max(1, Math.hypot(b.x - a.x, b.y - a.y)),
    angle: Math.atan2(b.y - a.y, b.x - a.x),
  };
}
export function pinchView(
  start: PreviewView,
  first: ReturnType<typeof touchPair>,
  now: ReturnType<typeof touchPair>,
  center: TouchPoint,
): PreviewView {
  const zoom = clamp((start.zoom * now.distance) / first.distance, 0.25, 6),
    ratio = zoom / start.zoom;
  return {
    zoom,
    x: now.x - center.x - (first.x - center.x - start.x) * ratio,
    y: now.y - center.y - (first.y - center.y - start.y) * ratio,
  };
}
export function pinchLayer(
  layer: { x: number; y: number; scale: number; rotation: number },
  first: ReturnType<typeof touchPair>,
  now: ReturnType<typeof touchPair>,
  scene: { width: number; height: number },
) {
  const angle = Math.atan2(
    Math.sin(now.angle - first.angle),
    Math.cos(now.angle - first.angle),
  );
  return {
    x: layer.x + (now.x - first.x) / scene.width,
    y: layer.y + (now.y - first.y) / scene.height,
    scale: clamp((layer.scale * now.distance) / first.distance, 0.01, 6),
    rotation: layer.rotation + (angle * 180) / Math.PI,
  };
}
