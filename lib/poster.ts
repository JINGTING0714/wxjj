import { posterFontCss, posterTextStops } from './poster-typography';
import { posterTracking } from './poster-editor';
import { decoration } from './poster-decoration';
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
  style:
    | 'plain'
    | 'outline'
    | 'glow'
    | 'extrude'
    | 'gradient'
    | 'double-outline'
    | 'chrome'
    | 'hollow'
    | 'shadow'
    | 'soft-glow';
  align: 'left' | 'center' | 'right';
  spacing: number;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  lineHeight?: number;
  strokeWidth?: number;
  depth?: number;
  shadowX?: number;
  shadowY?: number;
  shadowBlur?: number;
  gradientAngle?: number;
  autoSpacing?: boolean;
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
  decoration?: string;
  outline?: boolean;
};
export type PosterLayer = PosterImage | PosterText | PosterShape;
export type PosterDocument = {
  width: number;
  height: number;
  background: string;
  layers: PosterLayer[];
  fonts?: { id: string; file: File }[];
};
export type PosterLayout =
  | 'hero'
  | '4-3-4'
  | 'mosaic'
  | 'grid'
  | 'duo'
  | 'triptych'
  | 'hero-top'
  | 'hero-bottom'
  | 'gallery'
  | 'filmstrip'
  | 'overlap'
  | 'magazine'
  | '2-3-2'
  | '4-4-4'
  | '1-3-1'
  | '3-2-3'
  | '2-1-2'
  | 'stripes'
  | 'quad'
  | 'hero-center'
  | 'polaroid';
export const posterLayoutOptions: {
  id: PosterLayout;
  name: string;
  note: string;
  count?: number;
}[] = [
  { id: '4-4-4', name: '十二图陈列', note: '4 / 4 / 4', count: 12 },
  { id: '1-3-1', name: '双主图', note: '1 / 3 / 1', count: 5 },
  { id: '3-2-3', name: '双人主推', note: '3 / 2 / 3', count: 8 },
  { id: '2-1-2', name: '中心主视觉', note: '2 / 1 / 2', count: 5 },
  { id: 'stripes', name: '横向长条', note: '横向并排' },
  { id: 'quad', name: '四列展览', note: '四列自由拼排' },
  { id: 'hero-center', name: '横贯主图', note: '中间主图 · 两端陈列' },
  { id: 'polaroid', name: '拍立得留白', note: '留出备注与标题' },
  { id: '4-3-4', name: '主推词包', note: '4 / 3 / 4 · 中间更大', count: 11 },
  { id: 'mosaic', name: '错落九宫', note: '宽窄错落 · 9 张', count: 9 },
  { id: '2-3-2', name: '七图展览', note: '2 / 3 / 2 · 7 张', count: 7 },
  { id: 'grid', name: '均匀拼排', note: '适配任意数量' },
  { id: 'duo', name: '双列排版', note: '两列连贯展示' },
  { id: 'triptych', name: '三列展览', note: '三列整齐排布' },
  { id: 'hero', name: '主图侧栏', note: '主视觉与缩略图' },
  { id: 'hero-top', name: '上方主视觉', note: '下方陈列细节' },
  { id: 'hero-bottom', name: '下方主视觉', note: '上方陈列细节' },
  { id: 'gallery', name: '留白画廊', note: '留出标题与边距' },
  { id: 'filmstrip', name: '胶片条', note: '纵向图片序列' },
  { id: 'overlap', name: '随手拼贴', note: '错位与叠放' },
  { id: 'magazine', name: '杂志封面', note: '底图与浮动图片' },
];
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
  'Caveat',
  'Geist Variable',
  'Geist Mono Variable',
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
  '✶',
  '✴',
  '✵',
  '✹',
  '❋',
  '❈',
  '❊',
  '✻',
  '❁',
  '❃',
  '❅',
  '❆',
  '❄',
  '☀',
  '☼',
  '☁',
  '☽',
  '☄',
  '♢',
  '◇',
  '◈',
  '◊',
  '❖',
  '♧',
  '♤',
  '♬',
  '♪',
  '♫',
  '♩',
  '↗',
  '↘',
  '⇢',
  '➤',
  '➵',
  '➶',
  '❥',
  '❦',
  '❧',
  'ღ',
  '∞',
  '⌘',
  '⚘',
  '❣',
  '☙',
  '•',
  '○',
  '●',
  '◎',
  '◌',
  '⟡',
  '✢',
  '✣',
  '✥',
  '✤',
  '⋇',
];
export function posterTemplate(
  files: { id?: string; file: File }[],
  doc: Pick<PosterDocument, 'width' | 'height'>,
  template: PosterLayout,
  gap = 0,
): PosterImage[] {
  const requestedGap = Number.isFinite(gap) ? Math.max(0, gap) : 0;
  // Apply spacing after the layout so dense batches keep valid image frames.
  gap = 0;
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
  const bands: Record<string, number[]> = {
    '4-4-4': [4, 4, 4],
    '1-3-1': [1, 3, 1],
    '3-2-3': [3, 2, 3],
    '2-1-2': [2, 1, 2],
  };
  if (bands[template]?.reduce((a, b) => a + b, 0) === files.length) {
    const counts = bands[template],
      heights = template === '4-4-4' ? [0.3, 0.4, 0.3] : [0.27, 0.46, 0.27];
    let y = 0;
    counts.forEach((count, i) => {
      row(count, y, heights[i]);
      y += heights[i];
    });
  } else if (template === 'stripes') {
    row(files.length, 0, 1);
  } else if (template === 'hero-center' && files.length > 1) {
    boxes.push({
      x: 0,
      y: doc.height * 0.25,
      width: doc.width,
      height: doc.height * 0.5,
    });
    const top = Math.ceil((files.length - 1) / 2),
      bottom = files.length - 1 - top;
    row(top, 0, 0.25);
    if (bottom) row(bottom, 0.75, 0.25);
  } else if (template === '4-3-4' && files.length === 11) {
    row(4, 0, 0.3);
    row(3, 0.3, 0.4);
    row(4, 0.7, 0.3);
  } else if (template === 'mosaic' && files.length === 9) {
    row(3, 0, 0.3, [0.35, 0.35, 0.3]);
    row(3, 0.3, 0.4, [0.3, 0.4, 0.3]);
    row(3, 0.7, 0.3, [0.3, 0.35, 0.35]);
  } else if (template === '2-3-2' && files.length === 7) {
    row(2, 0, 0.35);
    row(3, 0.35, 0.3);
    row(2, 0.65, 0.35);
  } else if (
    ['hero-top', 'hero-bottom'].includes(template) &&
    files.length > 1
  ) {
    const bottom = template === 'hero-bottom',
      mainHeight = doc.height * 0.62;
    boxes.push({
      x: 0,
      y: bottom ? doc.height - mainHeight : 0,
      width: doc.width,
      height: mainHeight,
    });
    const count = files.length - 1,
      columns = Math.min(4, count),
      rows = Math.ceil(count / columns);
    for (let i = 0; i < count; i++)
      boxes.push({
        x: ((i % columns) * doc.width) / columns + gap / 2,
        y:
          (bottom ? 0 : mainHeight) +
          (Math.floor(i / columns) * doc.height * 0.38) / rows +
          gap / 2,
        width: doc.width / columns - gap,
        height: (doc.height * 0.38) / rows - gap,
      });
  } else if (template === 'filmstrip') {
    for (let i = 0; i < files.length; i++)
      boxes.push({
        x: doc.width * 0.1 + gap / 2,
        y: doc.height * 0.05 + (i * doc.height * 0.9) / files.length + gap / 2,
        width: doc.width * 0.8 - gap,
        height: (doc.height * 0.9) / files.length - gap,
      });
  } else if (template === 'magazine' && files.length > 1) {
    boxes.push({ x: 0, y: 0, width: doc.width, height: doc.height });
    const count = files.length - 1,
      columns = Math.min(count, 4),
      rows = Math.ceil(count / columns);
    for (let i = 0; i < count; i++)
      boxes.push({
        x:
          doc.width * 0.04 +
          ((i % columns) * doc.width * 0.92) / columns +
          gap / 2,
        y:
          doc.height * 0.62 +
          (Math.floor(i / columns) * doc.height * 0.34) / rows +
          gap / 2,
        width: (doc.width * 0.92) / columns - gap,
        height: (doc.height * 0.34) / rows - gap,
      });
  } else if (template === 'overlap' && files.length <= 12) {
    const columns = files.length <= 3 ? 2 : 3,
      rows = Math.ceil(files.length / columns);
    for (let i = 0; i < files.length; i++)
      boxes.push({
        x: doc.width * (0.035 + (i % columns) * 0.28 + (i % 2) * 0.035),
        y:
          doc.height *
          (0.04 + (Math.floor(i / columns) * 0.87) / rows + (i % 2) * 0.02),
        width: doc.width * 0.36,
        height: (doc.height * 0.91) / rows,
      });
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
    const columns =
        template === 'quad'
          ? 4
          : template === 'duo'
            ? 2
            : template === 'triptych'
              ? 3
              : Math.ceil(Math.sqrt((files.length * doc.width) / doc.height)),
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
    if (template === 'gallery' || template === 'polaroid')
      for (const box of boxes) {
        box.x = doc.width * 0.07 + box.x * 0.86;
        box.y = doc.height * 0.08 + box.y * 0.77;
        box.width *= 0.86;
        box.height *= template === 'polaroid' ? 0.65 : 0.77;
      }
  }
  for (const box of boxes) {
    box.x = Math.max(0, Math.min(doc.width - 1, box.x));
    box.y = Math.max(0, Math.min(doc.height - 1, box.y));
    box.width = Math.max(1, Math.min(doc.width - box.x, box.width));
    box.height = Math.max(1, Math.min(doc.height - box.y, box.height));
    const inset = Math.min(requestedGap, box.width - 1, box.height - 1);
    box.x += inset / 2;
    box.y += inset / 2;
    box.width -= inset;
    box.height -= inset;
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
    fit: 'contain',
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
function lines(
  text: string,
  context: CanvasRenderingContext2D,
  width: number,
  spacing = 0,
) {
  const result: string[] = [];
  for (const paragraph of text.split('\n')) {
    let line = '';
    for (const char of Array.from(paragraph)) {
      if (
        line &&
        context.measureText(line + char).width +
          Array.from(line).length * spacing >
          width
      ) {
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
  context.imageSmoothingQuality = 'high';
  const faces: FontFace[] = [];
  try {
    for (const font of doc.fonts || []) {
      signal.throwIfAborted();
      if (
        !doc.layers.some(
          (layer) => layer.kind === 'text' && layer.font === font.id,
        )
      )
        continue;
      const face = await new FontFace(
        font.id,
        await font.file.arrayBuffer(),
      ).load();
      document.fonts.add(face);
      faces.push(face);
    }
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
      } else if (layer.kind === 'shape' && layer.decoration) {
        const item = decoration(layer.decoration);
        context.scale(layer.width / 100, layer.height / 100);
        context.fillStyle = layer.color;
        context.strokeStyle = layer.color;
        context.lineWidth = layer.outline ? 2 : 1.5;
        context.lineCap = 'round';
        context.lineJoin = 'round';
        for (const path of item?.paths || []) {
          const shape = new Path2D(path);
          if (
            !layer.outline &&
            !['arrow', 'wave', 'bracket', 'orbit'].includes(layer.decoration)
          )
            context.fill(shape);
          context.stroke(shape);
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
        await document.fonts.load(posterFontCss(layer), layer.text);
        context.font = posterFontCss(layer);
        context.textAlign = layer.align;
        context.textBaseline = 'top';
        const spacing = posterTracking(layer),
          rows = lines(layer.text, context, layer.width, spacing),
          x =
            layer.align === 'center'
              ? layer.width / 2
              : layer.align === 'right'
                ? layer.width
                : 0;
        const paint = (
          line: string,
          px: number,
          py: number,
          stroke = false,
        ) => {
          if (!spacing) {
            if (stroke) context.strokeText(line, px, py);
            else context.fillText(line, px, py);
            return;
          }
          const chars = Array.from(line),
            width =
              context.measureText(line).width +
              Math.max(0, chars.length - 1) * spacing,
            left =
              px -
              (layer.align === 'center'
                ? width / 2
                : layer.align === 'right'
                  ? width
                  : 0);
          context.textAlign = 'left';
          let prefix = '';
          for (let i = 0; i < chars.length; i++) {
            const xx = left + context.measureText(prefix).width + i * spacing;
            if (stroke) context.strokeText(chars[i], xx, py);
            else context.fillText(chars[i], xx, py);
            prefix += chars[i];
          }
          context.textAlign = layer.align;
        };
        for (let i = 0; i < rows.length; i++) {
          const y = i * layer.size * (layer.lineHeight || 1.25),
            width = layer.size * (layer.strokeWidth ?? 0.04);
          if (y > layer.height) break;
          if (layer.style === 'extrude') {
            context.fillStyle = layer.stroke;
            for (
              let depth = Math.min(
                100,
                Math.round(layer.size * (layer.depth ?? 0.06)),
              );
              depth > 0;
              depth--
            )
              paint(rows[i], x + depth, y + depth);
          }
          context.shadowColor = 'transparent';
          context.shadowBlur = 0;
          context.shadowOffsetX = 0;
          context.shadowOffsetY = 0;
          if (['glow', 'soft-glow', 'shadow'].includes(layer.style)) {
            context.shadowColor =
              layer.style === 'glow' ? layer.color : layer.stroke;
            context.shadowBlur = layer.size * (layer.shadowBlur ?? 0.22);
            context.shadowOffsetX = layer.size * (layer.shadowX ?? 0);
            context.shadowOffsetY = layer.size * (layer.shadowY ?? 0);
          }
          context.lineJoin = 'round';
          if (layer.style === 'double-outline') {
            context.strokeStyle = layer.stroke;
            context.lineWidth = width * 3;
            paint(rows[i], x, y, true);
            context.strokeStyle = layer.color2;
            context.lineWidth = width * 1.3;
            paint(rows[i], x, y, true);
          } else if (
            ['outline', 'extrude', 'hollow', 'chrome'].includes(layer.style)
          ) {
            context.strokeStyle = layer.stroke;
            context.lineWidth = width;
            paint(rows[i], x, y, true);
          }
          if (
            ['gradient', 'extrude', 'double-outline', 'chrome'].includes(
              layer.style,
            )
          ) {
            const angle = ((layer.gradientAngle ?? 180) * Math.PI) / 180,
              dx = Math.sin(angle) * layer.width,
              dy = -Math.cos(angle) * layer.size,
              g = context.createLinearGradient(
                layer.width / 2 - dx / 2,
                y + layer.size / 2 - dy / 2,
                layer.width / 2 + dx / 2,
                y + layer.size / 2 + dy / 2,
              );
            for (const stop of posterTextStops(layer))
              g.addColorStop(stop.offset, stop.color);
            context.fillStyle = g;
          } else context.fillStyle = layer.color;
          if (layer.style !== 'hollow') paint(rows[i], x, y);
          context.shadowColor = 'transparent';
          context.shadowBlur = 0;
          const rowWidth =
              context.measureText(rows[i]).width +
              Math.max(0, Array.from(rows[i]).length - 1) * spacing,
            left =
              x -
              (layer.align === 'center'
                ? rowWidth / 2
                : layer.align === 'right'
                  ? rowWidth
                  : 0);
          for (const yy of [
            layer.underline ? y + layer.size * 1.05 : null,
            layer.strike ? y + layer.size * 0.5 : null,
          ])
            if (yy !== null) {
              context.fillStyle = layer.color;
              context.fillRect(
                left,
                yy,
                rowWidth,
                Math.max(1, layer.size * 0.035),
              );
            }
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
    for (const face of faces) document.fonts.delete(face);
    canvas.width = canvas.height = 0;
  }
}
