import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { parseTextBlocks, type ImportDocument } from './asset-import';
import type { AssetKind } from './prism-types';
import { canvasBlob } from './image-processing';

export async function parsePdf(
  file: File,
  kind: AssetKind,
  progress?: (message: string) => void,
): Promise<ImportDocument> {
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  const task = pdfjs.getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
    useSystemFonts: true,
    useWasm: false,
    verbosity: 0,
  });
  const result: ImportDocument = {
    file,
    libraryName: file.name.replace(/\.pdf$/i, ''),
    rows: [],
    warnings: [],
    unmatchedImages: [],
  };
  try {
    const pdf = await task.promise;
    for (let i = 1; i <= pdf.numPages; i++) {
      progress?.(`本地解析 PDF · ${i} / ${pdf.numPages} 页`);
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const lines = new Map<number, { x: number; text: string }[]>();
      for (const item of content.items)
        if ('str' in item) {
          const y = Math.round(item.transform[5] / 3) * 3;
          lines.set(y, [
            ...(lines.get(y) || []),
            { x: item.transform[4], text: item.str },
          ]);
        }
      const text = [...lines]
        .sort((a, b) => b[0] - a[0])
        .map(([, line]) =>
          line
            .sort((a, b) => a.x - b.x)
            .map((s) => s.text)
            .join(' '),
        )
        .join('\n');
      const rows = parseTextBlocks(text, kind, file.name);
      rows.forEach((r) => {
        r.sheet = `第 ${i} 页`;
        r.warnings.push('PDF 阅读顺序可能与排版不同，请核对段落及作者。');
      });
      const ops = await page.getOperatorList();
      const seen = new Set<string>();
      const images: File[] = [];
      for (let n = 0; n < ops.fnArray.length; n++) {
        if (ops.fnArray[n] !== pdfjs.OPS.paintImageXObject) continue;
        const name = ops.argsArray[n][0] as string;
        if (seen.has(name)) continue;
        seen.add(name);
        try {
          const object = await new Promise<{
            width: number;
            height: number;
            bitmap?: ImageBitmap;
            data?: Uint8Array;
            kind?: number;
          }>((resolve, reject) => {
            const timer = setTimeout(
              () => reject(new Error('图像解码超时')),
              5000,
            );
            page.objs.get(name, (image: any) => {
              clearTimeout(timer);
              resolve(image);
            });
          });
          if (!object || !object.width || !object.height) continue;
          const canvas = document.createElement('canvas');
          canvas.width = object.width;
          canvas.height = object.height;
          const ctx = canvas.getContext('2d');
          if (!ctx) continue;
          if (object.bitmap) ctx.drawImage(object.bitmap, 0, 0);
          else if (object.data) {
            const pixels = ctx.createImageData(object.width, object.height);
            const source = object.data;
            for (let p = 0; p < object.width * object.height; p++) {
              if (object.kind === pdfjs.ImageKind.RGBA_32BPP) {
                for (let c = 0; c < 4; c++)
                  pixels.data[p * 4 + c] = source[p * 4 + c];
              } else if (object.kind === pdfjs.ImageKind.RGB_24BPP) {
                for (let c = 0; c < 3; c++)
                  pixels.data[p * 4 + c] = source[p * 3 + c];
                pixels.data[p * 4 + 3] = 255;
              } else {
                const row = Math.floor(p / object.width);
                const col = p % object.width;
                const v =
                  source[row * Math.ceil(object.width / 8) + (col >> 3)] &
                  (128 >> (col % 8))
                    ? 255
                    : 0;
                pixels.data.set([v, v, v, 255], p * 4);
              }
            }
            ctx.putImageData(pixels, 0, 0);
          } else continue;
          images.push(
            new File(
              [await canvasBlob(canvas, 'image/png')],
              `page-${i}-image-${images.length + 1}.png`,
              { type: 'image/png' },
            ),
          );
          canvas.width = canvas.height = 0;
        } catch {
          result.warnings.push(`第 ${i} 页有例图未能解码，请从原文件补入。`);
        }
      }
      if (rows.length === 1) {
        rows[0].images = images;
        if (images.length) rows[0].warnings.push('同页例图已关联，请核对。');
      } else result.unmatchedImages.push(...images);
      if (!text.trim())
        result.warnings.push(
          `第 ${i} 页没有可选择文字（可能为扫描版）。本地解析不猜写提示词，请先用本机 OCR 转为文字版。`,
        );
      result.rows.push(...rows);
      page.cleanup();
    }
    if (result.unmatchedImages.length)
      result.warnings.push(
        'PDF 中同一页有多个条目或无文字，例图保留在待分配区，请手动确认对应条目。',
      );
    return result;
  } finally {
    await task.destroy();
  }
}
