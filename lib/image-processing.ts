import {
  compositionSize,
  compositionStack,
  fitCompositionToContent,
  layerGeometry,
  resolveComposition,
  type ContentBounds,
  type LayerTransform,
  type WatermarkComposition,
} from './watermark-composition';

export type NumberPosition =
  | 'top-left'
  | 'top'
  | 'top-right'
  | 'left'
  | 'center'
  | 'right'
  | 'bottom-left'
  | 'bottom'
  | 'bottom-right';

export type WatermarkCrop = {
  top: number;
  right: number;
  bottom: number;
  left: number;
};

export type WatermarkLayerInput = LayerTransform & {
  file: File;
};

export type ProcessedImage = {
  id: string;
  name: string;
  blob: Blob;
  url: string;
  sourceName: string;
};

export type CollageOptions = {
  ratioWidth: number;
  ratioHeight: number;
  columns: number;
  rows: number;
  numberImages: boolean;
  startNumber: number;
  numberPosition: NumberPosition;
  numberSize: number;
  numberColor: string;
  numberBackground: string;
  numberBackgroundOpacity: number;
  numberShape: 'none' | 'square' | 'pill';
  numberWeight: 400 | 600 | 800;
  numberDigits: number;
  canvasWidth?: number;
  canvasHeight?: number;
  format: 'image/png' | 'image/jpeg';
};

function uid(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function loadImage(source: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(source);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('图片无法读取'));
    };
    image.src = url;
  });
}

export function canvasBlob(
  canvas: HTMLCanvasElement,
  format: string,
  quality = 0.92,
) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('图片导出失败'))),
      format,
      quality,
    );
  });
}

const contentMeasurements = new WeakMap<
  HTMLImageElement,
  { bounds: ContentBounds | null; opaque: boolean }
>();
/** Scan in strips: transparent PNG padding must not enlarge an automatic canvas. */
export function imageContentBounds(image: HTMLImageElement) {
  const cached = contentMeasurements.get(image);
  if (cached) return cached;
  const width = image.naturalWidth,
    height = image.naturalHeight;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = Math.min(128, height);
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('无法测量图层边界');
  let left = width,
    right = 0,
    top = height,
    bottom = 0,
    opaque = true;
  try {
    for (let y = 0; y < height; y += canvas.height) {
      const rows = Math.min(canvas.height, height - y);
      context.clearRect(0, 0, width, canvas.height);
      context.drawImage(image, 0, y, width, rows, 0, 0, width, rows);
      const pixels = context.getImageData(0, 0, width, rows).data;
      for (let i = 3; i < pixels.length; i += 4) {
        if (pixels[i] < 255) opaque = false;
        if (!pixels[i]) continue;
        const x = ((i - 3) / 4) % width,
          py = y + Math.floor((i - 3) / 4 / width);
        left = Math.min(left, x);
        right = Math.max(right, x + 1);
        top = Math.min(top, py);
        bottom = Math.max(bottom, py + 1);
      }
    }
    const result = {
      bounds:
        right > left
          ? {
              left: left / width,
              top: top / height,
              right: right / width,
              bottom: bottom / height,
            }
          : null,
      opaque,
    };
    contentMeasurements.set(image, result);
    return result;
  } finally {
    canvas.width = canvas.height = 0;
  }
}

export function fitImageComposition<T extends WatermarkLayerInput>(
  width: number,
  height: number,
  layers: T[],
  decoded: HTMLImageElement[],
  composition?: WatermarkComposition,
  source?: HTMLImageElement,
) {
  return fitCompositionToContent(
    width,
    height,
    layers,
    decoded.map((image) => ({
      width: image.naturalWidth,
      height: image.naturalHeight,
      bounds: imageContentBounds(image).bounds,
    })),
    composition,
    source ? imageContentBounds(source).bounds : undefined,
  );
}

function drawCover(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  const imageRatio = image.naturalWidth / image.naturalHeight;
  const cellRatio = width / height;
  let sourceWidth = image.naturalWidth;
  let sourceHeight = image.naturalHeight;
  let sourceX = 0;
  let sourceY = 0;

  if (imageRatio > cellRatio) {
    sourceWidth = image.naturalHeight * cellRatio;
    sourceX = (image.naturalWidth - sourceWidth) / 2;
  } else {
    sourceHeight = image.naturalWidth / cellRatio;
    sourceY = (image.naturalHeight - sourceHeight) / 2;
  }

  context.drawImage(
    image,
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    x,
    y,
    width,
    height,
  );
}

function hexToRgba(hex: string, opacity: number) {
  const value = hex.replace('#', '');
  const expanded =
    value.length === 3
      ? value
          .split('')
          .map((part) => `${part}${part}`)
          .join('')
      : value.padEnd(6, '0').slice(0, 6);
  const number = Number.parseInt(expanded, 16);
  const red = (number >> 16) & 255;
  const green = (number >> 8) & 255;
  const blue = number & 255;
  return `rgba(${red}, ${green}, ${blue}, ${Math.max(0, Math.min(1, opacity))})`;
}

function numberPlacement(
  position: NumberPosition,
  cellX: number,
  cellY: number,
  cellWidth: number,
  cellHeight: number,
  boxWidth: number,
  boxHeight: number,
) {
  const margin = Math.max(4, Math.min(cellWidth, cellHeight) * 0.035);
  const x =
    position.endsWith('left') || position === 'left'
      ? cellX + margin
      : position.endsWith('right') || position === 'right'
        ? cellX + cellWidth - boxWidth - margin
        : cellX + (cellWidth - boxWidth) / 2;
  const y =
    position.startsWith('top') || position === 'top'
      ? cellY + margin
      : position.startsWith('bottom') || position === 'bottom'
        ? cellY + cellHeight - boxHeight - margin
        : cellY + (cellHeight - boxHeight) / 2;
  return { x, y };
}

export function drawCompositionLayer(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  watermark: CanvasImageSource,
  layer: LayerTransform,
  naturalWidth: number,
  naturalHeight: number,
  referenceWidth: number,
) {
  const {
    sx: sourceX,
    sy: sourceY,
    sw: sourceWidth,
    sh: sourceHeight,
    width: drawWidth,
    height: drawHeight,
  } = layerGeometry(layer, naturalWidth, naturalHeight, referenceWidth);
  context.save();
  context.globalAlpha = Math.max(0, Math.min(layer.opacity, 1));
  context.translate(width * layer.x, height * layer.y);
  context.rotate((layer.rotation * Math.PI) / 180);
  context.drawImage(
    watermark,
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    -drawWidth / 2,
    -drawHeight / 2,
    drawWidth,
    drawHeight,
  );
  context.restore();
}

export function drawWatermarkComposition(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  layers: WatermarkLayerInput[],
  decoded: HTMLImageElement[],
  composition?: WatermarkComposition,
) {
  const c = resolveComposition(composition);
  context.clearRect(0, 0, width, height);
  if (c.background !== 'transparent') {
    context.fillStyle = c.background;
    context.fillRect(0, 0, width, height);
  }
  const stack = compositionStack<{
    image: CanvasImageSource;
    w: number;
    h: number;
    layer: LayerTransform;
  }>(
    layers.map((layer, i) => ({
      image: decoded[i] as CanvasImageSource,
      w: decoded[i].naturalWidth,
      h: decoded[i].naturalHeight,
      layer,
    })),
    { image: source, w: sourceWidth, h: sourceHeight, layer: c.source },
    c.sourceIndex,
  );
  for (const item of stack)
    drawCompositionLayer(
      context,
      width,
      height,
      item.image,
      item.layer,
      item.w,
      item.h,
      sourceWidth,
    );
}

export async function applyWatermarks(
  files: File[],
  layers: WatermarkLayerInput[],
  onProgress: (done: number, total: number) => void,
  onItem?: (item: ProcessedImage, index: number) => void | Promise<void>,
  signal?: AbortSignal,
  composition?: WatermarkComposition,
): Promise<ProcessedImage[]> {
  const results: ProcessedImage[] = [];

  const decodedLayers = await Promise.all(
    layers.map((layer) => loadImage(layer.file)),
  );
  for (let index = 0; index < files.length; index += 1) {
    signal?.throwIfAborted();
    const file = files[index];
    const base = await loadImage(file);
    const fitted = composition?.fitContent
      ? fitImageComposition(
          base.naturalWidth,
          base.naturalHeight,
          layers,
          decodedLayers,
          composition,
          base,
        )
      : { layers, composition };
    const canvas = document.createElement('canvas');
    const size = compositionSize(
      base.naturalWidth,
      base.naturalHeight,
      fitted.composition,
    );
    canvas.width = size.width;
    canvas.height = size.height;
    const context = canvas.getContext('2d', { alpha: true });
    if (!context) throw new Error('当前浏览器无法创建图片画布');
    drawWatermarkComposition(
      context,
      canvas.width,
      canvas.height,
      base,
      base.naturalWidth,
      base.naturalHeight,
      fitted.layers,
      decodedLayers,
      fitted.composition,
    );
    signal?.throwIfAborted();

    const blob = await canvasBlob(canvas, 'image/png');
    const result = {
      id: uid('watermarked'),
      name: `${file.name.replace(/\.[^.]+$/, '')}-watermarked.png`,
      sourceName: file.name,
      blob,
      url: URL.createObjectURL(blob),
    };
    results.push(result);
    signal?.throwIfAborted();
    await onItem?.(result, index);
    onProgress(index + 1, files.length);
    await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
  }

  return results;
}

export async function createCollages(
  files: File[],
  options: CollageOptions,
  onProgress: (done: number, total: number) => void,
  signal?: AbortSignal,
  onItem?: (item: ProcessedImage, boardIndex: number) => void | Promise<void>,
  startBoard = 0,
  jobId?: string,
): Promise<ProcessedImage[]> {
  const perBoard = Math.max(1, options.columns * options.rows);
  const totalBoards = Math.ceil(files.length / perBoard);
  const results: ProcessedImage[] = [];
  const ratio = options.ratioWidth / options.ratioHeight;
  const longEdge = 2400;
  const canvasWidth = options.canvasWidth
    ? Math.max(320, Math.min(8000, Math.round(options.canvasWidth)))
    : ratio >= 1
      ? longEdge
      : Math.round(longEdge * ratio);
  const canvasHeight = options.canvasHeight
    ? Math.max(320, Math.min(8000, Math.round(options.canvasHeight)))
    : ratio >= 1
      ? Math.round(longEdge / ratio)
      : longEdge;

  for (let boardIndex = startBoard; boardIndex < totalBoards; boardIndex += 1) {
    signal?.throwIfAborted();
    const batch = files.slice(
      boardIndex * perBoard,
      (boardIndex + 1) * perBoard,
    );
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(320, canvasWidth);
    canvas.height = Math.max(320, canvasHeight);
    const context = canvas.getContext('2d', {
      alpha: options.format === 'image/png',
    });
    if (!context) throw new Error('当前浏览器无法创建拼图画布');
    context.fillStyle = '#17131c';
    context.fillRect(0, 0, canvas.width, canvas.height);

    const gap = Math.max(
      2,
      Math.round(Math.min(canvas.width, canvas.height) * 0.003),
    );
    const cellWidth =
      (canvas.width - gap * (options.columns - 1)) / options.columns;
    const cellHeight =
      (canvas.height - gap * (options.rows - 1)) / options.rows;

    for (let imageIndex = 0; imageIndex < batch.length; imageIndex += 1) {
      signal?.throwIfAborted();
      const image = await loadImage(batch[imageIndex]);
      const column = imageIndex % options.columns;
      const row = Math.floor(imageIndex / options.columns);
      const x = column * (cellWidth + gap);
      const y = row * (cellHeight + gap);
      drawCover(context, image, x, y, cellWidth, cellHeight);

      if (options.numberImages) {
        const number = options.startNumber + boardIndex * perBoard + imageIndex;
        const fontSize = Math.round(
          Math.max(
            10,
            Math.min(cellWidth, cellHeight) *
              Math.max(0.03, Math.min(0.4, options.numberSize)),
          ),
        );
        const label = String(number).padStart(
          Math.max(0, Math.min(8, options.numberDigits)),
          '0',
        );
        context.font = `${options.numberWeight} ${fontSize}px ui-monospace, monospace`;
        const textWidth = context.measureText(label).width;
        const padX = options.numberShape === 'none' ? 0 : fontSize * 0.4;
        const padY = options.numberShape === 'none' ? 0 : fontSize * 0.22;
        const boxWidth = textWidth + padX * 2;
        const boxHeight = fontSize + padY * 2;
        const placement = numberPlacement(
          options.numberPosition,
          x,
          y,
          cellWidth,
          cellHeight,
          boxWidth,
          boxHeight,
        );
        if (options.numberShape !== 'none') {
          context.fillStyle = hexToRgba(
            options.numberBackground,
            options.numberBackgroundOpacity,
          );
          context.beginPath();
          if (options.numberShape === 'pill')
            context.roundRect(
              placement.x,
              placement.y,
              boxWidth,
              boxHeight,
              boxHeight / 2,
            );
          else context.rect(placement.x, placement.y, boxWidth, boxHeight);
          context.fill();
        }
        context.fillStyle = options.numberColor;
        context.textBaseline = 'top';
        context.fillText(label, placement.x + padX, placement.y + padY * 0.72);
      }
    }

    const blob = await canvasBlob(canvas, options.format, 0.92);
    const extension = options.format === 'image/png' ? 'png' : 'jpg';
    results.push({
      id: jobId ? `${jobId}-${boardIndex}` : uid('collage'),
      name: `PRISM-collage-${String(boardIndex + 1).padStart(3, '0')}.${extension}`,
      sourceName: `${batch.length} 张图片`,
      blob,
      url: URL.createObjectURL(blob),
    });
    signal?.throwIfAborted();
    await onItem?.(results[results.length - 1], boardIndex);
    onProgress(boardIndex + 1, totalBoards);
    await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
  }

  return results;
}

export function asFiles(results: ProcessedImage[]) {
  return results.map(
    (result) =>
      new File([result.blob], result.name, { type: result.blob.type }),
  );
}
