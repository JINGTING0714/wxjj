import type { OcrPage } from './local-ocr';
import { isPromptVariantMarker, promptVariantMarkerContent, splitPromptVariants } from './prompt-variants';

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
  author?: string;
  origin?: string;
  acquisition?: string;
  tags?: string;
  include: boolean;
  saved: boolean;
};

const chatDecoration = /^(?:[|lI1_—–\-·•*]+|\d{1,2}:\d{2}(?::\d{2})?|\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|微信|聊天记录|群聊的聊天记录)$/i;
const dateLine = /(?:20\d{2}\s*[年/-]\s*\d{1,2}\s*[月/-]\s*\d{1,2}|\d{1,2}\s*月\s*\d{1,2}\s*日)\s*(?:\d{1,2}:\d{2}(?::\d{2})?)?/;
const usage = /^(?:使用(?:方法|说明)?|用法|说明|注意|建议|如何使用|刷\s*n\d|参数说明|复制后)/i;
const chineseLabel = /^(?:中文(?:提示词|译文|版)?|译文|翻译)\s*[:：]?\s*/i;
const englishLabel = /^(?:英文(?:提示词|原文|版)?|english\s*prompt|prompt\s*(?:en|english))\s*[:：]?\s*/i;
const parameter = /--(?:ar|chaos|cw|cref|fast|iw|no|profile|quality|q|raw|repeat|seed|sref|stop|style|stylize|sw|tile|v|video|weird|niji)\b/i;

function cleanLine(value: string) {
  return value.replace(/[\u200b\ufeff]/g, '').replace(/\s+/g, ' ').trim();
}

function hasHan(value: string) {
  return /\p{Script=Han}/u.test(value);
}

function englishLine(value: string) {
  const letters = value.match(/[A-Za-z]/g)?.length || 0;
  const words = value.match(/[A-Za-z]{2,}/g)?.length || 0;
  return letters >= 12 && words >= 3;
}

function promptLine(value: string) {
  if (!value || chatDecoration.test(value) || dateLine.test(value)) return false;
  if (parameter.test(value)) return true;
  if (usage.test(value)) return false;
  const han = value.match(/\p{Script=Han}/gu)?.length || 0;
  if (han >= 6 && value.length >= 12) return true;
  return englishLine(value) && /[,.;:()[\]{}]/.test(value);
}

function makeDraft(
  segment: { lines: string[]; screenshot: number; top: number; confidence: number },
  index: number,
): ScreenshotPromptDraft | null {
  const lines = segment.lines.map(cleanLine).filter(Boolean);
  if (!lines.length) return null;
  const english: string[] = [];
  const chinese: string[] = [];
  const unconfirmed: string[] = [];
  const notes: string[] = [];
  const hasChinesePrompt = lines.some((line) => hasHan(line));
  for (const [index, original] of lines.entries()) {
    if (isPromptVariantMarker(original)) { (hasHan(promptVariantMarkerContent(original) || lines[index + 1] || '') ? chinese : english).push(original); continue; }
    const line = original.replace(chineseLabel, '').replace(englishLabel, '').trim();
    if (!line) continue;
    if (usage.test(line) && !parameter.test(line)) {
      notes.push(line);
      continue;
    }
    if (chineseLabel.test(original) || hasHan(line)) chinese.push(line);
    else if (englishLabel.test(original) || englishLine(line)) {
      if (/^(?:--|chaos\s+\d|ar\s+\d)/i.test(line) && parameter.test(line) && hasChinesePrompt && !english.length) chinese.push(line);
      else english.push(line);
    } else unconfirmed.push(line);
  }
  const joined = (values: string[]) => values.join(' ').replace(/--\s+(?=[A-Za-z])/g, '--').replace(/(?<=\S)--(?=(?:ar|chaos|raw|profile|stylize|weird|niji|sref|seed|no|v)\b)/gi, ' --').replace(/\s+([,.;:!?])/g, '$1').trim();
  const versions = (values: string[]) => splitPromptVariants(values.join('\n')).map(value => joined(value.split('\n'))).join('\n\n');
  const result = {
    english: versions(english),
    chinese: versions(chinese).replace(/(?<=\p{Script=Han})[ \t]+(?=\p{Script=Han})/gu, ''),
    unconfirmed: joined(unconfirmed),
    note: joined(notes),
  };
  if (!result.english && !result.chinese && !result.unconfirmed && !result.note) return null;
  return {
    id: crypto.randomUUID(), screenshot: segment.screenshot, top: segment.top,
    confidence: segment.confidence, title: `提示词 ${index + 1}`,
    ...result, include: false, saved: false,
  };
}

export function draftsFromOcr(pages: OcrPage[]): ScreenshotPromptDraft[] {
  const drafts: ScreenshotPromptDraft[] = [];
  pages.forEach((page, screenshot) => {
    // Phone chat screenshots are often returned as one giant OCR block. Use
    // message date boundaries and Midjourney parameter lines instead of
    // assuming that one OCR block equals one prompt.
    const source = (page.text || page.blocks.map((block) => block.text).join('\n'))
      .split(/\r?\n/).map(cleanLine).filter(Boolean);
    const positions = new Map<string, typeof page.blocks>();
    for (const block of page.blocks) for (const line of block.text.split(/\r?\n/)) {
      const key = cleanLine(line); const matches = positions.get(key) || []; matches.push(block); positions.set(key, matches);
    }
    let active: { lines: string[]; screenshot: number; top: number; confidence: number } | null = null;
    let lineIndex = 0;
    let previousBottom = 0;
    const flush = () => {
      if (!active) return;
      const draft = makeDraft(active, drafts.length);
      if (draft) drafts.push(draft);
      active = null;
    };
    for (const raw of source) {
      const geometry = positions.get(raw)?.shift();
      if (active && geometry && geometry.top - previousBottom > Math.max(42, (geometry.bottom - geometry.top) * 2.5) && !chineseLabel.test(raw) && !usage.test(raw)) flush();
      if (geometry) previousBottom = geometry.bottom;
      if (dateLine.test(raw) || /^(?:微信|聊天记录|群聊的聊天记录)/i.test(raw)) {
        flush(); lineIndex++; continue;
      }
      if (chatDecoration.test(raw) || raw.length < 3) { lineIndex++; continue; }
      if (promptLine(raw) || isPromptVariantMarker(raw)) {
        if (!active) {
          const block = geometry;
          active = { lines: [], screenshot, top: block?.top ?? lineIndex, confidence: block?.confidence ?? 0 };
        }
        if (geometry) active.confidence = Math.min(active.confidence, geometry.confidence);
        active.lines.push(raw);
      } else if (active && usage.test(raw)) active.lines.push(raw);
      else if (active && hasHan(raw) && raw.length >= 8) active.lines.push(raw);
      else if (active && raw.length >= 8 && englishLine(raw)) active.lines.push(raw);
      lineIndex++;
    }
    flush();
  });
  return drafts.flatMap(draft => {
    const english = splitPromptVariants(draft.english), chinese = splitPromptVariants(draft.chinese), unconfirmed = splitPromptVariants(draft.unconfirmed);
    const count = Math.max(english.length, chinese.length, unconfirmed.length);
    if (count === 1) return [draft];
    return Array.from({ length: count }, (_, index) => ({ ...draft, id: crypto.randomUUID(), title: `${draft.title} · 版本 ${index + 1}`, english: english[index] || '', chinese: chinese[index] || '', unconfirmed: unconfirmed[index] || '' }));
  });
}
