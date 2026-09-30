export type OcrBlock = {
  text: string;
  confidence: number;
  top: number;
  bottom: number;
};

export type OcrPage = { text: string; blocks: OcrBlock[] };

export async function recognizeLocalImages(
  files: File[],
  onProgress?: (label: string) => void,
): Promise<OcrPage[]> {
  const { createWorker, OEM } = await import('tesseract.js');
  const base = (process.env.NEXT_PUBLIC_BASE_PATH || '').replace(/\/$/, '');
  const path = `${base}/ocr`;
  const worker = await createWorker(['eng', 'chi_sim'], OEM.LSTM_ONLY, {
    workerPath: `${path}/worker.min.js`,
    corePath: `${path}/core`,
    langPath: `${path}/`,
    gzip: false,
    logger: (event) => {
      if (event.status === 'recognizing text')
        onProgress?.(`识别中 ${Math.round((event.progress || 0) * 100)}%`);
    },
  });
  try {
    const pages: OcrPage[] = [];
    for (let index = 0; index < files.length; index++) {
      onProgress?.(`正在识别第 ${index + 1} / ${files.length} 张截图`);
      const result = await worker.recognize(files[index], {}, { text: true, blocks: true });
      pages.push({
        text: result.data.text,
        blocks: (result.data.blocks || [])
          .filter((block) => block.text.trim())
          .map((block) => ({
            text: block.text.trim(),
            confidence: block.confidence,
            top: block.bbox.y0,
            bottom: block.bbox.y1,
          }))
          .sort((a, b) => a.top - b.top),
      });
    }
    return pages;
  } finally {
    await worker.terminate();
  }
}
