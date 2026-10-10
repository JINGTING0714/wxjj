/** PNG cleaning never mutates the source bytes or re-encodes deep-clean pixels. */
const signature = [137, 80, 78, 71, 13, 10, 26, 10];
const displayChunks = new Set([
  'IHDR',
  'PLTE',
  'IDAT',
  'IEND',
  'tRNS',
  'iCCP',
  'sRGB',
  'gAMA',
  'cHRM',
  'sBIT',
  'bKGD',
  'hIST',
  'pHYs',
  'cICP',
  'mDCV',
  'cLLI',
]);
const privacyChunks = new Set(['tEXt', 'zTXt', 'iTXt', 'eXIf', 'tIME']);
const crcTable = Uint32Array.from({ length: 256 }, (_, value) => {
  for (let bit = 0; bit < 8; bit++)
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});
export function pngCrc(bytes: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
export type PngField = {
  chunk: string;
  name: string;
  preview: string;
  highRisk: boolean;
};
export type PngChunk = {
  type: string;
  start: number;
  end: number;
  length: number;
  remove: boolean;
};
export type PngReport = {
  width: number;
  height: number;
  chunks: PngChunk[];
  fields: PngField[];
  removedChunks: string[];
  highRiskCount: number;
  fieldCount: number;
};
export const PNG_MAX_BYTES = 64 * 1024 * 1024;
export function parsePng(bytes: Uint8Array): PngReport {
  if (bytes.length > PNG_MAX_BYTES)
    throw new Error('单张 PNG 最大支持 64 MB，请缩小文件后重试。');
  if (!signature.every((value, i) => bytes[i] === value))
    throw new Error('文件不是有效的 PNG。');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const chunks: PngChunk[] = [];
  const fields: PngField[] = [];
  const seen = new Set<string>();
  let offset = 8,
    width = 0,
    height = 0,
    color = 0,
    depth = 0,
    highRiskCount = 0,
    fieldCount = 0;
  let idat = false,
    idatEnded = false,
    ended = false;
  while (offset < bytes.length) {
    if (chunks.length >= 100000)
      throw new Error('PNG chunk 数量过多，请重新导出图片后重试。');
    if (bytes.length - offset < 12) throw new Error('PNG chunk 边界不完整。');
    const length = view.getUint32(offset);
    const end = offset + length + 12;
    if (length > 0x7fffffff || end > bytes.length)
      throw new Error('PNG chunk 长度越界。');
    const type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
    if (!/^[A-Za-z]{2}[A-Z][A-Za-z]$/.test(type))
      throw new Error('PNG chunk 类型非法。');
    if (pngCrc(bytes.subarray(offset + 4, end - 4)) !== view.getUint32(end - 4))
      throw new Error(`${type} CRC 校验失败。`);
    const data = bytes.subarray(offset + 8, end - 4);
    if (!chunks.length && type !== 'IHDR')
      throw new Error('PNG 缺少首个 IHDR。');
    if (type === 'IHDR') {
      if (seen.has(type) || length !== 13)
        throw new Error('IHDR 重复或长度非法。');
      width = view.getUint32(offset + 8);
      height = view.getUint32(offset + 12);
      depth = data[8];
      color = data[9];
      const depths: Record<number, number[]> = {
        0: [1, 2, 4, 8, 16],
        2: [8, 16],
        3: [1, 2, 4, 8],
        4: [8, 16],
        6: [8, 16],
      };
      if (
        !width ||
        !height ||
        width > 0x7fffffff ||
        height > 0x7fffffff ||
        !depths[color]?.includes(depth) ||
        data[10] !== 0 ||
        data[11] !== 0 ||
        data[12] > 1
      )
        throw new Error('PNG 图像头参数非法。');
    }
    if (['acTL', 'fcTL', 'fdAT'].includes(type))
      throw new Error('暂不支持 APNG 动画，以免丢失帧；请使用静态 PNG。');
    if (
      type[0] === type[0].toUpperCase() &&
      !['IHDR', 'PLTE', 'IDAT', 'IEND'].includes(type)
    )
      throw new Error(`不支持的关键 chunk：${type}。`);
    if (
      type === 'PLTE' &&
      (seen.has(type) ||
        idat ||
        seen.has('tRNS') ||
        !length ||
        length % 3 ||
        length > 768 ||
        [0, 4].includes(color) ||
        (color === 3 && length / 3 > 2 ** depth))
    )
      throw new Error('PNG 调色板非法。');
    if (type === 'tRNS') {
      const palette = chunks.find((chunk) => chunk.type === 'PLTE');
      if (
        seen.has(type) ||
        idat ||
        !length ||
        (color === 0
          ? length !== 2
          : color === 2
            ? length !== 6
            : color === 3
              ? !palette || length > palette.length / 3
              : true)
      )
        throw new Error('PNG 透明度信息非法。');
    }
    const fixedLengths: Record<string, number> = {
      gAMA: 4,
      cHRM: 32,
      sRGB: 1,
      pHYs: 9,
      cICP: 4,
      mDCV: 24,
      cLLI: 8,
    };
    if (
      displayChunks.has(type) &&
      !['IHDR', 'PLTE', 'IDAT', 'IEND', 'tRNS'].includes(type)
    ) {
      if (
        seen.has(type) ||
        idat ||
        (fixedLengths[type] !== undefined && length !== fixedLengths[type])
      )
        throw new Error(`${type} 显示信息重复、顺序或长度非法。`);
      if (
        ['gAMA', 'cHRM', 'iCCP', 'sRGB', 'sBIT'].includes(type) &&
        seen.has('PLTE')
      )
        throw new Error(`${type} 必须位于调色板之前。`);
      if (
        (type === 'sRGB' && (data[0] > 3 || seen.has('iCCP'))) ||
        (type === 'iCCP' && seen.has('sRGB'))
      )
        throw new Error('PNG 色彩配置冲突。');
      if (type === 'gAMA' && view.getUint32(offset + 8) === 0)
        throw new Error('PNG gamma 非法。');
      if (type === 'iCCP') {
        const zero = data.indexOf(0);
        if (zero < 1 || zero > 79 || data[zero + 1] !== 0 || zero + 2 >= length)
          throw new Error('PNG ICC 配置非法。');
      }
      if (
        type === 'sBIT' &&
        (length !==
          ({ 0: 1, 2: 3, 3: 3, 4: 2, 6: 4 } as Record<number, number>)[color] ||
          data.some((bit) => bit === 0 || bit > (color === 3 ? 8 : depth)))
      )
        throw new Error('PNG 有效位数非法。');
      if (
        type === 'bKGD' &&
        (length !== (color === 3 ? 1 : [0, 4].includes(color) ? 2 : 6) ||
          (color === 3 &&
            (!seen.has('PLTE') ||
              data[0] >=
                chunks.find((chunk) => chunk.type === 'PLTE')!.length / 3)))
      )
        throw new Error('PNG 背景颜色非法。');
      if (
        type === 'hIST' &&
        (!seen.has('PLTE') ||
          length !==
            (chunks.find((chunk) => chunk.type === 'PLTE')!.length / 3) * 2)
      )
        throw new Error('PNG 调色板统计非法。');
    }
    if (type === 'IDAT') {
      if (idatEnded || (color === 3 && !seen.has('PLTE')))
        throw new Error('PNG 图像数据顺序或调色板非法。');
      idat = true;
    } else if (idat) idatEnded = true;
    const remove = !displayChunks.has(type);
    chunks.push({ type, start: offset, end, length, remove });
    if (remove) {
      const textChunk = ['tEXt', 'zTXt', 'iTXt'].includes(type);
      const zero = textChunk ? data.subarray(0, 80).indexOf(0) : -1;
      const name =
        textChunk && zero > 0
          ? new TextDecoder('latin1').decode(
              data.subarray(0, Math.min(zero, 79)),
            )
          : type === 'eXIf'
            ? 'EXIF'
            : type === 'tIME'
              ? '修改时间'
              : `其他字段 (${type})`;
      let preview = '二进制或压缩字段；清洗时移除整个 chunk。';
      if (type === 'tEXt' && zero > 0)
        preview = new TextDecoder('latin1').decode(
          data.subarray(zero + 1, zero + 501),
        );
      if (type === 'iTXt' && zero > 0 && data[zero + 1] === 0) {
        const languageEnd = data.indexOf(0, zero + 3);
        const translatedEnd =
          languageEnd < 0 ? -1 : data.indexOf(0, languageEnd + 1);
        if (translatedEnd >= 0)
          preview = new TextDecoder().decode(
            data.subarray(translatedEnd + 1, translatedEnd + 501),
          );
      }
      const highRisk =
        /prompt|parameter|description|comment|xmp|exif|author|location|gps|workflow/i.test(
          name,
        ) ||
        type === 'eXIf' ||
        !privacyChunks.has(type);
      fieldCount++;
      if (highRisk) highRiskCount++;
      if (fields.length < 1000)
        fields.push({ chunk: type, name, preview, highRisk });
    }
    seen.add(type);
    offset = end;
    if (type === 'IEND') {
      if (
        length !== 0 ||
        !idat ||
        !chunks.some((chunk) => chunk.type === 'IDAT' && chunk.length > 0)
      )
        throw new Error('PNG 结束块或图像数据非法。');
      ended = true;
      break;
    }
    if (chunks.length > 10000) throw new Error('PNG chunk 数量过多。');
  }
  if (!ended || offset !== bytes.length)
    throw new Error('PNG 缺少结束块或包含尾随数据。');
  return {
    width,
    height,
    chunks,
    fields,
    removedChunks: chunks
      .filter((chunk) => chunk.remove)
      .map((chunk) => chunk.type),
    highRiskCount,
    fieldCount,
  };
}
function cleanParsedPng(bytes: Uint8Array, report: PngReport) {
  const parts = [
    bytes.slice(0, 8),
    ...report.chunks
      .filter((chunk) => !chunk.remove)
      .map((chunk) => bytes.slice(chunk.start, chunk.end)),
  ];
  return new Blob(parts, { type: 'image/png' });
}
export function deepCleanPng(bytes: Uint8Array) {
  const report = parsePng(bytes);
  return { blob: cleanParsedPng(bytes, report), report };
}
export type CleanMode = 'deep' | 'fast';
const abort = (signal?: AbortSignal) => signal?.throwIfAborted();
export async function fastCleanPng(
  source: Blob,
  report: PngReport,
  signal?: AbortSignal,
) {
  abort(signal);
  if (
    report.width * report.height > 32_000_000 ||
    report.width > 16384 ||
    report.height > 16384
  )
    throw new Error(
      '快速清洗支持最多 3200 万像素、单边 16384 像素，请改用深度清洗。',
    );
  const url = URL.createObjectURL(source);
  const image = new Image();
  const canvas = document.createElement('canvas');
  try {
    await new Promise<void>((resolve, reject) => {
      const cancelled = () => {
        image.src = '';
        reject(new DOMException('已取消', 'AbortError'));
      };
      signal?.addEventListener('abort', cancelled, { once: true });
      const finish = (error?: Error) => {
        signal?.removeEventListener('abort', cancelled);
        if (error) reject(error);
        else resolve();
      };
      image.onload = () => finish();
      image.onerror = () => finish(new Error('浏览器无法解码这张 PNG。'));
      image.src = url;
    });
    abort(signal);
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('浏览器无法创建画布。');
    context.drawImage(image, 0, 0);
    const encoded = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('PNG 导出失败。'))),
        'image/png',
      ),
    );
    abort(signal);
    // Also remove any ancillary metadata written by the browser encoder.
    return deepCleanPng(new Uint8Array(await encoded.arrayBuffer())).blob;
  } finally {
    image.onload = null;
    image.onerror = null;
    image.src = '';
    URL.revokeObjectURL(url);
    canvas.width = 0;
    canvas.height = 0;
  }
}
export type PngJobResult = {
  id: string;
  revision?:string;
  report?: PngReport;
  file?: File;
  error?: string;
};
export async function runPngQueue(
  sources: { id: string; file: File }[],
  options: {
    mode?: CleanMode;
    signal?: AbortSignal;
    onResult: (result: PngJobResult, completed: number) => void;
  },
) {
  let completed = 0;
  for (const source of sources) {
    await new Promise((resolve) => setTimeout(resolve, 0));
    if (options.signal?.aborted) break;
    try {
      if (source.file.size > PNG_MAX_BYTES)
        throw new Error('单张 PNG 最大支持 64 MB。');
      const bytes = new Uint8Array(await source.file.arrayBuffer());
      abort(options.signal);
      const report = parsePng(bytes);
      const blob =
        options.mode === 'deep'
          ? cleanParsedPng(bytes, report)
          : options.mode === 'fast'
            ? await fastCleanPng(source.file, report, options.signal)
            : undefined;
      abort(options.signal);
      const file = blob
        ? new File(
            [blob],
            `${source.file.name.replace(/\.png$/i, '')}-clean.png`,
            { type: 'image/png' },
          )
        : undefined;
      const revision=file?Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await file.arrayBuffer())),byte=>byte.toString(16).padStart(2,'0')).join(''):undefined;
      abort(options.signal);
      options.onResult(
        { id: source.id, report: { ...report, chunks: [] }, file,revision },
        ++completed,
      );
    } catch (error) {
      if (options.signal?.aborted) break;
      options.onResult(
        {
          id: source.id,
          error: error instanceof Error ? error.message : '处理失败',
        },
        ++completed,
      );
    }
  }
  return { completed, cancelled: !!options.signal?.aborted };
}
