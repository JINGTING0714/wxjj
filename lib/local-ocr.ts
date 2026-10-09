export type OcrBlock = {
  text: string;
  confidence: number;
  top: number;
  bottom: number;
  left?: number;
  right?: number;
};

export type OcrPage = { text: string; blocks: OcrBlock[] };

export async function recognizeLocalImages(
  files: File[],
  onProgress?: (label: string) => void,
  mode: 'prompt' | 'sales' = 'prompt',
): Promise<OcrPage[]> {
  const { createWorker, OEM, PSM } = await import('tesseract.js');
  const base = (process.env.NEXT_PUBLIC_BASE_PATH || '').replace(/\/$/, '');
  const path = `${base}/ocr`;
  const worker = await createWorker(['chi_sim', 'eng'], OEM.LSTM_ONLY, {
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
    let preciseAvailable = true;
    const pages: OcrPage[] = [];
    for (let index = 0; index < files.length; index++) {
      onProgress?.(`正在识别第 ${index + 1} / ${files.length} 张截图`);
      // Decode on the main thread before handing pixels to the worker. File
      // objects restored from a local workspace are not always readable by the
      // worker's FileReader, while an encoded canvas is portable.
      const image = await createImageBitmap(new Blob([await files[index].arrayBuffer()], { type: files[index].type }));
      const canvas = document.createElement('canvas');
      canvas.width = image.width; canvas.height = image.height;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) { image.close(); throw new Error('浏览器无法读取截图，请重新选择原文件。'); }
      context.drawImage(image, 0, 0); image.close();
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
      const borderValues: number[] = [];
      for (let y = 0; y < canvas.height; y += 20) { const offset = (y * canvas.width + canvas.width - 3) * 4; borderValues.push(pixels.data[offset]); }
      borderValues.sort((a, b) => a - b);
      const background = borderValues[Math.floor(borderValues.length / 2)] || 0;
      const dark = background < 120;
      const bands: { top: number; bottom: number }[] = [];
      if (dark) {
        let start = -1, last = -1;
        for (let y = 0; y < canvas.height; y++) {
          let ink = 0;
          const from = Math.round(canvas.width * (mode === 'sales' ? .145 : .48));
          const to = Math.round(canvas.width * .97);
          for (let x = from; x < to; x += 2) {
            const offset = (y * canvas.width + x) * 4;
            const r = pixels.data[offset], g = pixels.data[offset + 1], b = pixels.data[offset + 2];
            if (Math.max(r, g, b) - Math.min(r, g, b) < 45 && (r + g + b) / 3 > background + 30) ink++;
          }
          if (mode === 'prompt' && start >= 0 && ink < 3) {
            let tailInk = 0;
            const tailFrom = Math.round(canvas.width * .112);
            for (let x = tailFrom; x < from; x += 2) {
              const offset = (y * canvas.width + x) * 4;
              const r = pixels.data[offset], g = pixels.data[offset + 1], b = pixels.data[offset + 2];
              if (Math.max(r, g, b) - Math.min(r, g, b) < 35 && (r + g + b) / 3 > background + 30) tailInk++;
            }
            if (tailInk >= 3 && tailInk < (from - tailFrom) * .2) ink = tailInk;
          }
          if (ink >= 3 && ink < (to - from) * .35) {
            if (start < 0) start = y; last = y;
          } else if (start >= 0 && y - last > Math.max(12, canvas.width * .035)) {
            bands.push({ top: Math.max(0, start - 8), bottom: Math.min(canvas.height, last + 10) }); start = -1;
          }
        }
        if (start >= 0) bands.push({ top: Math.max(0, start - 8), bottom: Math.min(canvas.height, last + 10) });
      }
      const regions = bands.length ? bands : [{ top: 0, bottom: canvas.height }];
      const blocks: OcrBlock[] = [];
      const scale = Math.min(3, Math.max(2, 2400 / canvas.width));
      for (let regionIndex = 0; regionIndex < regions.length; regionIndex++) {
        const region = regions[regionIndex];
        onProgress?.(`第 ${index + 1} / ${files.length} 张 · 识别区域 ${regionIndex + 1} / ${regions.length}`);
        const cut = document.createElement('canvas');
        const left = dark ? Math.round(canvas.width * (mode === 'sales' ? .145 : .112)) : 0;
        cut.width = Math.round((canvas.width - left) * scale); cut.height = Math.round((region.bottom - region.top) * scale);
        const cutContext = cut.getContext('2d', { willReadFrequently: true });
        if (!cutContext) throw new Error('截图预处理失败');
        cutContext.drawImage(canvas, left, region.top, canvas.width - left, region.bottom - region.top, 0, 0, cut.width, cut.height);
        if (dark) {
          const data = cutContext.getImageData(0, 0, cut.width, cut.height);
          for (let offset = 0; offset < data.data.length; offset += 4) {
            const gray = (data.data[offset] + data.data[offset + 1] + data.data[offset + 2]) / 3;
            const value = 255 - Math.max(0, Math.min(255, (gray - background - 8) * 2.1));
            data.data[offset] = data.data[offset + 1] = data.data[offset + 2] = value;
            data.data[offset + 3] = 255;
          }
          cutContext.putImageData(data, 0, 0);
        }
        await worker.reinitialize(mode === 'prompt' ? 'chi_sim' : 'chi_sim+eng');
        await worker.setParameters({ tessedit_pageseg_mode: bands.length ? PSM.SINGLE_BLOCK : PSM.AUTO, preserve_interword_spaces: '1', tessedit_char_whitelist: '' });
        const result = await worker.recognize(cut.toDataURL('image/png'), {}, { text: true, blocks: true });
        const lines = (result.data.blocks || []).flatMap(block => block.paragraphs.flatMap(paragraph => paragraph.lines));
        for (const line of lines) {
          if (mode === 'sales' && /^\s*\d/.test(line.text) && !/:|年|月|日/.test(line.text) && !/^20\d{2}/.test(line.text)) {
            // Scrollbar fragments far to the right are outside a number claim.
            // Remove only geometrically isolated nonnumeric noise, never a digit.
            const words = line.words.filter(word => !(left + word.bbox.x0 / scale > canvas.width * .75 && !/\d/.test(word.text) && word.text.trim().length <= 3));
            if (words.length !== line.words.length) line.text = words.map(word => word.text).join(' ');
          }
          const text = line.text.trim();
          const numericCandidate = mode === 'sales' && /^[\d\s.,，。/、;；]+$/.test(text) && !/^20\d{2}/.test(text);
          if (preciseAvailable && !numericCandidate && text.length >= 2 && (mode === 'prompt' || line.confidence < 95)) {
            const lineCanvas = document.createElement('canvas');
            const top = region.top + line.bbox.y0 / scale;
            const height = (line.bbox.y1 - line.bbox.y0) / scale;
            const clock = text.match(/\d{1,2}:\d{2}(?::\d{2})?/)?.[0];
            const clockWord = mode === 'sales' && clock ? line.words.find(word => /\d{1,2}:\d{2}/.test(word.text)) : undefined;
            const contentLeft = clockWord ? left : Math.max(0, left + line.bbox.x0 / scale - 4);
            const contentRight = Math.min(canvas.width, clockWord ? left + clockWord.bbox.x0 / scale - 4 : left + line.bbox.x1 / scale + 2);
            lineCanvas.width = Math.ceil(contentRight - contentLeft); lineCanvas.height = Math.ceil(height + 4);
            const lineContext = lineCanvas.getContext('2d');
            if (lineContext) {
              lineContext.fillStyle = `rgb(${background},${background},${background})`; lineContext.fillRect(0, 0, lineCanvas.width, lineCanvas.height);
              lineContext.drawImage(canvas, contentLeft, top, contentRight - contentLeft, height, 0, 2, lineCanvas.width, height);
              try {
                onProgress?.(`第 ${index + 1} 张 · 正在逐行精细识别文字和标点`);
                const { preciseText } = await import('./precise-ocr');
                let precise = await preciseText(lineCanvas);
                // Retry genuinely uncertain rows with normalized polarity and contrast.
                // This helps gray chat text and punctuation on dark phone screenshots.
                if (precise.confidence < 95) {
                  const normalized = lineContext.getImageData(0, 0, lineCanvas.width, lineCanvas.height);
                  for (let offset = 0; offset < normalized.data.length; offset += 4) {
                    const luminance = (normalized.data[offset] + normalized.data[offset + 1] + normalized.data[offset + 2]) / 3;
                    const gray = dark ? 255 - Math.max(0, Math.min(255, (luminance - background - 4) * 1.8)) : Math.max(0, Math.min(255, (luminance - 128) * 1.3 + 128));
                    normalized.data[offset] = normalized.data[offset + 1] = normalized.data[offset + 2] = gray; normalized.data[offset + 3] = 255;
                  }
                  lineContext.putImageData(normalized, 0, 0);
                  const retry = await preciseText(lineCanvas);
                  if (retry.confidence > precise.confidence) precise = retry;
                }
                if (clockWord && clock && /[\p{L}\p{Script=Han}]/u.test(precise.text)) precise.text = `${precise.text.trim()} ${clock}`;
                const keepsClock = mode !== 'sales' || !clock || precise.text.includes(clock);
                const numericRow = mode === 'sales' && /^[\d\s.,，。/、;；]+$/.test(text);
                const preservesNumbers = !numericRow || precise.text.replace(/\D/g, '') === text.replace(/\D/g, '');
                if (precise.text.trim() && precise.confidence >= (mode === 'sales' ? Math.max(80, line.confidence) : 80) && keepsClock && preservesNumbers) { line.text = precise.text.trim(); line.confidence = precise.confidence; lineCanvas.width = lineCanvas.height = 0; continue; }
              } catch (reason) { preciseAvailable = false; onProgress?.(`精细识别暂不可用，正在继续基础识别；结果需仔细校对。${reason instanceof Error ? reason.message : ''}`); }
            }
            lineCanvas.width = lineCanvas.height = 0;
          }
          const numeric = mode === 'sales' && /^[\d\s.,，。/、;；]+$/.test(text) && !/^20\d{2}/.test(text);
          const latin = mode === 'prompt' && !/\p{Script=Han}/u.test(text) && /[A-Za-z]/.test(text);
          if (!numeric && !latin) continue;
          const rowCanvas = document.createElement('canvas');
          const pad = 12;
          rowCanvas.width = line.bbox.x1 - line.bbox.x0 + pad * 2; rowCanvas.height = line.bbox.y1 - line.bbox.y0 + pad * 2;
          const rowContext = rowCanvas.getContext('2d');
          if (!rowContext) continue;
          rowContext.fillStyle = 'white'; rowContext.fillRect(0, 0, rowCanvas.width, rowCanvas.height);
          rowContext.drawImage(cut, line.bbox.x0, line.bbox.y0, line.bbox.x1 - line.bbox.x0, line.bbox.y1 - line.bbox.y0, pad, pad, line.bbox.x1 - line.bbox.x0, line.bbox.y1 - line.bbox.y0);
          await worker.reinitialize('eng');
          await worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_LINE, tessedit_char_whitelist: numeric ? '0123456789.,/; ' : '', preserve_interword_spaces: '1' });
          const refined = await worker.recognize(rowCanvas.toDataURL('image/png'));
          const preservesNumbers = !numeric || (refined.data.text.match(/\d+/g)?.length === text.match(/\d+/g)?.length) || refined.data.text.replace(/\D/g, '') === text.replace(/\D/g, '');
          if (refined.data.text.trim() && preservesNumbers) { line.text = refined.data.text.trim(); line.confidence = refined.data.confidence; }
          if (numeric && preciseAvailable) {
            try {
              const { preciseText } = await import('./precise-ocr');
              const candidate = await preciseText(rowCanvas);
              // The number specialist establishes the digits. A second model may
              // improve separators and confidence, but may not change those digits
              // or merge already separated claims into one number.
              const sameDigits = candidate.text.replace(/\D/g, '') === line.text.replace(/\D/g, '');
              const keepsGroups = (candidate.text.match(/\d+/g)?.length || 0) >= (line.text.match(/\d+/g)?.length || 0);
              if (sameDigits && keepsGroups && /^[\d\s.,，。/、;；]+$/.test(candidate.text.trim()) && candidate.confidence > line.confidence) { line.text = candidate.text.trim(); line.confidence = candidate.confidence; }
            } catch { preciseAvailable = false; }
          }
          rowCanvas.width = rowCanvas.height = 0;
        }
        blocks.push(...lines.filter(line => line.text.trim()).map(line => ({ text: line.text.trim(), confidence: line.confidence, top: region.top + line.bbox.y0 / scale, bottom: region.top + line.bbox.y1 / scale, left: left + line.bbox.x0 / scale, right: left + line.bbox.x1 / scale })));
        if (!lines.length && result.data.text.trim()) blocks.push({ text: result.data.text.trim(), confidence: result.data.confidence, top: region.top, bottom: region.bottom });
        cut.width = cut.height = 0;
      }
      canvas.width = canvas.height = 0;
      blocks.sort((a, b) => a.top - b.top);
      pages.push({ text: blocks.map(block => block.text).join('\n'), blocks });
    }
    return pages;
  } finally {
    await worker.terminate();
  }
}
