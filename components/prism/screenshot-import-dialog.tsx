'use client';

import { useEffect, useMemo, useState } from 'react';
import { ImagePlus, ScanText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { CollectionRecord, StoredLibraryAsset } from '@/lib/prism-types';
import { prismId } from '@/lib/prism-types';
import { recognizeLocalImages } from '@/lib/local-ocr';
import { draftsFromOcr, type ScreenshotPromptDraft } from '@/lib/prompt-screenshot';
import { promptLanguages } from '@/lib/prompt-language';
import { useVault } from './vault-provider';
import { useFileUrls } from './use-workspace-state';
import { useConfirmation } from './use-confirmation';

function promptKey(prompt: { english?: string; chinese?: string; unconfirmed?: string }) {
  return JSON.stringify([prompt.english, prompt.chinese, prompt.unconfirmed].map(value => (value || '').trim().replace(/\s+/g, ' ')));
}

export function ScreenshotImportDialog({
  collections,
  onImported,
}: {
  collections: CollectionRecord[];
  onImported: () => void;
}) {
  const vault = useVault();
  const confirmation = useConfirmation();
  const [open, setOpen] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const urls = useFileUrls(files);
  const [rows, setRows] = useState<ScreenshotPromptDraft[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [collection, setCollection] = useState('unfiled');
  const [newCollection, setNewCollection] = useState('');
  const [author, setAuthor] = useState('');
  const [origin, setOrigin] = useState('聊天截图导入');
  const [acquisition, setAcquisition] = useState('购买');
  const [tags, setTags] = useState('');
  const [duplicates, setDuplicates] = useState<Set<string>>(new Set());
  const [existing, setExisting] = useState<StoredLibraryAsset[]>([]);
  const [activeScreenshot, setActiveScreenshot] = useState(0);
  useEffect(() => {
    if (!open || vault.status !== 'unlocked') return;
    void vault.loadRecords<StoredLibraryAsset>('assets:prompt').then(setExisting).catch(() => setExisting([]));
  }, [open, vault]);
  const known = useMemo(() => new Set(existing.map(record => promptKey(promptLanguages(record)))), [existing]);
  const patch = (id: string, change: Partial<ScreenshotPromptDraft>) =>
    setRows((current) => current.map((row) => row.id === id ? { ...row, ...change } : row));
  const moveFile = (index: number, delta: number) => {
    setFiles((current) => {
      const next = [...current];
      const to = index + delta;
      if (to < 0 || to >= next.length) return current;
      [next[index], next[to]] = [next[to], next[index]];
      return next;
    });
    setRows([]);
    setMessage('截图顺序已改变，请重新识别。');
  };
  const removeFile = (index: number) => {
    setFiles((current) => current.filter((_, fileIndex) => fileIndex !== index));
    setRows([]);
    setActiveScreenshot((current) => Math.max(0, Math.min(current, files.length - 2)));
    setMessage('已移除这张截图；如需继续导入，请重新识别剩余截图。');
  };
  const clearFiles = () => {
    setFiles([]);
    setRows([]);
    setActiveScreenshot(0);
    setMessage('已清空待识别截图。');
  };
  const recognize = async () => {
    if (!files.length) return;
    setBusy(true);
    setMessage('正在本机加载英文和中文识别模型…');
    try {
      const pages = await recognizeLocalImages(files, setMessage);
      const next = draftsFromOcr(pages);
      setRows(next);
      setMessage(next.length
        ? `识别完成：${next.length} 条候选。每条需校对并勾选才会保存；模糊小图不会入库。`
        : '识别完成，但没有找到可确认的提示词。请检查截图清晰度、顺序，或点击“手动新增条目”录入；原截图仍保留，可删除后重传。');
      if (next.length) confirmation.notify('已经为你整理好候选提示词。请对照原截图检查中英文、标点和参数，再勾选确认入库。聊天截图不会成为正式例图；分享前请保护好提示词和 P 值。', '请先校对，再安心入库');
    } catch (error) {
      setMessage(`识别失败：${error instanceof Error ? error.message : '未知错误'}。可手动新增条目并对照截图录入。`);
    } finally {
      setBusy(false);
    }
  };
  const add = () => setRows((current) => [...current, {
    id: crypto.randomUUID(), screenshot: activeScreenshot, top: 0, confidence: 0,
    title: `提示词 ${current.length + 1}`, english: '', chinese: '', unconfirmed: '',
    note: '', include: false, saved: false,
  }]);
  const mergeNext = (index: number) => setRows((current) => {
    if (index >= current.length - 1) return current;
    const next = [...current];
    const second = next[index + 1];
    next[index] = {
      ...next[index],
      english: [next[index].english, second.english].filter(Boolean).join('\n'),
      chinese: [next[index].chinese, second.chinese].filter(Boolean).join('\n'),
      unconfirmed: [next[index].unconfirmed, second.unconfirmed].filter(Boolean).join('\n'),
      note: [next[index].note, second.note].filter(Boolean).join('\n'),
    };
    next.splice(index + 1, 1);
    return next;
  });
  const save = async () => {
    const selected = rows.filter((row) => row.include && !row.saved);
    if (!selected.length) { setMessage('请先勾选已校对的条目。'); return; }
    setBusy(true);
    let success = 0;
    let failed = 0;
    let skipped = 0;
    const savedTexts = new Set(known);
    const createdCollections = new Map<string, string>();
    try {
      let destination = collection;
      if (newCollection.trim()) {
        const match = collections.find((item) => item.name.trim() === newCollection.trim());
        destination = match?.id || prismId('prompt-collection');
        if (!match) await vault.saveRecord('collections:prompt', { id: destination, name: newCollection.trim() });
        setCollection(destination);
        setNewCollection('');
      }
      for (const row of selected) {
        const duplicate = savedTexts.has(promptKey(row));
        if (duplicate && !duplicates.has(row.id)) { skipped++; continue; }
        if (!row.title.trim() || !(row.english.trim() || row.chinese.trim() || row.unconfirmed.trim())) {
          failed++; continue;
        }
        let rowDestination = row.collectionId || destination;
        const ownCategory = row.newCollection?.trim();
        if (ownCategory) {
          const match = collections.find((item) => item.name.trim() === ownCategory);
          rowDestination = match?.id || createdCollections.get(ownCategory) || prismId('prompt-collection');
          if (!match && !createdCollections.has(ownCategory)) {
            await vault.saveRecord('collections:prompt', { id: rowDestination, name: ownCategory });
            createdCollections.set(ownCategory, rowDestination);
          }
        }
        const now = new Date().toISOString();
        const record: StoredLibraryAsset = {
          id: prismId('prompt'), kind: 'prompt', title: row.title.trim(),
          secret: row.english.trim() || row.chinese.trim() || row.unconfirmed.trim(),
          promptEnglish: row.english.trim(), promptChinese: row.chinese.trim(),
          promptUnconfirmed: row.unconfirmed.trim(), author: row.author?.trim() || author.trim() || '未记录',
          origin: row.origin?.trim() || origin.trim() || '聊天截图导入', acquisition: row.acquisition?.trim() || acquisition.trim() || '未记录',
          note: row.note.trim(), tags: (row.tags?.trim() || tags.trim()).split(/[,，、;；]/).map((item) => item.trim()).filter(Boolean), collection: rowDestination,
          customFields: [{ id: crypto.randomUUID(), label: '截图定位', value: `第 ${row.screenshot + 1} 张 / 约 ${Math.round(row.top)} px` }],
          createdAt: now, updatedAt: now,
        };
        try {
          await vault.saveRecord('assets:prompt', record);
          patch(row.id, { saved: true, include: false });
          setExisting((current) => [...current, record]);
          savedTexts.add(promptKey(row));
          success++;
        } catch { failed++; }
      }
      if (success) {
        onImported();
        window.dispatchEvent(new CustomEvent('prism:assets-changed'));
      }
      setMessage(`已保存 ${success} 条；跳过疑似重复 ${skipped} 条；未保存 ${failed} 条。请补充清晰例图，并删除设备上含私人提示词或 P 值的聊天截图；分享前再检查一次。`);
      if (success) confirmation.notify('提示词已安全保存在本机。记得补充清晰例图，并删除不再需要的聊天截图；发图或截图给别人之前，请再检查一下提示词和 P 值有没有露出。', '入库完成');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '保存失败，候选条目仍保留，可重试。');
    } finally { setBusy(false); }
  };
  return <>
    {confirmation.dialog}
    <Button disabled={vault.status !== 'unlocked'} onClick={() => setOpen(true)} variant="outline"><ScanText /> 从聊天截图导入</Button>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="screenshot-import-dialog">
        <DialogHeader><DialogTitle>从聊天截图导入提示词</DialogTitle></DialogHeader>
        <p>截图只在本机识别；不会保存为正式例图，也不会自动保存原聊天截图。请逐条核对英文、中文和说明。</p>
        <div className="screenshot-import-toolbar">
          <label className="mini-file"><ImagePlus /> 选择截图<input type="file" accept="image/*" multiple onChange={(event) => { const added = Array.from(event.target.files || []); setFiles((current) => [...current, ...added]); setRows([]); setMessage(`已加入 ${added.length} 张截图；可先删除或调整顺序，再开始本机识别。`); event.target.value = ''; }} /></label>
          <Button disabled={!files.length || busy} onClick={() => void recognize()}>{busy ? '正在处理…' : '本机识别'}</Button>
          <Button onClick={add} variant="outline">手动新增条目</Button>
          {!!files.length && <Button onClick={clearFiles} variant="outline" disabled={busy}>清空截图</Button>}
        </div>
        {!!files.length && <div className="screenshot-order" aria-label="截图顺序">{files.map((file, index) => <div key={`${file.name}-${index}`}><button type="button" onClick={() => setActiveScreenshot(index)}>{index + 1}. {file.name}</button><button disabled={index === 0 || busy} onClick={() => moveFile(index, -1)} type="button">上移</button><button disabled={index === files.length - 1 || busy} onClick={() => moveFile(index, 1)} type="button">下移</button><button disabled={busy} onClick={() => removeFile(index)} type="button">删除</button></div>)}</div>}
        {message && <output className="import-warning">{message}</output>}
        <div className="screenshot-import-grid">
          <div className="screenshot-preview"><strong>原截图 · 第 {activeScreenshot + 1} 张</strong>{urls[activeScreenshot] ? <img alt={`待校对的第 ${activeScreenshot + 1} 张聊天截图`} src={urls[activeScreenshot]} /> : <p>上传后在这里对照原图。</p>}</div>
          <div className="screenshot-drafts">
            <div className="screenshot-batch-fields"><label>目标分类<select value={collection} onChange={(event) => setCollection(event.target.value)}><option value="unfiled">未分类</option>{collections.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>或新建分类<input value={newCollection} onChange={(event) => setNewCollection(event.target.value)} placeholder="输入新分类名称" /></label><label>整批作者（可留空）<input value={author} onChange={(event) => setAuthor(event.target.value)} /></label><label>整批来源<input value={origin} onChange={(event) => setOrigin(event.target.value)} /></label><label>整批取得方式<input value={acquisition} onChange={(event) => setAcquisition(event.target.value)} /></label><label>整批标签（逗号分隔）<input value={tags} onChange={(event) => setTags(event.target.value)} /></label></div>
            {rows.map((row, index) => {
              const duplicate = known.has(promptKey(row));
              return <article className="screenshot-draft" key={row.id}>
                <div className="screenshot-draft-head"><label><input disabled={row.saved} type="checkbox" checked={row.include} onChange={(event) => patch(row.id, { include: event.target.checked })} />{row.saved ? '已保存' : '校对后保存此条'}</label><button onClick={() => setActiveScreenshot(row.screenshot)} type="button">第 {row.screenshot + 1} 张 · 约 {Math.round(row.top)} px</button><span>{Math.round(row.confidence)}% OCR 参考值</span></div>
                <label>名称<input value={row.title} onChange={(event) => patch(row.id, { title: event.target.value })} /></label>
                <div className="screenshot-row-category"><label>本条分类<select value={row.collectionId || ''} onChange={(event) => patch(row.id, { collectionId: event.target.value })}><option value="">使用上方批量分类</option><option value="unfiled">未分类</option>{collections.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>或为本条新建分类<input value={row.newCollection || ''} onChange={(event) => patch(row.id, { newCollection: event.target.value })} placeholder="留空则使用所选分类" /></label></div>
                <label>英文 Prompt<textarea aria-label="英文 Prompt" value={row.english} onChange={(event) => patch(row.id, { english: event.target.value })} spellCheck={false} /></label>
                <label>中文 Prompt<textarea aria-label="中文 Prompt" value={row.chinese} onChange={(event) => patch(row.id, { chinese: event.target.value })} /></label>
                <label>待确认原文<textarea aria-label="待确认原文" value={row.unconfirmed} onChange={(event) => patch(row.id, { unconfirmed: event.target.value })} /></label>
                <label>使用说明 / 普通备注（只填你确认属于此条的内容）<textarea value={row.note} onChange={(event) => patch(row.id, { note: event.target.value })} /></label>
                <details className="screenshot-row-details"><summary>本条作者、来源、取得方式与标签</summary><div className="screenshot-row-category"><label>作者<input value={row.author || ''} onChange={(event) => patch(row.id, { author: event.target.value })} placeholder="留空使用整批设置" /></label><label>来源<input value={row.origin || ''} onChange={(event) => patch(row.id, { origin: event.target.value })} placeholder="留空使用整批设置" /></label><label>取得方式<input value={row.acquisition || ''} onChange={(event) => patch(row.id, { acquisition: event.target.value })} placeholder="留空使用整批设置" /></label><label>标签<input value={row.tags || ''} onChange={(event) => patch(row.id, { tags: event.target.value })} placeholder="逗号分隔；留空使用整批设置" /></label></div></details>
                {duplicate && <label className="import-warning"><input type="checkbox" checked={duplicates.has(row.id)} onChange={(event) => setDuplicates((current) => { const next = new Set(current); if (event.target.checked) next.add(row.id); else next.delete(row.id); return next; })} />与现有词条的中英文和原文完全相同；确认仍要新增这一条</label>}
                <div className="screenshot-row-actions"><button type="button" onClick={() => mergeNext(index)} disabled={index === rows.length - 1 || row.saved}>合并下一条</button><button type="button" onClick={() => setRows((current) => [...current.slice(0, index + 1), { ...row, id: crypto.randomUUID(), title: `${row.title}（拆分）`, english: '', chinese: '', unconfirmed: '', note: '', include: false, saved: false }, ...current.slice(index + 1)])}>拆出新条目</button><button type="button" onClick={() => setRows((current) => current.filter((item) => item.id !== row.id))} disabled={row.saved}>移除候选</button></div>
              </article>;
            })}
          </div>
        </div>
        <div className="screenshot-import-footer"><span>仅勾选且校对过的条目入库；模糊小图不会成为例图。</span><Button disabled={busy || !rows.some((row) => row.include && !row.saved)} onClick={() => void save()}>保存已确认条目</Button></div>
      </DialogContent>
    </Dialog>
  </>;
}
