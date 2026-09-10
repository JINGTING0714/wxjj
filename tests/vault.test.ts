import 'fake-indexeddb/auto';
import { beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import { legacyFixture } from './legacy-fixture';
import { defaultComposition } from '../lib/watermark-composition';
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

test('expanded canvas, source transform, layer order and locks survive full backup restore exactly', async () => {
  const key = await createVault('composition-test-password');
  const composition = defaultComposition();
  composition.canvasWidth = 1.5;
  composition.canvasHeight = 1.2;
  composition.sourceIndex = 1;
  composition.source = {
    ...composition.source,
    locked: false,
    x: 0.4,
    y: 0.6,
    rotation: 37,
    scale: 0.72,
  };
  const data = {
    batches: [
      {
        id: 'one',
        composition,
        layers: [{ id: 'frame', locked: true, x: 0.5, y: 0.5 }],
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
