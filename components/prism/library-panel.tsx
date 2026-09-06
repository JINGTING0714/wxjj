'use client';

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
import { FormEvent, useEffect, useMemo, useState } from 'react';

import { FileImportDialog } from './file-import-dialog';
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
    number: '02',
    eyebrow: 'PROMPT ARCHIVE',
    title: '提示词库',
    noun: '提示词',
    description:
      '例图、完整来源与补充信息都可以随时增删改，提示词默认整段隐藏。',
  },
  profile: {
    number: '03',
    eyebrow: 'PROFILE INDEX',
    title: 'Profile 库',
    noun: 'Profile',
    description:
      '用长码归纳同一 Profile 文件夹，再记录每一个测试阶段的 7 位阶段 P。',
  },
  moodboard: {
    number: '04',
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

function VisualTile({
  asset,
  disabled,
  onUpload,
}: {
  asset: LibraryAsset;
  disabled?: boolean;
  onUpload: (files: FileList | null) => void;
}) {
  return (
    <label
      className={`record-visual record-visual-upload ${asset.images.length ? 'has-image' : 'empty-example'} ${disabled ? 'is-disabled' : ''}`}
      title={disabled ? '解锁后可添加例图' : '点击直接追加例图'}
    >
      {asset.images[0] && (
        <img alt={`${asset.title} 例图`} src={asset.images[0].url} />
      )}
      <small>
        <ImageIcon /> {asset.images.length}
        <span>点击添加</span>
      </small>
      <input
        accept="image/*"
        disabled={disabled}
        multiple
        onChange={(event) => {
          onUpload(event.target.files);
          event.currentTarget.value = '';
        }}
        type="file"
      />
    </label>
  );
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
  const copy = kindCopy[kind];
  const [assets, setAssets] = useState<LibraryAsset[]>([]);
  const [collections, setCollections] = useState<CollectionRecord[]>([]);
  const [activeCollection, setActiveCollection] = useState('all');
  const [localQuery, setLocalQuery] = useState('');
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const [assetDialog, setAssetDialog] = useState(false);
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

  const allCollections = useMemo(
    () => [
      { id: 'all', name: `全部${copy.noun}` },
      { id: 'unfiled', name: '未分类' },
      ...collections,
    ],
    [collections, copy.noun],
  );

  const refresh = async () => {
    if (vault.status !== 'unlocked') {
      setAssets(
        demoAssets
          .filter((asset) => asset.kind === kind)
          .map((asset) => ({ ...asset, images: [] })),
      );
      setCollections([]);
      return;
    }
    const [records, storedCollections] = await Promise.all([
      vault.loadRecords<StoredLibraryAsset>(`assets:${kind}`),
      vault.loadRecords<CollectionRecord>(`collections:${kind}`),
    ]);
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
            url: URL.createObjectURL(entry.blob),
          })),
        } satisfies LibraryAsset;
      }),
    );
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

  const query = `${globalQuery} ${localQuery}`.trim().toLocaleLowerCase();
  const filtered = useMemo(
    () =>
      assets.filter((asset) => {
        const inCollection =
          activeCollection === 'all' || asset.collection === activeCollection;
        const extra = (asset.customFields || []).flatMap((field) => [
          field.label,
          field.value,
        ]);
        const haystack = [
          asset.title,
          asset.author,
          asset.origin,
          asset.acquisition,
          asset.acquisitionOther,
          asset.stageType,
          asset.stageTypeOther,
          asset.stageNote,
          asset.note,
          ...asset.tags,
          ...extra,
        ]
          .join(' ')
          .toLocaleLowerCase();
        return inCollection && (!query || haystack.includes(query));
      }),
    [activeCollection, assets, query],
  );

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
    setFormError('');
    if (vault.status !== 'unlocked') {
      setFormError('请先在“安全与备份”中创建或解锁本机保险库。');
      return;
    }
    const form = new FormData(event.currentTarget);
    const secret = String(form.get('secret') || '').trim();
    if (kind !== 'prompt' && secret.length !== 7) {
      setFormError(`${copy.noun} 阶段短码必须正好是 7 位。`);
      return;
    }
    const now = new Date().toISOString();
    const id = editingAsset?.id || prismId(kind);
    const record: StoredLibraryAsset = {
      id,
      kind,
      title: String(form.get('title') || '').trim(),
      secret: kind === 'prompt' ? secret : secret.toUpperCase(),
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
    try {
      const added = newImageFiles.map((file) => ({
        id: crypto.randomUUID(),
        name: file.name,
        url: URL.createObjectURL(file),
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
        editingAsset
          ? current.map((asset) => (asset.id === id ? hydrated : asset))
          : [hydrated, ...current],
      );
      setAssetDialog(false);
      window.dispatchEvent(new CustomEvent('prism:assets-changed'));
    } catch (reason) {
      setFormError(reason instanceof Error ? reason.message : '资产保存失败');
    }
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
      window.dispatchEvent(new CustomEvent('prism:assets-changed'));
    } catch (reason) {
      setFormError(reason instanceof Error ? reason.message : '删除资产失败');
    }
  };

  const appendExampleImages = async (
    asset: LibraryAsset,
    files: FileList | null,
  ) => {
    if (
      !files ||
      !files.length ||
      vault.status !== 'unlocked' ||
      asset.id.startsWith('demo-')
    )
      return;
    try {
      const added: AssetImage[] = [];
      for (const file of Array.from(files)) {
        const imageId = await vault.saveBlob(
          `asset-image:${asset.id}`,
          file,
          file.name,
        );
        added.push({
          id: imageId,
          name: file.name,
          url: URL.createObjectURL(file),
        });
      }
      setAssets((current) =>
        current.map((item) =>
          item.id === asset.id
            ? {
                ...item,
                images: [...item.images, ...added],
                updatedAt: new Date().toISOString(),
              }
            : item,
        ),
      );
    } catch (reason) {
      setFormError(reason instanceof Error ? reason.message : '例图保存失败');
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

  return (
    <div className="studio-page">
      <div className="library-import-entry">
        <FileImportDialog
          kind={kind}
          onImported={() => {
            void refresh().catch((e) => setFormError(String(e)));
          }}
        />
      </div>
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

      <div className="collection-rail">
        <div className="collection-tabs">
          {allCollections.map((collection) => (
            <button
              className={collection.id === activeCollection ? 'is-active' : ''}
              key={collection.id}
              onClick={() => setActiveCollection(collection.id)}
              type="button"
            >
              <span>{collection.name}</span>
              <small>
                {collection.id === 'all'
                  ? assets.length
                  : assets.filter((asset) => asset.collection === collection.id)
                      .length}
              </small>
              {!['all', 'unfiled'].includes(collection.id) && (
                <span className="collection-actions">
                  <Pencil
                    aria-label={`重命名 ${collection.name}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      setCollectionDialog({
                        id: collection.id,
                        name: collection.name,
                      });
                    }}
                  />
                  <Trash2
                    aria-label={`删除 ${collection.name}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      deleteCollection(collection.id);
                    }}
                  />
                </span>
              )}
            </button>
          ))}
        </div>
        <p>
          <CircleAlert /> 分类可随时重命名或删除；删除分类不会删除资产。
        </p>
      </div>

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

      <div className="record-list">
        <div className="record-head">
          <span>例图 / 资产</span>
          <span>{copy.noun} / 来源</span>
          <span>备注 / 自定义信息</span>
          <span>操作</span>
        </div>
        {filtered.map((asset) => {
          const isRevealed = revealed.has(asset.id);
          const visibleValue = isRevealed
            ? asset.secret
            : kind === 'prompt'
              ? '••••••••••••••••••••'
              : secretPreview(asset.secret);
          return (
            <article className="record-row" key={asset.id}>
              <div className="record-identity">
                <VisualTile
                  asset={asset}
                  disabled={
                    vault.status !== 'unlocked' || asset.id.startsWith('demo-')
                  }
                  onUpload={(files) => appendExampleImages(asset, files)}
                />
                <div>
                  <Badge variant="outline">{copy.noun}</Badge>
                  <h3>{asset.title}</h3>
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
                <div className={!isRevealed ? 'is-obscured' : ''}>
                  <code>{visibleValue}</code>
                </div>
                {kind === 'profile' && (
                  <p className="long-code-line">
                    <span>长码</span>
                    <code>
                      {isRevealed ? asset.longCode || '未记录' : '长码已隐藏'}
                    </code>
                  </p>
                )}
                <div className="record-secret-actions">
                  <button onClick={() => toggleReveal(asset.id)} type="button">
                    {isRevealed ? <EyeOff /> : <Eye />}{' '}
                    {isRevealed ? '隐藏' : '显示'}
                  </button>
                  <button
                    disabled={!isRevealed}
                    onClick={() => navigator.clipboard?.writeText(asset.secret)}
                    type="button"
                  >
                    <Copy /> 复制短码
                  </button>
                </div>
                <p>
                  <strong>{asset.author}</strong>
                  <span>·</span>
                  {asset.origin}
                  <span>·</span>
                  {asset.acquisition === '其他'
                    ? asset.acquisitionOther || '其他'
                    : asset.acquisition}
                </p>
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
                <p>{asset.note || '暂无私人备注。'}</p>
                {asset.stageNote && (
                  <p>
                    <strong>阶段说明：</strong>
                    {asset.stageNote}
                  </p>
                )}
                <CustomFieldList fields={asset.customFields} />
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

      <Dialog onOpenChange={setAssetDialog} open={assetDialog}>
        <DialogContent className="asset-dialog asset-dialog-wide">
          <DialogHeader>
            <DialogTitle>
              {editingAsset ? '编辑' : '添加'}
              {copy.noun}
            </DialogTitle>
            <DialogDescription>
              所有字段都可以以后继续修改；自定义字段不限制名称和数量。
            </DialogDescription>
          </DialogHeader>
          <form
            className="editor-form"
            id="asset-form"
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
            <label className="wide-field">
              <span>
                {kind === 'profile'
                  ? '阶段 P 短码（7 位）'
                  : kind === 'moodboard'
                    ? 'Moodboard 短码（7 位）'
                    : '完整提示词'}
              </span>
              {kind === 'prompt' ? (
                <textarea
                  defaultValue={editingAsset?.secret}
                  name="secret"
                  placeholder="粘贴完整提示词…"
                  required
                />
              ) : (
                <Input
                  defaultValue={editingAsset?.secret}
                  maxLength={7}
                  minLength={7}
                  name="secret"
                  placeholder="ABC1234"
                  required
                />
              )}
            </label>
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
            <div className="wide-field existing-image-editor">
              <span>现有例图</span>
              {existingImages.length ? (
                <div>
                  {existingImages.map((image) => (
                    <figure key={image.id}>
                      <img alt={image.name} src={image.url} />
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
                accept="image/*"
                multiple
                onChange={(event) =>
                  setNewImageFiles(Array.from(event.target.files || []))
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
            <Button onClick={() => setAssetDialog(false)} variant="ghost">
              取消
            </Button>
            <Button form="asset-form" type="submit">
              <LockKeyhole /> 加密保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
