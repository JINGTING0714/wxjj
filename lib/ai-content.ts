/** Keep generated media out of prompt text and bound expensive editor work. */
export function cleanAiText(value: string, limit = 40000) {
  const text = value
    .replace(/!\[[^\]]*\]\(data:image\/[\s\S]*?\)/gi, '')
    .replace(/data:image\/[\w.+-]+;base64,[A-Za-z0-9+/=\s]+/gi, '')
    .trim();
  if (text.length > limit)
    throw new Error('返回文字过长，请让晏精简内容；原稿保留。');
  return text;
}
export function autoWritingTitle(text: string) {
  const body = cleanAiText(text)
    .split(/--[a-z]/i)[0]
    .trim();
  return (
    body.slice(0, 22).replace(/\s+/g, ' ') ||
    `${new Date().toLocaleDateString('zh-CN')}自写词`
  );
}
export function imageDataFile(uri: string, name = '晏参考图.png') {
  const match = uri.match(
    /^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/=\s]+)$/i,
  );
  if (!match || uri.length > 40_000_000)
    throw new Error('返回图片格式无效或过大。');
  const raw = atob(match[2].replace(/\s/g, ''));
  return new File([Uint8Array.from(raw, (char) => char.charCodeAt(0))], name, {
    type: match[1],
  });
}
