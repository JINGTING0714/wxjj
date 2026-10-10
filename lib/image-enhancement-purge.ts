import type { VaultWrite } from './local-vault';
type WorkspaceRecord = {
  id: string;
  data: {
    photos: { id: string; [key: string]: unknown }[];
    [key: string]: unknown;
  };
};
function references(value: unknown, result = new Set<string>()) {
  if (!value || typeof value !== 'object') return result;
  if ('__prismFile' in value && 'id' in value && typeof value.id === 'string')
    result.add(value.id);
  else for (const item of Object.values(value)) references(item, result);
  return result;
}
/** Sold-image cleanup must also work when the enhancement screen was never opened. */
export async function purgeEnhancementFiles(
  vault: {
    loadRecords: <T>(scope: string, ids?: readonly string[]) => Promise<T[]>;
    writeBatch: (batch: VaultWrite) => Promise<void>;
  },
  originalIds: string[],
) {
  const record = (
    await vault.loadRecords<WorkspaceRecord>('workspaces', [
      'workspace:image-enhancement',
    ])
  )[0];
  if (!record || !Array.isArray(record.data.photos)) return 0;
  const ids = new Set(originalIds),
    photos = record.data.photos.filter(
      (photo) =>
        !ids.has(photo.id) && !ids.has(photo.id.replace(/^png-clean-/, '')),
    );
  if (photos.length === record.data.photos.length) return 0;
  const next = { ...record, data: { ...record.data, photos } },
    keep = references(next.data),
    deleted = [...references(record.data)].filter((id) => !keep.has(id));
  await vault.writeBatch({
    records: [{ scope: 'workspaces', value: next }],
    deleteBlobs: deleted,
  });
  return record.data.photos.length - photos.length;
}
