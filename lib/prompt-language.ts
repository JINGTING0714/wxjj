import type { StoredLibraryAsset } from './prism-types';
export function classifyPrompt(text: string) {
  if (!text.trim()) return { english: '', chinese: '', unconfirmed: '' };
  return classifyImportedPromptText(text);
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
    if (explicit && /^--[a-z]+\b/i.test(line)) {
      (explicit === 'english' ? english : chinese).push(line);
      continue;
    }
    if (/^(?:使用|用法|说明|注意|建议|刷\s*n\d)/i.test(line)) {
      unconfirmed.push(line);
      continue;
    }
    const body = line.split(/\s--[a-z]/i)[0];
    const han = [...body.matchAll(/\p{Script=Han}/gu)].length;
    const latin = [...body.matchAll(/\p{Script=Latin}/gu)].length;
    if (
      /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(body)
    ) {
      unconfirmed.push(line);
      continue;
    }
    if (!han && latin >= 2) {
      english.push(line);
      explicit = 'english';
    } else if (
      han >= 2 &&
      (han >= latin * 0.35 ||
        (han >= 4 && (body.match(/[A-Za-z]+/g)?.length || 0) <= 3))
    ) {
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
