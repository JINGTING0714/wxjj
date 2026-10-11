export type ImageRegion = {
  x: number;
  y: number;
  width: number;
  height: number;
};
export function imageRegion(
  a: { x: number; y: number },
  b: { x: number; y: number },
  width: number,
  height: number,
): ImageRegion {
  const clamp = (value: number, max: number) =>
    Math.max(0, Math.min(max, value));
  const x = Math.floor(clamp(Math.min(a.x, b.x), width)),
    y = Math.floor(clamp(Math.min(a.y, b.y), height));
  return {
    x,
    y,
    width: Math.ceil(clamp(Math.max(a.x, b.x), width)) - x,
    height: Math.ceil(clamp(Math.max(a.y, b.y), height)) - y,
  };
}
export async function cropRegion(
  file: File,
  region: ImageRegion,
): Promise<File> {
  const image = await createImageBitmap(file),
    canvas = document.createElement('canvas');
  try {
    const rect = imageRegion(
      { x: region.x, y: region.y },
      { x: region.x + region.width, y: region.y + region.height },
      image.width,
      image.height,
    );
    if (rect.width < 8 || rect.height < 8)
      throw new Error('圈选范围太小，请把文字完整圈进去。');
    canvas.width = rect.width;
    canvas.height = rect.height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('无法读取圈选区域');
    context.drawImage(
      image,
      rect.x,
      rect.y,
      rect.width,
      rect.height,
      0,
      0,
      rect.width,
      rect.height,
    );
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (value) =>
          value ? resolve(value) : reject(new Error('圈选截图读取失败')),
        'image/png',
      ),
    );
    return new File([blob], '圈选文字.png', { type: 'image/png' });
  } finally {
    image.close();
    canvas.width = canvas.height = 0;
  }
}
