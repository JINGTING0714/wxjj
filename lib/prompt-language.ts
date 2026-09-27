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
