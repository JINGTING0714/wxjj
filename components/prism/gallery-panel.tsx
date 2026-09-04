'use client';

import { CheckSquare2, CircleAlert, Download, FolderPlus, Grid3X3, Maximize2, Pencil, ShieldCheck, Trash2, Upload } from 'lucide-react';
import { FormEvent, useEffect, useMemo, useState } from 'react';

import { SectionHead } from '@/components/prism/studio-shared';
import { useVault } from '@/components/prism/vault-provider';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { downloadBlob, downloadZip } from '@/lib/download';
import type { CollectionRecord, GalleryImage, GalleryImageMeta } from '@/lib/prism-types';
import { prismId } from '@/lib/prism-types';

const coreCollections: CollectionRecord[] = [{ id: 'daily', name: '每日刷图' }];

export function GalleryPanel({ onOpenCollage }: { onOpenCollage: () => void }) {
  const vault = useVault();
  const [collections, setCollections] = useState<CollectionRecord[]>(coreCollections);
  const [active, setActive] = useState('daily');
  const [images, setImages] = useState<GalleryImage[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [collectionDialog, setCollectionDialog] = useState<{ id?: string; name: string } | null>(null);
  const [editingImage, setEditingImage] = useState<GalleryImage | null>(null);
  const [preview, setPreview] = useState<GalleryImage | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);
  const visible = useMemo(() => images.filter((image) => image.collection === active), [active, images]);

  useEffect(() => {
    const refresh = () => setRefreshTick((value) => value + 1);
    window.addEventListener('prism:gallery-refresh', refresh);
    return () => window.removeEventListener('prism:gallery-refresh', refresh);
  }, []);

  useEffect(() => {
    if (vault.status !== 'unlocked') {
      setCollections(coreCollections);
      setImages([]);
      setSelected(new Set());
      return;
    }
    Promise.all([
      vault.loadRecords<CollectionRecord>('gallery-collections'),
      vault.loadRecords<GalleryImageMeta>('gallery-image-meta'),
    ]).then(async ([storedCollections, metadata]) => {
      const merged = [...coreCollections, ...storedCollections.filter((collection) => !coreCollections.some((core) => core.id === collection.id))];
      const metaById = new Map(metadata.map((item) => [item.id, item]));
      const loaded = (await Promise.all(merged.map(async (collection) => {
        const blobs = await vault.loadBlobs(`gallery:${collection.id}`);
        return blobs.map((entry) => {
          const meta = metaById.get(entry.id);
          return {
            id: entry.id,
            name: meta?.name || entry.name,
            collection: collection.id,
            note: meta?.note || '',
            tags: meta?.tags || [],
            createdAt: meta?.createdAt || entry.updatedAt,
            updatedAt: meta?.updatedAt || entry.updatedAt,
            url: URL.createObjectURL(entry.blob),
            blob: entry.blob,
          } satisfies GalleryImage;
        });
      }))).flat();
      setCollections(merged);
      setImages(loaded.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || '')));
      if (!merged.some((collection) => collection.id === active)) setActive('daily');
    }).catch((reason) => setError(reason instanceof Error ? reason.message : '图库读取失败'));
  }, [refreshTick, vault.status]);

  const upload = async (files: FileList | null) => {
    if (!files) return;
    if (vault.status !== 'unlocked') {
      setError('请先创建或解锁本机保险库，再上传图片。');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const next: GalleryImage[] = [];
      for (const file of Array.from(files)) {
        const id = prismId('gallery-image');
        const now = new Date().toISOString();
        const meta: GalleryImageMeta = { id, name: file.name, collection: active, note: '', tags: [], createdAt: now, updatedAt: now };
        await vault.saveBlob(`gallery:${active}`, file, file.name, id);
        await vault.saveRecord('gallery-image-meta', meta);
        next.push({ ...meta, url: URL.createObjectURL(file), blob: file });
      }
      setImages((current) => [...next, ...current]);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '图片保存失败');
    } finally {
      setBusy(false);
    }
  };

  const saveCollection = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!collectionDialog || vault.status !== 'unlocked') {
      setError('请先创建或解锁本机保险库，再管理图库。');
      return;
    }
    const name = String(new FormData(event.currentTarget).get('name') || '').trim();
    if (!name) return;
    const record = { id: collectionDialog.id || prismId('gallery'), name };
    await vault.saveRecord('gallery-collections', record);
    setCollections((current) => collectionDialog.id ? current.map((item) => item.id === record.id ? record : item) : [...current, record]);
    setActive(record.id);
    setCollectionDialog(null);
  };

  const removeCollection = async (id: string) => {
    if (id === 'daily') return;
    const collection = collections.find((item) => item.id === id);
    if (!window.confirm(`删除图库“${collection?.name || ''}”？其中图片会移入“每日刷图”，不会被删除。`)) return;
    const moving = images.filter((image) => image.collection === id);
    for (const image of moving) {
      await vault.saveBlob('gallery:daily', image.blob, image.name, image.id);
      await vault.saveRecord('gallery-image-meta', { ...image, url: undefined, blob: undefined, collection: 'daily', updatedAt: new Date().toISOString() } as unknown as GalleryImageMeta);
    }
    await vault.deleteRecord(id);
    setImages((current) => current.map((image) => image.collection === id ? { ...image, collection: 'daily' } : image));
    setCollections((current) => current.filter((item) => item.id !== id));
    setActive('daily');
  };

  const toggleSelected = (id: string) => setSelected((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const deleteImages = async (targets: GalleryImage[]) => {
    if (!targets.length || !window.confirm(`确定删除选中的 ${targets.length} 张图片吗？此操作会删除本机加密副本。`)) return;
    for (const image of targets) {
      await vault.deleteBlob(image.id);
      await vault.deleteRecord(image.id);
      URL.revokeObjectURL(image.url);
    }
    const ids = new Set(targets.map((item) => item.id));
    setImages((current) => current.filter((item) => !ids.has(item.id)));
    setSelected((current) => new Set([...current].filter((id) => !ids.has(id))));
    setPreview(null);
    setEditingImage(null);
  };

  const saveImage = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editingImage) return;
    const data = new FormData(event.currentTarget);
    const name = String(data.get('name') || '').trim() || editingImage.name;
    const collection = String(data.get('collection') || editingImage.collection);
    const next: GalleryImage = {
      ...editingImage,
      name,
      collection,
      note: String(data.get('note') || '').trim(),
      tags: String(data.get('tags') || '').split(/[,，]/).map((tag) => tag.trim()).filter(Boolean),
      updatedAt: new Date().toISOString(),
    };
    await vault.saveBlob(`gallery:${collection}`, next.blob, name, next.id);
    const { url: _url, blob: _blob, ...meta } = next;
    await vault.saveRecord('gallery-image-meta', meta);
    setImages((current) => current.map((image) => image.id === next.id ? next : image));
    setEditingImage(null);
  };

  const sendSelected = () => {
    const targets = images.filter((image) => selected.has(image.id));
    if (!targets.length) return;
    window.dispatchEvent(new CustomEvent('prism:send-to-collage', { detail: targets.map((image) => new File([image.blob], image.name, { type: image.blob.type })) }));
    onOpenCollage();
  };

  const currentCollection = collections.find((collection) => collection.id === active);

  return (
    <div className="studio-page gallery-page">
      <SectionHead eyebrow="IMAGE ARCHIVE" number="06" title="图片收纳" description="图库和图片都能自由创建、重命名、移动、补充信息与删除。" actions={<><Button onClick={() => setCollectionDialog({ name: '' })} variant="outline"><FolderPlus /> 新建图库</Button><label className={`button-file ${busy ? 'is-disabled' : ''}`}><Upload /> {busy ? '正在加密…' : '上传图片'}<input accept="image/*" disabled={busy} multiple onChange={(event) => upload(event.target.files)} type="file" /></label></>} />
      {vault.status !== 'unlocked' && <div className="vault-gate"><ShieldCheck /><p><strong>图库正在安全锁定</strong><span>先创建或解锁本机保险库，才能把图片加密写入此设备。</span></p></div>}
      {error && <p className="error-banner"><CircleAlert /> {error}</p>}
      <div className="gallery-layout">
        <aside className="gallery-libraries"><p className="eyebrow">YOUR LIBRARIES</p>{collections.map((collection, index) => <button className={active === collection.id ? 'is-active' : ''} key={collection.id} onClick={() => { setActive(collection.id); setSelected(new Set()); }} type="button"><span><i>{String(index + 1).padStart(2, '0')}</i>{collection.name}</span><small>{images.filter((image) => image.collection === collection.id).length}</small>{collection.id !== 'daily' && <span className="gallery-collection-actions"><Pencil aria-label={`重命名 ${collection.name}`} onClick={(event) => { event.stopPropagation(); setCollectionDialog({ id: collection.id, name: collection.name }); }} /><Trash2 aria-label={`删除 ${collection.name}`} onClick={(event) => { event.stopPropagation(); removeCollection(collection.id); }} /></span>}</button>)}<p className="library-hint">删除图库不会删除图片，内容会自动移入“每日刷图”。</p></aside>
        <section className="gallery-surface">
          <div className="gallery-surface-head"><div><p className="eyebrow">CURRENT LIBRARY</p><h2>{currentCollection?.name}</h2></div><div className="gallery-head-actions"><Badge variant="outline">{visible.length} IMAGES</Badge>{visible.length > 0 && <Button onClick={() => downloadZip(visible.map((image) => ({ name: image.name, blob: image.blob })), `${currentCollection?.name || 'PRISM-图库'}.zip`)} size="sm" variant="outline"><Download /> 一键下载全部</Button>}</div></div>
          {visible.length ? <div className="masonry-grid">{visible.map((image, index) => <article className={`gallery-image gallery-size-${(index % 3) + 1} ${selected.has(image.id) ? 'is-selected' : ''}`} key={image.id}><button aria-label={`选择 ${image.name}`} className="gallery-select" onClick={() => toggleSelected(image.id)} type="button"><CheckSquare2 /></button><button className="gallery-preview-button" onClick={() => setPreview(image)} type="button"><img alt={image.name} src={image.url} /><span><Maximize2 />{image.name}</span></button><div className="gallery-card-actions"><button onClick={() => setEditingImage(image)} type="button"><Pencil /> 编辑</button><button onClick={() => deleteImages([image])} type="button"><Trash2 /> 删除</button><button onClick={() => downloadBlob(image.blob, image.name)} type="button"><Download /> 下载</button></div></article>)}</div> : <label className="gallery-drop gallery-drop-empty"><Upload /><strong>把今天的图放进来</strong><span>支持批量选择；图片只保存在本机加密保险库</span><input accept="image/*" multiple onChange={(event) => upload(event.target.files)} type="file" /></label>}
          <div className="gallery-footer"><p><ShieldCheck /> 已选择 {selected.size} 张；所有处理都在本机完成。</p><div>{selected.size > 0 && <Button onClick={() => deleteImages(images.filter((image) => selected.has(image.id)))} variant="outline"><Trash2 /> 删除已选</Button>}<Button disabled={!selected.size} onClick={sendSelected} variant="outline"><Grid3X3 /> 已选图片送去拼贴</Button></div></div>
        </section>
      </div>

      <Dialog onOpenChange={(open) => !open && setCollectionDialog(null)} open={Boolean(collectionDialog)}><DialogContent><DialogHeader><DialogTitle>{collectionDialog?.id ? '重命名图库' : '新建图片库'}</DialogTitle><DialogDescription>图库只是分类；图库和图片都可以以后继续修改。</DialogDescription></DialogHeader><form className="single-form" id="gallery-form" onSubmit={saveCollection}><label><span>图库名称</span><Input autoFocus defaultValue={collectionDialog?.name} name="name" placeholder="例如：2026 秋冬灵感" required /></label></form><DialogFooter><Button onClick={() => setCollectionDialog(null)} variant="ghost">取消</Button><Button form="gallery-form" type="submit">保存图库</Button></DialogFooter></DialogContent></Dialog>

      <Dialog onOpenChange={(open) => !open && setEditingImage(null)} open={Boolean(editingImage)}><DialogContent className="image-edit-dialog">{editingImage && <><DialogHeader><DialogTitle>编辑图片</DialogTitle><DialogDescription>重命名、移动图库，或者记录标签和备注。</DialogDescription></DialogHeader><img alt={editingImage.name} src={editingImage.url} /><form className="editor-form" id="image-form" onSubmit={saveImage}><label><span>图片名称</span><Input defaultValue={editingImage.name} name="name" required /></label><label><span>所属图库</span><select defaultValue={editingImage.collection} name="collection">{collections.map((collection) => <option key={collection.id} value={collection.id}>{collection.name}</option>)}</select></label><label className="wide-field"><span>标签</span><Input defaultValue={editingImage.tags.join('，')} name="tags" /></label><label className="wide-field"><span>备注</span><textarea defaultValue={editingImage.note} name="note" /></label></form><DialogFooter><Button onClick={() => deleteImages([editingImage])} variant="outline"><Trash2 /> 删除图片</Button><Button form="image-form" type="submit">保存修改</Button></DialogFooter></>}</DialogContent></Dialog>

      <Dialog onOpenChange={(open) => !open && setPreview(null)} open={Boolean(preview)}><DialogContent className="image-preview-dialog">{preview && <><DialogHeader><DialogTitle>{preview.name}</DialogTitle><DialogDescription>{preview.note || '暂无备注'}</DialogDescription></DialogHeader><img alt={preview.name} src={preview.url} /><DialogFooter><Button onClick={() => downloadBlob(preview.blob, preview.name)} variant="outline"><Download /> 下载</Button><Button onClick={() => { setPreview(null); setEditingImage(preview); }}><Pencil /> 编辑信息</Button></DialogFooter></>}</DialogContent></Dialog>
    </div>
  );
}
