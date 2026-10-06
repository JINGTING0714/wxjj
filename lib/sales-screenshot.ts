import type { OcrPage } from './local-ocr';
import type { SaleMessage } from './sales-reconciliation';
import { extractSaleNumbers } from './sales-reconciliation';

const fullTime = /(?:20\d{2})\s*[-/.年]\s*(\d{1,2})\s*[-/.月]\s*(\d{1,2})\s*[日\sT]+(\d{1,2})\s*:\s*(\d{2})(?:\s*:\s*(\d{2}))?/;
const timeOnly = /\b\d{1,2}:\d{2}(?::\d{2})?\b/;
const dateLike = /20\d{2}\s*[-/.年]/;
const numericMessage = /(?:^|[^\d])\d+(?:\s*[/,，.。;；、]\s*\d+)+(?:$|[^\d])|^\s*\d+\s*$/;

function cleanLine(value: string) {
  return value.replace(/[|_]/g, ' ').replace(/\s+/g, ' ').trim();
}

function plausibleBuyer(value: string) {
  const cleaned = cleanLine(value)
    .replace(/\b\d{1,2}:\d{2}(?::\d{2})?\b/g, '')
    .replace(/20\d{2}[^\p{L}\p{Script=Han}]*/u, '')
    .replace(/[\d.,，。/、;；:：()[\]{}]+/g, ' ')
    .replace(/^(?:全|从|Re|Ane|SY|M|Om|fe|gs|4%|boa)\s+/i, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned || cleaned.length > 30 || !/[\p{L}\p{Script=Han}]/u.test(cleaned)) return '';
  return cleaned;
}

export function messagesFromOcr(pages: OcrPage[]): SaleMessage[] {
  const messages: SaleMessage[] = [];
  pages.forEach((page, screenshot) => {
    let buyer = '';
    let time = '';
    let date = '';
    const lines = (page.text || page.blocks.map((block) => block.text).join('\n'))
      .split(/\r?\n/).map(cleanLine).filter(Boolean);
    lines.forEach((raw, order) => {
      if (!raw) return;
      const day = raw.match(/(20\d{2})\s*[-/.年]\s*(\d{1,2})\s*[-/.月]\s*(\d{1,2})/);
      if (day) date = `${day[1]}-${day[2].padStart(2, '0')}-${day[3].padStart(2, '0')}`;
      const dated = raw.match(fullTime);
      if (dated) {
        const year = raw.match(/20\d{2}/)?.[0] || '';
        time = `${year}-${dated[1].padStart(2, '0')}-${dated[2].padStart(2, '0')}T${dated[3].padStart(2, '0')}:${dated[4]}:${dated[5] || '00'}`;
        buyer = plausibleBuyer(raw.slice(0, dated.index));
      } else if (timeOnly.test(raw)) {
        const before = raw.slice(0, raw.search(timeOnly)).trim();
        buyer = plausibleBuyer(before) || buyer;
        const clock = raw.match(timeOnly)?.[0] || '';
        time = date ? `${date}T${clock.length === 5 ? `${clock}:00` : clock}` : '';
      }
      const body = dated ? raw.replace(fullTime, '').trim() : raw;
      const numbers = extractSaleNumbers(body);
      const isDate = dateLike.test(raw) || /^(?:20\d{2}|\d{4})$/.test(raw);
      if (!isDate && !/^20\d{5,}$/.test(body) && numericMessage.test(body) && numbers.length && buyer) {
        const inlineBuyer = plausibleBuyer(body);
        const text = body.replace(/^[^\d]*/, '').trim() || body;
        messages.push({ id: crypto.randomUUID(), screenshot, order, buyer: inlineBuyer || buyer, time, text });
      } else if (!dated && !timeOnly.test(raw) && !isDate && !/\d/.test(raw) && !/^(?:微信|聊天记录|昨天|今天|群聊的聊天记录)$/i.test(raw)) {
        const nextBuyer = plausibleBuyer(raw);
        if (nextBuyer) buyer = nextBuyer;
      }
    });
  });
  return messages;
}
