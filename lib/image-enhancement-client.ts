import type { EnhancementSettings } from './image-enhancement';
export async function enhanceImage(file: File, settings: EnhancementSettings, signal: AbortSignal, progress?: (value: number) => void) {
  signal.throwIfAborted(); const image = await createImageBitmap(file), canvas = document.createElement('canvas');
  try {
    if (image.width * image.height > 20_000_000) throw new Error('单张图片最多 2000 万像素，请减少尺寸后再处理。');
    canvas.width = image.width; canvas.height = image.height; const context = canvas.getContext('2d',{ willReadFrequently: true }); if (!context) throw new Error('无法读取图片');
    context.drawImage(image,0,0); const pixels = context.getImageData(0,0,canvas.width,canvas.height);
    const output = await new Promise<Uint8ClampedArray<ArrayBuffer>>((resolve,reject) => {
      const worker = new Worker(new URL('./image-enhancement-worker.ts',import.meta.url),{ type: 'module' });
      const clean = () => { worker.terminate(); signal.removeEventListener('abort',abort); }, abort = () => { clean(); reject(new Error('已取消处理，原图保留。')); };
      signal.addEventListener('abort',abort,{ once: true });
      worker.onmessage = event => { if (event.data.error) { clean(); reject(new Error(event.data.error)); } else if (event.data.data) { clean(); resolve(event.data.data); } else progress?.(event.data.progress); };
      worker.onerror = () => { clean(); reject(new Error('本机图像处理失败，请重试或减少图片尺寸。')); };
      if (signal.aborted) { abort(); return; } worker.postMessage({ data: pixels.data,width:canvas.width,height:canvas.height,settings },[pixels.data.buffer]);
    });
    signal.throwIfAborted(); context.putImageData(new ImageData(output,canvas.width,canvas.height),0,0);
    const blob = await new Promise<Blob>((resolve,reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('PNG 导出失败')),'image/png'));
    signal.throwIfAborted(); return { file: new File([blob],`${file.name.replace(/\.[^.]+$/,'')}-清晰增强.png`,{ type: 'image/png' }),width:canvas.width,height:canvas.height };
  } finally { image.close(); canvas.width = canvas.height = 0; }
}
