import type { EnhancementSettings } from './image-enhancement';
import type { EnhancementMode } from './super-resolution';

let worker: Worker | undefined;
let idle: ReturnType<typeof setTimeout> | undefined;
let queue: Promise<unknown> = Promise.resolve();
const dispose = () => {
  worker?.terminate();
  worker = undefined;
  clearTimeout(idle);
};

/** One warm engine per tab. Serialize jobs to bound phone memory, and terminate
 * only for cancellation/failure or after a minute without work. */
export function runEnhancement(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  settings: EnhancementSettings,
  mode: EnhancementMode,
  signal: AbortSignal,
  progress?: (value: number, label?: string) => void,
) {
  const job = queue
    .catch(() => {})
    .then(() => {
      signal.throwIfAborted();
      clearTimeout(idle);
      worker ??= new Worker(
        new URL('./image-enhancement-worker.ts', import.meta.url),
        { type: 'module' },
      );
      const engine = worker;
      return new Promise<Uint8ClampedArray<ArrayBuffer>>((resolve, reject) => {
        const finish = () => {
          signal.removeEventListener('abort', abort);
          engine.onmessage = null;
          engine.onerror = null;
          idle = setTimeout(dispose, 60000);
        };
        const abort = () => {
          finish();
          dispose();
          reject(new Error('已取消处理，原图保留。'));
        };
        signal.addEventListener('abort', abort, { once: true });
        engine.onmessage = (event) => {
          if (event.data.error) {
            finish();
            dispose();
            reject(new Error(event.data.error));
          } else if (event.data.data) {
            finish();
            resolve(event.data.data);
          } else progress?.(event.data.progress, event.data.label);
        };
        engine.onerror = () => {
          finish();
          dispose();
          reject(new Error('本机图像处理失败，请重试或减少图片尺寸。'));
        };
        if (signal.aborted) {
          abort();
          return;
        }
        engine.postMessage(
          {
            data,
            width,
            height,
            settings,
            mode,
            path: `${process.env.NEXT_PUBLIC_BASE_PATH || ''}/enhancement/`,
          },
          [data.buffer],
        );
      });
    });
  queue = job.then(() => undefined, () => undefined);
  return job;
}
