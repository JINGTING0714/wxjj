import { promptVariantRecords } from './prompt-variants';
import type { StoredLibraryAsset } from './prism-types';
import type { DecryptedBlob, VaultWrite } from './local-vault';

export async function syncPromptVariants(vault: { loadRecords: <T>(scope: string) => Promise<T[]>; loadBlobs: (scope: string) => Promise<DecryptedBlob[]>; writeBatch: (batch: VaultWrite) => Promise<void> }) {
  const records = await vault.loadRecords<StoredLibraryAsset>('assets:prompt');
  const knownIds = new Set(records.map(record => record.id));
  const history = new Set((await vault.loadRecords<{ id: string }>('prompt-variant-history')).map(record => record.id));
  const batch: VaultWrite = { records: [], blobs: [] };
  let split = 0;
  for (const record of records) {
    const versions = promptVariantRecords(record);
    if (versions.length < 2) continue;
    const historyId = `prompt-variants:${record.id}`;
    if (!history.has(historyId)) batch.records!.push({ scope: 'prompt-variant-history', value: { id: historyId, original: record } });
    const images = await vault.loadBlobs(`asset-image:${record.id}`);
    for (const [index, version] of versions.entries()) {
      if (index && knownIds.has(version.id)) continue;
      batch.records!.push({ scope: 'assets:prompt', value: version });
      if (index) batch.blobs!.push(...images.map(image => ({ id: crypto.randomUUID(), scope: `asset-image:${version.id}`, blob: image.blob, name: image.name })));
    }
    split++;
  }
  if (split) await vault.writeBatch(batch);
  return split;
}
