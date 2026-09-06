import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DOMParser } from '@xmldom/xmldom';
import JSZip from 'jszip';
import {
  parseAssetFile,
  parseDelimited,
  parseTextBlocks,
} from '../lib/asset-import';
import { mergeSources, shuffleSources } from '../lib/pipeline';
import {
  profileChoices,
  profileCodes,
  profileImageScope,
  resolveLegacyProfileIds,
} from '../lib/profile-model';
import type { StoredLibraryAsset } from '../lib/prism-types';
(globalThis as any).DOMParser = DOMParser;
test('CSV quoted multiline prompts and distinct authors remain complete', async () => {
  const csv =
    '序号,作者,提示词,备注\r\n1,老师甲,"a cinematic portrait, violet light\nsecond line",自己的备注\r\n2,老师乙,"second prompt, long words and lighting",更多信息';
  const result = await parseAssetFile(
    new File([csv], '测试词会.csv'),
    'prompt',
  );
  assert.equal(result.rows.length, 2);
  assert.equal(
    result.rows[0].secret,
    'a cinematic portrait, violet light\nsecond line',
  );
  assert.equal(result.rows[1].author, '老师乙');
  assert.equal(result.rows[1].title, '2');
  assert.equal(result.rows[0].origin, '测试词会.csv');
  assert.throws(() => parseDelimited('x,"broken', ','));
});
test('XLSX multi-author sheets, shared strings and embedded row examples', async () => {
  const zip = new JSZip();
  const ns = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
  const rel =
    'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  zip.file(
    'xl/workbook.xml',
    `<workbook xmlns="${ns}" xmlns:r="${rel}"><sheets><sheet name="桔啊" r:id="r1"/><sheet name="巴比兔" r:id="r2"/></sheets></workbook>`,
  );
  zip.file(
    'xl/_rels/workbook.xml.rels',
    '<Relationships><Relationship Id="r1" Target="worksheets/sheet1.xml"/><Relationship Id="r2" Target="worksheets/sheet2.xml"/></Relationships>',
  );
  zip.file(
    'xl/sharedStrings.xml',
    `<sst xmlns="${ns}"><si><t>完整提示词</t></si><si><t>第一段\n第二段</t></si></sst>`,
  );
  for (const i of [1, 2])
    zip.file(
      `xl/worksheets/sheet${i}.xml`,
      `<worksheet xmlns="${ns}" xmlns:r="${rel}"><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>序号</t></is></c><c r="B1" t="s"><v>0</v></c></row><row r="2"><c r="A2"><v>${i}</v></c><c r="B2" t="s"><v>1</v></c></row></sheetData>${i === 1 ? '<drawing r:id="draw"/>' : ''}</worksheet>`,
    );
  zip.file(
    'xl/worksheets/_rels/sheet1.xml.rels',
    '<Relationships><Relationship Id="draw" Target="../drawings/drawing1.xml"/></Relationships>',
  );
  zip.file(
    'xl/drawings/drawing1.xml',
    `<xdr:wsDr xmlns:xdr="urn:drawing" xmlns:a="urn:a" xmlns:r="${rel}"><xdr:twoCellAnchor><xdr:from><xdr:row>1</xdr:row></xdr:from><a:blip r:embed="img"/></xdr:twoCellAnchor></xdr:wsDr>`,
  );
  zip.file(
    'xl/drawings/_rels/drawing1.xml.rels',
    '<Relationships><Relationship Id="img" Target="../media/example.png"/></Relationships>',
  );
  zip.file('xl/media/example.png', new Uint8Array([137, 80, 78, 71, 2, 3]));
  const result = await parseAssetFile(
    new File(
      [await zip.generateAsync({ type: 'arraybuffer' })],
      '暑期词会.xlsx',
    ),
    'prompt',
  );
  assert.equal(result.libraryName, '暑期词会');
  assert.equal(result.rows.length, 2);
  assert.deepEqual(
    result.rows.map((r) => r.author),
    ['桔啊', '巴比兔'],
  );
  assert.equal(result.rows[0].secret, '第一段\n第二段');
  assert.equal(result.rows[0].images.length, 1);
  assert.equal(result.unmatchedImages.length, 0);
  assert.equal(result.rows[1].origin, '暑期词会.xlsx');
});
test('text author markers and numbered prompts split correctly', () => {
  const rows = parseTextBlocks(
    '作者：老师甲\n1. first complete prompt\n2. second complete prompt\n作者：老师乙\n3. third complete prompt',
    'prompt',
    'list.txt',
  );
  assert.equal(rows.length, 3);
  assert.equal(rows[2].author, '老师乙');
  assert.equal(rows[2].title, '3');
});

test('Profile folders retain independent stage/final codes and stable recipe references', () => {
  const old: StoredLibraryAsset = {
    id: 'folder',
    kind: 'profile',
    title: '同一文件夹',
    longCode: 'long-code',
    secret: 'abc1234',
    author: '老师',
    origin: 'source',
    acquisition: '其他',
    note: '',
    tags: [],
    collection: 'library',
  };
  const legacy = profileCodes(old)[0];
  assert.equal(legacy.nature, 'unconfirmed');
  assert.equal(profileImageScope(old.id, legacy), 'asset-image:folder');
  const expanded = {
    ...old,
    profileCodes: [
      { ...legacy, nature: 'stage' as const },
      {
        id: 'final',
        label: '最终成品',
        secret: 'fin5678',
        nature: 'final' as const,
        note: '成品说明',
      },
    ],
  };
  const options = profileChoices([expanded]);
  assert.equal(options.length, 2);
  assert.notEqual(options[0].id, options[1].id);
  assert.equal(options[1].stageType, '成品 P');
  const pinned = resolveLegacyProfileIds(['folder'], [old]);
  assert.equal(pinned[0], options[0].id);
  assert.deepEqual(
    resolveLegacyProfileIds(pinned, [
      { ...expanded, profileCodes: [expanded.profileCodes[1]] },
    ]),
    pinned,
  );
});

test('JSON secret and profile nature columns are recognized without guessing final status', async () => {
  const doc = await parseAssetFile(
    new File(
      [
        JSON.stringify([
          {
            title: '1',
            secret: 'abc1234',
            author: '老师',
            longCode: 'folder-code',
            nature: '成品 P',
          },
        ]),
      ],
      'profiles.json',
    ),
    'profile',
  );
  assert.equal(doc.rows[0].secret, 'abc1234');
  assert.equal(doc.rows[0].nature, '成品 P');
  assert.equal(doc.rows[0].longCode, 'folder-code');
});
test('shuffle mixes all batches without losing or duplicating sources; rework replaces by stable id', () => {
  const items = Array.from({ length: 1000 }, (_, i) => ({
    id: String(i),
    file: new File(['x'], `${i}.png`),
  }));
  const shuffled = shuffleSources(items, () => 0.25);
  assert.equal(new Set(shuffled.map((i) => i.id)).size, 1000);
  assert.notDeepEqual(
    shuffled.map((i) => i.id),
    items.map((i) => i.id),
  );
  const replacement = new File(['y'], 'new.png');
  const merged = mergeSources(items, [
    { id: '2', file: replacement },
    { id: '1001', file: replacement },
  ]);
  assert.equal(merged.length, 1000);
  assert.equal(merged[2].file, replacement);
});
