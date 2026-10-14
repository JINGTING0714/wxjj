import {
  applyTranslation,
  protectedParameters,
  splitWritingVariants,
  type WritingLanguage,
} from './writing-model';
const greetings: Record<string, Record<WritingLanguage, string>> = {
  你好: {
    zh: '你好',
    en: 'Hello',
    fr: 'Bonjour',
    es: 'Hola',
    ja: 'こんにちは',
    ko: '안녕하세요',
  },
  谢谢: {
    zh: '谢谢',
    en: 'Thank you',
    fr: 'Merci',
    es: 'Gracias',
    ja: 'ありがとうございます',
    ko: '감사합니다',
  },
  再见: {
    zh: '再见',
    en: 'Goodbye',
    fr: 'Au revoir',
    es: 'Adiós',
    ja: 'さようなら',
    ko: '안녕히 가세요',
  },
};
const memo = new Map<string, string>();
type NativeTranslator = {
  translate: (text: string) => Promise<string>;
  destroy: () => void;
};
type NativeFactory = {
  availability: (pair: {
    sourceLanguage: string;
    targetLanguage: string;
  }) => Promise<string>;
  create: (pair: {
    sourceLanguage: string;
    targetLanguage: string;
  }) => Promise<NativeTranslator>;
};
let worker: Worker | undefined,
  serial = 0,
  idle: ReturnType<typeof setTimeout> | undefined;
export function clearLocalTranslation() {
  worker?.terminate();
  worker = undefined;
  memo.clear();
}
async function localText(
  text: string,
  source: WritingLanguage,
  target: WritingLanguage,
  signal: AbortSignal,
  progress: (text: string) => void,
  allowDownload = false,
) {
  clearTimeout(idle);
  signal.throwIfAborted();
  const direct = Object.values(greetings).find(
    (row) => row[source] === text.trim().replace(/[！!。.]$/, ''),
  );
  if (direct) return direct[target];
  const key = source + '\0' + target + '\0' + text;
  if (memo.has(key)) return memo.get(key)!;
  const native = (globalThis as unknown as { Translator?: NativeFactory })
    .Translator;
  let output = '';
  if (
    native &&
    (await native.availability({
      sourceLanguage: source,
      targetLanguage: target,
    })) !== 'unavailable'
  ) {
    progress('正在使用浏览器的本地语言包…');
    const translator = await native.create({
      sourceLanguage: source,
      targetLanguage: target,
    });
    try {
      output = await translator.translate(text);
    } finally {
      translator.destroy();
    }
  } else {
    worker ||= new Worker(
      new URL('./local-translation-worker.ts', import.meta.url),
      { type: 'module' },
    );
    const current = worker,
      id = ++serial;
    output = await new Promise<string>((resolve, reject) => {
      const done = () => {
        current.removeEventListener('message', receive);
        current.removeEventListener('error', failed);
        signal.removeEventListener('abort', abort);
      };
      const failed = (event: ErrorEvent) => {
        done();
        current.terminate();
        if (worker === current) worker = undefined;
        reject(new Error('本地语言包未能启动：' + event.message));
      };
      const abort = () => {
        done();
        current.terminate();
        if (worker === current) worker = undefined;
        reject(new DOMException('翻译已取消', 'AbortError'));
      };
      const receive = (event: MessageEvent) => {
        if (event.data.id !== id) return;
        if (event.data.progress) {
          progress(event.data.progress);
          return;
        }
        done();
        event.data.error
          ? reject(new Error(event.data.error))
          : resolve(event.data.text);
      };
      current.addEventListener('message', receive);
      current.addEventListener('error', failed);
      signal.addEventListener('abort', abort, { once: true });
      current.postMessage({ id, text, source, target, allowDownload });
    });
  }
  signal.throwIfAborted();
  if (!output.trim()) throw new Error('本地语言包没有返回译文，请重试。');
  memo.set(key, output);
  if (memo.size > 200) memo.delete(memo.keys().next().value!);
  idle = setTimeout(() => {
    worker?.terminate();
    worker = undefined;
  }, 20000);
  return output;
}
export async function prepareLocalTranslation(
  signal: AbortSignal,
  progress: (message: string) => void,
) {
  await localText('语言包准备就绪。', 'zh', 'en', signal, progress, true);
}
export async function translateLocally(
  text: string,
  source: WritingLanguage,
  target: WritingLanguage,
  signal: AbortSignal,
  progress = (message: string) => {},
  verify = false,
) {
  const translated: string[] = [],
    back: string[] = [];
  for (const variant of splitWritingVariants(text)) {
    const { body } = protectedParameters(variant);
    if (!body.trim()) throw new Error('请先填写需要翻译的中文。');
    const result = await localText(body, source, target, signal, progress);
    translated.push(applyTranslation(variant, result));
    if (verify)
      back.push(await localText(result, target, source, signal, progress));
  }
  return {
    translation: translated.join('\n\n'),
    backTranslation: back.join('\n\n'),
    warnings: [
      '本机翻译，不调用 API。请核对人物动作、数量、否定词和术语；MJ 参数保持原样。',
    ],
  };
}
