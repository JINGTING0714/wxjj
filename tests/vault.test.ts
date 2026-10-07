import 'fake-indexeddb/auto';
import { beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import { legacyFixture } from './legacy-fixture';
import { defaultComposition } from '../lib/watermark-composition';
import { pngFixture } from './png-fixtures';
import { deepCleanPng } from '../lib/png-cleaner';
import { syncProfileMoodboards } from '../lib/profile-moodboard-sync';
import { syncPromptVariants } from '../lib/prompt-variant-sync';
import { BackupZipWriter, openBackupZip } from '../lib/backup-zip';
import type { StoredLibraryAsset, CollectionRecord, StoredRecipe } from '../lib/prism-types';
import {
  createVault,
  unlockVault,
  writeVaultBatch,
  loadEncryptedRecords,
  loadEncryptedBlobs,
  exportVaultFile,
  importVaultFile,
  inspectVaultFile,
  createRecoveryKey,
  resetVaultPassword,
} from '../lib/local-vault';

async function clear() {
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase('prism-local-vault');
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}
beforeEach(clear);

void test('existing schema v1 unlock and export do not upgrade or scan files, even with an old tab open', async () => {
  const oldConnection = await new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open('prism-local-vault', 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore('meta', { keyPath: 'key' });
      for (const name of ['records','blobs']) req.result.createObjectStore(name, { keyPath: 'id' }).createIndex('scope', 'scope');
    };
    req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error);
  });
  let file: File;
  try {
    const key = await createVault('existing-schema-password');
    await writeVaultBatch(key, { records: [{ scope: 'test', value: { id: 'preserve', note: '原库文字' } }], blobs: [{ scope: 'test', id: 'original', blob: new Blob(['original image bytes']), name: 'original.png' }] });
    const unlocked = await unlockVault('existing-schema-password');
    assert.equal((await loadEncryptedRecords<{ note: string }>(unlocked, 'test'))[0].note, '原库文字');
    file = new File([await exportVaultFile(unlocked)], 'existing.prism');
    assert.equal((await inspectVaultFile(file)).files, 1);
    assert.equal(oldConnection.version, 1);
    assert.ok(!oldConnection.objectStoreNames.contains('backup-staging'));
    assert.ok(!oldConnection.transaction('blobs').objectStore('blobs').indexNames.contains('backup-revision'));
  } finally { oldConnection.close(); }
  const restored = await importVaultFile(file!, 'existing-schema-password');
  assert.equal((await loadEncryptedRecords<{ note: string }>(restored.key, 'test'))[0].note, '原库文字');
  assert.equal(await (await loadEncryptedBlobs(restored.key, 'test'))[0].blob.text(), 'original image bytes');
  const upgraded = await new Promise<IDBDatabase>((resolve, reject) => { const req = indexedDB.open('prism-local-vault'); req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); });
  try {
    assert.equal(upgraded.version, 2);
    assert.ok(upgraded.objectStoreNames.contains('backup-staging'));
    assert.ok(!upgraded.transaction('blobs').objectStore('blobs').indexNames.contains('backup-revision'));
  } finally { upgraded.close(); }
});

void test('streaming backup writes standard ZIP entries incrementally and restores exact data', async () => {
  const key = await createVault('stream-export-password');
  await writeVaultBatch(key, { records: [{ scope: 'test', value: { id: 'stream-record', note: '保留' } }], blobs: [{ id: 'large', scope: 'test-image', blob: new Blob([new Uint8Array(3 * 1024 * 1024).fill(71)]), name: 'large.png' }] });
  const chunks: Uint8Array<ArrayBuffer>[] = [], progress: number[] = [];
  const result = await exportVaultFile(key, { write: async bytes => { assert.ok(bytes.byteLength <= 1024 * 1024); chunks.push(bytes.slice()); }, onProgress: status => progress.push(status.current) });
  assert.equal(result, undefined);
  assert.ok(chunks.length > 5 && progress.includes(2));
  const file = new File(chunks, 'stream.prism');
  const zip = await JSZip.loadAsync(await file.arrayBuffer(), { checkCRC32: true });
  assert.ok(zip.file('manifest.json'));
  const info = await inspectVaultFile(file); assert.equal(info.files, 1); assert.equal(info.records, 1);
  await clear(); const restored = await importVaultFile(file, 'stream-export-password');
  assert.equal((await loadEncryptedRecords<{ id: string; note: string }>(restored.key, 'test'))[0].note, '保留');
  const bytes = new Uint8Array(await (await loadEncryptedBlobs(restored.key, 'test-image'))[0].blob.arrayBuffer());
  assert.equal(bytes.length, 3 * 1024 * 1024); assert.ok(bytes.every(value => value === 71));
});

void test('failed output and interrupted staged restore preserve the live vault', async () => {
  const key = await createVault('failure-safe-password');
  await writeVaultBatch(key, { records: [{ scope: 'test', value: { id: 'keep', note: '不要丢失' } }], blobs: [{ id: 'file', scope: 'test-image', blob: new Blob(['original']), name: 'image.png' }] });
  await assert.rejects(exportVaultFile(key, { write: async () => { throw new Error('disk full'); } }), /disk full/);
  assert.equal((await loadEncryptedRecords<{ note: string }>(key, 'test'))[0].note, '不要丢失');
  const backup = new File([await exportVaultFile(key)], 'safe.prism');
  let checks = 0;
  await assert.rejects(importVaultFile(backup, 'failure-safe-password', { assertSession: () => { if (++checks >= 2) throw new Error('cancelled staging'); } }), /cancelled staging/);
  assert.equal((await loadEncryptedRecords<{ note: string }>(key, 'test'))[0].note, '不要丢失');
  assert.equal(await (await loadEncryptedBlobs(key, 'test-image'))[0].blob.text(), 'original');
  checks = 0;
  await assert.rejects(importVaultFile(backup, 'failure-safe-password', { assertSession: () => { if (++checks >= 4) throw new Error('cancelled commit'); } }), /cancelled commit/);
  assert.equal((await loadEncryptedRecords<{ note: string }>(key, 'test'))[0].note, '不要丢失');
  assert.equal(await (await loadEncryptedBlobs(key, 'test-image'))[0].blob.text(), 'original');
});

void test('a changed encrypted revision aborts export without overwriting current data', async () => {
  const key = await createVault('revision-check-password');
  await writeVaultBatch(key, { records: [{ scope: 'test', value: { id: 'keep', note: '旧内容' } }] });
  let changed = false;
  await assert.rejects(exportVaultFile(key, { write: async () => { if (changed) return; changed = true; await writeVaultBatch(key, { records: [{ scope: 'test', value: { id: 'keep', note: '新内容' } }] }); } }), /资料发生变化/);
  assert.equal((await loadEncryptedRecords<{ note: string }>(key, 'test'))[0].note, '新内容');
});

void test('ZIP64 offsets can be read through slices without allocating the whole archive', async () => {
  const chunks: Uint8Array<ArrayBuffer>[] = [], base = 0x100000000 + 8;
  const writer = new BackupZipWriter(async chunk => { chunks.push(chunk.slice()); });
  Reflect.set(writer, 'offset', base);
  const payload = new TextEncoder().encode('original encrypted bytes');
  await writer.add('test.bin', payload); await writer.finish();
  const physical = new Blob(chunks);
  const sparse = { size: base + physical.size, slice(start: number, end: number) {
    if (start >= base) return physical.slice(start - base, end - base);
    return new Blob([new Uint8Array(Math.min(end, base) - start), ...(end > base ? [physical.slice(0, end - base)] : [])]);
  } } as Blob;
  const zip = await openBackupZip(sparse);
  assert.equal(new TextDecoder().decode(await zip.read('test.bin')), 'original encrypted bytes');
});

void test('split prompt versions keep original examples in an encrypted pool until ownership is reviewed', async () => {
  const key = await createVault('variant-pool-password');
  const first = 'A cinematic portrait, lifting a silver necklace --ar 3:4';
  const second = 'A cinematic portrait, adjusting round glasses --ar 3:4';
  const record: StoredLibraryAsset = { id: 'mixed', kind: 'prompt', title: '双版本', secret: `${first}\n\n${second}`, promptEnglish: `${first}\n\n${second}`, author: '作者', origin: '购买', acquisition: '付费', note: '', tags: [], collection: 'unfiled' };
  await writeVaultBatch(key, { records: [{ scope: 'assets:prompt', value: record }], blobs: [
    { id: 'silver', scope: 'asset-image:mixed', blob: new Blob(['silver-example']), name: 'silver.png' },
    { id: 'glasses', scope: 'asset-image:mixed', blob: new Blob(['glasses-example']), name: 'glasses.png' },
  ] });
  const vault = { loadRecords: <T>(scope: string) => loadEncryptedRecords<T>(key, scope), loadBlobs: (scope: string) => loadEncryptedBlobs(key, scope), writeBatch: (batch: Parameters<typeof writeVaultBatch>[1]) => writeVaultBatch(key, batch) };
  assert.equal(await syncPromptVariants(vault), 1);
  const versions = await loadEncryptedRecords<StoredLibraryAsset>(key, 'assets:prompt');
  assert.deepEqual(versions.map(version => version.promptEnglish), [first, second]);
  assert.ok(versions.every(version => version.promptExampleReviewRequired));
  const images = await loadEncryptedBlobs(key, versions[0].promptExamplePoolScope!);
  assert.deepEqual((await Promise.all(images.map(image => image.blob.text()))).sort(), ['glasses-example', 'silver-example']);
  assert.equal((await loadEncryptedBlobs(key, `asset-image:${versions[1].id}`)).length, 0);
  assert.equal(await syncPromptVariants(vault), 0);
  assert.equal((await loadEncryptedBlobs(key, versions[0].promptExamplePoolScope!)).length, 2);
});

void test('older split versions with copied examples request ownership review without losing images', async () => {
  const key = await createVault('legacy-variant-password');
  const record: StoredLibraryAsset = { id: 'old', kind: 'prompt', title: '旧词条 · 版本 1', secret: 'A portrait, silver necklace --ar 3:4', promptEnglish: 'A portrait, silver necklace --ar 3:4', promptFamilyId: 'old', author: '作者', origin: '', acquisition: '', note: '', tags: [], collection: 'unfiled' };
  await writeVaultBatch(key, { records: [
    { scope: 'assets:prompt', value: record },
    { scope: 'assets:prompt', value: { ...record, id: 'old:variant:2', title: '旧词条 · 版本 2', secret: 'A portrait, round glasses --ar 3:4', promptEnglish: 'A portrait, round glasses --ar 3:4' } },
    { scope: 'prompt-variant-history', value: { id: 'prompt-variants:old', original: record } },
  ], blobs: [
    { id: 'a', scope: 'asset-image:old', blob: new Blob(['original-example']), name: 'example.png' },
    { id: 'b', scope: 'asset-image:old:variant:2', blob: new Blob(['original-example']), name: 'example.png' },
  ] });
  const vault = { loadRecords: <T>(scope: string) => loadEncryptedRecords<T>(key, scope), loadBlobs: (scope: string) => loadEncryptedBlobs(key, scope), writeBatch: (batch: Parameters<typeof writeVaultBatch>[1]) => writeVaultBatch(key, batch) };
  assert.equal(await syncPromptVariants(vault), 1);
  assert.ok((await loadEncryptedRecords<StoredLibraryAsset>(key, 'assets:prompt')).every(version => version.promptExampleReviewRequired));
  assert.equal((await loadEncryptedBlobs(key, 'asset-image:old')).length, 1);
  assert.equal((await loadEncryptedBlobs(key, 'asset-image:old:variant:2')).length, 1);
  assert.equal(await syncPromptVariants(vault), 0);
});

void test('emotion-only folders move with examples and recipe references; categories only exist for emotion records', async () => {
  const key = await createVault('emotion-sync-password');
  const folder: StoredLibraryAsset = { id: 'emotion-only', kind: 'profile', title: '福利p', secret: 'emoABC', profileCodes: [{ id: 'e', label: '情绪p', secret: 'emoABC', nature: 'emotion', note: '短码备注' }], author: '原作者', origin: '购买', acquisition: '付费购入', note: '文件夹备注', tags: ['N6P'], collection: 'modern' };
  const other = { ...folder, id: 'final-only', title: '成品', collection: 'other', profileCodes: [{ ...folder.profileCodes![0], id: 'f', nature: 'final' as const }] };
  await writeVaultBatch(key, { records: [
    { scope: 'assets:profile', value: folder }, { scope: 'assets:profile', value: other },
    { scope: 'collections:profile', value: { id: 'modern', name: '现代人' } }, { scope: 'collections:profile', value: { id: 'other', name: '无情绪' } },
    { scope: 'collections:moodboard', value: { id: 'old-empty', name: '无情绪' } },
    { scope: 'recipes', value: { id: 'r', title: '旧配方', profileIds: ['emotion-only::e'], moodboardIds: [], selectionOrder: [{ kind: 'profile', id: 'emotion-only::e' }], ratio: '3:4', note: '', tags: [] } },
  ], blobs: [{ id: 'image', scope: 'profile-code-image:emotion-only:e', blob: new Blob(['example']), name: 'example.png' }] });
  const vault = { loadRecords: <T>(scope: string) => loadEncryptedRecords<T>(key, scope), loadBlobs: (scope: string) => loadEncryptedBlobs(key, scope), writeBatch: (batch: Parameters<typeof writeVaultBatch>[1]) => writeVaultBatch(key, batch) };
  await syncProfileMoodboards(vault);
  const moods = await loadEncryptedRecords<StoredLibraryAsset>(key, 'assets:moodboard');
  assert.equal(moods.length, 1); assert.equal(moods[0].title, '福利p情绪p'); assert.equal(moods[0].author, '原作者'); assert.equal(moods[0].note, '文件夹备注\n短码备注');
  assert.equal((await loadEncryptedRecords<StoredLibraryAsset>(key, 'assets:profile')).length, 1);
  assert.equal((await loadEncryptedRecords<StoredLibraryAsset>(key, 'assets:profile-moved'))[0].id, folder.id);
  assert.deepEqual((await loadEncryptedRecords<CollectionRecord>(key, 'collections:moodboard')).map(category => category.name), ['现代人']);
  assert.equal((await loadEncryptedBlobs(key, `asset-image:${moods[0].id}`))[0].name, 'example.png');
  const recipe = (await loadEncryptedRecords<StoredRecipe>(key, 'recipes'))[0]; assert.deepEqual(recipe.profileIds, []); assert.deepEqual(recipe.moodboardIds, [moods[0].id]);
  await syncProfileMoodboards(vault); assert.equal((await loadEncryptedRecords<StoredLibraryAsset>(key, 'assets:moodboard')).length, 1);
});

test('ledger receipts, undo, bilingual prompts, global recipe order and dynamic rules survive encrypted migration', async () => {
  const key=await createVault('p2-p4-backup-password');
  const fileRef={__prismFile:true,id:'receipt',name:'凭证.png',type:'image/png',lastModified:1};
  const transaction={id:'transaction',date:'2026-09-27',amount:12345,receipts:[fileRef]};
  const records=[
    {scope:'workspaces',value:{id:'workspace:accounting',data:{accounts:[{id:'a',name:'微信',opening:500}],transactions:[transaction],undo:[{id:transaction.id,previous:transaction,label:'修改交易'}]}}},
    {scope:'prompts',value:{id:'prompt',secret:'legacy mixed 中英',promptEnglish:'English',promptChinese:'中文',promptUnconfirmed:'legacy mixed 中英',note:'旧备注',customFields:[{id:'field',label:'旧字段',value:'保留'}]}},
    {scope:'recipes',value:{id:'recipe',profileIds:['p2','p1'],moodboardIds:['m1'],selectionOrder:[{kind:'moodboard',id:'m1'},{kind:'profile',id:'p2'},{kind:'profile',id:'p1'}]}},
    {scope:'workspaces',value:{id:'workspace:watermark',data:{layers:[{sourceCopy:true,rotation:90,crop:{left:0.1,right:0,top:0,bottom:0},file:{__prismFile:true,id:'rule',name:'rule.png',type:'image/png'}}],overrides:{'source-2':{rotation:45}}}}},
  ];
  await writeVaultBatch(key,{records,blobs:[{id:'receipt',scope:'workspace-files:accounting',name:'凭证.png',blob:new Blob(['receipt bytes'],{type:'image/png'})},{id:'rule',scope:'workspace-files:watermark',name:'rule.png',blob:new Blob([],{type:'image/png'})}]});
  const backup=new File([await exportVaultFile(key)],'p2-p4.prism');await clear(); const restored=await importVaultFile(backup,'p2-p4-backup-password');
  for(const scope of ['workspaces','prompts','recipes']) assert.deepEqual(await loadEncryptedRecords(restored.key,scope),records.filter(record=>record.scope===scope).map(record=>record.value));
  assert.equal(await (await loadEncryptedBlobs(restored.key,'workspace-files:accounting'))[0].blob.text(),'receipt bytes');
  assert.equal((await loadEncryptedBlobs(restored.key,'workspace-files:watermark'))[0].blob.size,0);
});

void test('PNG source and clean copy survive encrypted full backup with old library data unchanged', async () => {
  const key = await createVault('png-backup-test-password');
  const original = pngFixture({ indexed: true });
  const cleaned = deepCleanPng(original);
  const cleanBytes = new Uint8Array(await cleaned.blob.arrayBuffer());
  const oldProfile = { id: 'old-profile', secret: 'CaseSensitiveCODE', note: '原有备注', codes: ['B', 'A'] };
  const snapshot = {
    id: 'workspace:png-cleaner',
    data: {
      mode: 'deep',
      sources: [{ id: 'png-source', file: { __prismFile: true, id: 'png-original', name: 'original.png', type: 'image/png', lastModified: 1000 } }],
      results: [{ id: 'png-source', report: { ...cleaned.report, chunks: [] }, file: { __prismFile: true, id: 'png-cleaned', name: 'original-clean.png', type: 'image/png', lastModified: 2000 } }],
    },
  };
  await writeVaultBatch(key, {
    records: [{ scope: 'profiles', value: oldProfile }, { scope: 'workspaces', value: snapshot }],
    blobs: [
      { id: 'png-original', scope: 'workspace-files:png-cleaner', name: 'original.png', blob: new Blob([original], { type: 'image/png' }) },
      { id: 'png-cleaned', scope: 'workspace-files:png-cleaner', name: 'original-clean.png', blob: cleaned.blob },
    ],
  });
  const backup = new File([await exportVaultFile(key)], 'png-workspace.prism');
  await clear();
  const restored = await importVaultFile(backup, 'png-backup-test-password');
  assert.deepEqual(await loadEncryptedRecords(restored.key, 'profiles'), [oldProfile]);
  assert.deepEqual(await loadEncryptedRecords(restored.key, 'workspaces'), [snapshot]);
  const files = await loadEncryptedBlobs(restored.key, 'workspace-files:png-cleaner');
  assert.deepEqual(new Uint8Array(await files.find((file) => file.id === 'png-original')!.blob.arrayBuffer()), original);
  assert.deepEqual(new Uint8Array(await files.find((file) => file.id === 'png-cleaned')!.blob.arrayBuffer()), cleanBytes);
});

test('recipe categories, library references, manual entries and examples survive cross-device backup exactly', async () => {
  const key = await createVault('recipe-migration-password');
  const recipe = {
    id: 'mixed-recipe',
    title: '混合配方',
    collection: 'recipe-cat',
    profileIds: ['folder:stage-1'],
    moodboardIds: [],
    manualEntries: [
      {
        id: 'manual-p',
        kind: 'profile',
        secret: 'CaseSensitive123456789',
        label: '手填阶段',
        author: '作者乙',
        note: '福利 P',
      },
      {
        id: 'manual-m',
        kind: 'moodboard',
        secret: 'xYz',
        label: '',
        author: '',
        note: '',
      },
    ],
    customFields: [{ id: 'f', label: '自行扩展', value: '不遗漏' }],
  };
  await writeVaultBatch(key, {
    records: [
      { scope: 'recipes', value: recipe },
      {
        scope: 'collections:recipe',
        value: { id: 'recipe-cat', name: '配方库' },
      },
    ],
    blobs: [
      {
        id: 'recipe-img',
        scope: 'recipe-image:mixed-recipe',
        name: 'example.png',
        blob: new Blob([new Uint8Array([0, 1, 255])], { type: 'image/png' }),
      },
    ],
  });
  const backup = new File([await exportVaultFile(key)], 'recipe.prism');
  await clear();
  const restored = await importVaultFile(backup, 'recipe-migration-password');
  assert.deepEqual(await loadEncryptedRecords(restored.key, 'recipes'), [
    recipe,
  ]);
  assert.deepEqual(
    await loadEncryptedRecords(restored.key, 'collections:recipe'),
    [{ id: 'recipe-cat', name: '配方库' }],
  );
  const images = await loadEncryptedBlobs(
    restored.key,
    'recipe-image:mixed-recipe',
  );
  assert.equal(images.length, 1);
  assert.deepEqual(
    new Uint8Array(await images[0].blob.arrayBuffer()),
    new Uint8Array([0, 1, 255]),
  );
  await writeVaultBatch(restored.key, {
    deleteRecords: ['recipe-cat'],
    records: [
      { scope: 'recipes', value: { ...recipe, collection: 'unfiled' } },
    ],
  });
  assert.deepEqual(await loadEncryptedRecords(restored.key, 'recipes'), [
    { ...recipe, collection: 'unfiled' },
  ]);
  assert.equal(
    (await loadEncryptedBlobs(restored.key, 'recipe-image:mixed-recipe'))
      .length,
    1,
  );
});

test('bulk deletion changes only selected records and blobs, never their collections or other assets', async () => {
  const key = await createVault('bulk-test-password');
  const records = ['a', 'b', 'keep'].map((id) => ({
    scope: 'assets:prompt',
    value: { id, collection: 'library', secret: `secret-${id}` },
  }));
  await writeVaultBatch(key, {
    records: [
      ...records,
      {
        scope: 'collections:prompt',
        value: { id: 'library', name: '保留的库' },
      },
    ],
    blobs: ['a', 'b', 'keep'].map((id) => ({
      id: `img-${id}`,
      scope: `asset-image:${id}`,
      blob: new Blob([id]),
      name: `${id}.png`,
    })),
  });
  await writeVaultBatch(key, {
    deleteRecords: ['a', 'b'],
    deleteBlobs: ['img-a', 'img-b'],
  });
  assert.deepEqual(await loadEncryptedRecords(key, 'assets:prompt'), [
    records[2].value,
  ]);
  assert.equal(
    (await loadEncryptedRecords(key, 'collections:prompt')).length,
    1,
  );
  assert.equal((await loadEncryptedBlobs(key, 'asset-image:keep')).length, 1);
  assert.equal((await loadEncryptedBlobs(key, 'asset-image:a')).length, 0);
});

test('fitted canvas, independent stretch, layer order and locks survive full backup restore exactly', async () => {
  const key = await createVault('composition-test-password');
  const composition = defaultComposition();
  composition.canvasWidth = 1.5;
  composition.canvasHeight = 1.2;
  composition.sourceIndex = 1;
  composition.fitContent = true;
  composition.source = {
    ...composition.source,
    locked: false,
    x: 0.4,
    y: 0.6,
    rotation: 37,
    scale: 0.72,
    scaleX: 1.4,
    scaleY: 0.65,
  };
  const data = {
    batches: [
      {
        id: 'one',
        composition,
        layers: [
          {
            id: 'frame',
            locked: true,
            x: 0.5,
            y: 0.5,
            scaleX: 0.75,
            scaleY: 2.3,
          },
        ],
      },
    ],
  };
  await writeVaultBatch(key, {
    records: [
      {
        scope: 'workspaces',
        value: { id: 'workspace:watermark-batches', data },
      },
    ],
  });
  const backup = new File([await exportVaultFile(key)], 'composition.prism');
  await clear();
  const restored = await importVaultFile(backup, 'composition-test-password');
  assert.deepEqual(await loadEncryptedRecords(restored.key, 'workspaces'), [
    { id: 'workspace:watermark-batches', data },
  ]);
});
test('complete restore to fresh device preserves metadata, all scopes and exact binary bytes', async () => {
  const key = await createVault('测试Password 123');
  const values = [
    {
      scope: 'assets:prompt',
      value: {
        id: 'p',
        secret: 'a\n完整提示词',
        author: '桔啊',
        collection: 'lib',
        custom: ['x'],
      },
    },
    { scope: 'collections:prompt', value: { id: 'lib', name: '词会名单' } },
    {
      scope: 'workspaces',
      value: {
        id: 'workspace:collage',
        data: { rows: 7, columns: 7, order: ['3', '2'] },
      },
    },
  ];
  const binary = Uint8Array.from({ length: 100_000 }, (_, i) => i % 256);
  await writeVaultBatch(key, {
    records: values,
    blobs: [
      {
        id: 'img',
        scope: 'asset-image:p',
        blob: new Blob([binary], { type: 'image/png' }),
        name: '私密例图.png',
      },
    ],
  });
  const backup = new File([await exportVaultFile(key)], 'complete.prism');
  const info = await inspectVaultFile(backup);
  assert.equal(info.records, 3);
  assert.equal(info.files, 1);
  assert.equal(info.verified, true);
  await clear();
  const imported = await importVaultFile(backup, '测试Password 123');
  for (const r of values)
    assert.deepEqual(await loadEncryptedRecords(imported.key, r.scope), [
      r.value,
    ]);
  const [image] = await loadEncryptedBlobs(imported.key, 'asset-image:p');
  assert.equal(image.name, '私密例图.png');
  assert.deepEqual(new Uint8Array(await image.blob.arrayBuffer()), binary);
  await unlockVault('测试Password 123');
});
test('wrong password and corrupt file cannot change destination; successful import completely replaces it', async () => {
  let key = await createVault('original-password');
  await writeVaultBatch(key, {
    records: [{ scope: 'test', value: { id: 'original' } }],
  });
  const backup = new File([await exportVaultFile(key)], 'backup.prism');
  await clear();
  key = await createVault('destination-password');
  await writeVaultBatch(key, {
    records: [{ scope: 'test', value: { id: 'destination' } }],
  });
  await assert.rejects(importVaultFile(backup, 'wrong-password'));
  assert.deepEqual(await loadEncryptedRecords(key, 'test'), [
    { id: 'destination' },
  ]);
  const zip = await JSZip.loadAsync(await backup.arrayBuffer());
  zip.file('records/0.bin', 'corrupt');
  const corrupt = new File(
    [await zip.generateAsync({ type: 'arraybuffer' })],
    'bad.prism',
  );
  await assert.rejects(importVaultFile(corrupt, 'original-password'));
  await unlockVault('destination-password');
  const result = await importVaultFile(backup, 'original-password');
  assert.deepEqual(await loadEncryptedRecords(result.key, 'test'), [
    { id: 'original' },
  ]);
  await assert.rejects(unlockVault('destination-password'));
});
test('recovery resets password without touching data and is portable', async () => {
  const key = await createVault('password-original');
  await writeVaultBatch(key, {
    records: [{ scope: 'test', value: { id: 'original' } }],
  });
  const code = await createRecoveryKey(key, 'password-original');
  const backup = new File([await exportVaultFile(key)], 'recovery.prism');
  await assert.rejects(
    resetVaultPassword(
      'PRISM-' + '00000000-'.repeat(7) + '00000000',
      'new-password',
    ),
  );
  const recovered = await resetVaultPassword(code, 'new-password');
  assert.deepEqual(await loadEncryptedRecords(recovered, 'test'), [
    { id: 'original' },
  ]);
  await assert.rejects(unlockVault('password-original'));
  await clear();
  const restored = await importVaultFile(backup, code, { recovery: true });
  assert.deepEqual(await loadEncryptedRecords(restored.key, 'test'), [
    { id: 'original' },
  ]);
});
test('create cannot replace existing password; cancelled writes do not land', async () => {
  const key = await createVault('existing-password');
  await assert.rejects(createVault('new-password'));
  await unlockVault('existing-password');
  await assert.rejects(
    writeVaultBatch(
      key,
      { records: [{ scope: 'test', value: { id: 'blocked' } }] },
      () => {
        throw new Error('locked');
      },
    ),
  );
  assert.deepEqual(await loadEncryptedRecords(key, 'test'), []);
});

test('legacy v1 JSON backup unlocks, upgrades recovery, and re-exports with unchanged data', async () => {
  const legacy = await legacyFixture();
  const result = await importVaultFile(legacy.file, 'legacy-password');
  assert.deepEqual(await loadEncryptedRecords(result.key, 'test'), [
    legacy.record,
  ]);
  assert.equal(
    (await loadEncryptedBlobs(result.key, 'test-file'))[0].name,
    '旧例图.svg',
  );
  const recovery = await createRecoveryKey(result.key, 'legacy-password');
  await writeVaultBatch(result.key, {
    records: [{ scope: 'new', value: { id: 'new-entry' } }],
  });
  const modern = new File(
    [await exportVaultFile(result.key)],
    'upgraded.prism',
  );
  await clear();
  const imported = await importVaultFile(modern, recovery, { recovery: true });
  assert.deepEqual(await loadEncryptedRecords(imported.key, 'test'), [
    legacy.record,
  ]);
  assert.deepEqual(await loadEncryptedRecords(imported.key, 'new'), [
    { id: 'new-entry' },
  ]);
  await unlockVault('legacy-password');
});

test('an old tab cannot mix its encrypted records into an imported replacement vault', async () => {
  const source = await legacyFixture();
  const stale = await createVault('destination-password');
  await importVaultFile(source.file, 'legacy-password');
  await assert.rejects(
    writeVaultBatch(stale, {
      records: [{ scope: 'test', value: { id: 'stale' } }],
    }),
  );
  const key = await unlockVault('legacy-password');
  assert.deepEqual(await loadEncryptedRecords(key, 'test'), [source.record]);
});

test('1000 queued files retain exact contents, names, order and workspace references after restore', async () => {
  const key = await createVault('batch-password');
  const blobs = Array.from({ length: 1000 }, (_, index) => ({
    id: `file-${index}`,
    scope: 'workspace-files:collage',
    blob: new Blob([`original-content-${index}`], { type: 'image/png' }),
    name: `原图-${index}.png`,
  }));
  const workspace = {
    id: 'workspace:collage',
    data: {
      rows: 7,
      columns: 7,
      files: [...blobs].reverse().map((file) => ({
        __prismFile: true,
        id: file.id,
        name: file.name,
        type: file.blob.type,
      })),
    },
  };
  await writeVaultBatch(key, {
    records: [{ scope: 'workspaces', value: workspace }],
    blobs,
  });
  const backup = new File([await exportVaultFile(key)], '1000-files.prism');
  assert.equal((await inspectVaultFile(backup)).files, 1000);
  await clear();
  const restored = await importVaultFile(backup, 'batch-password');
  assert.deepEqual(await loadEncryptedRecords(restored.key, 'workspaces'), [
    workspace,
  ]);
  const files = await loadEncryptedBlobs(
    restored.key,
    'workspace-files:collage',
  );
  assert.equal(files.length, 1000);
  const original = new Map(blobs.map((file) => [file.id, file]));
  for (const file of files) {
    assert.equal(file.name, original.get(file.id)!.name);
    assert.equal(
      await file.blob.text(),
      await original.get(file.id)!.blob.text(),
    );
  }
});

test('missing workspace files fail before replacing a destination even with valid archive checksums', async () => {
  const key = await createVault('source-password');
  await writeVaultBatch(key, {
    records: [
      {
        scope: 'workspaces',
        value: {
          id: 'workspace:video',
          data: { video: { __prismFile: true, id: 'original-video' } },
        },
      },
    ],
    blobs: [
      {
        id: 'original-video',
        scope: 'workspace-files:video',
        blob: new Blob(['video']),
        name: 'video.mp4',
      },
    ],
  });
  const zip = await JSZip.loadAsync(
    await (await exportVaultFile(key)).arrayBuffer(),
  );
  const manifest = JSON.parse(await zip.file('manifest.json')!.async('string'));
  for (const file of manifest.blobs) zip.remove(file.path);
  manifest.blobs = [];
  const manifestText = JSON.stringify(manifest);
  zip.file('manifest.json', manifestText);
  zip.file(
    'manifest.sha256',
    Buffer.from(
      await crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(manifestText),
      ),
    ).toString('base64'),
  );
  const incomplete = new File(
    [await zip.generateAsync({ type: 'arraybuffer' })],
    'incomplete.prism',
  );
  await clear();
  const destination = await createVault('destination-password');
  await writeVaultBatch(destination, {
    records: [{ scope: 'test', value: { id: 'keep-me' } }],
  });
  await assert.rejects(
    importVaultFile(incomplete, 'source-password'),
    /缺少引用/,
  );
  assert.deepEqual(await loadEncryptedRecords(destination, 'test'), [
    { id: 'keep-me' },
  ]);
  await unlockVault('destination-password');
});
