import { apiRequest } from './writing-api';
import { cleanAiText, imageDataFile } from './ai-content';
import type { ApiSettings } from './writing-model';
export type YanRole = 'write' | 'image' | 'vision';
export type YanProfile = Omit<ApiSettings, 'id'> & {
  id: string;
  name: string;
  vision?: boolean;
  imageEndpoint?: 'images' | 'chat';
};
export type YanMessage = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  createdAt: string;
  media?: { id: string; name: string }[];
};
export type YanConversation = {
  id: string;
  title: string;
  kind: YanRole;
  messages: YanMessage[];
  createdAt: string;
  updatedAt: string;
};
export const yanNames = { write: '写词晏', image: '生图晏', vision: '识图晏' };
export const yanIdentity = `你叫晏，是一位审美一流、用词精准的顶级提示词工程师，女性。你擅长人物、配饰、光影、构图、材质和风格的精准描述，以及 Midjourney 和图像生成模型提示词。你既能讨论创作灵感，也能写出层次清晰、具体可执行的提示词。尊重用户画风与意图，不擅自替换人物动作、数量和重要细节；缺少信息时自然沟通，不能凭空断言。用户未要求时不要添加夸张的清晰度套话。默认用中文交流。参考图只能根据真正收到的图像输入描述；无法读取图片时明确说明，不假装看见。不要输出、复述附件的 base64、API Key 或任何图片数据编码。只描述用户需要的画面与提示词。MJ 参数按原内容保留，不编造 Profile 短码。`;
function settings(profile: YanProfile): ApiSettings {
  return { ...profile, id: 'writing-api' };
}
export async function yanChat(
  profile: YanProfile,
  history: YanMessage[],
  signal: AbortSignal,
  image?: string,
) {
  if (image && !profile.vision)
    throw new Error('请在识图 API 设置中确认模型支持图像输入，再发送参考图。');
  const messages = history.slice(-24).map((message, index, array) => ({
    role: message.role,
    content:
      image && index === array.length - 1
        ? [
            { type: 'text', text: message.text || '请准确描述这张参考图。' },
            { type: 'image_url', image_url: { url: image } },
          ]
        : message.text,
  }));
  const data = await apiRequest(
    settings(profile),
    '/chat/completions',
    {
      model: profile.model,
      messages: [{ role: 'system', content: yanIdentity }, ...messages],
      stream: false,
    },
    signal,
  );
  const choice = Array.isArray(data.choices)
    ? (data.choices[0] as { message?: { content?: unknown } })
    : undefined;
  const content = choice?.message?.content ?? data.output_text ?? data.response;
  const raw =
    typeof content === 'string'
      ? content
      : Array.isArray(content)
        ? content.map((part) => part?.text || '').join('\n')
        : '';
  const text = cleanAiText(raw, 30000);
  if (!text)
    throw new Error(
      '接口没有返回可用文字，可能不支持图像输入。请更换识图模型；原稿保留。',
    );
  return text;
}
export async function yanGenerate(
  profile: YanProfile,
  prompt: string,
  signal: AbortSignal,
  size: string,
) {
  if (!prompt.trim()) throw new Error('请填写想生成的画面。');
  const endpoint =
    profile.imageEndpoint === 'chat'
      ? '/chat/completions'
      : '/images/generations';
  const data = await apiRequest(
    settings(profile),
    endpoint,
    profile.imageEndpoint === 'chat'
      ? {
          model: profile.model,
          messages: [
            {
              role: 'system',
              content: yanIdentity + '本次请根据描述生成图像。',
            },
            { role: 'user', content: prompt },
          ],
          stream: false,
          modalities: ['image', 'text'],
        }
      : { model: profile.model, prompt, n: 1, size },
    signal,
  );
  const values: { b64_json?: string; url?: string }[] = Array.isArray(data.data)
    ? data.data
    : [];
  if (!values.length && Array.isArray(data.choices)) {
    const message = data.choices[0]?.message;
    for (const item of message?.images || [])
      values.push({ url: item.image_url?.url || item.url });
    const content = message?.content;
    if (typeof content === 'string')
      for (const match of content.matchAll(
        /(?:\]\()(data:image\/[^)]+|https:\/\/[^)]+)\)/g,
      ))
        values.push({ url: match[1] });
    if (Array.isArray(content))
      for (const item of content)
        if (item.type === 'image_url')
          values.push({ url: item.image_url?.url });
  }
  if (!values.length)
    throw new Error('接口没有返回图片。请确认选择了生图模型及正确的生图接口。');
  const files: File[] = [];
  for (const [index, item] of values.slice(0, 4).entries()) {
    const name = `${new Date().getFullYear()}年${new Date().getMonth() + 1}月${new Date().getDate()}日生图-${index + 1}.png`;
    if (item.b64_json)
      files.push(imageDataFile('data:image/png;base64,' + item.b64_json, name));
    else if (item.url?.startsWith('data:image/'))
      files.push(imageDataFile(item.url, name));
    else if (item.url) {
      const url = new URL(item.url);
      if (url.protocol !== 'https:')
        throw new Error('返回的图片地址需要 HTTPS。');
      const response = await fetch(url, {
        signal,
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
      });
      if (!response.ok)
        throw new Error('生成成功，但图片下载失败，请重试保存。');
      const blob = await response.blob();
      if (blob.size > 30_000_000 || !blob.type.startsWith('image/'))
        throw new Error('生成图片格式不支持或过大。');
      files.push(new File([blob], name, { type: blob.type }));
    }
  }
  return files;
}
export async function yanImageInput(file: File) {
  const bitmap = await createImageBitmap(file),
    canvas = document.createElement('canvas');
  try {
    const scale = Math.min(1, 1280 / Math.max(bitmap.width, bitmap.height));
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas
      .getContext('2d')!
      .drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.88);
  } finally {
    bitmap.close();
    canvas.width = canvas.height = 0;
  }
}
