import {
  compositionSize,
  resolveComposition,
  type WatermarkComposition,
} from './watermark-composition';

export type VideoExportOptions = {
  format: 'auto' | 'mp4' | 'webm-alpha';
  quality: 'high' | 'ultra';
};
export const defaultVideoExport: VideoExportOptions = {
  format: 'auto',
  quality: 'high',
};

// FFmpeg's native VP8/VP9 decoders discard WebM alpha. Use libvpx when
// re-importing a transparent result, before the input argument.
export function videoInputDecoder(codec: string | undefined) {
  return codec === 'vp8'
    ? ['-c:v', 'libvpx']
    : codec === 'vp9'
      ? ['-c:v', 'libvpx-vp9']
      : [];
}

export function videoExportPlan(
  width: number,
  height: number,
  duration: number,
  composition: WatermarkComposition | undefined,
  options: VideoExportOptions,
  hasTransparency: boolean,
) {
  const c = resolveComposition(composition);
  const size = compositionSize(width, height, c);
  if (!Number.isFinite(duration) || duration <= 0)
    throw new Error('无法读取有效的视频时长');
  if (options.format === 'mp4' && hasTransparency)
    throw new Error(
      '当前画布含透明区域。请选择“WebM · 保留透明”，或先选择不透明底色再导出 MP4；不会自动把透明填成黑色。',
    );
  const alpha =
    options.format === 'webm-alpha' ||
    (options.format === 'auto' && hasTransparency);
  const crop = (n: number) => Math.max(0, Math.min(0.49, n));
  const sw =
    width *
    Math.max(0.02, 1 - crop(c.source.crop.left) - crop(c.source.crop.right));
  const sh =
    height *
    Math.max(0.02, 1 - crop(c.source.crop.top) - crop(c.source.crop.bottom));
  const dw = Math.max(
    1,
    Math.round(width * Math.max(0.01, Math.min(6, c.source.scale))),
  );
  const dh = Math.max(1, Math.round((dw * sh) / sw));
  const number = (n: number) => {
    if (!Number.isFinite(n)) throw new Error('水印变换参数无效');
    return String(Math.round(n * 1000000) / 1000000);
  };
  const angle = number((c.source.rotation * Math.PI) / 180);
  const sourceFilter = `crop=${number(sw)}:${number(sh)}:${number(width * crop(c.source.crop.left))}:${number(height * crop(c.source.crop.top))}:exact=1,scale=${dw}:${dh}:flags=lanczos,format=rgba,colorchannelmixer=aa=${number(c.source.opacity)},rotate=${angle}:ow=rotw(${angle}):oh=roth(${angle}):c=none`;
  const filter = [
    '[0:v]setpts=PTS-STARTPTS,split[video][clock]',
    `[clock]scale=${size.width}:${size.height},format=rgba,colorchannelmixer=aa=0[empty]`,
    '[empty][1:v]overlay=0:0:format=auto:shortest=1[bg]',
    `[video]${sourceFilter}[src]`,
    `[bg][src]overlay=x=${number(size.width * c.source.x)}-overlay_w/2:y=${number(size.height * c.source.y)}-overlay_h/2:format=auto:shortest=1[body]`,
    `[body][2:v]overlay=0:0:format=auto:shortest=1${alpha ? ',format=yuva420p' : ',pad=ceil(iw/2)*2:ceil(ih/2)*2,format=yuv420p'}[out]`,
  ].join(';');
  const crf = options.quality === 'ultra' ? '16' : '20';
  // This pinned WASM core's VP9 alpha path crashes on real-sized video.
  // VP8 carries the same WebM alpha channel; use a generous pixel-based
  // bitrate budget and low quantizer without changing dimensions or timing.
  const alphaBitrate = String(
    Math.max(2_000_000, Math.round(size.width * size.height * 12)),
  );
  const extension = alpha ? 'webm' : 'mp4';
  return {
    ...size,
    alpha,
    extension,
    mime: alpha ? 'video/webm' : 'video/mp4',
    filter,
    args: [
      '-i',
      'input',
      '-loop',
      '1',
      '-i',
      'under.png',
      '-loop',
      '1',
      '-i',
      'over.png',
      '-filter_complex_threads',
      '1',
      '-filter_complex',
      filter,
      '-map',
      '[out]',
      '-map',
      '0:a?',
      '-t',
      number(duration),
      '-fps_mode',
      'vfr',
      ...(alpha
        ? [
            '-c:v',
            'libvpx',
            '-pix_fmt',
            'yuva420p',
            '-b:v',
            alphaBitrate,
            '-crf',
            options.quality === 'ultra' ? '4' : '8',
            '-auto-alt-ref',
            '0',
            '-lag-in-frames',
            '0',
            '-deadline',
            'good',
            '-cpu-used',
            '4',
            '-metadata:s:v:0',
            'alpha_mode=1',
            '-c:a',
            'libopus',
          ]
        : [
            '-c:v',
            'libx264',
            '-crf',
            crf,
            '-preset',
            'fast',
            '-pix_fmt',
            'yuv420p',
            '-movflags',
            '+faststart',
            '-c:a',
            'aac',
          ]),
      '-b:a',
      '192k',
      '-threads',
      '1',
      `output.${extension}`,
    ],
  };
}
