import type { FFmpeg } from '@ffmpeg/ffmpeg';

/** One worker per batch, released on completion/pause/lock. No media survives a job. */
export class VideoEngineSession {
  private engine?: FFmpeg;
  private wasmUrl = '';

  async get(
    signal: AbortSignal,
    report: (value: number, phase: string) => void,
  ) {
    signal.throwIfAborted();
    if (this.engine?.loaded) return this.engine;
    const { FFmpeg } = await import('@ffmpeg/ffmpeg');
    signal.throwIfAborted();
    const engine = new FFmpeg();
    this.engine = engine;
    const abort = () => this.dispose();
    signal.addEventListener('abort', abort, { once: true });
    try {
      const base = new URL(
        `${process.env.NEXT_PUBLIC_BASE_PATH || ''}/media-engine/v0.12.10-0.12.15/`,
        location.origin,
      );
      const get = async (name: string) => {
        const response = await fetch(new URL(name, base), {
          signal,
          credentials: 'omit',
          cache: 'force-cache',
        });
        if (!response.ok)
          throw new Error(
            '视频引擎加载失败，请保持联网重试；你的媒体文件没有上传。',
          );
        return response;
      };
      report(0, '加载兼容视频引擎（首次约 32 MB）');
      const manifest = (await (await get('manifest.json')).json()) as {
        parts: string[];
        bytes: number;
      };
      if (
        !Array.isArray(manifest.parts) ||
        !manifest.parts.length ||
        manifest.parts.some((part) => !/^core-\d+\.bin$/.test(part))
      )
        throw new Error('视频引擎清单无效');
      let received = 0;
      const parts = await Promise.all(
        manifest.parts.map(async (name) => {
          const response = await get(name);
          const reader = response.body?.getReader();
          if (!reader) {
            const data = await response.arrayBuffer();
            received += data.byteLength;
            return new Blob([data]);
          }
          const chunks: Uint8Array<ArrayBuffer>[] = [];
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            chunks.push(new Uint8Array(value));
            received += value.byteLength;
            report(
              0,
              `加载兼容视频引擎 · ${(received / 1048576).toFixed(1)} / ${(manifest.bytes / 1048576).toFixed(1)} MB`,
            );
          }
          return new Blob(chunks);
        }),
      );
      const wasm = new Blob(parts, { type: 'application/wasm' });
      if (wasm.size !== manifest.bytes)
        throw new Error('视频引擎下载不完整，请重试');
      signal.throwIfAborted();
      this.wasmUrl = URL.createObjectURL(wasm);
      report(0, '启动兼容视频引擎');
      await engine.load({
        classWorkerURL: new URL('worker.js', base).href,
        coreURL: new URL('ffmpeg-core.js', base).href,
        wasmURL: this.wasmUrl,
      });
      signal.throwIfAborted();
      return engine;
    } catch (error) {
      this.dispose();
      throw error;
    } finally {
      signal.removeEventListener('abort', abort);
    }
  }

  dispose() {
    this.engine?.terminate();
    this.engine = undefined;
    if (this.wasmUrl) URL.revokeObjectURL(this.wasmUrl);
    this.wasmUrl = '';
  }
}
