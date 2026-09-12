import {
  canvasBlob,
  drawWatermarkComposition,
  drawCompositionLayer,
  loadImage,
  fitImageComposition,
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
import type { FFmpeg } from '@ffmpeg/ffmpeg';
import { VideoEngineSession } from './video-engine';
import { nativeWatermarkVideo, videoMayHaveAlpha } from './video-native';
import { videoProgressDetail } from './video-progress';

async function openVideo(file: File, signal?: AbortSignal) {
  signal?.throwIfAborted();
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
        signal?.removeEventListener('abort', abort);
      };
      const abort = () => {
        clean();
        reject(signal?.reason);
      };
      signal?.addEventListener('abort', abort, { once: true });
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
  notify: (value: number, phase: string) => void,
  composition?: WatermarkComposition,
  options: VideoExportOptions = defaultVideoExport,
  batchEngine?: VideoEngineSession,
) {
  signal.throwIfAborted();
  if (file.size > 512 * 1024 * 1024)
    throw new Error(
      '本地视频单文件上限为 512 MB；请先分段，避免浏览器内存不足。',
    );
  const { video, dispose } = await openVideo(file, signal);
  const engine = batchEngine ?? new VideoEngineSession();
  let ffmpeg: FFmpeg | undefined;
  const abort = () => engine.dispose();
  signal.addEventListener('abort', abort, { once: true });
  const started = performance.now();
  let lastValue = 0,
    phase = '准备视频',
    encodingStarted = 0,
    encodingPhase = '';
  const duration = video.duration;
  const emit = () =>
    notify(
      lastValue,
      `${phase} · ${videoProgressDetail(lastValue, (performance.now() - started) / 1000, encodingStarted ? (performance.now() - encodingStarted) / 1000 : 0, duration)}`,
    );
  let lastEmitted = 0;
  const onProgress = (value: number, nextPhase: string) => {
    if (nextPhase.endsWith('编码') && encodingPhase !== nextPhase) {
      encodingStarted = performance.now();
      encodingPhase = nextPhase;
    }
    const changed = phase !== nextPhase;
    lastValue = value;
    phase = nextPhase;
    if (changed || value === 1 || performance.now() - lastEmitted >= 200) {
      emit();
      lastEmitted = performance.now();
    }
  };
  const heartbeat = setInterval(emit, 1000);
  const logs: string[] = [];
  const log = ({ message }: { message: string }) => {
    logs.push(message);
    if (logs.length > 12) logs.shift();
  };
  let progress: ((event: { time: number }) => void) | undefined;
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
    let c = resolveComposition(composition);
    const decoded = await Promise.all(
      layers.map((layer) => loadImage(layer.file)),
    );
    if (c.fitContent) {
      const fitted = fitImageComposition(
        video.videoWidth,
        video.videoHeight,
        layers,
        decoded,
        c,
      );
      c = fitted.composition;
      layers = fitted.layers;
    }
    const size = compositionSize(video.videoWidth, video.videoHeight, c);
    signal.throwIfAborted();
    const probe = canvas(size.width, size.height);
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
    let hasTransparency = false;
    // Full resolution, in strips: even a one-pixel alpha border must be preserved.
    for (let y = 0; y < size.height && !hasTransparency; y += 128) {
      const rgba = probe.ctx.getImageData(
        0,
        y,
        size.width,
        Math.min(128, size.height - y),
      ).data;
      for (let i = 3; i < rgba.length; i += 4)
        if (rgba[i] < 255) {
          hasTransparency = true;
          break;
        }
    }
    probe.el.width = probe.el.height = 0;
    // An alpha-capable input may change transparency after its first frame.
    // Check track metadata, not only the first frame or file extension. Unknown
    // alpha also prevents the opaque-source shortcut when a solid background is used.
    const sourceHasTransparency = await videoMayHaveAlpha(file).catch(
      () => true,
    );
    signal.throwIfAborted();
    if (c.background === 'transparent' && sourceHasTransparency)
      hasTransparency = true;
    const plan = videoExportPlan(
      video.videoWidth,
      video.videoHeight,
      video.duration,
      c,
      options,
      hasTransparency,
      sourceHasTransparency,
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
    // Browser video decoders can discard WebM alpha even when flattening onto
    // a solid canvas. Such sources need the alpha-aware compatibility decoder.
    if (!plan.alpha && !sourceHasTransparency) {
      try {
        const fast = await nativeWatermarkVideo(
          file,
          under.el,
          over.el,
          video.videoWidth,
          video.videoHeight,
          c,
          options,
          signal,
          onProgress,
        );
        if (fast) {
          onProgress(1, '编码完成，正在加密保存');
          return fast;
        }
      } catch (error) {
        if (signal.aborted) throw error;
      }
      onProgress(0, '此视频改用兼容处理');
    }
    const underBlob = plan.direct
        ? null
        : await canvasBlob(under.el, 'image/png'),
      overBlob = await canvasBlob(over.el, 'image/png');
    dispose();
    canvases.forEach((c) => {
      c.width = c.height = 0;
    });
    ffmpeg = await engine.get(signal, onProgress);
    signal.throwIfAborted();
    progress = ({ time }: { time: number }) =>
      onProgress(
        Math.max(0, Math.min(0.99, time / 1e6 / duration)),
        `${plan.alpha ? 'WebM 透明' : 'MP4'} · 兼容编码`,
      );
    ffmpeg.on('progress', progress);
    ffmpeg.on('log', log);
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
    if (underBlob)
      await ffmpeg.writeFile(
        'under.png',
        new Uint8Array(await underBlob.arrayBuffer()),
      );
    await ffmpeg.writeFile(
      'over.png',
      new Uint8Array(await overBlob.arrayBuffer()),
    );
    signal.throwIfAborted();
    onProgress(0, `${plan.alpha ? 'WebM 透明' : 'MP4'} · 兼容编码`);
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
    clearInterval(heartbeat);
    signal.removeEventListener('abort', abort);
    if (ffmpeg) {
      if (progress) ffmpeg.off('progress', progress);
      ffmpeg.off('log', log);
      if (ffmpeg.loaded)
        for (const name of [
          'input',
          'under.png',
          'over.png',
          'probe.json',
          'output.mp4',
          'output.webm',
        ])
          await ffmpeg.deleteFile(name).catch(() => {});
    }
    if (!batchEngine || signal.aborted) engine.dispose();
    dispose();
    canvases.forEach((c) => {
      c.width = c.height = 0;
    });
  }
}
