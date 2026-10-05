import type { StoredLibraryAsset } from './prism-types';
export function classifyPrompt(text: string) {
  if (!text.trim()) return { english: '', chinese: '', unconfirmed: '' };
  const chinese = /\p{Script=Han}/u.test(text),
    latin = /[A-Za-z]/.test(text);
  if (latin && !chinese && !/[^\p{ASCII}\s\p{P}\p{N}\p{S}]/u.test(text))
    return { english: text, chinese: '', unconfirmed: '' };
  if (
    chinese &&
    !latin &&
    !/[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(text)
  )
    return { english: '', chinese: text, unconfirmed: '' };
  return { english: '', chinese: '', unconfirmed: text };
}

/** Conservative import mapping. Existing vault records never pass through this function. */
export function classifyImportedPromptText(text: string) {
  const lines = text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const english: string[] = [];
  const chinese: string[] = [];
  const unconfirmed: string[] = [];
  let explicit: 'english' | 'chinese' | null = null;
  for (const raw of lines) {
    const englishLabel = raw.match(
      /^(?:英文(?:提示词|原文|版)?|english(?:\s+prompt)?|prompt\s*en)(?:\s*[:：]\s*(.*)|\s*)$/i,
    );
    const chineseLabel = raw.match(
      /^(?:中文(?:提示词|译文|版)?|译文|翻译|chinese(?:\s+prompt)?|prompt\s*zh)(?:\s*[:：]\s*(.*)|\s*)$/i,
    );
    if (englishLabel) explicit = 'english';
    if (chineseLabel) explicit = 'chinese';
    const line =
      englishLabel || chineseLabel
        ? englishLabel?.[1] || chineseLabel?.[1] || ''
        : raw;
    if (!line) continue;
    if (/^(?:使用|用法|说明|注意|建议|刷\s*n\d)/i.test(line)) {
      unconfirmed.push(line);
      continue;
    }
    const han = [...line.matchAll(/\p{Script=Han}/gu)].length;
    const latin = [...line.matchAll(/[A-Za-z]/g)].length;
    if (!han && latin >= 4) {
      english.push(line);
      explicit = 'english';
    } else if (han >= 2 && han >= latin * 0.35) {
      chinese.push(line);
      explicit = 'chinese';
    } else if (explicit && /^--[a-z]+\b/i.test(line))
      (explicit === 'english' ? english : chinese).push(line);
    else unconfirmed.push(line);
  }
  return {
    english: english.join('\n'),
    chinese: chinese.join('\n'),
    unconfirmed: unconfirmed.join('\n'),
  };
}
/** A read-only legacy view; no write-back or language guess overwrites old content. */
export function promptLanguages(
  asset?: Pick<
    StoredLibraryAsset,
    'secret' | 'promptEnglish' | 'promptChinese' | 'promptUnconfirmed'
  >,
) {
  if (!asset) return { english: '', chinese: '', unconfirmed: '' };
  if (
    asset.promptEnglish !== undefined ||
    asset.promptChinese !== undefined ||
    asset.promptUnconfirmed !== undefined
  )
    return {
      english: asset.promptEnglish || '',
      chinese: asset.promptChinese || '',
      unconfirmed: asset.promptUnconfirmed || '',
    };
  return classifyPrompt(asset.secret || '');
}
/** Import preview and saved values must agree, including a separate legacy original. */
export function importedPromptLanguages(
  asset: Pick<
    StoredLibraryAsset,
    'secret' | 'promptEnglish' | 'promptChinese' | 'promptUnconfirmed'
  >,
) {
  const values = promptLanguages(asset);
  if (
    asset.promptUnconfirmed === undefined &&
    (asset.promptEnglish !== undefined || asset.promptChinese !== undefined) &&
    asset.secret !== asset.promptEnglish &&
    asset.secret !== asset.promptChinese
  )
    values.unconfirmed = asset.secret;
  return values;
}
