export type WatermarkPosition =
  | 'full'
  | 'top-left'
  | 'top'
  | 'top-right'
  | 'left'
  | 'center'
  | 'right'
  | 'bottom-left'
  | 'bottom'
  | 'bottom-right';

export type WatermarkLayerInput = {
  file: File;
  opacity: number;
  position: WatermarkPosition;
  scale: number;
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
  format: 'image/png' | 'image/jpeg';
};

function uid(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function loadImage(source: Blob): Promise<HTMLImageElement> {
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

function canvasBlob(canvas: HTMLCanvasElement, format: string, quality = 0.92) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => blob ? resolve(blob) : reject(new Error('图片导出失败')),
      format,
      quality,
    );
  });
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

function placedRect(
  image: HTMLImageElement,
  canvasWidth: number,
  canvasHeight: number,
  position: Exclude<WatermarkPosition, 'full'>,
  scale: number,
) {
  const safeScale = Math.max(0.05, Math.min(scale, 1));
  const width = canvasWidth * safeScale;
  const height = width / (image.naturalWidth / image.naturalHeight);
  const margin = Math.max(18, Math.min(canvasWidth, canvasHeight) * 0.035);
  const left = margin;
  const centerX = (canvasWidth - width) / 2;
  const right = canvasWidth - width - margin;
  const top = margin;
  const centerY = (canvasHeight - height) / 2;
  const bottom = canvasHeight - height - margin;

  const positions: Record<Exclude<WatermarkPosition, 'full'>, [number, number]> = {
    'top-left': [left, top],
    top: [centerX, top],
    'top-right': [right, top],
    left: [left, centerY],
    center: [centerX, centerY],
    right: [right, centerY],
    'bottom-left': [left, bottom],
    bottom: [centerX, bottom],
    'bottom-right': [right, bottom],
  };

  const [x, y] = positions[position];
  return { x, y, width, height };
}

export async function applyWatermarks(
  files: File[],
  layers: WatermarkLayerInput[],
  onProgress: (done: number, total: number) => void,
  onItem?: (item: ProcessedImage) => void,
): Promise<ProcessedImage[]> {
  const results: ProcessedImage[] = [];

  for (let index = 0; index < files.length; index += 1) {
    const file = files[index];
    const base = await loadImage(file);
    const canvas = document.createElement('canvas');
    canvas.width = base.naturalWidth;
    canvas.height = base.naturalHeight;
    const context = canvas.getContext('2d', { alpha: true });
    if (!context) throw new Error('当前浏览器无法创建图片画布');
    context.drawImage(base, 0, 0);

    for (const layer of layers) {
      const watermark = await loadImage(layer.file);
      context.save();
      context.globalAlpha = Math.max(0, Math.min(layer.opacity, 1));
      if (layer.position === 'full') {
        context.drawImage(watermark, 0, 0, canvas.width, canvas.height);
      } else {
        const rect = placedRect(watermark, canvas.width, canvas.height, layer.position, layer.scale);
        context.drawImage(watermark, rect.x, rect.y, rect.width, rect.height);
      }
      context.restore();
    }

    const blob = await canvasBlob(canvas, 'image/png');
    const result = {
      id: uid('watermarked'),
      name: `${file.name.replace(/\.[^.]+$/, '')}-watermarked.png`,
      sourceName: file.name,
      blob,
      url: URL.createObjectURL(blob),
    };
    results.push(result);
    onItem?.(result);
    onProgress(index + 1, files.length);
    await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
  }

  return results;
}

export async function createCollages(
  files: File[],
  options: CollageOptions,
  onProgress: (done: number, total: number) => void,
): Promise<ProcessedImage[]> {
  const perBoard = Math.max(1, options.columns * options.rows);
  const totalBoards = Math.ceil(files.length / perBoard);
  const results: ProcessedImage[] = [];
  const ratio = options.ratioWidth / options.ratioHeight;
  const longEdge = 2400;
  const canvasWidth = ratio >= 1 ? longEdge : Math.round(longEdge * ratio);
  const canvasHeight = ratio >= 1 ? Math.round(longEdge / ratio) : longEdge;

  for (let boardIndex = 0; boardIndex < totalBoards; boardIndex += 1) {
    const batch = files.slice(boardIndex * perBoard, (boardIndex + 1) * perBoard);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(320, canvasWidth);
    canvas.height = Math.max(320, canvasHeight);
    const context = canvas.getContext('2d', { alpha: options.format === 'image/png' });
    if (!context) throw new Error('当前浏览器无法创建拼图画布');
    context.fillStyle = '#17131c';
    context.fillRect(0, 0, canvas.width, canvas.height);

    const gap = Math.max(2, Math.round(Math.min(canvas.width, canvas.height) * 0.003));
    const cellWidth = (canvas.width - gap * (options.columns - 1)) / options.columns;
    const cellHeight = (canvas.height - gap * (options.rows - 1)) / options.rows;

    for (let imageIndex = 0; imageIndex < batch.length; imageIndex += 1) {
      const image = await loadImage(batch[imageIndex]);
      const column = imageIndex % options.columns;
      const row = Math.floor(imageIndex / options.columns);
      const x = column * (cellWidth + gap);
      const y = row * (cellHeight + gap);
      drawCover(context, image, x, y, cellWidth, cellHeight);

      if (options.numberImages) {
        const number = options.startNumber + boardIndex * perBoard + imageIndex;
        const fontSize = Math.round(Math.max(16, Math.min(cellWidth, cellHeight) * 0.095));
        const label = String(number).padStart(Math.max(3, String(options.startNumber).length), '0');
        context.font = `600 ${fontSize}px ui-monospace, monospace`;
        const textWidth = context.measureText(label).width;
        const padX = fontSize * 0.38;
        const padY = fontSize * 0.25;
        const labelX = x + fontSize * 0.28;
        const labelY = y + cellHeight - fontSize * 0.28;
        context.fillStyle = 'rgba(19, 14, 24, 0.76)';
        context.fillRect(
          labelX - padX,
          labelY - fontSize - padY,
          textWidth + padX * 2,
          fontSize + padY * 1.8,
        );
        context.fillStyle = '#f6f2fb';
        context.fillText(label, labelX, labelY - padY * 0.35);
      }
    }

    const blob = await canvasBlob(canvas, options.format, 0.92);
    const extension = options.format === 'image/png' ? 'png' : 'jpg';
    results.push({
      id: uid('collage'),
      name: `PRISM-collage-${String(boardIndex + 1).padStart(3, '0')}.${extension}`,
      sourceName: `${batch.length} 张图片`,
      blob,
      url: URL.createObjectURL(blob),
    });
    onProgress(boardIndex + 1, totalBoards);
    await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
  }

  return results;
}

export function asFiles(results: ProcessedImage[]) {
  return results.map((result) => new File([result.blob], result.name, { type: result.blob.type }));
}
