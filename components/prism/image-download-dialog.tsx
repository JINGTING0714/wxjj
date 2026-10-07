'use client';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { downloadArchiveZip, downloadBlob, registerImageDownloadHandler, safeDownloadName, type ImageDownloadRequest } from '@/lib/download';

type Job = ImageDownloadRequest & { resolve: () => void };
export function ImageDownloadDialog() {
  const [job, setJob] = useState<Job | null>(null), [mode, setMode] = useState<'choose'|'files'>('choose'), [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(''), [issued, setIssued] = useState<Set<number>>(new Set());
  const active = useRef<Job | null>(null), queue = useRef<Job[]>([]), cancel = useRef(false);
  const advance = () => { const next = queue.current.shift() || null; active.current = next; setJob(next); setMode('choose'); setStatus(''); setIssued(new Set()); };
  useEffect(() => {
    const cleanup = registerImageDownloadHandler(request => new Promise(resolve => { queue.current.push({ ...request, resolve }); if (!active.current) advance(); }));
    return () => { cleanup(); cancel.current = true; active.current?.resolve(); for (const request of queue.current) request.resolve(); };
  }, []);
  const close = () => { if (busy) return; active.current?.resolve(); advance(); };
  const mark = (index: number) => setIssued(current => new Set([...current, index]));
  const one = (index: number) => { if (!job) return; const item = job.items[index]; downloadBlob(item.blob, safeDownloadName(item.name), { retainMs: 600000 }); mark(index); setStatus('已发起原图下载，请在浏览器下载记录中确认。'); };
  const batch = async (chooseFolder: boolean) => {
    if (!job || busy) return;
    setMode('files'); setBusy(true); cancel.current = false;
    try {
      const picker = (window as Window & { showDirectoryPicker?: () => Promise<FileSystemDirectoryHandle> }).showDirectoryPicker;
      let directory: FileSystemDirectoryHandle | undefined;
      if (chooseFolder && picker && window.matchMedia('(min-width: 781px)').matches) {
        try { directory = await picker.call(window); }
        catch (reason) { if (reason instanceof DOMException && reason.name === 'AbortError') { setStatus('已取消选择文件夹，可以继续逐张下载。'); return; } }
      }
      for (let index = 0; index < job.items.length && !cancel.current; index++) {
        const item = job.items[index];
        if (directory) {
          const base = safeDownloadName(item.name); let name = base, suffix = 2;
          while (true) { try { await directory.getFileHandle(name); name = base.replace(/(\.[^.]+)?$/, `-${suffix++}$1`); } catch (reason) { if (reason instanceof DOMException && reason.name === 'NotFoundError') break; throw reason; } }
          const handle = await directory.getFileHandle(name, { create: true }), stream = await handle.createWritable();
          try { await item.blob.stream().pipeTo(stream); } catch (reason) { await stream.abort().catch(() => {}); throw reason; }
          mark(index); setStatus(`已保存 ${index + 1} / ${job.items.length} 张到所选文件夹。`);
        } else {
          downloadBlob(item.blob, safeDownloadName(item.name), { retainMs: 600000 }); mark(index);
          setStatus(`已发起 ${index + 1} / ${job.items.length} 张原图下载。请在下载记录中确认；缺少的图片可点下方按钮重新下载。`);
          if (index < job.items.length - 1) await new Promise(resolve => setTimeout(resolve, 650));
        }
      }
      job.resolve();
    } catch (reason) { setStatus(`下载未全部完成：${reason instanceof Error ? reason.message : '请重试'}。原图仍保留，可以逐张下载。`); }
    finally { setBusy(false); }
  };
  const zip = async () => {
    if (!job) return; setBusy(true); setStatus('正在整理 ZIP，图片格式和像素保持不变…');
    try { await downloadArchiveZip(job.items, job.archiveName); job.resolve(); setBusy(false); advance(); }
    catch (reason) { setStatus(`打包未完成：${reason instanceof Error ? reason.message : '请重试'}。也可以选择原图逐张下载。`); setBusy(false); }
  };
  return <Dialog open={!!job} onOpenChange={open => { if (!open) close(); }}><DialogContent className="image-download-dialog">
    <DialogHeader><DialogTitle>下载 {job?.items.length || 0} 张图片</DialogTitle></DialogHeader>
    <div className="image-download-body">
    <p>选择适合你的下载方式。两种方式都保留图片原始格式和像素。</p>
    {mode === 'choose' ? <div className="image-download-options"><Button disabled={busy} variant="outline" onClick={() => void zip()}>ZIP 打包下载</Button><Button disabled={busy} onClick={() => void batch(true)}>原图逐张下载</Button><small>ZIP 可一次下载后解压；直接下载适合手机，无需解压。电脑支持时可以选择保存文件夹。</small></div> : <>
      <p className="download-browser-hint">如果浏览器询问是否允许多个文件下载，请选择允许。部分手机浏览器会限制连续下载，你也可以点击每张图片单独下载。</p>
      <div className="image-download-files">{job?.items.map((item, index) => <div key={index}><span>{index + 1}. {item.name}</span><Button size="sm" variant="outline" disabled={busy} onClick={() => one(index)}>{issued.has(index) ? '再次下载这张' : '下载这张'}</Button></div>)}</div>
      <div className="image-download-actions">{busy ? <Button variant="outline" onClick={() => { cancel.current = true; }}>暂停连续下载</Button> : <Button variant="outline" onClick={() => void batch(false)}>再次逐张下载全部</Button>}</div>
    </>}
    {status && <p role="status" className="download-status">{status}</p>}</div><Button disabled={busy} variant="ghost" onClick={close}>{mode === 'choose' ? '取消' : '完成'}</Button>
  </DialogContent></Dialog>;
}
