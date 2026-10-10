export type EnhancementMode = 'clarity' | 'sr2' | 'sr4';
export function enhancementSize(
  width: number,
  height: number,
  mode: EnhancementMode,
) {
  const scale = mode === 'sr4' ? 4 : mode === 'sr2' ? 2 : 1;
  if (
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width < 1 ||
    height < 1 ||
    width * height * scale * scale > 20_000_000 ||
    Math.max(width, height) * scale > 16384
  )
    throw new Error(
      '增强后的图片需不超过 2000 万像素、单边 16384 像素。请改用较低倍数或原尺寸增强。',
    );
  return { width: width * scale, height: height * scale, scale };
}
export function resolutionTiles(
  width: number,
  height: number,
  tile = 96,
  pad = 20,
) {
  const result = [];
  for (let y = 0; y < height; y += tile)
    for (let x = 0; x < width; x += tile) {
      const left = Math.max(0, x - pad),
        top = Math.max(0, y - pad),
        right = Math.min(width, x + tile + pad),
        bottom = Math.min(height, y + tile + pad);
      result.push({
        x,
        y,
        width: Math.min(tile, width - x),
        height: Math.min(tile, height - y),
        left,
        top,
        inputWidth: right - left,
        inputHeight: bottom - top,
      });
    }
  return result;
}
