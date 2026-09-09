import {
  canvasBlob,
  drawWatermarkComposition,
  drawCompositionLayer,
  loadImage,
  type WatermarkLayerInput,
} from './image-processing';
import {
  compositionSize,
  resolveComposition,
  type WatermarkComposition,
} from './watermark-composition';
import {
  defaultVideoExport,
  videoExportPlan,
  videoInputDecoder,
  type VideoExportOptions,
} from './video-export';

async function openVideo(file: File) {
  const video = document.createElement('video');
  const url = URL.createObjectURL(file);
  video.preload = 'auto';
  video.playsInline = true;
  video.muted = true;
  video.style.cssText =
    'position:fixed;width:2px;height:2px;bottom:0;left:0;opacity:.001;pointer-events:none';
  document.body.appendChild(video);
  const dispose = () => {
    video.pause();
    video.removeAttribute('src');
    video.load();
    video.remove();
    URL.revokeObjectURL(url);
  };
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        clean();
        reject(new Error(`视频加载超时：${file.name}`));
      }, 25_000);
      const clean = () => {
        clearTimeout(timer);
        video.onloadeddata = video.onerror = null;
      };
      video.onloadeddata = () => {
        clean();
        resolve();
      };
      video.onerror = () => {
        clean();
        reject(
          new Error(
            `当前浏览器不能解码 ${file.name}。请先转为常见 H.264 MP4 或 WebM。`,
          ),
        );
      };
      video.src = url;
    });
    if (
      !video.videoWidth ||
      !video.videoHeight ||
      !Number.isFinite(video.duration)
    )
      throw new Error('视频尺寸或时长无法读取');
    return { video, dispose };
  } catch (e) {
    dispose();
    throw e;
  }
}
export async function videoFirstFrame(file: File) {
  const { video, dispose } = await openVideo(file);
  try {
    const canvas = document.createElement('canvas');
    const scale = Math.min(
      1,
      1400 / Math.max(video.videoWidth, video.videoHeight),
    );
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('无法生成视频首帧');
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const frame = new File(
      [await canvasBlob(canvas, 'image/png')],
      `${file.name}-first-frame.png`,
      { type: 'image/png' },
    );
    canvas.width = canvas.height = 0;
    return frame;
  } finally {
    dispose();
  }
}

/** FFmpeg runs in a dedicated local worker. Static engine files are from this same site. */
export async function watermarkVideo(
  file: File,
  layers: WatermarkLayerInput[],
  signal: AbortSignal,
  onProgress: (value: number, phase: string) => void,
  composition?: WatermarkComposition,
  options: VideoExportOptions = defaultVideoExport,
) {
  signal.throwIfAborted();
  if (file.size > 512 * 1024 * 1024)
    throw new Error(
      '本地视频单文件上限为 512 MB；请先分段，避免浏览器内存不足。',
    );
  const { FFmpeg } = await import('@ffmpeg/ffmpeg');
  const { video, dispose } = await openVideo(file);
  const ffmpeg = new FFmpeg();
  const abort = () => ffmpeg.terminate();
  signal.addEventListener('abort', abort, { once: true });
  let wasmUrl = '';
  const logs: string[] = [];
  const canvases: HTMLCanvasElement[] = [];
  const canvas = (w: number, h: number) => {
    const el = document.createElement('canvas');
    el.width = w;
    el.height = h;
    canvases.push(el);
    const ctx = el.getContext('2d');
    if (!ctx) throw new Error('无法创建视频合成画布');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    return { el, ctx };
  };
  try {
    const c = resolveComposition(composition);
    const size = compositionSize(video.videoWidth, video.videoHeight, c);
    const decoded = await Promise.all(
      layers.map((layer) => loadImage(layer.file)),
    );
    signal.throwIfAborted();
    const probeScale = Math.min(1, 512 / Math.max(size.width, size.height));
    const probe = canvas(
      Math.max(1, Math.round(size.width * probeScale)),
      Math.max(1, Math.round(size.height * probeScale)),
    );
    probe.ctx.scale(probe.el.width / size.width, probe.el.height / size.height);
    drawWatermarkComposition(
      probe.ctx,
      size.width,
      size.height,
      video,
      video.videoWidth,
      video.videoHeight,
      layers,
      decoded,
      c,
    );
    const rgba = probe.ctx.getImageData(
      0,
      0,
      probe.el.width,
      probe.el.height,
    ).data;
    let hasTransparency = false;
    for (let i = 3; i < rgba.length; i += 4)
      if (rgba[i] < 255) {
        hasTransparency = true;
        break;
      }
    // An alpha-capable input may change transparency after its first frame.
    if (c.background === 'transparent' && /\.webm$/i.test(file.name))
      hasTransparency = true;
    const plan = videoExportPlan(
      video.videoWidth,
      video.videoHeight,
      video.duration,
      c,
      options,
      hasTransparency,
    );
    const under = canvas(size.width, size.height),
      over = canvas(size.width, size.height);
    if (c.background !== 'transparent') {
      under.ctx.fillStyle = c.background;
      under.ctx.fillRect(0, 0, size.width, size.height);
    }
    const sourceIndex = Math.max(
      0,
      Math.min(layers.length, Math.trunc(c.sourceIndex) || 0),
    );
    for (let i = 0; i < layers.length; i++)
      drawCompositionLayer(
        i < sourceIndex ? under.ctx : over.ctx,
        size.width,
        size.height,
        decoded[i],
        layers[i],
        decoded[i].naturalWidth,
        decoded[i].naturalHeight,
        video.videoWidth,
      );
    const underBlob = await canvasBlob(under.el, 'image/png'),
      overBlob = await canvasBlob(over.el, 'image/png');
    const duration = video.duration;
    dispose();
    canvases.forEach((c) => {
      c.width = c.height = 0;
    });
    onProgress(0, '加载本机视频引擎（首次约 32 MB）');
    const base = new URL(
      `${process.env.NEXT_PUBLIC_BASE_PATH || ''}/media-engine/v0.12.10-0.12.15/`,
      location.origin,
    );
    const get = async (name: string) => {
      const response = await fetch(new URL(name, base), {
        signal,
        credentials: 'omit',
      });
      if (!response.ok)
        throw new Error(
          '视频引擎加载失败，请保持联网重试；你的媒体文件没有上传。',
        );
      return response;
    };
    const manifest = (await (await get('manifest.json')).json()) as {
      parts: string[];
      bytes: number;
    };
    if (
      !Array.isArray(manifest.parts) ||
      manifest.parts.some((part) => !/^core-\d+\.bin$/.test(part))
    )
      throw new Error('视频引擎清单无效');
    const parts = await Promise.all(
      manifest.parts.map(async (name) => (await get(name)).arrayBuffer()),
    );
    const wasm = new Blob(parts, { type: 'application/wasm' });
    if (wasm.size !== manifest.bytes)
      throw new Error('视频引擎下载不完整，请重试');
    wasmUrl = URL.createObjectURL(wasm);
    signal.throwIfAborted();
    await ffmpeg.load({
      classWorkerURL: new URL('worker.js', base).href,
      coreURL: new URL('ffmpeg-core.js', base).href,
      wasmURL: wasmUrl,
    });
    signal.throwIfAborted();
    const progress = ({ time }: { time: number }) =>
      onProgress(
        Math.max(0, Math.min(0.99, time / 1e6 / duration)),
        `${plan.alpha ? 'WebM 透明' : 'MP4'} · 本机编码`,
      );
    ffmpeg.on('progress', progress);
    ffmpeg.on('log', ({ message }) => {
      logs.push(message);
      if (logs.length > 12) logs.shift();
    });
    onProgress(0, `${plan.alpha ? 'WebM 透明' : 'MP4'} · 准备原始分辨率素材`);
    await ffmpeg.writeFile('input', new Uint8Array(await file.arrayBuffer()));
    let decoder: string[] = [];
    if (/\.webm$/i.test(file.name) || file.type === 'video/webm') {
      const probeCode = await ffmpeg.ffprobe([
        '-v',
        'error',
        '-select_streams',
        'v:0',
        '-show_entries',
        'stream=codec_name',
        '-of',
        'json',
        'input',
        '-o',
        'probe.json',
      ]);
      // This core reports -1 on a successful ffprobe call. The generated
      // JSON and its video stream are the additional success check.
      if (probeCode !== 0 && probeCode !== -1)
        throw new Error('无法核对 WebM 视频编码，已停止以免丢失透明背景');
      const metadata = JSON.parse(
        (await ffmpeg.readFile('probe.json', 'utf8')) as string,
      ) as {
        streams?: { codec_name?: string }[];
      };
      if (!metadata.streams?.[0]?.codec_name)
        throw new Error('无法读取 WebM 视频编码，已停止以免丢失透明背景');
      decoder = videoInputDecoder(metadata.streams?.[0]?.codec_name);
    }
    await ffmpeg.writeFile(
      'under.png',
      new Uint8Array(await underBlob.arrayBuffer()),
    );
    await ffmpeg.writeFile(
      'over.png',
      new Uint8Array(await overBlob.arrayBuffer()),
    );
    signal.throwIfAborted();
    const code = await ffmpeg.exec([...decoder, ...plan.args]);
    signal.throwIfAborted();
    if (code !== 0)
      throw new Error(
        '本机视频编码未完成，没有保存不完整成品。可减少画布尺寸或使用较短视频重试。' +
          logs
            .filter((line) => /Error|Invalid|not found|memory/i.test(line))
            .slice(-2)
            .join(' ')
            .slice(0, 240),
      );
    const output = await ffmpeg.readFile(`output.${plan.extension}`);
    if (typeof output === 'string' || !output.byteLength)
      throw new Error('视频输出为空，没有保存成品');
    signal.throwIfAborted();
    onProgress(1, '编码完成，正在加密保存');
    return new File(
      [new Uint8Array(output)],
      `${file.name.replace(/\.[^.]+$/, '')}-watermarked.${plan.extension}`,
      { type: plan.mime },
    );
  } catch (error) {
    if (signal.aborted) throw error;
    const detail =
      error instanceof Error
        ? error.message
        : typeof error === 'string'
          ? error
          : '本机视频引擎未能完成处理';
    const diagnostic = logs
      .filter((line) => /Error|Invalid|not found|memory|Aborted/i.test(line))
      .slice(-2)
      .join(' ');
    if (/memory access|out of memory|allocation/i.test(detail))
      throw new Error(
        '本地视频引擎遇到内存错误，未覆盖已有成品。请关闭其他高占用页面，或使用较短视频再继续。',
      );
    throw new Error(
      `${detail}${diagnostic ? ` · ${diagnostic}` : ''}`.slice(0, 480),
    );
  } finally {
    signal.removeEventListener('abort', abort);
    ffmpeg.terminate();
    if (wasmUrl) URL.revokeObjectURL(wasmUrl);
    dispose();
    canvases.forEach((c) => {
      c.width = c.height = 0;
    });
  }
}
