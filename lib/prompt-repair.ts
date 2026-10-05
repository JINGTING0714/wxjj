import { classifyImportedPromptText, promptLanguages } from './prompt-language';
import type { StoredLibraryAsset } from './prism-types';

/** Return a proposed repair only. The caller must show it before writing to the vault. */
export function proposePromptRepair(
  asset: StoredLibraryAsset,
): StoredLibraryAsset | null {
  if (asset.kind !== 'prompt') return null;
  const languages = promptLanguages(asset);
  const extracted = (asset.customFields || [])
    .filter(
      (field) =>
        /原文件|中文|英文|翻译|译文/i.test(field.label) &&
        !/^=?_?xlfn\.|^=DISPIMG\(/i.test(field.value) &&
        field.value.length >= 24,
    )
    .map((field) => ({
      field,
      mapped: classifyImportedPromptText(field.value),
    }))
    .filter(({ mapped }) => mapped.english || mapped.chinese);
  if (!extracted.length) return null;
  const merge = (existing: string, additions: string[]) =>
    [...new Set([existing, ...additions].filter(Boolean))].join('\n');
  const promptEnglish = merge(
    languages.english,
    extracted.map(({ mapped }) => mapped.english),
  );
  const promptChinese = merge(
    languages.chinese,
    extracted.map(({ mapped }) => mapped.chinese),
  );
  const promptUnconfirmed = merge(
    languages.unconfirmed,
    extracted.map(({ mapped }) => mapped.unconfirmed),
  );
  return {
    ...asset,
    promptEnglish,
    promptChinese,
    promptUnconfirmed,
    secret: promptEnglish || promptChinese || promptUnconfirmed,
    customFields: (asset.customFields || []).filter(
      (field) => !extracted.some((entry) => entry.field.id === field.id),
    ),
    updatedAt: new Date().toISOString(),
  };
}
