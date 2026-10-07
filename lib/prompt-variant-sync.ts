import { promptVariantRecords } from './prompt-variants';
import type { StoredLibraryAsset } from './prism-types';
import type { DecryptedBlob, VaultWrite } from './local-vault';

export async function syncPromptVariants(vault: { loadRecords: <T>(scope: string) => Promise<T[]>; loadBlobs: (scope: string) => Promise<DecryptedBlob[]>; writeBatch: (batch: VaultWrite) => Promise<void> }) {
  const records = await vault.loadRecords<StoredLibraryAsset>('assets:prompt');
  const knownIds = new Set(records.map(record => record.id));
  const savedHistory = await vault.loadRecords<{ id: string; original?: StoredLibraryAsset }>('prompt-variant-history');
  const history = new Set(savedHistory.map(record => record.id));
  const batch: VaultWrite = { records: [], blobs: [] };
  let split = 0;
  for (const record of records) {
    const versions = promptVariantRecords(record);
    if (versions.length < 2) continue;
    const historyId = `prompt-variants:${record.id}`;
    if (!history.has(historyId)) batch.records!.push({ scope: 'prompt-variant-history', value: { id: historyId, original: record } });
    const images = await vault.loadBlobs(`asset-image:${record.id}`);
    const poolScope = `prompt-variant-examples:${record.promptFamilyId || record.id}`;
    if (images.length) batch.blobs!.push(...images.map(image => ({ id: crypto.randomUUID(), scope: poolScope, blob: image.blob, name: image.name })));
    for (const [index, version] of versions.entries()) {
      if (index && knownIds.has(version.id)) continue;
      batch.records!.push({ scope: 'assets:prompt', value: { ...version, promptExamplePoolScope: poolScope, promptExampleReviewRequired: !!images.length } });
    }
    split++;
  }
  // Earlier releases copied the same examples into every split version. Keep
  // those encrypted images, but request explicit ownership instead of guessing.
  for (const entry of savedHistory) {
    const family = entry.original?.promptFamilyId || entry.original?.id;
    if (!family) continue;
    const versions = records.filter(record => record.promptFamilyId === family);
    if (versions.length < 2 || versions.some(record => record.promptExamplePoolScope)) continue;
    const groups = await Promise.all(versions.map(record => vault.loadBlobs(`asset-image:${record.id}`)));
    if (!groups[0].length) continue;
    const signatures = await Promise.all(groups.map(async images => (await Promise.all(images.map(async image => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', await image.blob.arrayBuffer()))).join(',')))).sort().join('|')));
    if (!signatures.every(signature => signature === signatures[0])) continue;
    const poolScope = `prompt-variant-examples:${family}`;
    batch.blobs!.push(...groups[0].map(image => ({ id: crypto.randomUUID(), scope: poolScope, blob: image.blob, name: image.name })));
    for (const version of versions) batch.records!.push({ scope: 'assets:prompt', value: { ...version, promptExamplePoolScope: poolScope, promptExampleReviewRequired: true } });
    split++;
  }
  if (split) await vault.writeBatch(batch);
  return split;
}
