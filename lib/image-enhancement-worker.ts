import { enhancePixels, type EnhancementSettings } from './image-enhancement';
import type { EnhancementMode } from './super-resolution';
self.addEventListener(
  'message',
  async (
    event: MessageEvent<{
      data: Uint8ClampedArray;
      width: number;
      height: number;
      settings: EnhancementSettings;
      mode?: EnhancementMode;
      path: string;
    }>,
  ) => {
    try {
      const {
        data,
        width,
        height,
        settings,
        mode = 'clarity',
        path,
      } = event.data;
      const result =
        mode === 'clarity'
          ? {
              data: enhancePixels(data, width, height, settings, (progress) =>
                self.postMessage({ progress }),
              ),
              width,
              height,
            }
          : await (
              await import('./super-resolution-worker')
            ).superResolve(
              data,
              width,
              height,
              mode,
              settings,
              path,
              (progress, label) => self.postMessage({ progress, label }),
            );
      self.postMessage(result, { transfer: [result.data.buffer] });
    } catch (reason) {
      console.warn('Local image enhancement:', reason);
      const message = reason instanceof Error ? reason.message : '';
      self.postMessage({
        error:
          message && /[^\x00-\x7f]/.test(message)
            ? message
            : '本机超分辨率引擎暂时无法处理这张图片。请改用较低倍数或原尺寸增强，也可以先把原图送去水印工坊。',
      });
    }
  },
);
