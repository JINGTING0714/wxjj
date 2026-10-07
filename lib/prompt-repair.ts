import { classifyImportedPromptText } from './prompt-language';
import type { StoredLibraryAsset } from './prism-types';
import { splitPromptVariants } from './prompt-variants';

const promptShape = (text: string) =>
  !/^(?:my\s|personal\b|notes?\s*[:：]|usage\b|use\s|instructions?\b|copyright\b|purchase\b)/i.test(
    text.trim(),
  ) &&
  !/^(?:我|个人|自己|备注|笔记|使用|用法|说明|注意|建议|版权|授权|购买)/.test(
    text.trim(),
  ) &&
  !/^https?:\/\/\S+$/.test(text) &&
  !/^=?(?:_?xlfn\.)?(?:DISPIMG|IMAGE)\s*\(/i.test(text) &&
  (/^(?:中文|英文|译文|翻译|English|Chinese|Prompt)\s*[:：]/i.test(text) ||
    (text.length >= 24 &&
      /分辨率|画质|插画|镜头|肖像|景深|光影|cinematic|portrait|illustration|photoreal|--(?:ar|sref|stylize)\b/i.test(
        text,
      )) ||
    (text.length >= 100 && (text.match(/[,，;；]/g)?.length || 0) >= 3));

/** Reclassify language fields and move recognizable imported prose. Original records are archived by the caller. */
export function proposePromptRepair(
  asset: StoredLibraryAsset,
): StoredLibraryAsset | null {
  if (asset.kind !== 'prompt') return null;
  const originalTexts = [
    ...new Set(
      [
        asset.promptEnglish,
        asset.promptChinese,
        asset.promptUnconfirmed,
        asset.secret,
      ].filter((value): value is string => !!value),
    ),
  ];
  const mapped = originalTexts.map(classifyImportedPromptText);
  const fields = (asset.customFields || []).filter(
    (field) =>
      /原文件|中文|英文|翻译|译文|旧补充/i.test(field.label) &&
      promptShape(field.value),
  );
  mapped.push(
    ...fields.map((field) => classifyImportedPromptText(field.value)),
  );
  const noteBlocks = (asset.note || '').split(/\n\s*\n/);
  const movedNotes = noteBlocks.filter(promptShape);
  const noteMapped = movedNotes.map(classifyImportedPromptText);
  mapped.push(...noteMapped.map((value) => ({ ...value, unconfirmed: '' })));
  const unique = (values: string[]) =>
    [...new Set(values.filter(Boolean).flatMap(splitPromptVariants))].join('\n\n');
  const promptEnglish = unique(mapped.map((value) => value.english));
  const promptChinese = unique(mapped.map((value) => value.chinese));
  const promptUnconfirmed = unique(mapped.map((value) => value.unconfirmed));
  const note = movedNotes.length
    ? [
        ...noteBlocks.filter((block) => !movedNotes.includes(block)),
        ...noteMapped.map((value) => value.unconfirmed).filter(Boolean),
      ].join('\n\n')
    : asset.note;
  const customFields = (asset.customFields || []).filter(
    (field) => !fields.some((value) => value.id === field.id),
  );
  const repair = {
    ...asset,
    promptEnglish,
    promptChinese,
    promptUnconfirmed,
    secret: promptEnglish || promptChinese || promptUnconfirmed,
    note,
    customFields,
  };
  const current = {
    ...asset,
    promptEnglish: asset.promptEnglish || '',
    promptChinese: asset.promptChinese || '',
    promptUnconfirmed: asset.promptUnconfirmed || '',
    customFields: asset.customFields || [],
  };
  return JSON.stringify(repair) === JSON.stringify(current) ? null : repair;
}
