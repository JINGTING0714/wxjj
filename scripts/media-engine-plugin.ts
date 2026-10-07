import { copyFile, mkdir, open, readFile, stat, writeFile } from 'node:fs/promises';
import type { Plugin } from 'vite';

/** Generate versioned, same-origin codec assets. No CDN, runtime upload or server encoding. */
export function mediaEngineAssets(): Plugin {
  return {
    name: 'prism-local-media-engine',
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const name = request.url?.split('?')[0].split('/').pop();
        if (!request.url?.includes('/ocr/paddle/') || name !== 'ort-wasm-simd-threaded.mjs') { next(); return; }
        void readFile(new URL(`../public/ocr/paddle/${name}`, import.meta.url)).then(bytes => { response.setHeader('Content-Type', 'text/javascript'); response.end(bytes); }, next);
      });
    },
    async configResolved() {
      const root = new URL('../', import.meta.url);
      const ocrTarget = new URL('public/ocr/paddle/', root);
      await mkdir(ocrTarget, { recursive: true });
      for (const name of ['ch_PP-OCRv4_rec_infer.onnx', 'ppocr_keys_v1.txt'])
        await copyFile(new URL(`node_modules/@gutenye/ocr-models/assets/${name}`, root), new URL(name, ocrTarget));
      for (const name of ['ort-wasm-simd-threaded.wasm', 'ort-wasm-simd-threaded.mjs'])
        await copyFile(new URL(`node_modules/onnxruntime-web/dist/${name}`, root), new URL(name, ocrTarget));
      const target = new URL('public/media-engine/v0.12.10-0.12.15/', root);
      await mkdir(target, { recursive: true });
      for (const name of ['worker.js', 'const.js', 'errors.js'])
        await copyFile(
          new URL(`node_modules/@ffmpeg/ffmpeg/dist/esm/${name}`, root),
          new URL(name, target),
        );
      await copyFile(
        new URL('node_modules/@ffmpeg/core/dist/esm/ffmpeg-core.js', root),
        new URL('ffmpeg-core.js', target),
      );
      const wasmPath = new URL(
        'node_modules/@ffmpeg/core/dist/esm/ffmpeg-core.wasm',
        root,
      );
      const { size } = await stat(wasmPath);
      // Keep individual static assets below hosting limits, reconstruct only in the user's browser.
      const parts: string[] = [];
      const handle = await open(wasmPath, 'r');
      try {
        const chunkSize = 8 * 1024 * 1024;
        const buffer = Buffer.allocUnsafe(chunkSize);
        for (let offset = 0; offset < size; offset += chunkSize) {
          const name = `core-${parts.length}.bin`;
          parts.push(name);
          const length = Math.min(chunkSize, size - offset);
          let read = 0;
          while (read < length) {
            const { bytesRead } = await handle.read(
              buffer,
              read,
              length - read,
              offset + read,
            );
            if (!bytesRead)
              throw new Error('Incomplete installed media engine');
            read += bytesRead;
          }
          await writeFile(new URL(name, target), buffer.subarray(0, length));
        }
      } finally {
        await handle.close();
      }
      await writeFile(
        new URL('manifest.json', target),
        JSON.stringify({ parts, bytes: size }),
      );
    },
  };
}
