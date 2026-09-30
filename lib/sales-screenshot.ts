import type { OcrPage } from './local-ocr';
import type { SaleMessage } from './sales-reconciliation';
import { extractSaleNumbers } from './sales-reconciliation';

const fullTime = /(?:20\d{2})[-/.年](\d{1,2})[-/.月](\d{1,2})[日\sT]+(\d{1,2}):(\d{2})(?::(\d{2}))?/;
const timeOnly = /\b\d{1,2}:\d{2}(?::\d{2})?\b/;
const numericMessage = /^(?:扣\s*)?[\d\s,，.。;；、\n]+$/;

export function messagesFromOcr(pages: OcrPage[]): SaleMessage[] {
  const messages: SaleMessage[] = [];
  pages.forEach((page, screenshot) => {
    let buyer = '';
    let time = '';
    page.blocks.forEach((block, order) => {
      const raw = block.text.trim();
      if (!raw) return;
      const dated = raw.match(fullTime);
      if (dated) {
        const year = raw.match(/20\d{2}/)?.[0] || '';
        time = `${year}-${dated[1].padStart(2, '0')}-${dated[2].padStart(2, '0')}T${dated[3].padStart(2, '0')}:${dated[4]}:${dated[5] || '00'}`;
        const before = raw.slice(0, dated.index).trim();
        if (before && before.length <= 30) buyer = before;
      } else if (timeOnly.test(raw)) {
        const before = raw.slice(0, raw.search(timeOnly)).trim();
        if (before && before.length <= 30) buyer = before;
        time = '';
      }
      const lines = raw.split('\n').map((line) => line.trim()).filter(Boolean);
      const body = dated ? lines.filter((line) => !fullTime.test(line)).join('\n') : raw;
      if (numericMessage.test(body) && extractSaleNumbers(body).length) {
        messages.push({ id: crypto.randomUUID(), screenshot, order, buyer, time, text: body });
      } else if (!dated && !timeOnly.test(raw) && !/\d/.test(raw) && raw.length <= 30 && !/^(?:微信|聊天记录|昨天|今天)$/.test(raw)) {
        buyer = raw;
      }
    });
  });
  return messages;
}
