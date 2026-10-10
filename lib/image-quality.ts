export type ImageAdvice = {
  width: number;
  height: number;
  recommended: boolean;
  reason: string;
  mode: 'sr2' | 'clarity';
};
export function imageAdvice(
  width: number,
  height: number,
  pixels: Uint8ClampedArray,
  sampleWidth: number,
  sampleHeight: number,
): ImageAdvice {
  if (width * height > 20_000_000 || Math.max(width, height) > 16384)
    return {
      width,
      height,
      recommended: false,
      reason: '尺寸较大，建议保留原分辨率直接打水印',
      mode: 'clarity',
    };
  let edges = 0,
    squares = 0,
    count = 0,
    visible = 0;
  const histogram = new Uint32Array(256),
    luma = new Float32Array(sampleWidth * sampleHeight);
  for (let i = 0; i < luma.length; i++) {
    const value =
      pixels[i * 4] * 0.2126 +
      pixels[i * 4 + 1] * 0.7152 +
      pixels[i * 4 + 2] * 0.0722;
    luma[i] = value;
    if (pixels[i * 4 + 3] > 128) {
      histogram[Math.round(value)]++;
      visible++;
    }
  }
  for (let y = 1; y < sampleHeight - 1; y++)
    for (let x = 1; x < sampleWidth - 1; x++) {
      const i = y * sampleWidth + x;
      if (pixels[i * 4 + 3] < 128) continue;
      const lap =
        luma[i - 1] +
        luma[i + 1] +
        luma[i - sampleWidth] +
        luma[i + sampleWidth] -
        4 * luma[i];
      squares += lap * lap;
      edges += Math.abs(luma[i - 1] - luma[i + 1]) > 6 ? 1 : 0;
      count++;
    }
  const percentile = (fraction: number) => {
    let sum = 0;
    for (let i = 0; i < 256; i++) {
      sum += histogram[i];
      if (sum >= visible * fraction) return i;
    }
    return 255;
  };
  const contrast = percentile(0.98) - percentile(0.02),
    soft = count > 0 && squares / count < 45 && edges / count > 0.06;
  if (!visible || (contrast < 8 && squares / Math.max(1, count) < 1))
    return {
      width,
      height,
      recommended: false,
      reason: '画面接近纯色或透明，可直接打水印',
      mode: 'clarity',
    };
  if (
    Math.min(width, height) < 1080 &&
    Math.max(width, height) < 2200 &&
    width * height * 4 <= 20_000_000
  )
    return {
      width,
      height,
      recommended: true,
      reason: '分辨率较低，建议尝试 2× 超分辨率',
      mode: 'sr2',
    };
  const recommended = visible > 0 && (soft || contrast < 65);
  return {
    width,
    height,
    recommended,
    reason: recommended
      ? '层次偏弱或边缘偏软，建议对照增强效果'
      : '分辨率与层次较充足，可先送水印工坊',
    mode: width * height * 4 <= 20_000_000 ? 'sr2' : 'clarity',
  };
}
