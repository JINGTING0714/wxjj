import { profileCodes, profileImageScope, profileChoiceId } from './profile-model';
import type { CollectionRecord, StoredLibraryAsset, StoredRecipe } from './prism-types';
import type { DecryptedBlob, VaultWrite } from './local-vault';

type SyncVault = {
  loadRecords: <T>(scope: string) => Promise<T[]>;
  loadBlobs: (scope: string) => Promise<DecryptedBlob[]>;
  writeBatch: (batch: VaultWrite) => Promise<void>;
};
const running = new WeakMap<SyncVault, Promise<void>>();

/** Synchronize the whole library in one encrypted transaction. Source folders
 * moved out of Profile remain recoverable in the full backup. */
export function syncProfileMoodboards(vault: SyncVault): Promise<void> {
  const pending = running.get(vault);
  if (pending) return pending;
  const task = synchronize(vault).finally(() => running.delete(vault));
  running.set(vault, task);
  return task;
}

async function synchronize(vault: SyncVault) {
  const [profiles, profileCollections, moods, moodCollections, recipes, migrations] = await Promise.all([
    vault.loadRecords<StoredLibraryAsset>('assets:profile'),
    vault.loadRecords<CollectionRecord>('collections:profile'),
    vault.loadRecords<StoredLibraryAsset>('assets:moodboard'),
    vault.loadRecords<CollectionRecord>('collections:moodboard'),
    vault.loadRecords<StoredRecipe>('recipes'),
    vault.loadRecords<{ id: string }>('migration-history'),
  ]);
  const batch: VaultWrite = { records: [], blobs: [], deleteBlobs: [] };
  const categories = new Map(moodCollections.map(category => [category.name.trim(), category]));
  const neededNames = new Set<string>();
  const choiceMoves = new Map<string, string>();
  const now = new Date().toISOString();
  for (const folder of profiles) {
    const codes = profileCodes(folder);
    const emotions = codes.filter(code => code.nature === 'emotion');
    if (!emotions.length) continue;
    const categoryName = profileCollections.find(category => category.id === folder.collection)?.name.trim();
    let category = categoryName ? categories.get(categoryName) : undefined;
    if (categoryName) {
      neededNames.add(categoryName);
      if (!category) {
        category = { id: crypto.randomUUID(), name: categoryName };
        categories.set(categoryName, category);
        batch.records!.push({ scope: 'collections:moodboard', value: category });
      }
    }
    const moveFolder = codes.length > 0 && codes.every(code => code.nature === 'emotion');
    for (const code of emotions) {
      const existing = moods.find(mood => mood.derivedFromProfile?.folderId === folder.id && mood.derivedFromProfile.codeId === code.id);
      const id = existing?.id || `moodboard-emotion:${folder.id}:${code.id}`;
      const images = await vault.loadBlobs(profileImageScope(folder.id, code));
      const author = code.customFields?.find(field => field.label === '此短码原作者' && field.value !== '未记录')?.value || folder.author;
      const acquisition = code.customFields?.find(field => field.label === '此短码取得方式' && field.value !== '未说明')?.value || folder.acquisition;
      const note = [...new Set([folder.note, code.note].filter(Boolean))].join('\n');
      const baseTitle = folder.title.replace(/情绪\s*[pP]?\s*$/i, '');
      const title = `${baseTitle}情绪p${emotions.length > 1 ? ` · ${code.label}` : ''}`;
      const fingerprint = JSON.stringify(['v2', title, category?.id || 'unfiled', author, acquisition, folder.origin, folder.sourceUrl, folder.acquisitionOther, folder.tags, folder.customFields, note, code, images.map(image => image.id)]);
      if (moveFolder) choiceMoves.set(profileChoiceId(folder.id, code.id), id);
      if (existing?.emotionSyncFingerprint === fingerprint) continue;
      const record: StoredLibraryAsset = {
        ...existing, id, kind: 'moodboard', title, secret: code.secret,
        author, acquisition, origin: folder.origin, sourceUrl: folder.sourceUrl,
        acquisitionOther: folder.acquisitionOther, note,
        tags: [...new Set((folder.tags || []).filter(tag => !/^(?:N6P|N7P|自动同步·情绪P)$/i.test(tag)))],
        collection: category?.id || 'unfiled',
        customFields: [...(folder.customFields || []), ...(code.customFields || [])],
        derivedFromProfile: { folderId: folder.id, codeId: code.id },
        emotionSyncFingerprint: fingerprint,
        createdAt: existing?.createdAt || folder.createdAt || now, updatedAt: now,
      };
      batch.records!.push({ scope: 'assets:moodboard', value: record });
      const oldImages = existing ? await vault.loadBlobs(`asset-image:${id}`) : [];
      batch.deleteBlobs!.push(...oldImages.map(image => image.id));
      batch.blobs!.push(...images.map(image => ({ id: crypto.randomUUID(), scope: `asset-image:${id}`, blob: image.blob, name: image.name })));
    }
    if (moveFolder) {
      batch.records!.push({ scope: 'assets:profile-moved', value: folder });
      choiceMoves.set(folder.id, choiceMoves.get(profileChoiceId(folder.id, codes[0].id))!);
    }
  }
  // The previous version created categories before checking whether a folder
  // had an emotion code. Retire only empty categories matching Profile names;
  // keep their records recoverable and leave independent Moodboard categories.
  const profileNames = new Set(profileCollections.map(category => category.name.trim()));
  if (!migrations.some(migration => migration.id === 'emotion-category-cleanup-v2')) {
    for (const category of moodCollections) {
      if (profileNames.has(category.name.trim()) && !neededNames.has(category.name.trim()) && !moods.some(mood => mood.collection === category.id)) {
        batch.records!.push({ scope: 'collections:moodboard-unused', value: category });
      }
    }
    batch.records!.push({ scope: 'migration-history', value: { id: 'emotion-category-cleanup-v2', appliedAt: now } });
  }
  if (choiceMoves.size) {
    for (const recipe of recipes) {
      if (!recipe.profileIds.some(id => choiceMoves.has(id))) continue;
      const movedIds = recipe.profileIds.filter(id => choiceMoves.has(id)).map(id => choiceMoves.get(id)!);
      batch.records!.push({ scope: 'recipes', value: {
        ...recipe,
        profileIds: recipe.profileIds.filter(id => !choiceMoves.has(id)),
        moodboardIds: [...new Set([...recipe.moodboardIds, ...movedIds])],
        selectionOrder: recipe.selectionOrder?.map(choice => choice.kind === 'profile' && choiceMoves.has(choice.id) ? { kind: 'moodboard' as const, id: choiceMoves.get(choice.id)! } : choice),
      } });
    }
  }
  if (batch.records!.length) {
    await vault.writeBatch(batch);
    if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('prism:assets-changed'));
  }
}
