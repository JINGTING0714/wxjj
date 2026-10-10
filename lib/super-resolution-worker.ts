import {
  enhancementSize,
  resolutionTiles,
  type EnhancementMode,
} from './super-resolution';
import { enhancePixels, type EnhancementSettings } from './image-enhancement';

export async function superResolve(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  mode: EnhancementMode,
  settings: EnhancementSettings,
  path: string,
  progress: (value: number, label?: string) => void,
) {
  const size = enhancementSize(width, height, mode);
  progress(0.01, '加载本机超分辨率模型');
  let ort: typeof import('onnxruntime-web/wasm');
  const response = await fetch(`${path}realesr-animevideov3.onnx`).catch(() => {
    throw new Error(
      '超分辨率模型暂时无法下载，请检查网络后重试；也可以先用原图打水印。',
    );
  });
  if (!response.ok) throw new Error('超分辨率模型加载失败，请检查网络后重试。');
  const model = await response.arrayBuffer();
  const digest = Array.from(
    new Uint8Array(await crypto.subtle.digest('SHA-256', model)),
    (byte) => byte.toString(16).padStart(2, '0'),
  ).join('');
  if (
    digest !==
    '9471c57a9a5d2b7ff66806c65edeb230709d2efc7df4f3561a75614b58d9384b'
  )
    throw new Error('超分辨率模型校验失败，请刷新后重试。');
  let session: import('onnxruntime-web').InferenceSession,
    accelerated = false;
  const adapter = await (
    navigator as Navigator & {
      gpu?: { requestAdapter: () => Promise<unknown> };
    }
  ).gpu
    ?.requestAdapter()
    .catch(() => null);
  try {
    if (!adapter) throw new Error('GPU unavailable');
    ort = await import('onnxruntime-web/webgpu');
    ort.env.wasm.wasmPaths = path;
    ort.env.wasm.numThreads = 1;
    ort.env.wasm.proxy = false;
    ort.env.webgpu.adapter = adapter as typeof ort.env.webgpu.adapter;
    session = await ort.InferenceSession.create(model, {
      executionProviders: ['webgpu'],
      graphOptimizationLevel: 'all',
    });
    accelerated = true;
  } catch {
    ort = await import('onnxruntime-web/wasm');
    ort.env.wasm.wasmPaths = path;
    ort.env.wasm.numThreads = 1;
    ort.env.wasm.proxy = false;
    session = await ort.InferenceSession.create(model, {
      executionProviders: ['wasm'],
      graphOptimizationLevel: 'all',
    });
  }
  const tone = enhancePixels(data, width, height, {
      ...settings,
      sharpen: settings.sharpen * 0.5,
    }),
    output = new Uint8ClampedArray(size.width * size.height * 4),
    tiles = resolutionTiles(width, height);
  try {
    for (let index = 0; index < tiles.length; index++) {
      const tile = tiles[index],
        plane = tile.inputWidth * tile.inputHeight,
        input = new Float32Array(plane * 3);
      for (let y = 0; y < tile.inputHeight; y++)
        for (let x = 0; x < tile.inputWidth; x++) {
          const source = ((tile.top + y) * width + tile.left + x) * 4,
            p = y * tile.inputWidth + x;
          for (let c = 0; c < 3; c++)
            input[c * plane + p] = tone[source + c] / 255;
        }
      const tensor = new ort.Tensor('float32', input, [
        1,
        3,
        tile.inputHeight,
        tile.inputWidth,
      ]);
      let result: Record<string, import('onnxruntime-web').Tensor> | undefined;
      try {
        result = await session.run({ [session.inputNames[0]]: tensor });
        const image = result[session.outputNames[0]],
          values = image.data as Float32Array,
          modelWidth = tile.inputWidth * 4,
          modelHeight = tile.inputHeight * 4,
          modelPlane = modelWidth * modelHeight;
        if (image.dims[2] !== modelHeight || image.dims[3] !== modelWidth)
          throw new Error('超分辨率输出尺寸异常');
        const step = 4 / size.scale,
          ox = (tile.x - tile.left) * 4,
          oy = (tile.y - tile.top) * 4;
        for (let y = 0; y < tile.height * size.scale; y++)
          for (let x = 0; x < tile.width * size.scale; x++) {
            const out =
              ((tile.y * size.scale + y) * size.width +
                tile.x * size.scale +
                x) *
              4;
            for (let c = 0; c < 3; c++) {
              let sum = 0;
              for (let sy = 0; sy < step; sy++)
                for (let sx = 0; sx < step; sx++)
                  sum +=
                    values[
                      c * modelPlane +
                        (oy + y * step + sy) * modelWidth +
                        ox +
                        x * step +
                        sx
                    ];
              if (!Number.isFinite(sum))
                throw new Error('模型输出异常，增强结果未保存，请重试。');
              output[out + c] = Math.max(
                0,
                Math.min(255, (sum / (step * step)) * 255),
              );
            }
            // Keep the original opacity geometry; alpha is interpolated, not inferred.
            const ax = Math.max(
                0,
                Math.min(width - 1, tile.x + (x + 0.5) / size.scale - 0.5),
              ),
              ay = Math.max(
                0,
                Math.min(height - 1, tile.y + (y + 0.5) / size.scale - 0.5),
              ),
              ix = Math.floor(ax),
              iy = Math.floor(ay),
              fx = ax - ix,
              fy = ay - iy;
            const alpha = (px: number, py: number) =>
              data[(py * width + px) * 4 + 3];
            output[out + 3] =
              (alpha(ix, iy) * (1 - fx) +
                alpha(Math.min(width - 1, ix + 1), iy) * fx) *
                (1 - fy) +
              (alpha(ix, Math.min(height - 1, iy + 1)) * (1 - fx) +
                alpha(
                  Math.min(width - 1, ix + 1),
                  Math.min(height - 1, iy + 1),
                ) *
                  fx) *
                fy;
          }
      } finally {
        tensor.dispose();
        if (result) Object.values(result).forEach((value) => value.dispose());
      }
      progress(
        0.08 + (0.92 * (index + 1)) / tiles.length,
        `${accelerated ? 'GPU' : '本机 CPU'} 超分辨率 · ${index + 1}/${tiles.length} 块`,
      );
    }
    return { data: output, width: size.width, height: size.height };
  } finally {
    await session.release();
  }
}
