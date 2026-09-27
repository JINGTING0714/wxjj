import { deflateSync } from 'node:zlib';
import { pngCrc } from '../lib/png-cleaner';

export function chunk(type: string, data = new Uint8Array()) {
  const bytes = new Uint8Array(data.length + 12);
  new DataView(bytes.buffer).setUint32(0, data.length);
  bytes.set(new TextEncoder().encode(type), 4);
  bytes.set(data, 8);
  new DataView(bytes.buffer).setUint32(
    bytes.length - 4,
    pngCrc(bytes.subarray(4, bytes.length - 4)),
  );
  return bytes;
}
export function pngFixture(
  options: { indexed?: boolean; metadata?: boolean } = {},
) {
  const header = new Uint8Array(13);
  const view = new DataView(header.buffer);
  view.setUint32(0, 2);
  view.setUint32(4, 1);
  header[8] = 8;
  header[9] = options.indexed ? 3 : 6;
  const gamma = new Uint8Array(4);
  new DataView(gamma.buffer).setUint32(0, 45455);
  const parts = [
    new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('gAMA', gamma),
    chunk('sRGB', new Uint8Array([0])),
  ];
  if (options.indexed)
    parts.push(
      chunk('PLTE', new Uint8Array([255, 0, 0, 0, 255, 0])),
      chunk('tRNS', new Uint8Array([0, 128])),
    );
  if (options.metadata !== false)
    parts.push(
      chunk('tEXt', new TextEncoder().encode('Prompt\0private prompt')),
      chunk(
        'zTXt',
        new Uint8Array([
          ...new TextEncoder().encode('Software\0'),
          0,
          ...deflateSync('Private tool'),
        ]),
      ),
      chunk(
        'iTXt',
        new Uint8Array([
          ...new TextEncoder().encode('XML:com.adobe.xmp\0'),
          0,
          0,
          0,
          0,
          ...new TextEncoder().encode('<xmp>private GPS</xmp>'),
        ]),
      ),
      chunk('eXIf', new Uint8Array([73, 73, 42, 0])),
      chunk('tIME', new Uint8Array([7, 234, 9, 27, 10, 0, 0])),
      chunk('vpAg', new TextEncoder().encode('private unknown field')),
    );
  const pixels = options.indexed
    ? [0, 0, 1]
    : [0, 255, 0, 0, 0, 0, 255, 0, 128];
  parts.push(chunk('IDAT', deflateSync(new Uint8Array(pixels))), chunk('IEND'));
  return new Uint8Array(Buffer.concat(parts));
}
