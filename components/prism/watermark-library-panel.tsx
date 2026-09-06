'use client';

import {
  CircleAlert,
  Download,
  FolderPlus,
  Image as ImageIcon,
  Link2,
  Pencil,
  Plus,
  Search,
  Trash2,
  Upload,
} from 'lucide-react';
import { FormEvent, useEffect, useMemo, useState } from 'react';

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
import { downloadBlob } from '@/lib/download';
import type {
  CollectionRecord,
  CustomField,
  StoredWatermark,
  WatermarkAsset,
} from '@/lib/prism-types';
import {
  normalizeCustomFields,
  prismId,
  safeSourceUrl,
} from '@/lib/prism-types';

const acquisitionOptions = [
  '自制',
  '免费分享',
  '福利获得',
  '公开发布',
  '朋友赠送',
  '付费购入',
  '合作授权',
  '其他',
];

export function WatermarkLibraryPanel({
  globalQuery,
}: {
  globalQuery: string;
}) {
  const vault = useVault();
  const [watermarks, setWatermarks] = useState<WatermarkAsset[]>([]);
  const [collections, setCollections] = useState<CollectionRecord[]>([]);
  const [active, setActive] = useState('all');
  const [localQuery, setLocalQuery] = useState('');
  const [assetDialog, setAssetDialog] = useState(false);
  const [editing, setEditing] = useState<WatermarkAsset | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [customFields, setCustomFields] = useState<CustomField[]>([]);
  const [acquisition, setAcquisition] = useState('自制');
  const [collectionDialog, setCollectionDialog] = useState<{
    id?: string;
    name: string;
  } | null>(null);
  const [error, setError] = useState('');
  const [refreshTick, setRefreshTick] = useState(0);

  const allCollections = useMemo(
    () => [
      { id: 'all', name: '全部水印' },
      { id: 'unfiled', name: '未分类' },
      ...collections,
    ],
    [collections],
  );

  const loadAll = async () => {
    if (vault.status !== 'unlocked') {
      setWatermarks([]);
      setCollections([]);
      return;
    }
    const [records, storedCollections] = await Promise.all([
      vault.loadRecords<StoredWatermark>('watermarks'),
      vault.loadRecords<CollectionRecord>('watermark-collections'),
    ]);
    const hydrated = (
      await Promise.all(
        records.map(async (record) => {
          const blobs = await vault.loadBlobs(`watermark-file:${record.id}`);
          const blob = record.blobId
            ? blobs.find((entry) => entry.id === record.blobId) || blobs[0]
            : blobs[0];
          if (!blob) return null;
          const file = new File([blob.blob], record.fileName || blob.name, {
            type: blob.blob.type,
          });
          return {
            ...record,
            tags: record.tags || [],
            customFields: record.customFields || [],
            file,
            url: URL.createObjectURL(blob.blob),
          } satisfies WatermarkAsset;
        }),
      )
    ).filter(Boolean) as WatermarkAsset[];
    setWatermarks(
      hydrated.sort((a, b) =>
        (b.updatedAt || '').localeCompare(a.updatedAt || ''),
      ),
    );
    setCollections(storedCollections);
  };

  useEffect(() => {
    loadAll().catch((reason) =>
      setError(reason instanceof Error ? reason.message : '水印库读取失败'),
    );
  }, [vault.status, refreshTick]);

  useEffect(() => {
    const refresh = () => setRefreshTick((value) => value + 1);
    window.addEventListener('prism:watermarks-changed', refresh);
    return () =>
      window.removeEventListener('prism:watermarks-changed', refresh);
  }, []);

  const query = `${globalQuery} ${localQuery}`.trim().toLocaleLowerCase();
  const visible = watermarks.filter((watermark) => {
    const inCollection = active === 'all' || watermark.collection === active;
    const text = [
      watermark.title,
      watermark.author,
      watermark.origin,
      watermark.acquisition,
      watermark.acquisitionOther,
      watermark.note,
      ...watermark.tags,
      ...(watermark.customFields || []).flatMap((field) => [
        field.label,
        field.value,
      ]),
    ]
      .join(' ')
      .toLocaleLowerCase();
    return inCollection && (!query || text.includes(query));
  });

  const openCreate = () => {
    setEditing(null);
    setSelectedFile(null);
    setCustomFields([]);
    setAcquisition('自制');
    setError('');
    setAssetDialog(true);
  };
  const openEdit = (watermark: WatermarkAsset) => {
    setEditing(watermark);
    setSelectedFile(null);
    setCustomFields(watermark.customFields || []);
    setAcquisition(watermark.acquisition || '其他');
    setError('');
    setAssetDialog(true);
  };

  const saveWatermark = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (vault.status !== 'unlocked') {
      setError('请先解锁本机保险库，再保存水印。');
      return;
    }
    const file = selectedFile || editing?.file;
    if (!file) {
      setError('请选择一张水印图片。');
      return;
    }
    const data = new FormData(event.currentTarget);
    const id = editing?.id || prismId('watermark');
    const now = new Date().toISOString();
    const record: StoredWatermark = {
      id,
      title: String(data.get('title') || '').trim() || file.name,
      collection: String(data.get('collection') || 'unfiled'),
      author: String(data.get('author') || '').trim() || '未记录',
      origin: String(data.get('origin') || '').trim() || '本机上传',
      sourceUrl: String(data.get('sourceUrl') || '').trim(),
      acquisition,
      acquisitionOther:
        acquisition === '其他'
          ? String(data.get('acquisitionOther') || '').trim()
          : undefined,
      note: String(data.get('note') || '').trim(),
      tags: String(data.get('tags') || '')
        .split(/[,，]/)
        .map((tag) => tag.trim())
        .filter(Boolean),
      customFields: normalizeCustomFields(customFields),
      fileName: file.name,
      blobId: editing?.blobId,
      createdAt: editing?.createdAt || now,
      updatedAt: now,
    };
    try {
      if (selectedFile || !editing) {
        if (editing?.blobId) await vault.deleteBlob(editing.blobId);
        else if (editing) {
          const legacy = await vault.loadBlobs(`watermark-file:${id}`);
          for (const entry of legacy) await vault.deleteBlob(entry.id);
        }
        record.blobId = await vault.saveBlob(
          `watermark-file:${id}`,
          file,
          file.name,
        );
      }
      await vault.saveRecord('watermarks', record);
      const savedBlobs = await vault.loadBlobs(`watermark-file:${id}`);
      const savedBlob = record.blobId
        ? savedBlobs.find((entry) => entry.id === record.blobId)
        : savedBlobs[0];
      const actualBlob = savedBlob?.blob || file;
      const hydrated: WatermarkAsset = {
        ...record,
        file: new File([actualBlob], record.fileName, {
          type: actualBlob.type,
        }),
        url: URL.createObjectURL(actualBlob),
      };
      setWatermarks((current) =>
        editing
          ? current.map((item) => (item.id === id ? hydrated : item))
          : [hydrated, ...current],
      );
      setAssetDialog(false);
      window.dispatchEvent(new CustomEvent('prism:watermarks-changed'));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '水印保存失败');
    }
  };

  const deleteWatermark = async (watermark: WatermarkAsset) => {
    if (!window.confirm(`确定删除水印“${watermark.title}”吗？`)) return;
    const blobs = await vault.loadBlobs(`watermark-file:${watermark.id}`);
    for (const blob of blobs) await vault.deleteBlob(blob.id);
    await vault.deleteRecord(watermark.id);
    setWatermarks((current) =>
      current.filter((item) => item.id !== watermark.id),
    );
    window.dispatchEvent(new CustomEvent('prism:watermarks-changed'));
  };

  const saveCollection = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!collectionDialog || vault.status !== 'unlocked') return;
    const name = String(
      new FormData(event.currentTarget).get('name') || '',
    ).trim();
    if (!name) return;
    const record = {
      id: collectionDialog.id || prismId('watermark-collection'),
      name,
    };
    await vault.saveRecord('watermark-collections', record);
    setCollections((current) =>
      collectionDialog.id
        ? current.map((item) => (item.id === record.id ? record : item))
        : [...current, record],
    );
    setActive(record.id);
    setCollectionDialog(null);
  };

  const deleteCollection = async (id: string) => {
    const target = collections.find((item) => item.id === id);
    if (
      !window.confirm(
        `删除分类“${target?.name || ''}”？其中的水印会移入“未分类”。`,
      )
    )
      return;
    const changed = watermarks.map((item) =>
      item.collection === id
        ? {
            ...item,
            collection: 'unfiled',
            updatedAt: new Date().toISOString(),
          }
        : item,
    );
    for (const item of changed.filter(
      (watermark) => watermark.collection === 'unfiled',
    )) {
      const { file: _file, url: _url, ...record } = item;
      await vault.saveRecord('watermarks', record);
    }
    await vault.deleteRecord(id);
    setWatermarks(changed);
    setCollections((current) => current.filter((item) => item.id !== id));
    setActive('all');
  };

  return (
    <div className="studio-page watermark-library-page">
      <SectionHead
        eyebrow="WATERMARK ARCHIVE"
        number="06B"
        title="水印库"
        description="上传到工坊的新水印会自动进入这里；每张水印都能分类、补充信息、替换、下载或删除。"
        actions={
          <>
            <Button
              onClick={() => setCollectionDialog({ name: '' })}
              variant="outline"
            >
              <FolderPlus /> 新建分类
            </Button>
            <Button className="add-button" onClick={openCreate}>
              <Plus /> 添加水印
            </Button>
          </>
        }
      />
      {vault.status !== 'unlocked' && (
        <div className="vault-gate">
          <ImageIcon />
          <p>
            <strong>水印库正在安全锁定</strong>
            <span>解锁后即可看到并管理本机水印。</span>
          </p>
        </div>
      )}
      {error && (
        <p className="error-banner">
          <CircleAlert /> {error}
        </p>
      )}
      <div className="collection-rail">
        <div className="collection-tabs">
          {allCollections.map((collection) => (
            <button
              className={active === collection.id ? 'is-active' : ''}
              key={collection.id}
              onClick={() => setActive(collection.id)}
              type="button"
            >
              <span>{collection.name}</span>
              <small>
                {collection.id === 'all'
                  ? watermarks.length
                  : watermarks.filter(
                      (item) => item.collection === collection.id,
                    ).length}
              </small>
              {!['all', 'unfiled'].includes(collection.id) && (
                <span className="collection-actions">
                  <Pencil
                    onClick={(event) => {
                      event.stopPropagation();
                      setCollectionDialog({
                        id: collection.id,
                        name: collection.name,
                      });
                    }}
                  />
                  <Trash2
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
      </div>
      <div className="library-toolbar">
        <div className="inner-search">
          <Search />
          <Input
            onChange={(event) => setLocalQuery(event.target.value)}
            placeholder="搜索水印名称、作者、来源、标签或备注…"
            value={localQuery}
          />
        </div>
        <div className="result-count">
          <strong>{String(visible.length).padStart(2, '0')}</strong>
          <span>张水印</span>
        </div>
      </div>
      {visible.length ? (
        <div className="watermark-library-grid">
          {visible.map((watermark) => (
            <article key={watermark.id}>
              <div className="watermark-checker">
                <img alt={watermark.title} src={watermark.url} />
              </div>
              <div className="watermark-info">
                <Badge variant="outline">
                  {watermark.acquisition === '其他'
                    ? watermark.acquisitionOther || '其他'
                    : watermark.acquisition}
                </Badge>
                <h2>{watermark.title}</h2>
                <p>
                  {watermark.author} · {watermark.origin}
                </p>
                <span>{watermark.note || '暂无备注'}</span>
                <CustomFieldList fields={watermark.customFields} />
                {safeSourceUrl(watermark.sourceUrl) && (
                  <a
                    href={safeSourceUrl(watermark.sourceUrl)}
                    rel="noreferrer"
                    target="_blank"
                  >
                    <Link2 /> 来源
                  </a>
                )}
                <div>
                  <button onClick={() => openEdit(watermark)} type="button">
                    <Pencil /> 编辑
                  </button>
                  <button
                    onClick={() =>
                      downloadBlob(watermark.file, watermark.fileName)
                    }
                    type="button"
                  >
                    <Download /> 下载
                  </button>
                  <button
                    onClick={() => deleteWatermark(watermark)}
                    type="button"
                  >
                    <Trash2 /> 删除
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <ImageIcon />
          <h3>还没有水印</h3>
          <p>从这里添加，或者在水印工坊上传第一层；工坊上传会自动归档。</p>
        </div>
      )}

      <Dialog onOpenChange={setAssetDialog} open={assetDialog}>
        <DialogContent className="asset-dialog">
          <DialogHeader>
            <DialogTitle>{editing ? '编辑水印' : '添加水印'}</DialogTitle>
            <DialogDescription>
              信息可以以后继续补充或修改；选择“其他”时可以自由填写。
            </DialogDescription>
          </DialogHeader>
          <form
            className="editor-form"
            id="watermark-form"
            key={editing?.id || 'new'}
            onSubmit={saveWatermark}
          >
            <label>
              <span>水印名称</span>
              <Input
                defaultValue={editing?.title}
                name="title"
                placeholder="方便辨认的名称"
                required
              />
            </label>
            <label>
              <span>所属分类</span>
              <select
                defaultValue={editing?.collection || 'unfiled'}
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
            <label>
              <span>作者 / 创作者</span>
              <Input defaultValue={editing?.author} name="author" />
            </label>
            <label>
              <span>来自哪里</span>
              <Input defaultValue={editing?.origin} name="origin" />
            </label>
            <label className="wide-field">
              <span>来源链接（可选）</span>
              <Input
                defaultValue={editing?.sourceUrl}
                name="sourceUrl"
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
                  defaultValue={editing?.acquisitionOther}
                  name="acquisitionOther"
                  required
                />
              </label>
            )}
            <label className="wide-field">
              <span>标签</span>
              <Input defaultValue={editing?.tags.join('，')} name="tags" />
            </label>
            <label className="wide-field">
              <span>备注</span>
              <textarea defaultValue={editing?.note} name="note" />
            </label>
            <CustomFieldsEditor
              fields={customFields}
              onChange={setCustomFields}
            />
            <label className="wide-field upload-field">
              <span>{editing ? '替换水印图片（可选）' : '水印图片'}</span>
              <input
                accept="image/*"
                onChange={(event) =>
                  setSelectedFile(event.target.files?.[0] || null)
                }
                required={!editing}
                type="file"
              />
              <div>
                <Upload />
                <strong>
                  {selectedFile
                    ? selectedFile.name
                    : editing
                      ? `保留 ${editing.fileName}`
                      : '选择透明 PNG 或其他图片'}
                </strong>
                <small>新图片会替换当前文件</small>
              </div>
            </label>
          </form>
          {error && (
            <p className="dialog-error">
              <CircleAlert /> {error}
            </p>
          )}
          <DialogFooter>
            <Button onClick={() => setAssetDialog(false)} variant="ghost">
              取消
            </Button>
            <Button form="watermark-form" type="submit">
              加密保存
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
              {collectionDialog?.id ? '重命名' : '新建'}水印分类
            </DialogTitle>
            <DialogDescription>删除分类不会删除其中的水印。</DialogDescription>
          </DialogHeader>
          <form
            className="single-form"
            id="watermark-collection-form"
            onSubmit={saveCollection}
          >
            <label>
              <span>分类名称</span>
              <Input
                autoFocus
                defaultValue={collectionDialog?.name}
                name="name"
                required
              />
            </label>
          </form>
          <DialogFooter>
            <Button onClick={() => setCollectionDialog(null)} variant="ghost">
              取消
            </Button>
            <Button form="watermark-collection-form" type="submit">
              保存分类
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
