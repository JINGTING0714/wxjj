import { promptLanguages } from './prompt-language';
import type { StoredLibraryAsset } from './prism-types';

const marker = /^(?:(?:版本|方案|变体|version|variant)\s*([一二三四五六七八九十\dA-Z])|第\s*([一二三四五六七八九十\d])\s*版)(?:\s*[:：.)、-]\s*(.*)|\s*)$/i;
export const isPromptVariantMarker = (text: string) => marker.test(text.trim());
export const promptVariantMarkerContent = (text: string) => text.trim().match(marker)?.[3] || '';
const parameters = /--(?:ar|chaos|profile|sref|stylize|niji|raw|v|weird|seed|no)\b/i;
const body = (value: string) => value.replace(/--[\s\S]*/, '').trim();
const prose = (value: string) => body(value).length >= 12 && (/\p{Script=Han}/u.test(value) || (value.match(/[A-Za-z]{2,}/g)?.length || 0) >= 3);

/** Split explicit variants and successive complete commands, preserving the
 * exact contents inside each version. Wrapped parameter lines stay attached. */
export function splitPromptVariants(value = ''): string[] {
  const parts: string[] = [];
  let current: string[] = [];
  const flush = () => { const text = current.join('\n').trim(); if (text) parts.push(text); current = []; };
  const lines = value.replace(/\r\n?/g, '\n').split('\n');
  for (const line of lines) {
    const header = line.trim().match(marker);
    if (header) { flush(); if (header[3]) current.push(header[3]); continue; }
    if (current.length && parameters.test(current.join('\n')) && prose(line)) flush();
    current.push(line);
  }
  flush();
  return parts.length > 1 && parts.every(prose) ? parts : [value.trim()];
}

export function promptVariantRecords(asset: StoredLibraryAsset): StoredLibraryAsset[] {
  const languages = promptLanguages(asset);
  const english = splitPromptVariants(languages.english), chinese = splitPromptVariants(languages.chinese), unconfirmed = splitPromptVariants(languages.unconfirmed);
  const count = Math.max(english.length, chinese.length, unconfirmed.length);
  if (count < 2) return [asset];
  return Array.from({ length: count }, (_, index) => {
    const promptEnglish = english[index] || '', promptChinese = chinese[index] || '', promptUnconfirmed = unconfirmed[index] || '';
    return { ...asset, id: index ? `${asset.id}:variant:${index + 1}` : asset.id, title: `${asset.title} · 版本 ${index + 1}`, promptFamilyId: asset.promptFamilyId || asset.id, promptVariantLabel: `版本 ${index + 1}`, promptEnglish, promptChinese, promptUnconfirmed, secret: promptEnglish || promptChinese || promptUnconfirmed };
  });
}
