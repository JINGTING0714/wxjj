/* oxlint-disable next/no-img-element */
'use client';
import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { useVault } from './vault-provider';
import { useFileUrls } from './use-workspace-state';
import { ExampleImage } from './example-image';
import type { CollectionRecord, StoredWatermark } from '@/lib/prism-types';
import { loadImage } from '@/lib/image-processing';

export function WatermarkPicker({ onUse, disabled }: { onUse: (file: File) => void | Promise<void>; disabled: boolean }) {
  const vault = useVault();
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [category, setCategory] = useState('all'), [query, setQuery] = useState('');
  const [collections, setCollections] = useState<CollectionRecord[]>([]);
  const [items, setItems] = useState<{ record: StoredWatermark; file: File }[]>([]);
  const [uploads, setUploads] = useState<{ file: File; title: string; collection: string }[]>([]);
  const [newCategory, setNewCategory] = useState('');
  const urls = useFileUrls(items.map(item => item.file));
  const uploadUrls = useFileUrls(uploads.map(item => item.file));
  const refresh = useCallback(async () => {
    if (vault.status !== 'unlocked') return;
    const [records, categories] = await Promise.all([vault.loadRecords<StoredWatermark>('watermarks'), vault.loadRecords<CollectionRecord>('watermark-collections')]);
    const loaded = await Promise.all(records.map(async record => {
      const blobs = await vault.loadBlobs(`watermark-file:${record.id}`);
      const blob = blobs.find(item => item.id === record.blobId) || blobs[0];
      return blob ? { record, file: new File([blob.blob], record.fileName || blob.name, { type: blob.blob.type }) } : null;
    }));
    setCollections(categories); setItems(loaded.filter((item): item is NonNullable<typeof item> => !!item));
  }, [vault]);
  useEffect(() => { if (open || uploads.length) void Promise.resolve().then(refresh).catch(error => setError(String(error))); }, [open, uploads.length, refresh]);
  async function saveUploads() {
    if (busy) return;
    setBusy(true); setError('');
    try {
      if (uploads.some(item => !item.title.trim())) throw new Error('请为每张水印填写名称。');
      const now = new Date().toISOString();
      const existing = collections.find(item => item.name === newCategory.trim());
      const categoryId = newCategory.trim() ? existing?.id || crypto.randomUUID() : '';
      const records: { scope: string; value: StoredWatermark | CollectionRecord }[] = [];
      if (categoryId && !existing) records.push({ scope: 'watermark-collections', value: { id: categoryId, name: newCategory.trim() } });
      const blobs = [];
      const files: File[] = [];
      for (const upload of uploads) {
        await loadImage(upload.file);
        const id = crypto.randomUUID(), blobId = crypto.randomUUID();
        records.push({ scope: 'watermarks', value: { id, title: upload.title.trim(), collection: categoryId || upload.collection, author: '未记录', origin: '本机上传', acquisition: '其他', note: '', tags: [], fileName: upload.file.name, blobId, createdAt: now, updatedAt: now } });
        blobs.push({ id: blobId, scope: `watermark-file:${id}`, blob: upload.file, name: upload.file.name });
        files.push(new File([upload.file], `${upload.title.trim()}.${upload.file.name.split('.').pop() || 'png'}`, { type: upload.file.type }));
      }
      await vault.writeBatch({ records, blobs });
      for (const file of files) await onUse(file); setUploads([]); setNewCategory('');
      window.dispatchEvent(new CustomEvent('prism:watermarks-changed'));
    } catch (reason) { setError(reason instanceof Error ? reason.message : '水印保存失败'); }
    finally { setBusy(false); }
  }
  return <><div className="layer-source-actions">
    <label className="mini-file">上传水印<input type="file" accept="image/*" multiple disabled={disabled || busy} onChange={event => { setError(''); setUploads(Array.from(event.target.files || []).map(file => ({ file, title: file.name.replace(/\.[^.]+$/, ''), collection: 'unfiled' }))); event.target.value = ''; }} /></label>
    <Button variant="outline" disabled={disabled} onClick={() => { setError(''); setOpen(true); }}>从水印库选择</Button>
  </div>
  <Dialog open={open} onOpenChange={setOpen}><DialogContent className="watermark-picker-dialog"><DialogTitle>按分类选水印</DialogTitle><DialogDescription>先选库或搜索名称；点击预览图可放大，确认后再添加图层。</DialogDescription>
    <div className="watermark-picker-filter"><label>水印库<select aria-label="水印库" value={category} onChange={event => setCategory(event.target.value)}><option value="all">全部水印</option><option value="unfiled">未分类</option>{collections.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>搜索<input placeholder="名称、作者或标签" value={query} onChange={event => setQuery(event.target.value)} /></label></div>
    <div className="watermark-picker-grid">{items.map((item, index) => (category === 'all' || item.record.collection === category) && `${item.record.title} ${item.record.author} ${item.record.tags.join(' ')}`.toLowerCase().includes(query.toLowerCase()) && <article key={item.record.id}><ExampleImage src={urls[index]} alt={item.record.title} /><strong>{item.record.title}</strong><small>{collections.find(category => category.id === item.record.collection)?.name || '未分类'}</small><Button onClick={async () => { await onUse(new File([item.file], `${item.record.title}.${item.file.name.split('.').pop() || 'png'}`, { type: item.file.type })); setOpen(false); }}>使用这张水印</Button></article>)}</div>
    {!items.length && <p>暂时没有水印，可以上传并命名保存。</p>}{error && <p role="alert">{error}</p>}
  </DialogContent></Dialog>
  <Dialog open={!!uploads.length} onOpenChange={value => { if (!value && !busy) setUploads([]); }}><DialogContent className="watermark-picker-dialog"><DialogTitle>先命名、归库，再启用水印</DialogTitle><DialogDescription>保存到本机水印库后才会加入当前图层。分享前请确认素材不含私人信息。</DialogDescription>
    <div className="watermark-upload-list">{uploads.map((item, index) => <article key={index}><ExampleImage src={uploadUrls[index]} alt={item.file.name} /><label>水印名称<input value={item.title} required onChange={event => setUploads(current => current.map((entry, i) => i === index ? { ...entry, title: event.target.value } : entry))} /></label><label>所属水印库<select value={item.collection} onChange={event => setUploads(current => current.map((entry, i) => i === index ? { ...entry, collection: event.target.value } : entry))}><option value="unfiled">未分类</option>{collections.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label><Button variant="ghost" onClick={() => setUploads(current => current.filter((_, i) => i !== index))}>移除</Button></article>)}</div>
    <label>或新建水印库（用于本次上传）<input value={newCategory} onChange={event => setNewCategory(event.target.value)} placeholder="例如：个人边框" /></label>
    {error && <p role="alert">{error}</p>}<DialogFooter><Button disabled={busy} variant="outline" onClick={() => setUploads([])}>取消</Button><Button disabled={busy} onClick={() => void saveUploads()}>{busy ? '正在保存…' : '保存并启用水印'}</Button></DialogFooter>
  </DialogContent></Dialog></>;
}
