'use client';

import { ArrowDown, ArrowRight, ArrowUp, Check, CircleAlert, Crop, Download, Grid3X3, Image as ImageIcon, Layers3, Library, Maximize2, Plus, RefreshCw, RotateCcw, RotateCw, ShieldCheck, Stamp, Trash2, Upload, WandSparkles, X } from 'lucide-react';
import { PointerEvent, useEffect, useRef, useState } from 'react';

import { SectionHead } from '@/components/prism/studio-shared';
import { useVault } from '@/components/prism/vault-provider';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Progress, ProgressLabel, ProgressValue } from '@/components/ui/progress';
import { downloadBlob, downloadZip } from '@/lib/download';
import { applyWatermarks, asFiles, type ProcessedImage, type WatermarkCrop, type WatermarkLayerInput } from '@/lib/image-processing';
import type { StoredWatermark, WatermarkAsset } from '@/lib/prism-types';
import { prismId } from '@/lib/prism-types';

type WatermarkLayerState = {
  id: string;
  libraryId?: string;
  file: File;
  url: string;
  opacity: number;
  x: number;
  y: number;
  scale: number;
  rotation: number;
  crop: WatermarkCrop;
};

function loadCanvasImage(source: Blob) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(source);
    const image = new Image();
    image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('预览图片无法读取')); };
    image.src = url;
  });
}

function drawLayer(context: CanvasRenderingContext2D, canvas: HTMLCanvasElement, image: HTMLImageElement, layer: WatermarkLayerState, selected: boolean) {
  const left = Math.max(0, Math.min(0.49, layer.crop.left));
  const right = Math.max(0, Math.min(0.49, layer.crop.right));
  const top = Math.max(0, Math.min(0.49, layer.crop.top));
  const bottom = Math.max(0, Math.min(0.49, layer.crop.bottom));
  const sourceX = image.naturalWidth * left;
  const sourceY = image.naturalHeight * top;
  const sourceWidth = image.naturalWidth * Math.max(0.02, 1 - left - right);
  const sourceHeight = image.naturalHeight * Math.max(0.02, 1 - top - bottom);
  const width = canvas.width * layer.scale;
  const height = width / (sourceWidth / sourceHeight);
  context.save();
  context.translate(canvas.width * layer.x, canvas.height * layer.y);
  context.rotate((layer.rotation * Math.PI) / 180);
  context.globalAlpha = layer.opacity;
  context.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, -width / 2, -height / 2, width, height);
  if (selected) {
    context.globalAlpha = 1;
    context.strokeStyle = '#b8ff3d';
    context.lineWidth = Math.max(2, canvas.width / 420);
    context.setLineDash([10, 7]);
    context.strokeRect(-width / 2, -height / 2, width, height);
    context.setLineDash([]);
    context.fillStyle = '#b8ff3d';
    for (const [x, y] of [[-width / 2, -height / 2], [width / 2, -height / 2], [-width / 2, height / 2], [width / 2, height / 2]]) {
      context.fillRect(x - 5, y - 5, 10, 10);
    }
  }
  context.restore();
}

function WatermarkStage({
  source,
  layers,
  activeLayerId,
  onMove,
}: {
  source?: File;
  layers: WatermarkLayerState[];
  activeLayerId?: string;
  onMove: (id: string, x: number, y: number) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragging = useRef(false);

  useEffect(() => {
    let cancelled = false;
    const render = async () => {
      const canvas = canvasRef.current;
      if (!canvas || !source) return;
      const base = await loadCanvasImage(source);
      if (cancelled) return;
      const edge = 1000;
      const ratio = base.naturalWidth / base.naturalHeight;
      canvas.width = ratio >= 1 ? edge : Math.round(edge * ratio);
      canvas.height = ratio >= 1 ? Math.round(edge / ratio) : edge;
      const context = canvas.getContext('2d');
      if (!context) return;
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(base, 0, 0, canvas.width, canvas.height);
      for (const layer of layers) {
        const image = await loadCanvasImage(layer.file);
        if (cancelled) return;
        drawLayer(context, canvas, image, layer, layer.id === activeLayerId);
      }
    };
    render().catch(() => undefined);
    return () => { cancelled = true; };
  }, [activeLayerId, layers, source]);

  const move = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!activeLayerId || (!dragging.current && event.type !== 'pointerdown')) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = Math.max(-0.5, Math.min(1.5, (event.clientX - rect.left) / rect.width));
    const y = Math.max(-0.5, Math.min(1.5, (event.clientY - rect.top) / rect.height));
    onMove(activeLayerId, x, y);
  };

  if (!source) return <div className="watermark-stage-empty"><ImageIcon /><strong>先上传原图批次</strong><span>第一张图会成为本批水印排版样本。</span></div>;
  return <canvas aria-label="水印样本编辑画布。拖动可移动当前水印层。" onPointerDown={(event) => { dragging.current = true; event.currentTarget.setPointerCapture(event.pointerId); move(event); }} onPointerMove={move} onPointerUp={() => { dragging.current = false; }} ref={canvasRef} />;
}

export function WatermarkPanel({ onOpenCollage }: { onOpenCollage: () => void }) {
  const vault = useVault();
  const [sourceFiles, setSourceFiles] = useState<File[]>([]);
  const [layers, setLayers] = useState<WatermarkLayerState[]>([]);
  const [activeLayerId, setActiveLayerId] = useState<string>();
  const [savedWatermarks, setSavedWatermarks] = useState<WatermarkAsset[]>([]);
  const [libraryDialog, setLibraryDialog] = useState(false);
  const [outputs, setOutputs] = useState<ProcessedImage[]>([]);
  const [rejected, setRejected] = useState<Set<string>>(new Set());
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    if (vault.status !== 'unlocked') { setSavedWatermarks([]); return; }
    vault.loadRecords<StoredWatermark>('watermarks').then(async (records) => {
      const hydrated = (await Promise.all(records.map(async (record) => {
        const blobs = await vault.loadBlobs(`watermark-file:${record.id}`);
        const entry = record.blobId ? blobs.find((blob) => blob.id === record.blobId) || blobs[0] : blobs[0];
        if (!entry) return null;
        const file = new File([entry.blob], record.fileName || entry.name, { type: entry.blob.type });
        return { ...record, tags: record.tags || [], customFields: record.customFields || [], file, url: URL.createObjectURL(entry.blob) } satisfies WatermarkAsset;
      }))).filter(Boolean) as WatermarkAsset[];
      setSavedWatermarks(hydrated);
    }).catch((reason) => setError(reason instanceof Error ? reason.message : '水印库读取失败'));
  }, [vault.status, refreshTick]);

  useEffect(() => {
    const refresh = () => setRefreshTick((value) => value + 1);
    window.addEventListener('prism:watermarks-changed', refresh);
    return () => window.removeEventListener('prism:watermarks-changed', refresh);
  }, []);

  const chooseSources = (files: FileList | null) => {
    if (!files) return;
    const selected = Array.from(files).slice(0, 200);
    setSourceFiles(selected);
    setOutputs([]);
    setRejected(new Set());
    setError(files.length > 200 ? '单批最多 200 张，已自动保留前 200 张。' : '');
  };

  const makeLayer = (file: File, libraryId?: string): WatermarkLayerState => ({
    id: prismId('layer'), libraryId, file, url: URL.createObjectURL(file), opacity: 1,
    x: 0.5, y: 0.5, scale: 0.55, rotation: 0,
    crop: { top: 0, right: 0, bottom: 0, left: 0 },
  });

  const appendLayer = (layer: WatermarkLayerState) => {
    setLayers((current) => [...current, layer]);
    setActiveLayerId(layer.id);
  };

  const addLayer = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    const layer = makeLayer(file);
    appendLayer(layer);
    if (vault.status === 'unlocked') {
      try {
        const id = prismId('watermark');
        const blobId = await vault.saveBlob(`watermark-file:${id}`, file, file.name);
        const now = new Date().toISOString();
        const record: StoredWatermark = { id, title: file.name.replace(/\.[^.]+$/, ''), collection: 'unfiled', author: '未记录', origin: '水印工坊自动归档', acquisition: '自制', note: '从水印工坊上传，等待补充信息。', tags: ['工坊上传'], customFields: [], fileName: file.name, blobId, createdAt: now, updatedAt: now };
        await vault.saveRecord('watermarks', record);
        setLayers((current) => current.map((item) => item.id === layer.id ? { ...item, libraryId: id } : item));
        window.dispatchEvent(new CustomEvent('prism:watermarks-changed'));
      } catch (reason) {
        setError(reason instanceof Error ? `水印层已加入，但自动归档失败：${reason.message}` : '水印层已加入，但自动归档失败');
      }
    }
  };

  const addFromLibrary = (watermark: WatermarkAsset) => {
    appendLayer(makeLayer(watermark.file, watermark.id));
    setLibraryDialog(false);
  };

  const updateLayer = (id: string, patch: Partial<WatermarkLayerState>) => setLayers((current) => current.map((layer) => layer.id === id ? { ...layer, ...patch } : layer));
  const updateCrop = (id: string, edge: keyof WatermarkCrop, value: number) => setLayers((current) => current.map((layer) => {
    if (layer.id !== id) return layer;
    const crop = { ...layer.crop, [edge]: Math.max(0, Math.min(0.49, value)) };
    if (crop.left + crop.right > 0.96) crop[edge] = 0.96 - crop[edge === 'left' ? 'right' : edge === 'right' ? 'left' : edge];
    if (crop.top + crop.bottom > 0.96) crop[edge] = 0.96 - crop[edge === 'top' ? 'bottom' : edge === 'bottom' ? 'top' : edge];
    return { ...layer, crop };
  }));
  const moveLayer = (index: number, direction: -1 | 1) => setLayers((current) => {
    const target = index + direction;
    if (target < 0 || target >= current.length) return current;
    const next = [...current];
    [next[index], next[target]] = [next[target], next[index]];
    return next;
  });

  const run = async (onlyFiles = sourceFiles) => {
    if (!onlyFiles.length || !layers.length || processing) return;
    setProcessing(true);
    setError('');
    setProgress(0);
    const fullRun = onlyFiles === sourceFiles;
    if (fullRun) { outputs.forEach((output) => URL.revokeObjectURL(output.url)); setOutputs([]); }
    try {
      const layerInput: WatermarkLayerInput[] = layers.map(({ file, opacity, x, y, scale, rotation, crop }) => ({ file, opacity, x, y, scale, rotation, crop }));
      await applyWatermarks(onlyFiles, layerInput, (done, total) => setProgress(Math.round((done / total) * 100)), (item) => setOutputs((current) => fullRun ? [...current, item] : [...current.filter((output) => output.sourceName !== item.sourceName), item]));
      setRejected(new Set());
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '水印处理失败');
    } finally {
      setProcessing(false);
    }
  };

  const activeLayer = layers.find((layer) => layer.id === activeLayerId);
  const rerunRejected = () => {
    const names = new Set(outputs.filter((output) => rejected.has(output.id)).map((output) => output.sourceName));
    run(sourceFiles.filter((file) => names.has(file.name)));
  };
  const sendQualified = () => {
    const accepted = outputs.filter((output) => !rejected.has(output.id));
    window.dispatchEvent(new CustomEvent('prism:send-to-collage', { detail: asFiles(accepted) }));
    onOpenCollage();
  };
  const deleteOutput = (id: string) => {
    const target = outputs.find((output) => output.id === id);
    if (target) URL.revokeObjectURL(target.url);
    setOutputs((current) => current.filter((output) => output.id !== id));
    setRejected((current) => { const next = new Set(current); next.delete(id); return next; });
  };

  return (
    <div className="studio-page pipeline-page">
      <SectionHead eyebrow="WATERMARK PIPELINE" number="07" title="水印工坊" description="以第一张原图为样本，自由拖动、裁切、缩放和旋转每一层；确认一次，整批复用。" />
      <div className="pipeline-steps"><div className={sourceFiles.length ? 'is-done' : 'is-current'}><i>01</i><span>上传原图</span><small>最多 200 张</small></div><ArrowRight /><div className={layers.length ? 'is-done' : sourceFiles.length ? 'is-current' : ''}><i>02</i><span>自由排版</span><small>第一张图作样本</small></div><ArrowRight /><div className={processing ? 'is-current' : outputs.length ? 'is-done' : ''}><i>03</i><span>检查与分流</span><small>合格 / 重打 / 删除</small></div></div>

      <div className="watermark-editor-layout">
        <section className="watermark-sample-panel"><div className="panel-heading"><div><p className="eyebrow">BATCH SAMPLE / 01</p><h2>本批水印样本</h2></div><Badge variant="outline">{sourceFiles.length} / 200</Badge></div><label className="large-drop compact-drop"><Upload /><strong>{sourceFiles.length ? `第一张样本：${sourceFiles[0].name}` : '选择原图批次'}</strong><span>整批图片会复用同一套归一化水印位置和样式</span><input accept="image/*" multiple onChange={(event) => chooseSources(event.target.files)} type="file" /></label><div className="watermark-stage"><WatermarkStage activeLayerId={activeLayerId} layers={layers} onMove={(id, x, y) => updateLayer(id, { x, y })} source={sourceFiles[0]} /></div><p className="stage-tip"><WandSparkles /> 选择一层后，直接在样本图上拖动它。画布外位置也可通过 X/Y 数值继续调整。</p></section>

        <section className="watermark-layer-panel"><div className="panel-heading"><div><p className="eyebrow">LAYERS / 02</p><h2>水印层与变换</h2></div><div className="layer-source-actions"><Button disabled={vault.status !== 'unlocked' || !savedWatermarks.length} onClick={() => setLibraryDialog(true)} size="sm" variant="outline"><Library /> 从库选择</Button><label className="mini-file"><Plus /> 上传新水印<input accept="image/*" onChange={(event) => addLayer(event.target.files)} type="file" /></label></div></div>
          {layers.length === 0 ? <div className="layer-empty"><Layers3 /><p>还没有水印层</p><span>上传的新水印会自动进入水印库。</span></div> : <div className="transform-layer-list">{layers.map((layer, index) => <article className={activeLayerId === layer.id ? 'is-active' : ''} key={layer.id}><button className="layer-select" onClick={() => setActiveLayerId(layer.id)} type="button"><span className="layer-thumb"><img alt={layer.file.name} src={layer.url} /><i>{String(index + 1).padStart(2, '0')}</i></span><span><strong>{layer.file.name}</strong><small>位置 {Math.round(layer.x * 100)}%, {Math.round(layer.y * 100)}% · 旋转 {Math.round(layer.rotation)}°</small></span></button><span className="layer-order-actions"><button aria-label="上移一层" disabled={index === 0} onClick={() => moveLayer(index, -1)} type="button"><ArrowUp /></button><button aria-label="下移一层" disabled={index === layers.length - 1} onClick={() => moveLayer(index, 1)} type="button"><ArrowDown /></button><button aria-label="删除水印层" onClick={() => { setLayers((current) => current.filter((item) => item.id !== layer.id)); if (activeLayerId === layer.id) setActiveLayerId(undefined); }} type="button"><X /></button></span></article>)}</div>}

          {activeLayer && <div className="transform-controls"><div className="transform-heading"><div><Crop /><span><strong>当前层变换</strong><small>所有数值只需为本批设置一次</small></span></div><Button onClick={() => updateLayer(activeLayer.id, { opacity: 1, x: 0.5, y: 0.5, scale: 0.55, rotation: 0, crop: { top: 0, right: 0, bottom: 0, left: 0 } })} size="sm" variant="ghost"><RefreshCw /> 重置</Button></div><div className="transform-grid"><label><span>水平位置 X · {Math.round(activeLayer.x * 100)}%</span><input max="1.5" min="-0.5" onChange={(event) => updateLayer(activeLayer.id, { x: Number(event.target.value) })} step="0.01" type="range" value={activeLayer.x} /></label><label><span>垂直位置 Y · {Math.round(activeLayer.y * 100)}%</span><input max="1.5" min="-0.5" onChange={(event) => updateLayer(activeLayer.id, { y: Number(event.target.value) })} step="0.01" type="range" value={activeLayer.y} /></label><label><span>缩放 · {Math.round(activeLayer.scale * 100)}%</span><input max="3" min="0.01" onChange={(event) => updateLayer(activeLayer.id, { scale: Number(event.target.value) })} step="0.01" type="range" value={activeLayer.scale} /></label><label><span>透明度 · {Math.round(activeLayer.opacity * 100)}%</span><input max="1" min="0" onChange={(event) => updateLayer(activeLayer.id, { opacity: Number(event.target.value) })} step="0.01" type="range" value={activeLayer.opacity} /></label><label className="rotation-control"><span>旋转 · {Math.round(activeLayer.rotation)}°</span><div><button aria-label="逆时针旋转 90 度" onClick={() => updateLayer(activeLayer.id, { rotation: activeLayer.rotation - 90 })} type="button"><RotateCcw /></button><input max="180" min="-180" onChange={(event) => updateLayer(activeLayer.id, { rotation: Number(event.target.value) })} step="1" type="range" value={activeLayer.rotation} /><button aria-label="顺时针旋转 90 度" onClick={() => updateLayer(activeLayer.id, { rotation: activeLayer.rotation + 90 })} type="button"><RotateCw /></button></div></label><fieldset className="crop-controls"><legend>自由裁切</legend>{(['top', 'right', 'bottom', 'left'] as const).map((edge) => <label key={edge}><span>{{ top: '上', right: '右', bottom: '下', left: '左' }[edge]}裁切 · {Math.round(activeLayer.crop[edge] * 100)}%</span><input max="0.49" min="0" onChange={(event) => updateCrop(activeLayer.id, edge, Number(event.target.value))} step="0.01" type="range" value={activeLayer.crop[edge]} /></label>)}</fieldset></div></div>}
          <div className="position-note"><CircleAlert /><p><strong>不再区分全屏或非全屏。</strong>每一层都使用完全相同的自由变换系统，最终按第一张样本的比例映射到本批所有图片。</p></div>
        </section>
      </div>

      <section className="run-bar"><div><WandSparkles /><p><strong>{processing ? '正在本机逐张合并…' : '样本确认后即可启动'}</strong><span>页面内切换到拼图区不会中断当前队列。</span></p></div>{processing ? <Progress className="run-progress" value={progress}><ProgressLabel>处理中</ProgressLabel><ProgressValue>{() => `${progress}%`}</ProgressValue></Progress> : <Button disabled={!sourceFiles.length || !layers.length} onClick={() => run()}><Stamp /> 按样本处理整批</Button>}</section>
      {error && <p className="error-banner"><CircleAlert /> {error}</p>}
      {(outputs.length > 0 || processing) && <section className="result-zone"><div className="result-head"><div><p className="eyebrow">WAITING AREA / 03</p><h2>等待检查</h2></div><div><Badge className="success-badge">{outputs.length - rejected.size} 合格</Badge><Badge variant="destructive">{rejected.size} 待重打</Badge></div></div><div className="result-grid">{outputs.map((output, index) => { const bad = rejected.has(output.id); return <article className={bad ? 'is-rejected' : ''} key={output.id}><a href={output.url} rel="noreferrer" target="_blank"><img alt={output.name} src={output.url} /><Maximize2 /></a><div><span>{String(index + 1).padStart(3, '0')}</span><p>{output.name}</p><button onClick={() => setRejected((current) => { const next = new Set(current); if (bad) next.delete(output.id); else next.add(output.id); return next; })} type="button">{bad ? <RefreshCw /> : <Check />} {bad ? '取消重打' : '标记不合格'}</button><button onClick={() => downloadBlob(output.blob, output.name)} type="button"><Download /> 下载</button><button onClick={() => deleteOutput(output.id)} type="button"><Trash2 /> 删除</button></div></article>; })}</div><div className="result-actions"><Button disabled={!outputs.length} onClick={() => downloadZip(outputs.map((output) => ({ name: output.name, blob: output.blob })), 'PRISM-水印成品.zip')} variant="outline"><Download /> 下载等待区全部</Button><Button disabled={!rejected.size || processing} onClick={rerunRejected} variant="outline"><RefreshCw /> 重打已选 {rejected.size} 张</Button><Button disabled={!outputs.length || outputs.length === rejected.size} onClick={sendQualified}><Grid3X3 /> 合格图片送往拼图区</Button></div></section>}

      <Dialog onOpenChange={setLibraryDialog} open={libraryDialog}><DialogContent className="watermark-picker-dialog"><DialogHeader><DialogTitle>从水印库选择</DialogTitle><DialogDescription>选择后会成为新的一层，并立即进入样本编辑画布。</DialogDescription></DialogHeader><div className="watermark-picker-grid">{savedWatermarks.map((watermark) => <button key={watermark.id} onClick={() => addFromLibrary(watermark)} type="button"><span><img alt={watermark.title} src={watermark.url} /></span><strong>{watermark.title}</strong><small>{watermark.author}</small></button>)}</div>{!savedWatermarks.length && <div className="empty-state"><ImageIcon /><h3>水印库为空</h3></div>}<DialogFooter><Button onClick={() => setLibraryDialog(false)} variant="ghost">取消</Button></DialogFooter></DialogContent></Dialog>
      <p className="workshop-privacy-note"><ShieldCheck /> 水印、原图、变换参数和输出都只在本机处理，不上传到 PRISM 服务器。</p>
    </div>
  );
}
