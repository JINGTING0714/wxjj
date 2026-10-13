import {
  splitPromptVariants,
  awaitingPromptParameter,
} from './prompt-variants';
export function splitWritingVariants(text: string) {
  const known = splitPromptVariants(text);
  if (known.length > 1) return known;
  const chunks: string[] = [];
  let current = '';
  for (const line of text.replace(/\r\n?/g, '\n').split('\n')) {
    const body = line.split(/--[a-z]+\b/i)[0].trim();
    if (
      current &&
      !awaitingPromptParameter(current) &&
      /--(?:ar|profile|niji|stylize|v)\b/i.test(current) &&
      /[\p{Script=Han}A-Za-z]/u.test(body)
    ) {
      chunks.push(current.trim());
      current = '';
    }
    current += [current ? '\n' : '', line].join('');
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks.length > 1 &&
    chunks.every((value) => /--(?:ar|profile|niji|stylize|v)\b/i.test(value))
    ? chunks
    : known;
}
export const writingLanguages = [
  { id: 'zh', name: '中文' },
  { id: 'en', name: 'English' },
  { id: 'fr', name: 'Français' },
  { id: 'es', name: 'Español' },
  { id: 'ja', name: '日本語' },
  { id: 'ko', name: '한국어' },
] as const;
export type WritingLanguage = (typeof writingLanguages)[number]['id'];
export type WritingText = Record<WritingLanguage, string>;
export const emptyWritingText = (): WritingText => ({
  zh: '',
  en: '',
  fr: '',
  es: '',
  ja: '',
  ko: '',
});
export type WritingMedia = {
  id: string;
  name: string;
  type: string;
  role: 'reference' | 'example';
  variant?: number | 'shared';
};
export type WritingVersion = {
  id: string;
  label: string;
  createdAt: string;
  languages: WritingText;
  sensitive: Record<WritingLanguage, string[]>;
  note: string;
  media: WritingMedia[];
};
export type WrittenPrompt = {
  id: string;
  title: string;
  category: string;
  author: string;
  origin: string;
  tags: string[];
  note: string;
  familyId?: string;
  variantLabel?: string;
  mediaScope: string;
  versions: WritingVersion[];
  activeVersion: string;
  createdAt: string;
  updatedAt: string;
};
export type WritingSnippet = {
  id: string;
  title: string;
  text: string;
  category: string;
  language: WritingLanguage | 'any';
};
export type ApiSettings = {
  id: 'writing-api';
  url: string;
  key: string;
  model: string;
  transport?: 'auto' | 'direct' | 'relay';
  relayUrl?: string;
  authHeader?: 'auto' | 'bearer' | 'x-api-key';
};
export const emptySensitive = (): Record<WritingLanguage, string[]> => ({
  zh: [],
  en: [],
  fr: [],
  es: [],
  ja: [],
  ko: [],
});
export const writingTerms = [
  {
    category: '风格',
    zh: '厚涂',
    en: 'impasto painting',
    fr: 'peinture en empâtement',
    es: 'pintura de empaste',
    ja: '厚塗り',
    ko: '임파스토 회화',
  },
  {
    category: '风格',
    zh: '精致动漫插画',
    en: 'detailed anime illustration',
    fr: 'illustration anime détaillée',
    es: 'ilustración de anime detallada',
    ja: '精緻なアニメイラスト',
    ko: '정교한 애니메이션 일러스트',
  },
  {
    category: '质感',
    zh: '细腻织物纹理',
    en: 'fine fabric texture',
    fr: 'texture textile fine',
    es: 'textura fina de tela',
    ja: '繊細な布地の質感',
    ko: '섬세한 직물 질감',
  },
  {
    category: '光影',
    zh: '柔和侧光',
    en: 'soft side lighting',
    fr: 'éclairage latéral doux',
    es: 'iluminación lateral suave',
    ja: '柔らかな側面光',
    ko: '부드러운 측면 조명',
  },
  {
    category: '镜头',
    zh: '浅景深',
    en: 'shallow depth of field',
    fr: 'faible profondeur de champ',
    es: 'poca profundidad de campo',
    ja: '浅い被写界深度',
    ko: '얕은 피사계 심도',
  },
  {
    category: '清晰度',
    zh: '细节清晰',
    en: 'crisp details',
    fr: 'détails nets',
    es: 'detalles nítidos',
    ja: '鮮明なディテール',
    ko: '선명한 디테일',
  },
  {
    category: '配色',
    zh: '低饱和配色',
    en: 'muted color palette',
    fr: 'palette de couleurs peu saturées',
    es: 'paleta de colores poco saturados',
    ja: '低彩度の配色',
    ko: '저채도 색상 팔레트',
  },
];
export function insertWritingText(
  text: string,
  addition: string,
  start = text.length,
  end = start,
) {
  ({ start, end } = writingInsertionRange(text, addition, start, end));
  const before = text.slice(0, start),
    after = text.slice(end);
  return (
    before +
    (before && !/\s$/.test(before) ? ' ' : '') +
    addition +
    (after && !/^\s/.test(after) ? ' ' : '') +
    after
  );
}
export function writingInsertionRange(
  text: string,
  addition: string,
  start = text.length,
  end = start,
) {
  if (!addition.trimStart().startsWith('--')) {
    let cursor = 0;
    for (const part of splitWritingVariants(text)) {
      const offset = text.indexOf(part, cursor);
      if (offset < 0) continue;
      cursor = offset + part.length;
      if (start < offset || start > cursor) continue;
      const match = /(?:^|\s)(--[a-z]+\b)/i.exec(part);
      if (match) {
        const parameter =
          offset + match.index + match[0].length - match[1].length;
        start = Math.min(start, parameter);
        end = Math.min(end, parameter);
      }
      break;
    }
  }
  return { start, end };
}
export function writingVersion(doc: WrittenPrompt) {
  return (
    doc.versions.find((version) => version.id === doc.activeVersion) ||
    doc.versions.at(-1)!
  );
}
export function protectedParameters(text: string) {
  const match = /(?:^|\s)(--[a-z]+\b)/i.exec(text);
  if (!match) return { body: text, parameters: '' };
  const start = match.index + match[0].length - match[1].length;
  return {
    body: text.slice(0, start).trimEnd(),
    parameters: text.slice(start),
  };
}
export function applyTranslation(source: string, translatedBody: string) {
  const { parameters } = protectedParameters(source);
  if (/(?:^|\s)--[a-z]+\b/i.test(translatedBody))
    throw new Error('译文包含额外参数，已保留原文，请检查后重试。');
  return [translatedBody.trim(), parameters].filter(Boolean).join(' ');
}
