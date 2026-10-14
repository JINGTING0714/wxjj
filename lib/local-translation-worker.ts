import type * as Transformers from '@huggingface/transformers';
declare global {
  interface ImportMeta {
    readonly env: { readonly BASE_URL: string };
  }
}
type LocalModel = (
  text: string,
  options: Record<string, unknown>,
) => Promise<{ translation_text: string }[]>;
const base = new URL(
  import.meta.env.BASE_URL + 'models/local-translation/',
  self.location.origin,
).href;
let engine:typeof Transformers|undefined;
async function loadEngine(){
 const value=engine||=await import(/* @vite-ignore */ base+'transformers.min.js');
 const env=value.env;
env.allowRemoteModels = false;
env.allowLocalModels = true;
env.localModelPath = new URL('../', base).href;
env.useBrowserCache = false;
env.backends.onnx.wasm!.wasmPaths = base;
env.backends.onnx.wasm!.numThreads = 1;
env.backends.onnx.wasm!.proxy = false;

return value.pipeline;
}
let model: LocalModel | undefined,
  allowDownload = false;
const originalFetch = self.fetch.bind(self);
let manifest:
  | {
      files: Record<
        string,
        {
          size: number;
          parts: { name: string; size: number; sha256: string }[];
        }
      >;
    }
  | undefined;
self.fetch = async (request, init) => {
  const url =
    typeof request === 'string'
      ? request
      : request instanceof URL
        ? request.href
        : request.url;
  if (url.startsWith(base) && url.endsWith('.onnx')) {
    manifest ||= await (await self.fetch(base + 'manifest.json')).json();
    const entry = manifest!.files[url.split('/').pop()!];
    if (!entry) throw new Error('本地模型文件缺失。');
    const cache = await caches.open('prism-local-translation-v1');
    const stream = new ReadableStream({
      async start(control) {
        try {
          for (const part of entry.parts) {
            const partUrl = base + part.name;
            let response = await cache.match(partUrl);
            if (!response) {
              if (!allowDownload)
                throw new Error(
                  '首次使用请先点击“准备本地语言包”（约 670 MB）。短语无需下载；已准备的语言包可离线复用。',
                );
              response = await originalFetch(partUrl);
              if (!response.ok)
                throw new Error('语言包下载失败，请检查网络后重试。');
              await cache.put(partUrl, response.clone());
            }
            const bytes = new Uint8Array(await response.arrayBuffer());
            if (bytes.length !== part.size)
              throw new Error('语言包不完整，请重新下载。');
            const digest = Array.from(
              new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)),
              (b) => b.toString(16).padStart(2, '0'),
            ).join('');
            if (digest !== part.sha256) throw new Error('语言包校验失败。');
            control.enqueue(bytes);
          }
          control.close();
        } catch (error) {
          control.error(error);
        }
      },
    });
    return new Response(stream, {
      headers: { 'Content-Length': String(entry.size) },
    });
  }
  if (url.startsWith(base)) {
    const cache = await caches.open('prism-local-translation-v1'),
      cached = await cache.match(url);
    if (cached) return cached;
    const response = await originalFetch(request, init);
    if (response.ok) await cache.put(url, response.clone());
    return response;
  }
  return originalFetch(request, init);
};
self.onmessage = async (event) => {
  const { id, text, source, target } = event.data;
  allowDownload = event.data.allowDownload === true;
  try {
    self.postMessage({
      id,
      progress: '首次使用正在加载本地通用语言包；下载完成后可离线使用…',
    });
    const create = (await loadEngine()) as unknown as (
      task: string,
      name: string,
      options: Record<string, unknown>,
    ) => Promise<LocalModel>;
    model ||= await create('translation', 'local-translation', {
      dtype: 'q8',
      device: 'wasm',
      progress_callback: (event: {
        status: string;
        loaded?: number;
        total?: number;
      }) => {
        if (event.total && event.loaded)
          self.postMessage({
            id,
            progress: `准备本地语言包 ${Math.round((event.loaded / event.total) * 100)}%…`,
          });
      },
    });
    const chunks = text.match(/[^。！？\n]{1,300}[。！？\n]?/gu) || [text],
      results: string[] = [];
    for (let i = 0; i < chunks.length; i++) {
      self.postMessage({
        id,
        progress: `本机翻译 ${i + 1} / ${chunks.length}…`,
      });
      const result = await model(chunks[i], {
        src_lang: source,
        tgt_lang: target,
        max_new_tokens: 384,
        num_beams: 2,
      });
      results.push(result[0].translation_text);
    }
    self.postMessage({ id, text: results.join('\n') });
  } catch (error) {
    self.postMessage({
      id,
      error: error instanceof Error ? error.message : '本地翻译失败。',
    });
  }
};
