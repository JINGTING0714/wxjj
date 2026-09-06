import 'fake-indexeddb/auto';
import { mkdir, writeFile } from 'node:fs/promises';
import { deflateSync } from 'node:zlib';
import JSZip from 'jszip';
import {
  createVault,
  writeVaultBatch,
  exportVaultFile,
  type VaultWrite,
} from '../lib/local-vault';
import { legacyFixture } from './legacy-fixture';

const out = new URL('../outputs/qa/', import.meta.url);
await mkdir(out, { recursive: true });
function png(w: number, h: number, color: number[], transparent = false) {
  const crc = (bytes: Buffer) => {
    let value = 0xffffffff;
    for (const byte of bytes) {
      value ^= byte;
      for (let bit = 0; bit < 8; bit++)
        value = (value >>> 1) ^ (value & 1 ? 0xedb88320 : 0);
    }
    return (value ^ 0xffffffff) >>> 0;
  };
  const chunk = (name: string, data: Buffer) => {
    const n = Buffer.alloc(4);
    n.writeUInt32BE(data.length);
    const combined = Buffer.concat([Buffer.from(name), data]);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc(combined));
    return Buffer.concat([n, combined, c]);
  };
  const head = Buffer.alloc(13);
  head.writeUInt32BE(w);
  head.writeUInt32BE(h, 4);
  head[8] = 8;
  head[9] = 6;
  const pixels = Buffer.alloc(h * (w * 4 + 1));
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * (w * 4 + 1) + 1 + x * 4;
      const mark = x % 64 < 12 || y % 64 < 12;
      pixels[i] = mark ? 180 : color[0];
      pixels[i + 1] = mark ? 245 : color[1];
      pixels[i + 2] = mark ? 80 : color[2];
      pixels[i + 3] = transparent && !mark ? 0 : 255;
    }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', head),
    chunk('IDAT', deflateSync(pixels)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
const picture = png(384, 512, [101, 51, 178]);
const other = png(512, 384, [24, 68, 78]);
const watermark = png(256, 192, [170, 250, 50], true);
for (const [name, data] of [
  ['image-a.png', picture],
  ['image-b.png', other],
  ['watermark.png', watermark],
] as const)
  await writeFile(new URL(name, out), data);
await writeFile(
  new URL('list.csv', out),
  '序号,作者,提示词,备注\n1,测试老师甲,"first prompt, purple lighting, detailed shapes",保留原备注\n2,测试老师乙,"second complete prompt, green lighting, studio photograph",多作者测试',
);
const key = await createVault('wxjj-test-2026');
const batch: VaultWrite = { records: [], blobs: [] };
for (const [kind, secret] of [
  ['prompt', 'synthetic violet prompt, testing only --ar 3:4'],
  ['profile', 'abc1234'],
  ['moodboard', 'xyz5678'],
] as const) {
  const id = `qa-${kind}`;
  batch.records!.push(
    {
      scope: `collections:${kind}`,
      value: { id: `qa-lib-${kind}`, name: '仅用于测试的库' },
    },
    {
      scope: `assets:${kind}`,
      value: {
        id,
        kind,
        title: `测试 ${kind}`,
        secret,
        author: '测试老师甲',
        origin: '合成测试文件',
        acquisition: '自创',
        note: 'QA synthetic, no private assets',
        tags: ['测试'],
        collection: `qa-lib-${kind}`,
        longCode: 'test-long-code',
        customFields: [],
      },
    },
  );
  batch.blobs!.push({
    id: `qa-example-${kind}`,
    scope: `asset-image:${id}`,
    blob: new Blob([picture], { type: 'image/png' }),
    name: 'image-a.png',
  });
}
const sources = Array.from({ length: 50 }, (_, i) => {
  const id = `qa-source-${i}`;
  const name = `image-${String(i + 1).padStart(3, '0')}.png`;
  batch.blobs!.push({
    id,
    scope: 'workspace-files:collage',
    blob: new Blob([i % 2 ? picture : other], { type: 'image/png' }),
    name,
  });
  return {
    id,
    file: { __prismFile: true, id, name, type: 'image/png', lastModified: 0 },
  };
});
batch.records!.push({
  scope: 'workspaces',
  value: { id: 'workspace:collage', data: { sources } },
});
await writeVaultBatch(key, batch);
await writeFile(
  new URL('synthetic.prism', out),
  new Uint8Array(await (await exportVaultFile(key)).arrayBuffer()),
);
const legacy = await legacyFixture();
await writeFile(
  new URL('legacy.prism', out),
  new Uint8Array(await legacy.file.arrayBuffer()),
);
// Two author worksheets, each with an anchored, valid example image.
const zip = new JSZip();
const ns = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const rel =
  'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
zip.file(
  'xl/workbook.xml',
  `<workbook xmlns="${ns}" xmlns:r="${rel}"><sheets><sheet name="老师甲" r:id="r1"/><sheet name="老师乙" r:id="r2"/></sheets></workbook>`,
);
zip.file(
  'xl/_rels/workbook.xml.rels',
  '<Relationships><Relationship Id="r1" Target="worksheets/sheet1.xml"/><Relationship Id="r2" Target="worksheets/sheet2.xml"/></Relationships>',
);
for (const i of [1, 2]) {
  zip.file(
    `xl/worksheets/sheet${i}.xml`,
    `<worksheet xmlns="${ns}" xmlns:r="${rel}"><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>序号</t></is></c><c r="B1" t="inlineStr"><is><t>提示词</t></is></c></row><row r="2"><c r="A2"><v>${i}</v></c><c r="B2" t="inlineStr"><is><t>synthetic prompt ${i}, full description and details --ar 3:4</t></is></c></row></sheetData><drawing r:id="draw"/></worksheet>`,
  );
  zip.file(
    `xl/worksheets/_rels/sheet${i}.xml.rels`,
    `<Relationships><Relationship Id="draw" Target="../drawings/drawing${i}.xml"/></Relationships>`,
  );
  zip.file(
    `xl/drawings/drawing${i}.xml`,
    `<xdr:wsDr xmlns:xdr="urn:drawing" xmlns:a="urn:a" xmlns:r="${rel}"><xdr:twoCellAnchor><xdr:from><xdr:row>1</xdr:row></xdr:from><a:blip r:embed="img"/></xdr:twoCellAnchor></xdr:wsDr>`,
  );
  zip.file(
    `xl/drawings/_rels/drawing${i}.xml.rels`,
    `<Relationships><Relationship Id="img" Target="../media/${i}.png"/></Relationships>`,
  );
  zip.file(`xl/media/${i}.png`, i === 1 ? picture : other);
}
await writeFile(
  new URL('multi-author.xlsx', out),
  await zip.generateAsync({ type: 'nodebuffer' }),
);
console.log(
  'Synthetic fixtures generated in outputs/qa. Password: wxjj-test-2026. No real browser data accessed.',
);
