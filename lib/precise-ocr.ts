let worker: Worker | undefined;
let sequence = 0;
const pending = new Map<number, { resolve: (result: { text: string; confidence: number }) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>();

/** Recognition runs off the UI thread, so editing and scrolling stay responsive. */
export async function preciseText(canvas: HTMLCanvasElement): Promise<{ text: string; confidence: number }> {
  if (!worker) {
    worker = new Worker(new URL('./precise-ocr-worker.ts', import.meta.url), { type: 'module' });
    worker.addEventListener('message', event => {
      const request = pending.get(event.data.id); if (!request) return;
      pending.delete(event.data.id); clearTimeout(request.timer);
      if (event.data.error) request.reject(new Error(event.data.error)); else request.resolve(event.data.result);
    });
    worker.addEventListener('error', event => {
      for (const request of pending.values()) { clearTimeout(request.timer); request.reject(new Error(event.message || '精细识别暂时不可用')); }
      pending.clear(); worker?.terminate(); worker = undefined;
    });
  }
  const pixels = canvas.getContext('2d', { willReadFrequently: true })?.getImageData(0, 0, canvas.width, canvas.height);
  if (!pixels) throw new Error('无法读取截图像素');
  const id = ++sequence, path = `${(process.env.NEXT_PUBLIC_BASE_PATH || '').replace(/\/$/, '')}/ocr/paddle/`;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      for (const request of pending.values()) { clearTimeout(request.timer); request.reject(new Error('精细识别加载超时，请检查网络或稍后重试')); }
      pending.clear(); worker?.terminate(); worker = undefined;
    }, 90000);
    pending.set(id, { resolve, reject, timer });
    worker!.postMessage({ id, pixels, path }, [pixels.data.buffer]);
  });
}
