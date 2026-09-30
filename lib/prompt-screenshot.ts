import type { OcrPage } from './local-ocr';

export type ScreenshotPromptDraft = {
  id: string;
  screenshot: number;
  top: number;
  confidence: number;
  title: string;
  english: string;
  chinese: string;
  unconfirmed: string;
  note: string;
  collectionId?: string;
  newCollection?: string;
  include: boolean;
  saved: boolean;
};

const chatDecoration = /^(?:\d{1,2}:\d{2}(?::\d{2})?|\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|微信|聊天记录)$/;
const usage = /^(?:使用|用法|说明|注意|建议|刷\s*n\d|参数说明)/i;
const chineseLabel = /^(?:中文(?:提示词|译文)?|译文|翻译)\s*[:：]?\s*/i;
const englishLabel = /^(?:英文(?:提示词|原文)?|english\s*prompt|prompt)\s*[:：]?\s*/i;

export function draftsFromOcr(pages: OcrPage[]): ScreenshotPromptDraft[] {
  const drafts: ScreenshotPromptDraft[] = [];
  pages.forEach((page, screenshot) => {
    // OCR often returns an entire chat bubble as one block. Split its lines before
    // deciding which language each fragment belongs to.
    const fragments = page.blocks.flatMap((block) => block.text.split(/\r?\n/).map((text, index, lines) => ({
      text,
      confidence: block.confidence,
      top: block.top + (block.bottom - block.top) * index / Math.max(1, lines.length),
    })));
    for (const block of fragments) {
      const raw = block.text.trim();
      if (!raw || chatDecoration.test(raw) || /^\d{1,2}月\d{1,2}日/.test(raw)) continue;
      const hasHan = /\p{Script=Han}/u.test(raw);
      const english = raw.replace(englishLabel, '').trim();
      const chinese = raw.replace(chineseLabel, '').trim();
      const previous = drafts[drafts.length - 1];
      if (!hasHan && /[A-Za-z]/.test(raw) && english.length >= 18) {
        const continues = previous && previous.screenshot === screenshot &&
          /^[a-z,.;:)]/.test(english) && block.top - previous.top < 350;
        if (continues) {
          previous.english += ` ${english}`;
          previous.confidence = Math.min(previous.confidence, block.confidence);
        } else {
          drafts.push({
            id: crypto.randomUUID(), screenshot, top: block.top,
            confidence: block.confidence, title: `提示词 ${drafts.length + 1}`,
            english, chinese: '', unconfirmed: '', note: '', include: false, saved: false,
          });
        }
      } else if (hasHan && previous && previous.screenshot === screenshot &&
        (chineseLabel.test(raw) || (!usage.test(raw) && raw.length >= 24))) {
        previous.chinese = [previous.chinese, chinese].filter(Boolean).join('\n');
        previous.confidence = Math.min(previous.confidence, block.confidence);
      } else if (hasHan && previous && previous.screenshot === screenshot && usage.test(raw)) {
        previous.unconfirmed = [previous.unconfirmed, raw].filter(Boolean).join('\n');
      } else if (raw.length >= 8) {
        drafts.push({
          id: crypto.randomUUID(), screenshot, top: block.top,
          confidence: block.confidence, title: `待确认 ${drafts.length + 1}`,
          english: '', chinese: '', unconfirmed: raw, note: '', include: false, saved: false,
        });
      }
    }
  });
  return drafts;
}
