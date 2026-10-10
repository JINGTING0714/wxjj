'use client';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { SectionHead } from './studio-shared';
import { useFileUrls, useWorkspaceState } from './use-workspace-state';
import { ExampleImage } from './example-image';
import { enhancementPresets, type EnhancementSettings } from '@/lib/image-enhancement';
import { enhanceImage } from '@/lib/image-enhancement-client';
import { downloadBlob, downloadZip } from '@/lib/download';
import { useVault } from './vault-provider';
type Photo = { id: string; file: File; output?: File; width?: number; height?: number; applied?: EnhancementSettings; error?: string };
export function ImageEnhancementPanel() {
  const vault = useVault(), workspace = useWorkspaceState('image-enhancement',{ photos: [] as Photo[], settings: enhancementPresets.natural });
  const { state,setState } = workspace, [selected,setSelected] = useState(0), [busy,setBusy] = useState(false), [progress,setProgress] = useState(''), [error,setError] = useState(''), [showOriginal,setShowOriginal] = useState(false);
  const controller = useRef<AbortController | null>(null), task = useRef<Promise<void> | null>(null);
  const photo = state.photos[Math.min(selected,Math.max(0,state.photos.length - 1))], urls = useFileUrls(photo ? [photo.file,...(photo.output ? [photo.output] : [])] : []);
  useEffect(() => {
    const stop = () => controller.current?.abort(), checkpoint = (event: Event) => { stop(); if (task.current) (event as CustomEvent<Promise<unknown>[]>).detail.push(task.current.then(() => workspace.flush())); };
    window.addEventListener('prism:stop-processing',stop); window.addEventListener('prism:checkpoint',checkpoint);
    return () => { stop(); window.removeEventListener('prism:stop-processing',stop); window.removeEventListener('prism:checkpoint',checkpoint); };
  }, []);
  const run = (all: boolean) => {
    if (busy || !photo || !workspace.ready) return;
    const abort = new AbortController(), ids = all ? state.photos.map(item => item.id) : [photo.id], settings = { ...state.settings };
    controller.current = abort; setBusy(true); setError('');
    task.current = (async () => {
      try {
        for (let index = 0; index < ids.length; index++) {
          abort.signal.throwIfAborted(); const item = workspace.current.current.photos.find(photo => photo.id === ids[index]); if (!item) continue;
          try { const result = await enhanceImage(item.file,settings,abort.signal,value => setProgress(`第 ${index + 1} / ${ids.length} 张 · ${Math.round(value * 100)}%`));
            setState(current => ({ ...current, photos: current.photos.map(photo => photo.id === item.id ? { ...photo,output:result.file,width:result.width,height:result.height,applied:settings,error:'' } : photo) }));
            await workspace.flush();
          } catch (reason) { if (abort.signal.aborted) throw reason; const message = reason instanceof Error ? reason.message : '处理失败'; setState(current => ({ ...current,photos:current.photos.map(photo => photo.id === item.id ? { ...photo,error:message } : photo) })); }
        }
        setProgress('处理完成。可以对照原图，调整强度后重新处理。');
      } catch (reason) { setProgress(abort.signal.aborted ? '已取消，已完成的增强结果保留。' : '处理未全部完成。'); if (!abort.signal.aborted) setError(String(reason)); }
      finally { setBusy(false); controller.current = null; task.current = null; }
    })();
  };
  const outputs = state.photos.filter(photo => photo.output);
  return <div className="studio-page enhancement-page"><SectionHead eyebrow="LOCAL IMAGE CLARITY" number="14" title="画质增强" description="去灰雾、增强层次和边缘细节，保留人物结构与原始尺寸。增强结果另存为 PNG，可与原图对照。" />
    <div className="enhancement-import"><label className="mini-file">选择图片<input id="enhancement-images" type="file" accept="image/*" multiple disabled={busy || !workspace.ready || vault.busy} onChange={event => { const files = Array.from(event.target.files || []); if (files.length + state.photos.length > 50) { setError('每批最多 50 张，请减少选择。'); return; } setState(current => ({ ...current,photos:[...current.photos,...files.map(file => ({ id:crypto.randomUUID(),file }))] })); setError(''); event.target.value = ''; }} /></label><small>最多 50 张；可拖入预览区或粘贴图片。每张最多 2000 万像素。</small></div>
    {(error || workspace.saveError) && <p className="error-banner" role="alert">{error || workspace.saveError}</p>}
    <div className="enhancement-layout"><section className="enhancement-controls"><h2>先选择强度</h2><div className="enhancement-presets"><Button variant="outline" disabled={busy} onClick={() => setState(current => ({ ...current,settings:enhancementPresets.natural }))}>自然保真</Button><Button variant="outline" disabled={busy} onClick={() => setState(current => ({ ...current,settings:enhancementPresets.clear }))}>清晰增强</Button></div>{([['dehaze','去灰雾'],['clarity','局部层次'],['sharpen','细节锐化']] as const).map(([key,label]) => <label key={key}>{label} · {Math.round(state.settings[key] * 100)}%<input aria-label={label} type="range" min="0" max="1" step=".05" disabled={busy} value={state.settings[key]} onChange={event => setState(current => ({ ...current,settings:{ ...current.settings,[key]:Number(event.target.value) } }))} /></label>)}<p>淡色头发、衣服和高光会保持柔和。原图已经丢失的细节无法通过普通清晰度处理真实找回。</p><div className="enhancement-actions"><Button disabled={!photo || busy || !workspace.ready || vault.busy} onClick={() => run(false)}>增强当前图片</Button><Button variant="outline" disabled={!state.photos.length || busy || !workspace.ready || vault.busy} onClick={() => run(true)}>按当前强度处理全部</Button>{busy && <Button variant="outline" onClick={() => controller.current?.abort()}>取消处理</Button>}</div>{progress && <p role="status">{progress}</p>}</section>
    <section className="enhancement-preview" data-file-drop-target="enhancement-images" tabIndex={0}>{photo ? <><div className="enhancement-photo-bar"><select aria-label="当前图片" value={photo.id} onChange={event => setSelected(state.photos.findIndex(photo => photo.id === event.target.value))}>{state.photos.map((photo,index) => <option value={photo.id} key={photo.id}>{index + 1}. {photo.file.name}</option>)}</select><Button variant="outline" disabled={busy} onClick={() => { setState(current => ({ ...current,photos:current.photos.filter(item => item.id !== photo.id) })); setSelected(0); }}>移除当前图片</Button></div><div className="enhancement-comparison"><article><h3>原图</h3><ExampleImage src={urls[0]} alt={`原图 ${photo.file.name}`} /></article><article><h3>增强结果{photo.width ? ` · ${photo.width} × ${photo.height}` : ''}</h3>{photo.output ? <ExampleImage src={showOriginal ? urls[0] : urls[1]} alt={`增强结果 ${photo.file.name}`} /> : <p className="enhancement-empty">处理后在这里查看结果。点击图片可放大核对细节。</p>}</article></div>{photo.output && <div className="enhancement-actions"><Button variant="outline" onClick={() => setShowOriginal(value => !value)}>{showOriginal ? '切回增强结果' : '在结果位置对照原图'}</Button><Button onClick={() => downloadBlob(photo.output!,photo.output!.name)}>下载当前增强 PNG</Button></div>}{photo.error && <p className="error-banner">{photo.error}</p>}</> : <button className="enhancement-empty" onClick={() => document.getElementById('enhancement-images')?.click()}>点击选择图片，或拖入、粘贴到这里</button>}</section></div>
    {outputs.length > 1 && <Button disabled={busy} onClick={() => void downloadZip(outputs.map(photo => ({ name:photo.output!.name,blob:photo.output! })),'PRISM-清晰增强.zip')}>下载全部增强图片（{outputs.length}）</Button>}
  </div>;
}
