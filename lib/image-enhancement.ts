export type EnhancementSettings = { dehaze: number; clarity: number; sharpen: number };
export const enhancementPresets: Record<string, EnhancementSettings> = {
  natural: { dehaze: .25, clarity: .25, sharpen: .3 },
  clear: { dehaze: .45, clarity: .45, sharpen: .5 },
};
const clamp = (value: number, low = 0, high = 1) => Math.min(high,Math.max(low,value));
const smooth = (low: number, high: number, value: number) => { const x = clamp((value - low) / (high - low)); return x * x * (3 - 2 * x); };
function blur(source: Float32Array, width: number, height: number, radius: number) {
  const horizontal = new Float32Array(source.length), result = new Float32Array(source.length), size = radius * 2 + 1;
  for (let y = 0; y < height; y++) {
    const row = y * width; let sum = 0;
    for (let x = -radius; x <= radius; x++) sum += source[row + clamp(x,0,width - 1)];
    for (let x = 0; x < width; x++) { horizontal[row + x] = sum / size; sum += source[row + clamp(x + radius + 1,0,width - 1)] - source[row + clamp(x - radius,0,width - 1)]; }
  }
  for (let x = 0; x < width; x++) {
    let sum = 0; for (let y = -radius; y <= radius; y++) sum += horizontal[clamp(y,0,height - 1) * width + x];
    for (let y = 0; y < height; y++) { result[y * width + x] = sum / size; sum += horizontal[clamp(y + radius + 1,0,height - 1) * width + x] - horizontal[clamp(y - radius,0,height - 1) * width + x]; }
  }
  return result;
}

/** Tone and multiscale contrast processing: coordinates and alpha remain unchanged. */
export function enhancePixels(input: Uint8ClampedArray, width: number, height: number, settings: EnhancementSettings, progress?: (value: number) => void) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width * height > 20_000_000 || input.length !== width * height * 4) throw new Error('图片尺寸超出本机处理范围，请选择不超过 2000 万像素的图片。');
  const dehaze = clamp(settings.dehaze), clarity = clamp(settings.clarity), sharpen = clamp(settings.sharpen);
  if (![dehaze,clarity,sharpen].every(Number.isFinite)) throw new Error('增强参数不完整');
  const output = new Uint8ClampedArray(input);
  if (!dehaze && !clarity && !sharpen) return output;
  const luma = new Float32Array(width * height), histogram = new Uint32Array(256); let visible = 0;
  for (let index = 0; index < luma.length; index++) { const offset = index * 4, value = (input[offset] * .2126 + input[offset + 1] * .7152 + input[offset + 2] * .0722) / 255; luma[index] = value; if (input[offset + 3]) { histogram[Math.round(value * 255)]++; visible++; } }
  let lower = 0, count = 0; for (; lower < 255; lower++) { count += histogram[lower]; if (count >= visible * .015) break; }
  const black = Math.min(.045, lower / 255 * dehaze * .28);
  progress?.(.15);
  const local = clarity ? blur(luma,width,height,Math.max(3,Math.round(Math.min(width,height) * .018))) : luma;
  progress?.(.45);
  const fine = sharpen ? blur(luma,width,height,1) : luma;
  progress?.(.65);
  for (let index = 0; index < luma.length; index++) {
    const offset = index * 4, original = luma[index]; if (!input[offset + 3]) continue;
    const protect = 1 - smooth(.76,.98,original) * .8;
    let target = clamp((original - black) / (1 - black));
    target += dehaze * .12 * (target - .5) * 4 * target * (1 - target) * protect;
    target += clamp((original - local[index]) * clarity * 1.6,-.045,.045) * protect;
    const detail = original - fine[index], filtered = Math.sign(detail) * Math.max(0,Math.abs(detail) - .003);
    target += clamp(filtered * sharpen * 1.3,-.028,.028) * protect;
    // Limit RGB gain together to preserve hue and protect already bright skin.
    const maximum = Math.max(input[offset],input[offset + 1],input[offset + 2]);
    const gain = Math.min(clamp(target) / Math.max(original,.0001),maximum ? 255 / maximum : 1);
    output[offset] = input[offset] * gain; output[offset + 1] = input[offset + 1] * gain; output[offset + 2] = input[offset + 2] * gain;
  }
  progress?.(1); return output;
}
