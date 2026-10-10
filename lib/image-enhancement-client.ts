import { runEnhancement } from './enhancement-runner';
import type { EnhancementSettings } from './image-enhancement';
import { enhancementSize, type EnhancementMode } from './super-resolution';
import { imageAdvice } from './image-quality';
export async function assessImage(file: File) {
  const image = await createImageBitmap(file),
    canvas = document.createElement('canvas');
  try {
    const scale = Math.min(1, 384 / Math.max(image.width, image.height));
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('无法检测图片');
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return imageAdvice(
      image.width,
      image.height,
      context.getImageData(0, 0, canvas.width, canvas.height).data,
      canvas.width,
      canvas.height,
    );
  } finally {
    image.close();
    canvas.width = canvas.height = 0;
  }
}
export async function enhanceImage(
  file: File,
  settings: EnhancementSettings,
  signal: AbortSignal,
  progress?: (value: number, label?: string) => void,
  mode: EnhancementMode = 'clarity',
) {
  signal.throwIfAborted();
  const image = await createImageBitmap(file),
    canvas = document.createElement('canvas');
  try {
    const size = enhancementSize(image.width, image.height, mode);
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('无法读取图片');
    context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
    const output = await runEnhancement(
      pixels.data,
      canvas.width,
      canvas.height,
      settings,
      mode,
      signal,
      progress,
    );
    signal.throwIfAborted();
    canvas.width = size.width;
    canvas.height = size.height;
    context.putImageData(
      new ImageData(output, canvas.width, canvas.height),
      0,
      0,
    );
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (value) => (value ? resolve(value) : reject(new Error('PNG 导出失败'))),
        'image/png',
      ),
    );
    const revision = Array.from(
      new Uint8Array(
        await crypto.subtle.digest('SHA-256', await blob.arrayBuffer()),
      ),
      (byte) => byte.toString(16).padStart(2, '0'),
    ).join('');
    signal.throwIfAborted();
    return {
      file: new File(
        [blob],
        `${file.name.replace(/\.[^.]+$/, '')}-${size.scale > 1 ? `超分${size.scale}x` : '清晰增强'}.png`,
        { type: 'image/png' },
      ),
      width: canvas.width,
      height: canvas.height,
      revision,
    };
  } finally {
    image.close();
    canvas.width = canvas.height = 0;
  }
}
