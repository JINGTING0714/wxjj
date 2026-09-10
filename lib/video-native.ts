import {
  layerGeometry,
  type WatermarkComposition,
} from './watermark-composition';
import type { VideoExportOptions } from './video-export';

export async function videoMayHaveAlpha(file: File) {
  const { Input, BlobSource, ALL_FORMATS } = await import('mediabunny');
  const input = new Input({
    source: new BlobSource(file),
    formats: ALL_FORMATS,
  });
  try {
    return (
      (await (await input.getPrimaryVideoTrack())?.canBeTransparent()) ?? true
    );
  } finally {
    input.dispose();
  }
}

/** Browser codecs preserve sample timestamps; this does not record real-time playback. */
export async function nativeWatermarkVideo(
  file: File,
  under: HTMLCanvasElement,
  over: HTMLCanvasElement,
  sourceWidth: number,
  sourceHeight: number,
  composition: WatermarkComposition,
  options: VideoExportOptions,
  signal: AbortSignal,
  report: (value: number, phase: string) => void,
) {
  if (
    typeof VideoEncoder === 'undefined' ||
    typeof VideoDecoder === 'undefined'
  )
    return null;
  const {
    Input,
    Output,
    BlobSource,
    BufferTarget,
    Mp4OutputFormat,
    ALL_FORMATS,
    Conversion,
    QUALITY_HIGH,
    QUALITY_VERY_HIGH,
    canEncodeVideo,
  } = await import('mediabunny');
  signal.throwIfAborted();
  const input = new Input({
    source: new BlobSource(file),
    formats: ALL_FORMATS,
  });
  const output = new Output({
    target: new BufferTarget(),
    format: new Mp4OutputFormat({ fastStart: 'in-memory' }),
  });
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(under.width / 2) * 2;
  canvas.height = Math.ceil(under.height / 2) * 2;
  const context = canvas.getContext('2d', { alpha: false });
  let conversion: import('mediabunny').Conversion | undefined;
  const abort = () => {
    void conversion?.cancel().catch(() => {});
  };
  signal.addEventListener('abort', abort, { once: true });
  try {
    if (!context) return null;
    context.imageSmoothingQuality = 'high';
    const primary = await input.getPrimaryVideoTrack();
    if (!primary) return null;
    // Keep all audio tracks. Unsupported audio causes a fallback, never a silent drop.
    report(0, '准备浏览器快速处理');
    const source = composition.source;
    const g = layerGeometry(source, sourceWidth, sourceHeight, sourceWidth);
    const hardwareAcceleration = (await canEncodeVideo('avc', {
      width: canvas.width,
      height: canvas.height,
      hardwareAcceleration: 'prefer-hardware',
    }))
      ? 'prefer-hardware'
      : 'no-preference';
    conversion = await Conversion.init({
      input,
      output,
      showWarnings: false,
      video: (track) =>
        track !== primary
          ? { discard: true }
          : {
              codec: 'avc',
              quality:
                options.quality === 'ultra' ? QUALITY_VERY_HIGH : QUALITY_HIGH,
              hardwareAcceleration,
              allowRotationMetadata: false,
              processedWidth: canvas.width,
              processedHeight: canvas.height,
              process: (sample) => {
                signal.throwIfAborted();
                context.fillStyle =
                  composition.background === 'transparent'
                    ? '#000000'
                    : composition.background;
                context.fillRect(0, 0, canvas.width, canvas.height);
                context.drawImage(under, 0, 0);
                context.save();
                context.globalAlpha = Math.max(0, Math.min(1, source.opacity));
                context.translate(
                  under.width * source.x,
                  under.height * source.y,
                );
                context.rotate((source.rotation * Math.PI) / 180);
                sample.draw(
                  context,
                  g.sx,
                  g.sy,
                  g.sw,
                  g.sh,
                  -g.width / 2,
                  -g.height / 2,
                  g.width,
                  g.height,
                );
                context.restore();
                context.drawImage(over, 0, 0);
                return canvas;
              },
            },
      audio: { codec: 'aac' },
    });
    signal.throwIfAborted();
    if (
      !conversion.isValid ||
      conversion.discardedTracks.some(
        (item) => item.reason !== 'discarded_by_user',
      )
    )
      return null;
    conversion.onProgress = (value) =>
      report(Math.min(0.99, value), 'MP4 · 浏览器快速编码');
    report(0, 'MP4 · 浏览器快速编码');
    await conversion.execute();
    signal.throwIfAborted();
    const bytes = output.target.buffer;
    if (!bytes?.byteLength) throw new Error('浏览器编码没有生成完整视频');
    return new File(
      [bytes],
      `${file.name.replace(/\.[^.]+$/, '')}-watermarked.mp4`,
      { type: 'video/mp4' },
    );
  } finally {
    signal.removeEventListener('abort', abort);
    await conversion?.cancel().catch(() => {});
    input.dispose();
    canvas.width = canvas.height = 0;
  }
}
