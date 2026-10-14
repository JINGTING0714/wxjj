import type {
  PosterImage,
  PosterLayer,
  PosterDocument,
  PosterText,
} from './poster';
export type PosterSavedLayout = {
  id: string;
  name: string;
  width: number;
  height: number;
  frames: {
    x: number;
    y: number;
    width: number;
    height: number;
    rotation: number;
  }[];
};
export function savePosterLayout(
  doc: PosterDocument,
  name: string,
): PosterSavedLayout {
  return {
    id: crypto.randomUUID(),
    name,
    width: doc.width,
    height: doc.height,
    frames: doc.layers
      .filter((layer): layer is PosterImage => layer.kind === 'image')
      .map((layer) => ({
        x: layer.x / doc.width,
        y: layer.y / doc.height,
        width: layer.width / doc.width,
        height: layer.height / doc.height,
        rotation: layer.rotation,
      })),
  };
}
export function applyPosterLayout(
  images: PosterImage[],
  layout: PosterSavedLayout,
  doc: Pick<PosterDocument, 'width' | 'height'>,
) {
  return images.map((image, index) => {
    const frame = layout.frames[index];
    return frame
      ? {
          ...image,
          x: frame.x * doc.width,
          y: frame.y * doc.height,
          width: frame.width * doc.width,
          height: frame.height * doc.height,
          rotation: frame.rotation,
        }
      : image;
  });
}
export function snapPosterRect(
  rect: Pick<PosterLayer, 'x' | 'y' | 'width' | 'height'>,
  doc: Pick<PosterDocument, 'width' | 'height'>,
  others: PosterLayer[],
  tolerance: number,
  anchorsX = [0, 0.5, 1],
  anchorsY = [0, 0.5, 1],
) {
  const axis = (
    start: number,
    size: number,
    limit: number,
    other: { start: number; size: number }[],
    anchors: number[],
  ) => {
    let best = tolerance + 1,
      delta = 0,
      guide: number | undefined;
    for (const target of [
      0,
      limit / 2,
      limit,
      ...other.flatMap((item) => [
        item.start,
        item.start + item.size / 2,
        item.start + item.size,
      ]),
    ])
      for (const anchor of anchors) {
        const value = target - (start + anchor * size);
        if (Math.abs(value) < best && Math.abs(value) <= tolerance) {
          best = Math.abs(value);
          delta = value;
          guide = target;
        }
      }
    return { delta, guide };
  };
  const x = axis(
      rect.x,
      rect.width,
      doc.width,
      others
        .filter((item) => item.visible)
        .map((item) => ({ start: item.x, size: item.width })),
      anchorsX,
    ),
    y = axis(
      rect.y,
      rect.height,
      doc.height,
      others
        .filter((item) => item.visible)
        .map((item) => ({ start: item.y, size: item.height })),
      anchorsY,
    );
  return {
    x: rect.x + x.delta,
    y: rect.y + y.delta,
    dx: x.delta,
    dy: y.delta,
    guideX: x.guide,
    guideY: y.guide,
  };
}
export function posterTracking(text: PosterText) {
  if (text.autoSpacing === false) return text.spacing || 0;
  const outlined = [
      'outline',
      'double-outline',
      'hollow',
      'chrome',
      'extrude',
    ].includes(text.style),
    outline = outlined
      ? text.size *
        (text.strokeWidth ?? 0.025) *
        (text.style === 'double-outline' ? 3 : 1)
      : 0,
    depth = text.style === 'extrude' ? text.size * (text.depth ?? 0.03) : 0;
  return Math.max(text.spacing || 0, outline + depth * 0.45);
}

export function posterStyleValues(text: PosterText): Partial<PosterText> {
  const {
    font,
    size,
    weight,
    color,
    color2,
    stroke,
    style,
    align,
    spacing,
    italic,
    underline,
    strike,
    lineHeight,
    strokeWidth,
    depth,
    shadowX,
    shadowY,
    shadowBlur,
    gradientAngle,
    autoSpacing,
  } = text;
  return {
    font,
    size,
    weight,
    color,
    color2,
    stroke,
    style,
    align,
    spacing,
    italic,
    underline,
    strike,
    lineHeight,
    strokeWidth,
    depth,
    shadowX,
    shadowY,
    shadowBlur,
    gradientAngle,
    autoSpacing,
  };
}
