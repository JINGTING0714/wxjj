import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deflateSync, inflateSync } from 'node:zlib';
import {
  deepCleanPng,
  fastCleanPng,
  parsePng,
  pngCrc,
  runPngQueue,
} from '../lib/png-cleaner';
import { chunk, pngFixture } from './png-fixtures';

void test('CRC matches independent standard check vector', () => {
  assert.equal(pngCrc(new TextEncoder().encode('123456789')), 0xcbf43926);
});
void test('deep clean removes text, compressed text, XMP, EXIF, time and unknown metadata without changing source or image bytes', async () => {
  for (const indexed of [false, true]) {
    const source = pngFixture({ indexed });
    const original = source.slice();
    const before = parsePng(source);
    const result = deepCleanPng(source);
    const output = new Uint8Array(await result.blob.arrayBuffer());
    const after = parsePng(output);
    assert.deepEqual(source, original);
    assert.equal(before.fields.length, 6);
    assert.equal(after.fields.length, 0);
    assert.equal(
      before.fields.find((field) => field.name === 'Prompt')?.highRisk,
      true,
    );
    assert.equal(
      before.fields.find((field) => field.name === 'Software')?.highRisk,
      false,
    );
    for (const kept of after.chunks) {
      const matching = before.chunks.find((item) => item.type === kept.type)!;
      assert.deepEqual(
        output.slice(kept.start, kept.end),
        source.slice(matching.start, matching.end),
      );
    }
    assert.ok(after.chunks.some((item) => item.type === 'sRGB'));
    assert.equal(
      after.chunks.some((item) => item.type === 'tRNS'),
      indexed,
    );
    const image = after.chunks.find((item) => item.type === 'IDAT')!;
    assert.deepEqual(
      [...inflateSync(output.slice(image.start + 8, image.end - 4))],
      indexed ? [0, 0, 1] : [0, 255, 0, 0, 0, 0, 255, 0, 128],
    );
    assert.deepEqual(
      new Uint8Array(await deepCleanPng(output).blob.arrayBuffer()),
      output,
    );
  }
});
void test('deep clean preserves ICC profiles and display ancillary information', async () => {
  const source = pngFixture({ metadata: false });
  const report = parsePng(source);
  const idat = report.chunks.find((item) => item.type === 'IDAT')!;
  const srgb = report.chunks.find((item) => item.type === 'sRGB')!;
  const icc = chunk(
    'iCCP',
    new Uint8Array([
      ...new TextEncoder().encode('Test profile\0'),
      0,
      ...deflateSync('test profile payload'),
    ]),
  );
  const modified = new Uint8Array(
    Buffer.concat([
      source.slice(0, srgb.start),
      icc,
      chunk('pHYs', new Uint8Array(9)),
      source.slice(idat.start),
    ]),
  );
  const output = new Uint8Array(
    await deepCleanPng(modified).blob.arrayBuffer(),
  );
  assert.deepEqual(output, modified);
});
void test('malformed PNG fails closed: signature, bounds, CRC, duplicate header, IDAT order, missing IEND, tail, palette and APNG', () => {
  const valid = pngFixture();
  const report = parsePng(valid);
  const idat = report.chunks.find((item) => item.type === 'IDAT')!;
  const corrupt = valid.slice();
  corrupt[29] ^= 1;
  const oversized = valid.slice();
  new DataView(oversized.buffer).setUint32(8, 0xffffffff);
  const indexed = pngFixture({ indexed: true });
  const palette = parsePng(indexed).chunks.find(
    (item) => item.type === 'PLTE',
  )!;
  const cases = [
    new Uint8Array([1, 2, 3]),
    valid.slice(0, 10),
    corrupt,
    oversized,
    new Uint8Array(Buffer.concat([valid.slice(0, 33), valid.slice(8)])),
    valid.slice(0, -12),
    new Uint8Array(Buffer.concat([valid, new Uint8Array([0])])),
    new Uint8Array(
      Buffer.concat([
        indexed.slice(0, palette.start),
        indexed.slice(palette.end),
      ]),
    ),
    new Uint8Array(
      Buffer.concat([
        valid.slice(0, idat.start),
        chunk('acTL', new Uint8Array(8)),
        valid.slice(idat.start),
      ]),
    ),
    new Uint8Array(
      Buffer.concat([
        valid.slice(0, -12),
        chunk('tEXt', new TextEncoder().encode('note\0x')),
        chunk('IDAT', new Uint8Array([1])),
        chunk('IEND'),
      ]),
    ),
    new Uint8Array(
      Buffer.concat([
        valid.slice(0, idat.start),
        chunk('ABCD'),
        valid.slice(idat.start),
      ]),
    ),
  ];
  for (const bytes of cases) assert.throws(() => parsePng(bytes));
});
void test('200-file queue isolates errors and produces new Files', async () => {
  const sources = Array.from({ length: 200 }, (_, index) => ({
    id: String(index),
    file: new File(
      [index === 70 ? new Uint8Array([1]) : pngFixture()],
      `image-${index}.png`,
    ),
  }));
  const outputs: Parameters<
    Parameters<typeof runPngQueue>[1]['onResult']
  >[0][] = [];
  const result = await runPngQueue(sources, {
    mode: 'deep',
    onResult: (output, done) => {
      outputs.push(output);
      assert.equal(done, outputs.length);
    },
  });
  assert.equal(result.completed, 200);
  assert.equal(outputs.filter((output) => output.file).length, 199);
  assert.ok(outputs[70].error);
  assert.notEqual(outputs[0].file, sources[0].file);
  assert.equal(outputs[0].file!.name, 'image-0-clean.png');
});
void test('cancellation stops remaining files and does not emit late results; pending files can resume', async () => {
  const control = new AbortController();
  let count = 0;
  const sources = Array.from({ length: 20 }, (_, index) => ({
    id: String(index),
    file: new File([pngFixture()], 'test.png'),
  }));
  const result = await runPngQueue(sources, {
    mode: 'deep',
    signal: control.signal,
    onResult: () => {
      if (++count === 3) control.abort();
    },
  });
  assert.deepEqual(result, { completed: 3, cancelled: true });
  assert.equal(count, 3);
  const resumed = await runPngQueue(sources.slice(3), {
    mode: 'deep',
    onResult: () => {},
  });
  assert.equal(resumed.completed, 17);
});

void test('fast-clean browser adapter redraws, strips encoder metadata and releases temporary resources on success, decode error and cancellation', async (context) => {
  const source = new Blob([pngFixture()]);
  const report = parsePng(pngFixture());
  let draws = 0,
    revocations = 0,
    decoderFails = false;
  const duringEncode: { current?: () => void } = {};
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => ({
      drawImage: () => {
        draws++;
      },
    }),
    toBlob: (callback: (blob: Blob) => void, type: string) => {
      assert.equal(type, 'image/png');
      duringEncode.current?.();
      queueMicrotask(() => callback(new Blob([pngFixture()], { type })));
    },
  };
  class FakeImage {
    naturalWidth = 2;
    naturalHeight = 1;
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    set src(value: string) {
      if (value)
        queueMicrotask(() =>
          decoderFails ? this.onerror?.() : this.onload?.(),
        );
    }
  }
  const imageDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'Image');
  const documentDescriptor = Object.getOwnPropertyDescriptor(
    globalThis,
    'document',
  );
  Object.defineProperty(globalThis, 'Image', {
    value: FakeImage,
    configurable: true,
  });
  Object.defineProperty(globalThis, 'document', {
    value: { createElement: () => canvas },
    configurable: true,
  });
  context.mock.method(URL, 'createObjectURL', () => 'blob:test-png');
  context.mock.method(URL, 'revokeObjectURL', () => {
    revocations++;
  });
  context.after(() => {
    if (imageDescriptor)
      Object.defineProperty(globalThis, 'Image', imageDescriptor);
    else Reflect.deleteProperty(globalThis, 'Image');
    if (documentDescriptor)
      Object.defineProperty(globalThis, 'document', documentDescriptor);
    else Reflect.deleteProperty(globalThis, 'document');
  });
  const clean = await fastCleanPng(source, report);
  assert.equal(
    parsePng(new Uint8Array(await clean.arrayBuffer())).fieldCount,
    0,
  );
  assert.equal(draws, 1);
  assert.equal(revocations, 1);
  assert.equal(canvas.width, 0);
  assert.equal(canvas.height, 0);
  decoderFails = true;
  await assert.rejects(fastCleanPng(source, report), /解码/);
  assert.equal(revocations, 2);
  assert.equal(draws, 1);
  decoderFails = false;
  const control = new AbortController();
  duringEncode.current = () => control.abort();
  await assert.rejects(fastCleanPng(source, report, control.signal), {
    name: 'AbortError',
  });
  assert.equal(revocations, 3);
  assert.equal(canvas.width, 0);
  assert.equal(canvas.height, 0);
  await assert.rejects(
    fastCleanPng(source, { ...report, width: 20000 }),
    /改用深度清洗/,
  );
  assert.equal(revocations, 3);
});
