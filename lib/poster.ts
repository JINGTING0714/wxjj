export type PosterImage = {
  id: string;
  kind: 'image';
  file: File;
  name: string;
  sourceId?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  opacity: number;
  locked: boolean;
  visible: boolean;
  fit: 'cover' | 'contain';
  zoom: number;
  offsetX: number;
  offsetY: number;
};
export type PosterText = {
  id: string;
  kind: 'text';
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  opacity: number;
  locked: boolean;
  visible: boolean;
  font: string;
  size: number;
  weight: number;
  color: string;
  color2: string;
  stroke: string;
  style: 'plain' | 'outline' | 'glow' | 'extrude' | 'gradient';
  align: 'left' | 'center' | 'right';
  spacing: number;
};
export type PosterShape = {
  id: string;
  kind: 'shape';
  symbol: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  opacity: number;
  locked: boolean;
  visible: boolean;
  color: string;
};
export type PosterLayer = PosterImage | PosterText | PosterShape;
export type PosterDocument = {
  width: number;
  height: number;
  background: string;
  layers: PosterLayer[];
};
export const posterPresets = [
  { name: '竖版 9:16', width: 1080, height: 1920 },
  { name: '竖版 2:3', width: 1200, height: 1800 },
  { name: '方形 1:1', width: 1600, height: 1600 },
  { name: '横版 16:9', width: 1920, height: 1080 },
  { name: 'A4 竖版', width: 2480, height: 3508 },
];
export const posterFonts = [
  'Noto Sans SC',
  'Noto Serif SC',
  'Ma Shan Zheng',
  'Bebas Neue',
  'Arial',
];
export const posterSymbols = [
  '✦',
  '✧',
  '★',
  '♡',
  '✿',
  '❀',
  '☾',
  '✩',
  '⋆',
  '✨',
  '♥',
  '✷',
  '➳',
  '◆',
  '✺',
  '🪄',
];
export function posterTemplate(
  files: { id?: string; file: File }[],
  doc: Pick<PosterDocument, 'width' | 'height'>,
  template: 'hero' | '4-3-4' | 'mosaic' | 'grid',
  gap = 0,
): PosterImage[] {
  const boxes: { x: number; y: number; width: number; height: number }[] = [];
  const row = (count: number, y: number, height: number, widths?: number[]) => {
    let x = 0;
    for (let i = 0; i < count; i++) {
      const width = widths?.[i] ?? 1 / count;
      boxes.push({
        x: x * doc.width + gap / 2,
        y: y * doc.height + gap / 2,
        width: width * doc.width - gap,
        height: height * doc.height - gap,
      });
      x += width;
    }
  };
  if (template === '4-3-4' && files.length === 11) {
    row(4, 0, 0.3);
    row(3, 0.3, 0.4);
    row(4, 0.7, 0.3);
  } else if (template === 'mosaic' && files.length === 9) {
    row(3, 0, 0.3, [0.35, 0.35, 0.3]);
    row(3, 0.3, 0.4, [0.3, 0.4, 0.3]);
    row(3, 0.7, 0.3, [0.3, 0.35, 0.35]);
  } else if (template === 'hero' && files.length > 1) {
    boxes.push({ x: 0, y: 0, width: doc.width * 0.65, height: doc.height });
    for (let i = 1; i < files.length; i++)
      boxes.push({
        x: doc.width * 0.65 + gap / 2,
        y: ((i - 1) * doc.height) / (files.length - 1) + gap / 2,
        width: doc.width * 0.35 - gap,
        height: doc.height / (files.length - 1) - gap,
      });
  } else {
    const columns = Math.ceil(
        Math.sqrt((files.length * doc.width) / doc.height),
      ),
      rows = Math.ceil(files.length / Math.max(1, columns));
    for (let i = 0; i < files.length; i++)
      boxes.push({
        x:
          ((i % Math.max(1, columns)) * doc.width) / Math.max(1, columns) +
          gap / 2,
        y: (Math.floor(i / Math.max(1, columns)) * doc.height) / rows + gap / 2,
        width: doc.width / Math.max(1, columns) - gap,
        height: doc.height / rows - gap,
      });
  }
  return files.map((item, index) => ({
    id: crypto.randomUUID(),
    kind: 'image',
    file: item.file,
    name: item.file.name,
    sourceId: item.id,
    ...(boxes[index] || {
      x: doc.width * 0.05,
      y: doc.height * 0.05,
      width: doc.width * 0.25,
      height: doc.height * 0.25,
    }),
    rotation: 0,
    opacity: 1,
    locked: false,
    visible: true,
    fit: 'cover',
    zoom: 1,
    offsetX: 0,
    offsetY: 0,
  }));
}
export function posterTitle(
  doc: Pick<PosterDocument, 'width' | 'height'>,
  text = '我的词包',
  style: PosterText['style'] = 'extrude',
): PosterText {
  return {
    id: crypto.randomUUID(),
    kind: 'text',
    text,
    x: doc.width * 0.04,
    y: doc.height * 0.42,
    width: doc.width * 0.92,
    height: doc.height * 0.16,
    rotation: 0,
    opacity: 1,
    locked: false,
    visible: true,
    font: 'Noto Sans SC',
    size: doc.width * 0.105,
    weight: 900,
    color: '#ff5baa',
    color2: '#fff5fd',
    stroke: '#672651',
    style,
    align: 'center',
    spacing: 1,
  };
}
function lines(text: string, context: CanvasRenderingContext2D, width: number) {
  const result: string[] = [];
  for (const paragraph of text.split('\n')) {
    let line = '';
    for (const char of Array.from(paragraph)) {
      if (line && context.measureText(line + char).width > width) {
        result.push(line);
        line = char;
      } else line += char;
    }
    result.push(line);
  }
  return result;
}
export async function renderPoster(
  doc: PosterDocument,
  signal: AbortSignal,
  onProgress?: (value: number) => void,
) {
  if (
    !Number.isInteger(doc.width) ||
    !Number.isInteger(doc.height) ||
    doc.width < 64 ||
    doc.height < 64 ||
    Math.max(doc.width, doc.height) > 8000 ||
    doc.width * doc.height > 40_000_000
  )
    throw new Error(
      '海报需至少 64 px，单边不超过 8000 px、总像素不超过 4000 万。',
    );
  const canvas = document.createElement('canvas');
  canvas.width = doc.width;
  canvas.height = doc.height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('浏览器无法创建海报画布');
  try {
    context.fillStyle = doc.background;
    context.fillRect(0, 0, doc.width, doc.height);
    for (let index = 0; index < doc.layers.length; index++) {
      signal.throwIfAborted();
      const layer = doc.layers[index];
      if (!layer.visible) continue;
      context.save();
      context.globalAlpha = layer.opacity;
      context.translate(layer.x + layer.width / 2, layer.y + layer.height / 2);
      context.rotate((layer.rotation * Math.PI) / 180);
      context.translate(-layer.width / 2, -layer.height / 2);
      if (layer.kind === 'image') {
        const image = await createImageBitmap(layer.file);
        try {
          context.beginPath();
          context.rect(0, 0, layer.width, layer.height);
          context.clip();
          const fit =
              (layer.fit === 'cover' ? Math.max : Math.min)(
                layer.width / image.width,
                layer.height / image.height,
              ) * layer.zoom,
            w = image.width * fit,
            h = image.height * fit;
          context.drawImage(
            image,
            (layer.width - w) / 2 + layer.offsetX * layer.width,
            (layer.height - h) / 2 + layer.offsetY * layer.height,
            w,
            h,
          );
        } finally {
          image.close();
        }
      } else if (layer.kind === 'shape') {
        context.fillStyle = layer.color;
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.font = `${Math.min(layer.width, layer.height)}px "Noto Sans SC",sans-serif`;
        context.fillText(layer.symbol, layer.width / 2, layer.height / 2);
      } else {
        context.beginPath();
        context.rect(0, 0, layer.width, layer.height);
        context.clip();
        await document.fonts.load(
          `${layer.weight} ${layer.size}px "${layer.font}"`,
          layer.text,
        );
        context.font = `${layer.weight} ${layer.size}px "${layer.font}",sans-serif`;
        context.textAlign = layer.align;
        context.textBaseline = 'top';
        const rows = lines(layer.text, context, layer.width),
          x =
            layer.align === 'center'
              ? layer.width / 2
              : layer.align === 'right'
                ? layer.width
                : 0;
        for (let i = 0; i < rows.length; i++) {
          const y = i * layer.size * 1.25;
          if (layer.style === 'extrude') {
            context.fillStyle = layer.stroke;
            for (
              let depth = Math.max(2, Math.round(layer.size * 0.08));
              depth > 0;
              depth--
            )
              context.fillText(rows[i], x + depth, y + depth);
          }
          if (layer.style === 'glow') {
            context.shadowColor = layer.color;
            context.shadowBlur = layer.size * 0.24;
          }
          if (layer.style === 'outline' || layer.style === 'extrude') {
            context.strokeStyle = layer.stroke;
            context.lineJoin = 'round';
            context.lineWidth = Math.max(1, layer.size * 0.05);
            context.strokeText(rows[i], x, y);
          }
          if (layer.style === 'gradient' || layer.style === 'extrude') {
            const gradient = context.createLinearGradient(
              0,
              y,
              0,
              y + layer.size,
            );
            gradient.addColorStop(0, layer.color2);
            gradient.addColorStop(1, layer.color);
            context.fillStyle = gradient;
          } else context.fillStyle = layer.color;
          context.fillText(rows[i], x, y);
        }
      }
      context.restore();
      onProgress?.((index + 1) / doc.layers.length);
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    signal.throwIfAborted();
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (value) => (value ? resolve(value) : reject(new Error('海报导出失败'))),
        'image/png',
      ),
    );
    signal.throwIfAborted();
    return new File([blob], `PRISM-海报-${doc.width}x${doc.height}.png`, {
      type: 'image/png',
    });
  } finally {
    canvas.width = canvas.height = 0;
  }
}
