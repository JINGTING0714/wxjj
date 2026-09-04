'use client';

import { CircleAlert, Download, Grid3X3, Image as ImageIcon, Plus, ShieldCheck, Trash2, Upload, WandSparkles, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { SectionHead } from '@/components/prism/studio-shared';
import { useVault } from '@/components/prism/vault-provider';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress, ProgressLabel, ProgressValue } from '@/components/ui/progress';
import { downloadBlob, downloadZip } from '@/lib/download';
import { createCollages, type NumberPosition, type ProcessedImage } from '@/lib/image-processing';
import type { GalleryImageMeta } from '@/lib/prism-types';

const ratioPresets = [{ label: '9:16', w: 9, h: 16 }, { label: '16:9', w: 16, h: 9 }, { label: '3:4', w: 3, h: 4 }, { label: '1:1', w: 1, h: 1 }];
const gridPresets = [{ label: '四宫格', columns: 2, rows: 2 }, { label: '九宫格', columns: 3, rows: 3 }, { label: '16 宫格', columns: 4, rows: 4 }, { label: '25 宫格', columns: 5, rows: 5 }];
const numberPositions: Array<{ value: NumberPosition; label: string }> = [
  { value: 'top-left', label: '左上' }, { value: 'top', label: '上方居中' }, { value: 'top-right', label: '右上' },
  { value: 'left', label: '左侧居中' }, { value: 'center', label: '正中央' }, { value: 'right', label: '右侧居中' },
  { value: 'bottom-left', label: '左下' }, { value: 'bottom', label: '下方居中' }, { value: 'bottom-right', label: '右下' },
];

export function CollagePanel() {
  const vault = useVault();
  const [files, setFiles] = useState<File[]>([]);
  const [ratio, setRatio] = useState(ratioPresets[0]);
  const [grid, setGrid] = useState(gridPresets[1]);
  const [customRatio, setCustomRatio] = useState(false);
  const [customGrid, setCustomGrid] = useState(false);
  const [ratioWidth, setRatioWidth] = useState(1080);
  const [ratioHeight, setRatioHeight] = useState(1920);
  const [gridColumns, setGridColumns] = useState(5);
  const [gridRows, setGridRows] = useState(5);
  const [numberImages, setNumberImages] = useState(true);
  const [startNumber, setStartNumber] = useState(1);
  const [numberPosition, setNumberPosition] = useState<NumberPosition>('bottom-left');
  const [numberSize, setNumberSize] = useState(0.095);
  const [numberColor, setNumberColor] = useState('#f6f2fb');
  const [numberBackground, setNumberBackground] = useState('#130e18');
  const [numberBackgroundOpacity, setNumberBackgroundOpacity] = useState(0.76);
  const [numberShape, setNumberShape] = useState<'none' | 'square' | 'pill'>('square');
  const [numberWeight, setNumberWeight] = useState<400 | 600 | 800>(600);
  const [numberDigits, setNumberDigits] = useState(3);
  const [format, setFormat] = useState<'image/png' | 'image/jpeg'>('image/jpeg');
  const [outputs, setOutputs] = useState<ProcessedImage[]>([]);
  const [processing, setProcessing] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');

  const today = new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'numeric', day: 'numeric' }).format(new Date()).replaceAll('/', '.');
  const collectionId = `collage-${today.replaceAll('.', '-')}`;
  const activeRatio = customRatio ? { label: `${Math.max(320, ratioWidth)}×${Math.max(320, ratioHeight)}`, w: Math.max(320, ratioWidth), h: Math.max(320, ratioHeight) } : ratio;
  const activeGrid = customGrid ? { label: '自定义', columns: Math.max(1, Math.min(20, gridColumns)), rows: Math.max(1, Math.min(20, gridRows)) } : grid;

  useEffect(() => {
    const receive = (event: Event) => {
      const detail = (event as CustomEvent<File[]>).detail || [];
      setFiles((current) => [...current, ...detail].slice(0, 1000));
    };
    window.addEventListener('prism:send-to-collage', receive);
    return () => window.removeEventListener('prism:send-to-collage', receive);
  }, []);

  useEffect(() => {
    if (vault.status !== 'unlocked') {
      setOutputs([]);
      return;
    }
    vault.loadBlobs(`gallery:${collectionId}`).then((blobs) => setOutputs(blobs.map((entry) => ({ id: entry.id, name: entry.name, sourceName: '今日拼图', blob: entry.blob, url: URL.createObjectURL(entry.blob) })))).catch((reason) => setError(reason instanceof Error ? reason.message : '当日拼图读取失败'));
  }, [vault.status]);

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    setFiles((current) => [...current, ...Array.from(list)].slice(0, 1000));
    if (files.length + list.length > 1000) setError('单批最多 1000 张，已自动保留前 1000 张。'); else setError('');
  };
  const removeSource = (index: number) => setFiles((current) => current.filter((_, itemIndex) => itemIndex !== index));
  const boardCount = files.length ? Math.ceil(files.length / (activeGrid.columns * activeGrid.rows)) : 0;

  const generate = async () => {
    if (!files.length || processing) return;
    setProcessing(true);
    setProgress(0);
    setError('');
    try {
      const results = await createCollages(files, {
        ratioWidth: activeRatio.w,
        ratioHeight: activeRatio.h,
        columns: activeGrid.columns,
        rows: activeGrid.rows,
        numberImages,
        startNumber,
        numberPosition,
        numberSize,
        numberColor,
        numberBackground,
        numberBackgroundOpacity,
        numberShape,
        numberWeight,
        numberDigits,
        canvasWidth: customRatio ? activeRatio.w : undefined,
        canvasHeight: customRatio ? activeRatio.h : undefined,
        format,
      }, (done, total) => setProgress(Math.round((done / total) * 100)));
      setOutputs((current) => [...results, ...current]);
      if (vault.status === 'unlocked') {
        await vault.saveRecord('gallery-collections', { id: collectionId, name: `${today} 拼图` });
        for (const result of results) {
          await vault.saveBlob(`gallery:${collectionId}`, result.blob, result.name, result.id);
          const now = new Date().toISOString();
          const meta: GalleryImageMeta = { id: result.id, name: result.name, collection: collectionId, note: `由 ${files.length} 张源图按 ${activeGrid.columns}×${activeGrid.rows} 自动生成`, tags: ['PRISM 拼图', activeRatio.label], createdAt: now, updatedAt: now };
          await vault.saveRecord('gallery-image-meta', meta);
        }
        window.dispatchEvent(new CustomEvent('prism:gallery-refresh'));
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '拼图处理失败');
    } finally {
      setProcessing(false);
    }
  };

  const deleteOutput = async (output: ProcessedImage) => {
    if (!window.confirm(`删除拼图“${output.name}”吗？`)) return;
    if (vault.status === 'unlocked') {
      await vault.deleteBlob(output.id).catch(() => undefined);
      await vault.deleteRecord(output.id).catch(() => undefined);
      window.dispatchEvent(new CustomEvent('prism:gallery-refresh'));
    }
    URL.revokeObjectURL(output.url);
    setOutputs((current) => current.filter((item) => item.id !== output.id));
  };

  const downloadAll = async () => {
    if (!outputs.length || downloading) return;
    setDownloading(true);
    try {
      await downloadZip(outputs.map((output) => ({ name: output.name, blob: output.blob })), `${today}-PRISM-拼图.zip`);
    } finally {
      setDownloading(false);
    }
  };

  const previewCells = useMemo(() => Math.min(activeGrid.columns * activeGrid.rows, 25), [activeGrid.columns, activeGrid.rows]);
  const previewPositionClass = `number-${numberPosition}`;

  return (
    <div className="studio-page collage-page">
      <SectionHead eyebrow="COLLAGE ENGINE" number="08" title="拼图工坊" description="最多 1000 张批量分板；尺寸、宫格、编号位置与视觉样式全部开放给你。" />
      <div className="collage-layout">
        <section className="collage-controls">
          <div className="control-section"><div className="control-title"><span>01</span><div><p className="eyebrow">SOURCE IMAGES</p><h2>选择图片</h2></div><Badge variant="outline">{files.length} / 1000</Badge></div><label className="collage-drop"><Upload /><strong>{files.length ? `已进入队列 ${files.length} 张` : '批量上传或从水印区/图库送入'}</strong><span>未占满的最后一板只保留实际图片，空格不会编号</span><input accept="image/*" multiple onChange={(event) => addFiles(event.target.files)} type="file" /></label>{files.length > 0 && <><div className="source-file-list">{files.slice(0, 12).map((file, index) => <span key={`${file.name}-${file.lastModified}-${index}`}>{file.name}<button aria-label={`移除 ${file.name}`} onClick={() => removeSource(index)} type="button"><X /></button></span>)}{files.length > 12 && <b>+{files.length - 12}</b>}</div><button className="clear-files" onClick={() => setFiles([])} type="button"><Trash2 /> 清空这一批</button></>}</div>
          <div className="control-section"><div className="control-title"><span>02</span><div><p className="eyebrow">CANVAS SIZE</p><h2>拼图尺寸</h2></div></div><div className="preset-grid ratio-grid">{ratioPresets.map((item) => <button className={!customRatio && ratio.label === item.label ? 'is-active' : ''} key={item.label} onClick={() => { setRatio(item); setCustomRatio(false); }} type="button"><i style={{ aspectRatio: `${item.w}/${item.h}` }} /><span>{item.label}</span></button>)}<button className={customRatio ? 'is-active' : ''} onClick={() => setCustomRatio(true)} type="button"><i className="custom-ratio-icon" /><span>自定义像素</span></button></div>{customRatio && <div className="custom-fields custom-pixel-fields"><label><span>画布宽 px</span><Input max="8000" min="320" onChange={(event) => setRatioWidth(Number(event.target.value))} type="number" value={ratioWidth} /></label><b>×</b><label><span>画布高 px</span><Input max="8000" min="320" onChange={(event) => setRatioHeight(Number(event.target.value))} type="number" value={ratioHeight} /></label><small>生成文件会严格使用这个像素尺寸。</small></div>}</div>
          <div className="control-section"><div className="control-title"><span>03</span><div><p className="eyebrow">GRID SYSTEM</p><h2>宫格数量</h2></div></div><div className="grid-preset-row">{gridPresets.map((item) => <button className={!customGrid && grid.label === item.label ? 'is-active' : ''} key={item.label} onClick={() => { setGrid(item); setCustomGrid(false); }} type="button"><Grid3X3 /><span>{item.label}</span></button>)}<button className={customGrid ? 'is-active' : ''} onClick={() => setCustomGrid(true)} type="button"><Plus /><span>自定义</span></button></div>{customGrid && <div className="custom-fields"><label><span>列数</span><Input max="20" min="1" onChange={(event) => setGridColumns(Number(event.target.value))} type="number" value={gridColumns} /></label><b>×</b><label><span>行数</span><Input max="20" min="1" onChange={(event) => setGridRows(Number(event.target.value))} type="number" value={gridRows} /></label></div>}</div>
          <div className="control-section numbering-section"><div className="control-title"><span>04</span><div><p className="eyebrow">NUMBERING</p><h2>编号与输出</h2></div><button aria-pressed={numberImages} className={`switch-control ${numberImages ? 'is-on' : ''}`} onClick={() => setNumberImages((value) => !value)} type="button"><i /></button></div><div className="number-style-grid"><label><span>起始序号</span><Input disabled={!numberImages} min="0" onChange={(event) => setStartNumber(Number(event.target.value))} type="number" value={startNumber} /></label><label><span>编号位置</span><select disabled={!numberImages} onChange={(event) => setNumberPosition(event.target.value as NumberPosition)} value={numberPosition}>{numberPositions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label><label><span>编号大小 · {Math.round(numberSize * 100)}%</span><input disabled={!numberImages} max="0.4" min="0.03" onChange={(event) => setNumberSize(Number(event.target.value))} step="0.005" type="range" value={numberSize} /></label><label><span>字重</span><select disabled={!numberImages} onChange={(event) => setNumberWeight(Number(event.target.value) as 400 | 600 | 800)} value={numberWeight}><option value="400">常规</option><option value="600">半粗</option><option value="800">粗体</option></select></label><label><span>补零位数</span><select disabled={!numberImages} onChange={(event) => setNumberDigits(Number(event.target.value))} value={numberDigits}><option value="0">不补零</option><option value="2">2 位</option><option value="3">3 位</option><option value="4">4 位</option><option value="5">5 位</option></select></label><label><span>底板形状</span><select disabled={!numberImages} onChange={(event) => setNumberShape(event.target.value as 'none' | 'square' | 'pill')} value={numberShape}><option value="none">无底板</option><option value="square">直角底板</option><option value="pill">圆角胶囊</option></select></label><label><span>文字颜色</span><input disabled={!numberImages} onChange={(event) => setNumberColor(event.target.value)} type="color" value={numberColor} /></label><label><span>底板颜色</span><input disabled={!numberImages || numberShape === 'none'} onChange={(event) => setNumberBackground(event.target.value)} type="color" value={numberBackground} /></label><label><span>底板透明度 · {Math.round(numberBackgroundOpacity * 100)}%</span><input disabled={!numberImages || numberShape === 'none'} max="1" min="0" onChange={(event) => setNumberBackgroundOpacity(Number(event.target.value))} step="0.01" type="range" value={numberBackgroundOpacity} /></label><label><span>输出格式</span><select onChange={(event) => setFormat(event.target.value as 'image/png' | 'image/jpeg')} value={format}><option value="image/jpeg">JPG · 较小</option><option value="image/png">PNG · 无损</option></select></label></div><p><CircleAlert /> 编号样式会实时反映在右侧预览；生成时按每个格子的实际尺寸精确计算。</p></div>
        </section>
        <aside className="collage-preview"><div className="preview-sticky"><div className="preview-heading"><p className="eyebrow">LIVE SPEC</p><span>{activeRatio.label}</span></div><div className="board-preview" style={{ aspectRatio: `${activeRatio.w}/${activeRatio.h}`, gridTemplateColumns: `repeat(${Math.min(activeGrid.columns, 5)}, 1fr)` }}>{Array.from({ length: previewCells }, (_, index) => <i className={index < Math.min(files.length || 7, 25) ? `cell-${(index % 3) + 1}` : ''} key={index}>{numberImages && index < Math.min(files.length || 7, 25) && <span className={`${previewPositionClass} shape-${numberShape}`} style={{ backgroundColor: numberShape === 'none' ? 'transparent' : `${numberBackground}${Math.round(numberBackgroundOpacity * 255).toString(16).padStart(2, '0')}`, color: numberColor, fontSize: `${Math.max(5, numberSize * 90)}px`, fontWeight: numberWeight }}>{String(startNumber + index).padStart(numberDigits, '0')}</span>}</i>)}</div><div className="spec-list"><div><span>单板容量</span><strong>{activeGrid.columns * activeGrid.rows} 张</strong></div><div><span>预计生成</span><strong>{boardCount} 张拼图</strong></div><div><span>今日已收纳</span><strong>{outputs.length} 张</strong></div><div><span>自动图库</span><strong>{vault.status === 'unlocked' ? `${today} 拼图` : '解锁后启用'}</strong></div></div>{processing ? <Progress className="collage-progress" value={progress}><ProgressLabel>正在拼贴</ProgressLabel><ProgressValue>{() => `${progress}%`}</ProgressValue></Progress> : <Button className="generate-button" disabled={!files.length} onClick={generate}><WandSparkles /> 开始批量拼图</Button>}<p className="local-note"><ShieldCheck /> 全程在本机处理，不上传原图。</p></div></aside>
      </div>
      {error && <p className="error-banner"><CircleAlert /> {error}</p>}
      {outputs.length > 0 && <section className="collage-results"><div className="result-head"><div><p className="eyebrow">GENERATED TODAY</p><h2>{today} 拼图</h2></div><div><Badge className="success-badge">共 {outputs.length} 张</Badge><Button disabled={downloading} onClick={downloadAll} variant="outline"><Download /> {downloading ? '正在打包…' : '一键下载全部'}</Button></div></div><div className="collage-result-grid">{outputs.map((output) => <article key={output.id}><img alt={output.name} src={output.url} /><div><span>{output.name}</span><div><button onClick={() => downloadBlob(output.blob, output.name)} type="button"><Download /> 下载</button><button onClick={() => deleteOutput(output)} type="button"><Trash2 /> 删除</button></div></div></article>)}</div></section>}
      {!outputs.length && !processing && <div className="collage-empty-note"><ImageIcon /><span>今天还没有生成拼图。</span></div>}
    </div>
  );
}
