'use client';
import { PromptExampleAssignment } from './prompt-example-assignment';
import { formatProfileCode } from '@/lib/short-codes';
import { copyText } from '@/lib/clipboard';
import { promptLanguages } from '@/lib/prompt-language';
import { useConfirmation } from './use-confirmation';
import { RecordExamples, SecretField, CollectionRail } from './library-shared';
import { ExampleImage, type Picture } from './example-image';
import { BulkActions, SelectItem, useSelection } from './bulk-selection';

import {
  CircleAlert,
  Copy,
  Eye,
  EyeOff,
  FolderPlus,
  Image as ImageIcon,
  Link2,
  LockKeyhole,
  Pencil,
  Plus,
  Search,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { FormEvent, useDeferredValue, useEffect, useId, useMemo, useRef, useState } from 'react';

import { FileImportDialog } from './file-import-dialog';
import { ScreenshotImportDialog } from './screenshot-import-dialog';
import { PromptRepairDialog } from './prompt-repair-dialog';
import { proposePromptRepair } from '@/lib/prompt-repair';
import { syncProfileMoodboards } from '@/lib/profile-moodboard-sync';
import { syncPromptVariants } from '@/lib/prompt-variant-sync';
import { ProfileLibraryPanel } from './profile-library-panel';
import {
  CustomFieldList,
  CustomFieldsEditor,
  SectionHead,
} from '@/components/prism/studio-shared';
import { useVault } from '@/components/prism/vault-provider';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import type {
  AssetImage,
  AssetKind,
  CollectionRecord,
  CustomField,
  LibraryAsset,
  StoredLibraryAsset,
} from '@/lib/prism-types';
import {
  normalizeCustomFields,
  prismId,
  secretPreview,
  safeSourceUrl,
} from '@/lib/prism-types';

const kindCopy = {
  prompt: {
    number: '01',
    eyebrow: 'PROMPT ARCHIVE',
    title: '提示词库',
    noun: '提示词',
    description:
      '例图、完整来源与补充信息都可以随时增删改，提示词默认整段隐藏。',
  },
  profile: {
    number: '02',
    eyebrow: 'PROFILE INDEX',
    title: 'Profile 库',
    noun: 'Profile',
    description: '用长码归纳同一 Profile 文件夹，再分别记录阶段 P 和成品 P。',
  },
  moodboard: {
    number: '03',
    eyebrow: 'MOODBOARD INDEX',
    title: 'Moodboard 库',
    noun: 'Moodboard',
    description:
      '把视觉倾向、短码、来源、版权、例图与任何补充信息放在同一条记录里。',
  },
};

const demoAssets: StoredLibraryAsset[] = [
  {
    id: 'demo-prompt',
    kind: 'prompt',
    title: 'Chrome Nocturne',
    secret:
      'industrial fashion portrait, liquid chrome, brutalist atrium, violet rim light --ar 3:4',
    author: 'Studio 09',
    origin: '私人实验',
    acquisition: '自创',
    note: '安全演示数据；解锁后将显示你的真实资料。',
    tags: ['冷硬', '人像'],
    collection: 'unfiled',
    swatch: 'swatch-a',
  },
  {
    id: 'demo-profile',
    kind: 'profile',
    title: 'Verdant Signal',
    secret: 'QVRN7PX',
    longCode: 'PROFILE-FOLDER-2049',
    stageType: '测试阶段 P',
    stageNote: '第三轮颜色测试',
    author: 'Neo Atelier',
    origin: '创作者商店',
    acquisition: '付费购入',
    note: '紫底会增加荧光绿边缘。',
    tags: ['荧光', '高对比'],
    collection: 'unfiled',
    swatch: 'swatch-b',
  },
  {
    id: 'demo-moodboard',
    kind: 'moodboard',
    title: 'Soft Brutalist',
    secret: 'MBX4L2A',
    author: 'Rin',
    origin: '私人交流',
    acquisition: '朋友赠送',
    note: '材质细腻、留白多。',
    tags: ['静物', '材质'],
    collection: 'unfiled',
    swatch: 'swatch-c',
  },
];

const acquisitionOptions = [
  '自创',
  '免费分享',
  '福利获得',
  '公开发布',
  '朋友赠送',
  '付费购入',
  '合作授权',
  '其他',
];
const stageOptions = [
  '测试阶段 P',
  '福利 P',
  '公开 P',
  '私享 P',
  '内测 P',
  '其他',
];

function VisualTile({ asset, pictures, offset = 0, onEdit }: { asset: LibraryAsset; pictures?: Picture[]; offset?: number; onEdit?: (id: string) => void }) {
  return <RecordExamples images={asset.images} title={asset.title} browseImages={pictures} browseOffset={offset} onEditAsset={onEdit} />;
}

function storedAsset(asset: LibraryAsset): StoredLibraryAsset {
  const { images: _images, ...stored } = asset;
  return stored;
}

export function LibraryPanel({
  kind,
  globalQuery,
}: {
  kind: AssetKind;
  globalQuery: string;
}) {
  return kind === 'profile' ? (
    <ProfileLibraryPanel globalQuery={globalQuery} />
  ) : (
    <SimpleLibraryPanel kind={kind} globalQuery={globalQuery} />
  );
}

function SimpleLibraryPanel({
  kind,
  globalQuery,
}: {
  kind: AssetKind;
  globalQuery: string;
}) {
  const vault = useVault();
  const confirmation = useConfirmation();
  const copy = kindCopy[kind];
  const [assets, setAssets] = useState<LibraryAsset[]>([]);
  const [collections, setCollections] = useState<CollectionRecord[]>([]);
  const [activeCollection, setActiveCollection] = useState('all');
  const [localQuery, setLocalQuery] = useState('');
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const [assetDialog, setAssetDialog] = useState(false);
  const editorFormId = useId();
  const [saving, setSaving] = useState(false);
  const savingNow = useRef(false);
  const refreshGeneration = useRef(0);
  const [libraryNotice, setLibraryNotice] = useState('');
  const [movingIds, setMovingIds] = useState<string[] | null>(null);
  const [moveTarget, setMoveTarget] = useState('');
  const [moveBusy, setMoveBusy] = useState(false);
  const [moveError, setMoveError] = useState('');
  const moveNow = useRef(false);
  const [editingAsset, setEditingAsset] = useState<LibraryAsset | null>(null);
  const [collectionDialog, setCollectionDialog] = useState<{
    id?: string;
    name: string;
  } | null>(null);
  const [newImageFiles, setNewImageFiles] = useState<File[]>([]);
  const [existingImages, setExistingImages] = useState<AssetImage[]>([]);
  const [removedImageIds, setRemovedImageIds] = useState<string[]>([]);
  const [customFields, setCustomFields] = useState<CustomField[]>([]);
  const [acquisition, setAcquisition] = useState('自创');
  const [stageType, setStageType] = useState('测试阶段 P');
  const [formError, setFormError] = useState('');
  const [repairStatus, setRepairStatus] = useState('');
  const [exampleFamily, setExampleFamily] = useState<LibraryAsset[]>([]);
  const imageUrls = useRef(new Map<string, string>());
  const searchTexts = useRef(new WeakMap<LibraryAsset, string>());
  const createdUrls = useRef(new Set<string>());
  const imageUrl = (blob: Blob, key?: string) => {
    if (key && imageUrls.current.has(key)) return imageUrls.current.get(key)!;
    const url = URL.createObjectURL(blob); createdUrls.current.add(url);
    if (key) imageUrls.current.set(key, url);
    return url;
  };
  useEffect(() => () => {
    for (const url of createdUrls.current) URL.revokeObjectURL(url);
    createdUrls.current.clear(); imageUrls.current.clear();
  }, [vault.session]);
  useEffect(() => { setRevealed(new Set()); }, [kind, activeCollection]);

  const allCollections = useMemo(
    () => [
      { id: 'all', name: `全部${copy.noun}` },
      { id: 'unfiled', name: '未分类' },
      ...collections,
    ],
    [collections, copy.noun],
  );

  const refresh = async () => {
    const generation = ++refreshGeneration.current;
    if (vault.status !== 'unlocked') {
      setAssets(
        demoAssets
          .filter((asset) => asset.kind === kind)
          .map((asset) => ({ ...asset, images: [] })),
      );
      setCollections([]);
      return;
    }
    if (kind === 'moodboard') await syncProfileMoodboards(vault);
    const [records, storedCollections] = await Promise.all([
      vault.loadRecords<StoredLibraryAsset>(`assets:${kind}`),
      vault.loadRecords<CollectionRecord>(`collections:${kind}`),
    ]);
    if (generation !== refreshGeneration.current) return;
    if (kind === 'prompt') {
      const repairs = records.filter(record => !record.promptAutoRepairDisabled).map(record => ({ record, repair: proposePromptRepair(record) })).filter(entry => entry.repair);
      if (repairs.length) {
        const savedHistory = new Set((await vault.loadRecords<{ id: string }>('prompt-repair-history')).map(entry => entry.id));
        if (generation !== refreshGeneration.current) return;
        await vault.writeBatch({ records: repairs.flatMap(({ record, repair }) => [
          ...(!savedHistory.has(`prompt-language-v3:${record.id}`) ? [{ scope: 'prompt-repair-history', value: { id: `prompt-language-v3:${record.id}`, original: record, repairedAt: new Date().toISOString() } }] : []),
          { scope: 'assets:prompt', value: repair! },
        ]) });
        for (const entry of repairs) records[records.findIndex(record => record.id === entry.record.id)] = entry.repair!;
        setRepairStatus(`已在本机自动整理 ${repairs.length} 条双语字段；原始内容保留为加密副本。`);
      }
      if (generation !== refreshGeneration.current) return;
      const split = await syncPromptVariants(vault);
      if (split) {
        records.splice(0, records.length, ...await vault.loadRecords<StoredLibraryAsset>('assets:prompt'));
        setRepairStatus(`已将 ${split} 条混合提示词拆成独立版本；每个版本可单独复制，原文保留为加密记录。`);
      }
    }
    if (generation !== refreshGeneration.current) return;
    const hydrated = await Promise.all(
      records.map(async (record) => {
        const blobs = await vault.loadBlobs(`asset-image:${record.id}`);
        return {
          ...record,
          tags: record.tags || [],
          customFields: record.customFields || [],
          images: blobs.map((entry) => ({
            id: entry.id,
            name: entry.name,
            url: imageUrl(entry.blob, `${entry.id}:${entry.updatedAt}`),
          })),
        } satisfies LibraryAsset;
      }),
    );
    if (generation !== refreshGeneration.current) return;
    setAssets(
      hydrated.sort((a, b) =>
        (b.updatedAt || '').localeCompare(a.updatedAt || ''),
      ),
    );
    setCollections(storedCollections);
  };

  useEffect(() => {
    refresh().catch((reason) =>
      setFormError(
        reason instanceof Error ? reason.message : '本地资产读取失败',
      ),
    );
  }, [kind, vault.status]);

  useEffect(() => {
    const hide = () => setRevealed(new Set());
    window.addEventListener('prism:hide-secrets', hide);
    return () => window.removeEventListener('prism:hide-secrets', hide);
  }, []);
  useEffect(() => {
    const changed = (event: Event) => { if ((event as CustomEvent<{ kind?: AssetKind }>).detail?.kind === 'prompt') return; if (vault.status === 'unlocked' && kind === 'moodboard') void refresh().catch(error => setFormError(String(error))); };
    window.addEventListener('prism:assets-changed', changed);
    return () => window.removeEventListener('prism:assets-changed', changed);
  }, [kind, vault.status]);

  const query = useDeferredValue(`${globalQuery} ${localQuery}`.trim().toLocaleLowerCase());
  const searchIndex = useMemo(() => new Map(assets.map(asset => {
    let text = searchTexts.current.get(asset);
    if (text === undefined) { text = [asset.title, ...Object.values(promptLanguages(asset)), asset.author, asset.origin, asset.acquisition, asset.acquisitionOther, asset.stageType, asset.stageTypeOther, asset.stageNote, asset.note, ...asset.tags, ...(asset.customFields || []).flatMap(field => [field.label, field.value])].join(' ').toLocaleLowerCase(); searchTexts.current.set(asset, text); }
    return [asset.id, text];
  })), [assets]);
  const filtered = useMemo(
    () =>
      assets.filter((asset) => {
        const inCollection =
          activeCollection === 'all' || asset.collection === activeCollection;
        return inCollection && (!query || searchIndex.get(asset.id)?.includes(query));
      }),
    [activeCollection, assets, query, searchIndex],
  );

  const browsePictures = useMemo(() => filtered.flatMap(asset => (asset.promptExampleReviewRequired ? [] : asset.images).map(image => ({ ...image, assetId: asset.id, title: asset.title, ...(kind === 'prompt' ? promptLanguages(asset) : { copyValue: asset.secret, copyLabel: '复制完整短码' }) }))), [kind, filtered]);
  const browseOffsets = useMemo(() => { const offsets = new Map<string, number>(); browsePictures?.forEach((picture, index) => { if (!offsets.has(picture.assetId)) offsets.set(picture.assetId, index); }); return offsets; }, [browsePictures]);
  const openCreate = () => {
    setEditingAsset(null);
    setExistingImages([]);
    setNewImageFiles([]);
    setRemovedImageIds([]);
    setCustomFields([]);
    setAcquisition('自创');
    setStageType('测试阶段 P');
    setFormError('');
    setAssetDialog(true);
  };

  const openEdit = (asset: LibraryAsset) => {
    if (asset.id.startsWith('demo-')) {
      setFormError(
        '这是锁定状态下的演示记录。解锁保险库后即可创建和编辑真实资产。',
      );
      return;
    }
    setEditingAsset(asset);
    setExistingImages(asset.images);
    setNewImageFiles([]);
    setRemovedImageIds([]);
    setCustomFields(asset.customFields || []);
    setAcquisition(asset.acquisition || '其他');
    setStageType(asset.stageType || '测试阶段 P');
    setFormError('');
    setAssetDialog(true);
  };

  const submitAsset = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (savingNow.current) return;
    setFormError('');
    if (vault.status !== 'unlocked') {
      setFormError('请先在“安全与备份”中创建或解锁本机保险库。');
      return;
    }
    const form = new FormData(event.currentTarget);
    const languages = kind === 'prompt' ? { promptEnglish: String(form.get('promptEnglish') || '').trim(), promptChinese: String(form.get('promptChinese') || '').trim(), promptUnconfirmed: String(form.get('promptUnconfirmed') || '').trim() } : {};
    const secret = kind === 'prompt' ? languages.promptEnglish || languages.promptChinese || languages.promptUnconfirmed || '' : String(form.get('secret') || '').trim();
    if (!secret) {
      setFormError(`${copy.noun}内容不能为空。`);
      return;
    }
    if (kind !== 'prompt' && !(await confirmation.confirmShortCodes([secret])))
      return;
    const now = new Date().toISOString();
    const id = editingAsset?.id || prismId(kind);
    const record: StoredLibraryAsset = {
      id,
      ...(editingAsset ? storedAsset(editingAsset) : {}),
      kind,
      title: String(form.get('title') || '').trim(),
      secret,
      ...languages,
      longCode:
        kind === 'profile'
          ? String(form.get('longCode') || '').trim()
          : undefined,
      stageType: kind === 'profile' ? stageType : undefined,
      stageTypeOther:
        kind === 'profile' && stageType === '其他'
          ? String(form.get('stageTypeOther') || '').trim()
          : undefined,
      stageNote:
        kind === 'profile'
          ? String(form.get('stageNote') || '').trim()
          : undefined,
      author: String(form.get('author') || '').trim() || '未记录',
      origin: String(form.get('origin') || '').trim() || '未记录',
      sourceUrl: String(form.get('sourceUrl') || '').trim(),
      acquisition,
      acquisitionOther:
        acquisition === '其他'
          ? String(form.get('acquisitionOther') || '').trim()
          : undefined,
      note: String(form.get('note') || '').trim(),
      tags: String(form.get('tags') || '')
        .split(/[,，]/)
        .map((tag) => tag.trim())
        .filter(Boolean),
      collection: String(form.get('collection') || 'unfiled'),
      customFields: normalizeCustomFields(customFields),
      swatch:
        editingAsset?.swatch ||
        ['swatch-a', 'swatch-b', 'swatch-c'][assets.length % 3],
      createdAt: editingAsset?.createdAt || now,
      updatedAt: now,
    };
    const previousLanguages = editingAsset && kind === 'prompt' ? promptLanguages(editingAsset) : null;
    const contentChanged = kind === 'prompt' && (!previousLanguages || previousLanguages.english !== languages.promptEnglish || previousLanguages.chinese !== languages.promptChinese || previousLanguages.unconfirmed !== languages.promptUnconfirmed);
    if (kind === 'prompt' && editingAsset && !contentChanged) Object.assign(record, { secret: editingAsset.secret, promptEnglish: editingAsset.promptEnglish, promptChinese: editingAsset.promptChinese, promptUnconfirmed: editingAsset.promptUnconfirmed });
    savingNow.current = true; setSaving(true); refreshGeneration.current++;
    try {
      const added = newImageFiles.map((file) => ({
        id: crypto.randomUUID(),
        name: file.name,
        url: imageUrl(file),
        file,
      }));
      await vault.writeBatch({
        records: [{ scope: `assets:${kind}`, value: record }],
        deleteBlobs: removedImageIds,
        blobs: added.map((image) => ({
          id: image.id,
          scope: `asset-image:${id}`,
          blob: image.file,
          name: image.name,
        })),
      });
      const hydrated: LibraryAsset = {
        ...record,
        images: [...existingImages, ...added],
      };
      setAssets((current) =>
        editingAsset && current.some(asset => asset.id === id)
          ? current.map((asset) => (asset.id === id ? hydrated : asset))
          : [hydrated, ...current],
      );
      setAssetDialog(false);
      if (editingAsset && editingAsset.collection !== record.collection) { setActiveCollection(record.collection); selection.clear(); }
      setLibraryNotice(`已保存“${record.title}”，归入${collections.find(item => item.id === record.collection)?.name || '未分类'}。`);
      if (contentChanged) void refresh().catch(reason => setFormError(`已保存，列表整理暂未完成：${reason instanceof Error ? reason.message : '请重试刷新'}。`));
      window.dispatchEvent(new CustomEvent('prism:assets-changed', { detail: { kind } }));
    } catch (reason) {
      setFormError(reason instanceof Error ? reason.message : '资产保存失败');
    } finally { savingNow.current = false; setSaving(false); }
  };

  const moveSelected = async () => {
    if (!movingIds || !moveTarget || moveNow.current) return;
    moveNow.current = true; setMoveBusy(true); setMoveError(''); refreshGeneration.current++;
    try {
      const [records, latestCollections] = await Promise.all([
        vault.loadRecords<StoredLibraryAsset>('assets:prompt', movingIds),
        vault.loadRecords<CollectionRecord>('collections:prompt'),
      ]);
      if (records.length !== movingIds.length) throw new Error('部分提示词已经变动，请关闭此窗口后重新选择。');
      if (moveTarget !== 'unfiled' && !latestCollections.some(item => item.id === moveTarget)) throw new Error('目标库已经变动，请重新选择。');
      const now = new Date().toISOString(), changed = records.filter(record => record.collection !== moveTarget).map(record => ({ ...record, collection: moveTarget, updatedAt: now }));
      if (changed.length) await vault.writeBatch({ records: changed.map(value => ({ scope: 'assets:prompt', value })) });
      const byId = new Map(changed.map(record => [record.id, record]));
      setAssets(current => current.map(asset => byId.has(asset.id) ? { ...byId.get(asset.id)!, tags: byId.get(asset.id)!.tags || [], customFields: byId.get(asset.id)!.customFields || [], images: asset.images } : asset));
      setCollections(latestCollections); setActiveCollection(moveTarget); selection.clear(); setMovingIds(null);
      setLibraryNotice(changed.length ? `已将 ${changed.length} 条提示词移入${latestCollections.find(item => item.id === moveTarget)?.name || '未分类'}。` : '所选提示词已经在目标库中。');
      window.dispatchEvent(new CustomEvent('prism:assets-changed', { detail: { kind } }));
    } catch (reason) { setMoveError(reason instanceof Error ? reason.message : '移动失败，请重试。'); }
    finally { moveNow.current = false; setMoveBusy(false); }
  };

  const deleteAsset = async (asset: LibraryAsset) => {
    if (asset.id.startsWith('demo-')) return;
    if (
      !window.confirm(
        `确定删除“${asset.title}”及其 ${asset.images.length} 张例图吗？此操作会删除本机加密副本。`,
      )
    )
      return;
    try {
      await vault.writeBatch({
        deleteRecords: [asset.id],
        deleteBlobs: asset.images.map((image) => image.id),
      });
      setAssets((current) => current.filter((item) => item.id !== asset.id));
      window.dispatchEvent(new CustomEvent('prism:assets-changed', { detail: { kind } }));
    } catch (reason) {
      setFormError(reason instanceof Error ? reason.message : '删除资产失败');
    }
  };

  const saveCollection = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!collectionDialog || vault.status !== 'unlocked') {
      setFormError('请先创建或解锁本机保险库，再管理分类。');
      return;
    }
    const name = String(
      new FormData(event.currentTarget).get('name') || '',
    ).trim();
    if (!name) return;
    const record = {
      id: collectionDialog.id || prismId(`collection-${kind}`),
      name,
    };
    await vault.saveRecord(`collections:${kind}`, record);
    setCollections((current) =>
      collectionDialog.id
        ? current.map((item) => (item.id === record.id ? record : item))
        : [...current, record],
    );
    setActiveCollection(record.id);
    setCollectionDialog(null);
  };

  const deleteCollection = async (id: string) => {
    if (id === 'all' || id === 'unfiled') return;
    const target = collections.find((collection) => collection.id === id);
    if (
      !window.confirm(
        `删除分类“${target?.name || ''}”？分类中的资产会移入“未分类”，不会被删除。`,
      )
    )
      return;
    const changed = assets.map((asset) =>
      asset.collection === id
        ? {
            ...asset,
            collection: 'unfiled',
            updatedAt: new Date().toISOString(),
          }
        : asset,
    );
    setAssets(changed);
    setCollections((current) =>
      current.filter((collection) => collection.id !== id),
    );
    setActiveCollection('all');
    await vault.deleteRecord(id);
    for (const asset of changed.filter((item) => item.collection === 'unfiled'))
      await vault.saveRecord(`assets:${kind}`, storedAsset(asset));
  };

  const toggleReveal = (id: string) =>
    setRevealed((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const selection = useSelection(
    filtered.filter((a) => !a.id.startsWith('demo-')).map((a) => a.id),
  );
  const [recordPage,setRecordPage]=useState(0);
  const pageSize=60;
  const currentPage=Math.min(recordPage,Math.max(0,Math.ceil(filtered.length/pageSize)-1));
  useEffect(()=>setRecordPage(0),[activeCollection,query]);
  const pageControls=filtered.length>pageSize&&<nav className="library-pagination" aria-label="资料分页"><Button variant="outline" disabled={currentPage===0} onClick={()=>setRecordPage(currentPage-1)}>上一页</Button><span>第 {currentPage+1} / {Math.ceil(filtered.length/pageSize)} 页 · 共 {filtered.length} 条</span><Button variant="outline" disabled={(currentPage+1)*pageSize>=filtered.length} onClick={()=>setRecordPage(currentPage+1)}>下一页</Button></nav>;
  return (
    <div className={`studio-page ${kind === 'moodboard' ? 'visual-library-page' : ''}`}>
      {confirmation.dialog}
      <div className="library-import-entry">
        <FileImportDialog
          kind={kind}
          onImported={() => {
            void refresh().catch((e) => setFormError(String(e)));
          }}
        />
        {kind === 'prompt' && <><ScreenshotImportDialog collections={collections} onImported={() => { void refresh().catch((e) => setFormError(String(e))); }} /><PromptRepairDialog assets={assets} onRepaired={() => { void refresh().catch((e) => setFormError(String(e))); }} /></>}
      </div>
      {kind === 'moodboard' && <p className="privacy-hint">Moodboard 短码请手动录入；分享页面截图前确认 P 值已隐藏，避免把聊天截图中的短码发出去。</p>}
      {kind === 'prompt' && repairStatus && <p className="privacy-hint" role="status">{repairStatus}</p>}
      <SectionHead
        description={copy.description}
        eyebrow={copy.eyebrow}
        number={copy.number}
        title={copy.title}
        actions={
          <>
            <Button
              onClick={() => setCollectionDialog({ name: '' })}
              variant="outline"
            >
              <FolderPlus /> 新建库
            </Button>
            <Button className="add-button" onClick={openCreate}>
              <Plus /> 添加{copy.noun}
            </Button>
          </>
        }
      />

      <CollectionRail
        noun={copy.noun}
        collections={collections}
        records={assets}
        active={activeCollection}
        onSelect={setActiveCollection}
        onEdit={setCollectionDialog}
        onDelete={deleteCollection}
      />

      {vault.status !== 'unlocked' && (
        <div className="vault-gate">
          <LockKeyhole />
          <p>
            <strong>当前展示的是安全演示数据</strong>
            <span>创建或解锁本机保险库后，即可新增、编辑和删除真实资产。</span>
          </p>
        </div>
      )}
      {formError && (
        <p className="error-banner">
          <CircleAlert /> {formError}
        </p>
      )}

      <div className="library-toolbar">
        <div className="inner-search">
          <Search />
          <Input
            onChange={(event) => setLocalQuery(event.target.value)}
            placeholder={`在当前${copy.noun}库中搜索…`}
            value={localQuery}
          />
        </div>
        <div className="result-count">
          <strong>{String(filtered.length).padStart(2, '0')}</strong>
          <span>条匹配资产</span>
        </div>
      </div>

        <BulkActions
          selection={selection}
          disabled={saving || moveBusy || vault.busy}
          onDelete={async (ids) => {
            await vault.writeBatch({
              deleteRecords: ids,
              deleteBlobs: assets
                .filter((a) => ids.includes(a.id))
                .flatMap((a) => a.images.map((i) => i.id)),
            });
            setAssets((current) => current.filter((a) => !ids.includes(a.id)));
            window.dispatchEvent(new CustomEvent('prism:assets-changed', { detail: { kind } }));
          }}
        />
        {kind === 'prompt' && filtered.length > 0 && <div className="library-move-actions"><Button variant="outline" disabled={!selection.selected.size || saving || moveBusy || vault.busy} onClick={() => { setMovingIds([...selection.selected]); setMoveTarget(''); setMoveError(''); }}>移动所选提示词（{selection.selected.size}）</Button></div>}
        {libraryNotice && <p className="library-action-notice" role="status">{libraryNotice}</p>}
      {pageControls}
      <div className="record-list">
        <div className="record-head">
          <span>例图 / 资产</span>
          <span>{copy.noun} / 来源</span>
          <span>备注 / 自定义信息</span>
          <span>操作</span>
        </div>
        {filtered.slice(currentPage*pageSize,(currentPage+1)*pageSize).map((asset) => {
          const isRevealed = revealed.has(asset.id);
          const RecordContainer = 'div';
          const visibleValue = isRevealed
            ? asset.secret
            : kind === 'prompt'
              ? '••••••••••••••••••••'
              : secretPreview(asset.secret);
          return (
            <RecordContainer className={`asset-record-fold ${kind === 'prompt' ? 'prompt-record-open' : ''}`} key={asset.id}>
            <article className="record-row">
              <div className="record-identity">
                <SelectItem
                  selection={selection}
                  id={asset.id}
                  name={asset.title}
                />
                <VisualTile asset={asset.promptExampleReviewRequired ? { ...asset, images: [] } : asset} pictures={browsePictures} offset={browseOffsets.get(asset.id)} onEdit={(id) => { const item = assets.find(record => record.id === id); if (item) openEdit(item); }} />
                <div>
                  <Badge variant="outline">{copy.noun}</Badge>
                  <h3>{asset.title}</h3>
                  {kind === 'prompt' && asset.promptExamplePoolScope && <button type="button" className="variant-example-action" onClick={() => setExampleFamily(assets.filter(version => version.promptFamilyId === asset.promptFamilyId && version.promptExamplePoolScope === asset.promptExamplePoolScope))}>{asset.promptExampleReviewRequired ? '例图归属待核对 · 分配各版本例图' : '调整各版本例图'}</button>}
                  <p>
                    {asset.tags.length ? asset.tags.join(' / ') : '未添加标签'}
                  </p>
                  {kind === 'profile' && (
                    <span className="stage-chip">
                      {asset.stageType === '其他'
                        ? asset.stageTypeOther
                        : asset.stageType || '阶段 P'}
                    </span>
                  )}
                </div>
              </div>
              <div className="record-secret">
                {kind === 'prompt' ? <div className="prompt-languages">{isRevealed ? Object.entries(promptLanguages(asset)).map(([language, content]) => content && <div key={language}><strong>{language === 'english' ? '英文 Prompt' : language === 'chinese' ? '中文 Prompt' : '待核对原文 · 原文保留'}</strong><pre>{content}</pre></div>) : <p className="prompt-hidden-label">提示词已隐藏 · 可直接复制</p>}</div> :
                <div
                  className={`record-secret-value ${!isRevealed ? 'is-obscured' : ''}`}
                >
                  <code>{visibleValue}</code>
                </div>}
                {kind === 'profile' && (
                  <p className="long-code-line">
                    <span>长码</span>
                    <code>
                      {isRevealed ? asset.longCode || '未记录' : '长码已隐藏'}
                    </code>
                  </p>
                )}
                <div className="record-secret-actions">
                  {<button onClick={() => toggleReveal(asset.id)} type="button">
                    {isRevealed ? <EyeOff /> : <Eye />}{' '}
                    {isRevealed ? '隐藏内容' : kind === 'prompt' ? '显示提示词' : '显示短码'}
                  </button>}
                  {(kind !== 'prompt' || promptLanguages(asset).english) && <button
                    onClick={() => void copyText(
                        kind === 'profile'
                          ? formatProfileCode(asset.secret)
                          : kind === 'prompt' ? promptLanguages(asset).english : asset.secret,
                      )}
                    type="button"
                  >
                    <Copy />{' '}
                    {kind === 'prompt'
                      ? '复制英文 Prompt'
                      : kind === 'profile'
                        ? '复制 Profile 参数'
                        : '复制短码'}
                  </button>}
                  {kind === 'prompt' && <>{promptLanguages(asset).chinese && <button type="button" onClick={() => void copyText(promptLanguages(asset).chinese)}>复制中文 Prompt</button>}{promptLanguages(asset).unconfirmed && <button type="button" onClick={() => void copyText(promptLanguages(asset).unconfirmed)}>复制待核对原文</button>}</>}
                </div>
                {<p>
                  <strong>{asset.author}</strong>
                  <span>·</span>
                  {asset.origin}
                  <span>·</span>
                  {asset.acquisition === '其他'
                    ? asset.acquisitionOther || '其他'
                    : asset.acquisition}
                </p>}
                {safeSourceUrl(asset.sourceUrl) && (
                  <a
                    className="source-link"
                    href={safeSourceUrl(asset.sourceUrl)}
                    rel="noreferrer"
                    target="_blank"
                  >
                    <Link2 /> 查看来源
                  </a>
                )}
              </div>
              <div className="record-note">
                {<p>{asset.note || '暂无私人备注。'}</p>}
                {asset.stageNote && (
                  <p>
                    <strong>阶段说明：</strong>
                    {asset.stageNote}
                  </p>
                )}
                {<CustomFieldList fields={asset.customFields} />}
              </div>
              <div className="row-actions">
                <button
                  aria-label={`编辑 ${asset.title}`}
                  onClick={() => openEdit(asset)}
                  type="button"
                >
                  <Pencil />
                </button>
                <button
                  aria-label={`删除 ${asset.title}`}
                  onClick={() => deleteAsset(asset)}
                  type="button"
                >
                  <Trash2 />
                </button>
              </div>
            </article>
            </RecordContainer>
          );
        })}
        {filtered.length === 0 && (
          <div className="empty-state">
            <Search />
            <h3>没有找到匹配资产</h3>
            <p>换一个关键词，或添加第一条真实记录。</p>
          </div>
        )}
      </div>

      {pageControls}
      {!!exampleFamily.length && <PromptExampleAssignment family={exampleFamily} onClose={() => setExampleFamily([])} onSaved={() => void refresh()} />}
      <Dialog onOpenChange={open => { if (!saving) setAssetDialog(open); }} open={assetDialog}>
        <DialogContent className="asset-dialog asset-dialog-wide">
          <DialogHeader>
            <DialogTitle>
              {editingAsset && assets.some(asset => asset.id === editingAsset.id) ? '编辑' : '添加'}
              {copy.noun}
            </DialogTitle>
            <DialogDescription>
              所有字段都可以以后继续修改；自定义字段不限制名称和数量。
            </DialogDescription>
          </DialogHeader>
          <form
            className="editor-form"
            id={editorFormId}
            key={editingAsset?.id || 'new'}
            onSubmit={submitAsset}
          >
            <label>
              <span>名称</span>
              <Input
                defaultValue={editingAsset?.title}
                name="title"
                placeholder="方便辨认的名称"
                required
              />
            </label>
            <label>
              <span>归属库</span>
              <select
                defaultValue={
                  editingAsset?.collection ||
                  (activeCollection === 'all' ? 'unfiled' : activeCollection)
                }
                name="collection"
                aria-label="归属库"
              >
                <option value="unfiled">未分类</option>
                {collections.map((collection) => (
                  <option key={collection.id} value={collection.id}>
                    {collection.name}
                  </option>
                ))}
              </select>
            </label>
            {kind === 'profile' && (
              <label className="wide-field">
                <span>Profile 长码 / 文件夹码</span>
                <Input
                  defaultValue={editingAsset?.longCode}
                  name="longCode"
                  placeholder="同一个长码代表同一 Profile 文件夹"
                  required
                />
              </label>
            )}
            {kind !== 'prompt' ? <label className="wide-field">
              <span>
                {kind === 'profile'
                  ? 'Profile 短码'
                  : kind === 'moodboard'
                    ? 'Moodboard 短码'
                    : '完整提示词'}
              </span>
              <SecretField
                label="短码"
                name="secret"
                defaultValue={editingAsset?.secret}
                placeholder="填写短码"
                required
              />
            </label> : <div className="wide-field prompt-language-editor"><p>英文和中文独立保存、搜索与复制。旧版混合原文保留在“待确认”中，请自行核对归属；原有补充信息不会改变。</p>{(['english', 'chinese', 'unconfirmed'] as const).map((language) => <label key={language}><span>{language === 'english' ? '英文 Prompt（默认复制）' : language === 'chinese' ? '中文 Prompt' : '待核对原文 · 保留原文'}</span><SecretField label={language === 'english' ? '英文 Prompt' : language === 'chinese' ? '中文 Prompt' : '待确认 Prompt'} name={language === 'english' ? 'promptEnglish' : language === 'chinese' ? 'promptChinese' : 'promptUnconfirmed'} defaultValue={promptLanguages(editingAsset || undefined)[language]} multiline /></label>)}</div>}
            {kind === 'profile' && (
              <>
                <label>
                  <span>阶段性质</span>
                  <select
                    onChange={(event) => setStageType(event.target.value)}
                    value={stageType}
                  >
                    {stageOptions.map((option) => (
                      <option key={option}>{option}</option>
                    ))}
                  </select>
                </label>
                {stageType === '其他' && (
                  <label>
                    <span>自定义阶段性质</span>
                    <Input
                      defaultValue={editingAsset?.stageTypeOther}
                      name="stageTypeOther"
                      placeholder="例如：联名活动 P"
                      required
                    />
                  </label>
                )}
                <label className="wide-field">
                  <span>阶段说明</span>
                  <Input
                    defaultValue={editingAsset?.stageNote}
                    name="stageNote"
                    placeholder="例如：第 4 轮肤色测试、福利批次、公开版本……"
                  />
                </label>
              </>
            )}
            <label>
              <span>作者 / 创作者</span>
              <Input
                defaultValue={editingAsset?.author}
                name="author"
                placeholder="作者、卖家或工作室"
              />
            </label>
            <label>
              <span>来自哪里</span>
              <Input
                defaultValue={editingAsset?.origin}
                name="origin"
                placeholder="网站、社群、商店、私人交流……"
              />
            </label>
            <label className="wide-field">
              <span>来源链接（可选）</span>
              <Input
                defaultValue={editingAsset?.sourceUrl}
                name="sourceUrl"
                placeholder="https://…"
                type="url"
              />
            </label>
            <label>
              <span>获得方式</span>
              <select
                onChange={(event) => setAcquisition(event.target.value)}
                value={acquisition}
              >
                {acquisitionOptions.map((option) => (
                  <option key={option}>{option}</option>
                ))}
              </select>
            </label>
            {acquisition === '其他' && (
              <label>
                <span>自定义获得方式</span>
                <Input
                  defaultValue={editingAsset?.acquisitionOther}
                  name="acquisitionOther"
                  placeholder="自由填写获得方式"
                  required
                />
              </label>
            )}
            <label className="wide-field">
              <span>标签</span>
              <Input
                defaultValue={editingAsset?.tags.join('，')}
                name="tags"
                placeholder="冷硬，产品，荧光（用逗号分隔）"
              />
            </label>
            <label className="wide-field">
              <span>私人备注</span>
              <textarea
                defaultValue={editingAsset?.note}
                name="note"
                placeholder="参数建议、使用感受、版权范围或搭配提醒……"
              />
            </label>
            <CustomFieldsEditor
              fields={customFields}
              onChange={setCustomFields}
            />
            <div className="wide-field existing-image-editor" data-file-drop-target={`library-example-images-${kind}`}>
              <span>现有例图</span>
              {existingImages.length ? (
                <div>
                  {existingImages.map((image) => (
                    <figure key={image.id}>
                      <ExampleImage alt={image.name} src={image.url} />
                      <figcaption>{image.name}</figcaption>
                      <button
                        aria-label={`删除例图 ${image.name}`}
                        onClick={() => {
                          setExistingImages((current) =>
                            current.filter((item) => item.id !== image.id),
                          );
                          setRemovedImageIds((current) => [
                            ...current,
                            image.id,
                          ]);
                        }}
                        type="button"
                      >
                        <X />
                      </button>
                    </figure>
                  ))}
                </div>
              ) : (
                <p>暂无例图</p>
              )}
            </div>
            <label className="wide-field upload-field">
              <span>追加例图（可多选）</span>
              <input
                id={`library-example-images-${kind}`}
                accept="image/*"
                multiple
                onChange={(event) =>
                  setNewImageFiles(current => [...current, ...Array.from(event.target.files || [])])
                }
                type="file"
              />
              <div>
                <Upload />
                <strong>
                  {newImageFiles.length
                    ? `已选择 ${newImageFiles.length} 张`
                    : '选择要追加的例图'}
                </strong>
                <small>PNG / JPG / WEBP</small>
              </div>
            </label>
          </form>
          {formError && (
            <p className="dialog-error">
              <CircleAlert /> {formError}
            </p>
          )}
          <DialogFooter>
            {kind === 'prompt' && editingAsset && assets.some(asset => asset.id === editingAsset.id) && <Button type="button" variant="outline" onClick={async () => {
              const original = editingAsset;
              const form = new FormData(document.getElementById(editorFormId) as HTMLFormElement);
              setEditingAsset({ ...original, id: prismId('prompt-version'), title: `${String(form.get('title') || original.title)} · 新版本`, promptFamilyId: original.promptFamilyId || original.id, promptVariantLabel: '新版本', promptExamplePoolScope: undefined, promptExampleReviewRequired: false, promptEnglish: String(form.get('promptEnglish') || ''), promptChinese: String(form.get('promptChinese') || ''), promptUnconfirmed: String(form.get('promptUnconfirmed') || ''), note: String(form.get('note') || ''), customFields: normalizeCustomFields(customFields), createdAt: undefined, images: [] });
              setExistingImages([]); setRemovedImageIds([]);
              setNewImageFiles([]);
              setFormError('这是独立的新版本。请修改词文并上传这个版本对应的例图，原版本会保留。');
            }}>新增独立版本</Button>}
            <Button disabled={saving} onClick={() => setAssetDialog(false)} variant="ghost">
              取消
            </Button>
            <Button disabled={saving || vault.busy} form={editorFormId} type="submit">
              <LockKeyhole /> {saving ? '正在保存…' : '加密保存'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!movingIds} onOpenChange={open => { if (!open && !moveBusy) setMovingIds(null); }}><DialogContent className="library-move-dialog"><DialogHeader><DialogTitle>移动 {movingIds?.length || 0} 条提示词</DialogTitle><DialogDescription>选择目标库，将所选提示词连同原有信息和例图一起归入。</DialogDescription></DialogHeader><label>目标库<select aria-label="目标库" disabled={moveBusy} value={moveTarget} onChange={event => setMoveTarget(event.target.value)}><option value="">请选择目标库</option><option value="unfiled">未分类</option>{collections.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>{moveError && <p role="alert" className="dialog-error">{moveError}</p>}<DialogFooter><Button variant="outline" disabled={moveBusy} onClick={() => setMovingIds(null)}>取消</Button><Button disabled={!moveTarget || moveBusy || vault.busy} onClick={() => void moveSelected()}>{moveBusy ? '正在移动…' : '确认移动'}</Button></DialogFooter></DialogContent></Dialog>

      <Dialog
        onOpenChange={(open) => !open && setCollectionDialog(null)}
        open={Boolean(collectionDialog)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {collectionDialog?.id ? '重命名' : '新建'}
              {copy.noun}库
            </DialogTitle>
            <DialogDescription>
              分类只是索引；删除分类不会删除其中的资产。
            </DialogDescription>
          </DialogHeader>
          <form
            className="single-form"
            id="collection-form"
            onSubmit={saveCollection}
          >
            <label>
              <span>库名称</span>
              <Input
                autoFocus
                defaultValue={collectionDialog?.name}
                name="name"
                placeholder="例如：实验性人像"
                required
              />
            </label>
          </form>
          <DialogFooter>
            <Button onClick={() => setCollectionDialog(null)} variant="ghost">
              取消
            </Button>
            <Button form="collection-form" type="submit">
              保存分类
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
