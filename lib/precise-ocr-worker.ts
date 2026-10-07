import type { InferenceSession } from 'onnxruntime-web';
let prepared: Promise<{ session: InferenceSession; dictionary: string[] }> | undefined;

async function preciseText(pixels: ImageData, path: string) {
  if (!prepared) {
    prepared = (async () => {
      const { env, InferenceSession } = await import('onnxruntime-web/wasm');
      env.wasm.wasmPaths = path; env.wasm.numThreads = 1; env.wasm.proxy = false;
      const [session, dictionaryText] = await Promise.all([InferenceSession.create(`${path}ch_PP-OCRv4_rec_infer.onnx`, { executionProviders: ['wasm'] }), fetch(`${path}ppocr_keys_v1.txt`).then(response => { if (!response.ok) throw new Error('字典加载失败'); return response.text(); })]);
      return { session, dictionary: [...dictionaryText.split('\n'), ' '] };
    })();
    void prepared.catch(() => { prepared = undefined; });
  }
  const { Tensor } = await import('onnxruntime-web/wasm');
  const model = await prepared;
  const height = 48, width = Math.max(32, Math.ceil(pixels.width / pixels.height * height / 32) * 32);
  const resized = new OffscreenCanvas(width, height);
  const context = resized.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('无法读取截图像素');
  const source = new OffscreenCanvas(pixels.width, pixels.height);
  source.getContext('2d')!.putImageData(pixels, 0, 0);
  context.drawImage(source, 0, 0, width, height);
  const image = context.getImageData(0, 0, width, height).data;
  const input = new Float32Array(3 * width * height), plane = width * height;
  for (let index = 0; index < plane; index++) for (let channel = 0; channel < 3; channel++) input[channel * plane + index] = (image[index * 4 + 2 - channel] / 255 - .5) / .5;
  const result = await model.session.run({ [model.session.inputNames[0]]: new Tensor('float32', input, [1, 3, height, width]) });
  const output = result[model.session.outputNames[0]], values = output.data as Float32Array;
  const vocabulary = Number(output.dims[2]);
  let previous = -1, text = '', total = 0, characters = 0;
  for (let index = 0; index < values.length; index += vocabulary) {
    let best = 0;
    for (let key = 1; key < vocabulary; key++) if (values[index + key] > values[index + best]) best = key;
    if (best !== 0 && best !== previous) { text += model.dictionary[best - 1] || ''; total += values[index + best]; characters++; }
    previous = best;
  }
  resized.width = resized.height = 0;
  return { text, confidence: characters ? total / characters * 100 : 0 };
}
let chain = Promise.resolve();
self.addEventListener('message', (event: MessageEvent<{ id: number; pixels: ImageData; path: string }>) => {
  const { id, pixels, path } = event.data;
  chain = chain.then(async () => {
    try { self.postMessage({ id, result: await preciseText(pixels, path) }); }
    catch (reason) { self.postMessage({ id, error: reason instanceof Error ? reason.message : '精细识别失败' }); }
  });
});

