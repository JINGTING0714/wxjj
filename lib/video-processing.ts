import {
  canvasBlob,
  drawWatermarkLayer,
  loadImage,
  type WatermarkLayerInput,
} from './image-processing';
import { fixWebmDuration } from '@fix-webm-duration/fix';

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

// The audio context is resumed directly from the user's start gesture, before async file work.
export function createVideoAudioContext() {
  if (
    typeof MediaRecorder === 'undefined' ||
    typeof HTMLCanvasElement.prototype.captureStream !== 'function' ||
    typeof AudioContext === 'undefined'
  )
    throw new Error(
      '此浏览器缺少本地视频编码功能，请使用新版 Edge / Chrome / Safari。',
    );
  const context = new AudioContext();
  const ready = context.resume();
  return { context, ready };
}
export async function watermarkVideo(
  file: File,
  layers: WatermarkLayerInput[],
  audio: { context: AudioContext; ready: Promise<void> },
  signal: AbortSignal,
  onProgress: (value: number, paused: boolean) => void,
) {
  await audio.ready;
  signal.throwIfAborted();
  const { video, dispose } = await openVideo(file);
  const canvas = document.createElement('canvas');
  let stream: MediaStream | undefined;
  let recorder: MediaRecorder | undefined;
  let frame = 0;
  let fallback: ReturnType<typeof setInterval> | undefined;
  let media: MediaElementAudioSourceNode | undefined;
  let visibility = () => {};
  try {
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('无法创建视频画布');
    const decoded = await Promise.all(layers.map((l) => loadImage(l.file)));
    signal.throwIfAborted();
    const draw = () => {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      layers.forEach((layer, i) =>
        drawWatermarkLayer(ctx, canvas.width, canvas.height, decoded[i], layer),
      );
    };
    draw();
    stream = canvas.captureStream(30);
    const destination = audio.context.createMediaStreamDestination();
    media = audio.context.createMediaElementSource(video);
    media.connect(destination);
    video.muted = false;
    destination.stream
      .getAudioTracks()
      .forEach((track) => stream!.addTrack(track));
    const mime = [
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
      'video/mp4',
      'video/webm',
    ].find((type) => MediaRecorder.isTypeSupported(type));
    if (!mime)
      throw new Error(
        '此浏览器没有可用的视频 + 音频编码器；没有输出静音替代品。',
      );
    recorder = new MediaRecorder(stream, {
      mimeType: mime,
      videoBitsPerSecond: Math.max(
        3_000_000,
        Math.min(24_000_000, canvas.width * canvas.height * 6),
      ),
      audioBitsPerSecond: 192_000,
    });
    const chunks: Blob[] = [];
    recorder.ondataavailable = (event) => {
      if (event.data.size) chunks.push(event.data);
    };
    const result = await new Promise<Blob>((resolve, reject) => {
      let failed = false;
      const abort = () => {
        failed = true;
        video.pause();
        if (recorder?.state !== 'inactive') recorder?.stop();
        reject(signal.reason || new DOMException('已暂停', 'AbortError'));
      };
      signal.addEventListener('abort', abort, { once: true });
      recorder!.onerror = () => {
        failed = true;
        signal.removeEventListener('abort', abort);
        reject(
          new Error('浏览器视频编码失败，请降低原视频分辨率或换新版浏览器。'),
        );
      };
      recorder!.onstop = () => {
        signal.removeEventListener('abort', abort);
        if (!failed) resolve(new Blob(chunks, { type: mime }));
      };
      const paint = () => {
        if (failed || video.ended || signal.aborted) return;
        draw();
        onProgress(video.currentTime / video.duration, document.hidden);
        frame = video.requestVideoFrameCallback(paint);
      };
      if (video.requestVideoFrameCallback)
        frame = video.requestVideoFrameCallback(paint);
      else
        fallback = setInterval(() => {
          if (!video.paused) {
            draw();
            onProgress(video.currentTime / video.duration, document.hidden);
          }
        }, 1000 / 30);
      video.onended = () => {
        draw();
        onProgress(1, false);
        if (recorder?.state !== 'inactive') recorder?.stop();
      };
      video.onerror = () => {
        failed = true;
        if (recorder?.state !== 'inactive') recorder?.stop();
        reject(new Error('视频播放或解码中断，没有保存不完整成品。'));
      };
      visibility = () => {
        if (!recorder || recorder.state === 'inactive') return;
        if (document.hidden) {
          video.pause();
          if (recorder.state === 'recording') recorder.pause();
          onProgress(video.currentTime / video.duration, true);
        } else {
          if (recorder.state === 'paused') recorder.resume();
          void video.play().catch(() => {
            failed = true;
            recorder?.stop();
            reject(new Error('浏览器暂停了视频播放，请点击继续处理。'));
          });
        }
      };
      document.addEventListener('visibilitychange', visibility);
      recorder!.start(1000);
      if (document.hidden) visibility();
      else
        void video.play().catch(() => {
          failed = true;
          recorder?.stop();
          reject(new Error('浏览器阻止播放，请直接点击“开始视频水印”重试。'));
        });
    });
    signal.throwIfAborted();
    if (!result.size) throw new Error('视频输出为空，未保存成品');
    const complete = mime.includes('webm')
      ? await fixWebmDuration(result, video.duration * 1000, { logger: false })
      : result;
    signal.throwIfAborted();
    return new File(
      [complete],
      `${file.name.replace(/\.[^.]+$/, '')}-watermarked.${mime.includes('mp4') ? 'mp4' : 'webm'}`,
      { type: mime.split(';')[0] },
    );
  } finally {
    document.removeEventListener('visibilitychange', visibility);
    if (frame && video.cancelVideoFrameCallback)
      video.cancelVideoFrameCallback(frame);
    clearInterval(fallback);
    if (recorder && recorder.state !== 'inactive') recorder.stop();
    stream?.getTracks().forEach((track) => track.stop());
    media?.disconnect();
    dispose();
    canvas.width = canvas.height = 0;
  }
}
