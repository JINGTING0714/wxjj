'use client';
import { ExampleImage } from './example-image';
import { BulkActions, SelectItem, useSelection } from './bulk-selection';
import { SourceSelection } from './source-selection';

import {
  CircleAlert,
  Download,
  Grid3X3,
  Image as ImageIcon,
  Plus,
  Pause,
  Shuffle,
  ShieldCheck,
  Trash2,
  Upload,
  WandSparkles,
  X,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { SectionHead } from '@/components/prism/studio-shared';
import { useWorkspaceState, useFileUrls } from './use-workspace-state';
import {
  mergeSources,
  shuffleSources,
  type PipelineSource,
} from '@/lib/pipeline';
import type { CollageOptions } from '@/lib/image-processing';
import { useVault } from '@/components/prism/vault-provider';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Progress,
  ProgressLabel,
  ProgressValue,
} from '@/components/ui/progress';
import { downloadBlob, downloadZip } from '@/lib/download';
import {
  createCollages,
  type NumberPosition,
  type ProcessedImage,
} from '@/lib/image-processing';
import type { GalleryImageMeta } from '@/lib/prism-types';

const ratioPresets = [
  { label: '9:16', w: 9, h: 16 },
  { label: '16:9', w: 16, h: 9 },
  { label: '3:4', w: 3, h: 4 },
  { label: '1:1', w: 1, h: 1 },
];
const gridPresets = [
  { label: '四宫格', columns: 2, rows: 2 },
  { label: '九宫格', columns: 3, rows: 3 },
  { label: '16 宫格', columns: 4, rows: 4 },
  { label: '25 宫格', columns: 5, rows: 5 },
];
const numberPositions: Array<{ value: NumberPosition; label: string }> = [
  { value: 'top-left', label: '左上' },
  { value: 'top', label: '上方居中' },
  { value: 'top-right', label: '右上' },
  { value: 'left', label: '左侧居中' },
  { value: 'center', label: '正中央' },
  { value: 'right', label: '右侧居中' },
  { value: 'bottom-left', label: '左下' },
  { value: 'bottom', label: '下方居中' },
  { value: 'bottom-right', label: '右下' },
];

export function CollagePanel() {
  const vault = useVault();
  const workspace = useWorkspaceState('collage', {
    sources: [] as PipelineSource[],
    ratio: ratioPresets[0],
    grid: gridPresets[1],
    customRatio: false,
    customGrid: false,
    ratioWidth: 1080,
    ratioHeight: 1920,
    gridColumns: 5,
    gridRows: 5,
    numberImages: true,
    startNumber: 1,
    numberPosition: 'bottom-left' as NumberPosition,
    numberSize: 0.095,
    numberColor: '#f6f2fb',
    numberBackground: '#130e18',
    numberBackgroundOpacity: 0.76,
    numberShape: 'square' as 'none' | 'square' | 'pill',
    numberWeight: 600 as 400 | 600 | 800,
    numberDigits: 3,
    format: 'image/jpeg' as 'image/png' | 'image/jpeg',
    job: null as {
      id: string;
      files: File[];
      options: CollageOptions;
      nextBoard: number;
    } | null,
  });
  const { state, setState } = workspace;
  const {
    ratio,
    grid,
    customRatio,
    customGrid,
    ratioWidth,
    ratioHeight,
    gridColumns,
    gridRows,
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
    format,
  } = state;
  const files = state.sources.map((item) => item.file);
  const patch = <K extends keyof typeof state>(
    key: K,
    value: (typeof state)[K],
  ) => setState((current) => ({ ...current, [key]: value }));
  const setRatio = (value: typeof state.ratio) => patch('ratio', value);
  const setGrid = (value: typeof state.grid) => patch('grid', value);
  const setCustomRatio = (value: typeof state.customRatio) =>
    patch('customRatio', value);
  const setCustomGrid = (value: typeof state.customGrid) =>
    patch('customGrid', value);
  const setRatioWidth = (value: typeof state.ratioWidth) =>
    patch('ratioWidth', value);
  const setRatioHeight = (value: typeof state.ratioHeight) =>
    patch('ratioHeight', value);
  const setGridColumns = (value: typeof state.gridColumns) =>
    patch('gridColumns', value);
  const setGridRows = (value: typeof state.gridRows) =>
    patch('gridRows', value);
  const setStartNumber = (value: typeof state.startNumber) =>
    patch('startNumber', value);
  const setNumberPosition = (value: typeof state.numberPosition) =>
    patch('numberPosition', value);
  const setNumberSize = (value: typeof state.numberSize) =>
    patch('numberSize', value);
  const setNumberColor = (value: typeof state.numberColor) =>
    patch('numberColor', value);
  const setNumberBackground = (value: typeof state.numberBackground) =>
    patch('numberBackground', value);
  const setNumberBackgroundOpacity = (
    value: typeof state.numberBackgroundOpacity,
  ) => patch('numberBackgroundOpacity', value);
  const setNumberShape = (value: typeof state.numberShape) =>
    patch('numberShape', value);
  const setNumberWeight = (value: typeof state.numberWeight) =>
    patch('numberWeight', value);
  const setNumberDigits = (value: typeof state.numberDigits) =>
    patch('numberDigits', value);
  const setFormat = (value: typeof state.format) => patch('format', value);
  const setNumberImages = (value: boolean | ((old: boolean) => boolean)) =>
    setState((current) => ({
      ...current,
      numberImages:
        typeof value === 'function' ? value(current.numberImages) : value,
    }));
  const setFiles = (value: File[] | ((old: File[]) => File[])) =>
    setState((current) => {
      const next =
        typeof value === 'function'
          ? value(current.sources.map((item) => item.file))
          : value;
      return {
        ...current,
        sources: next.map(
          (file) =>
            current.sources.find((item) => item.file === file) || {
              id: crypto.randomUUID(),
              file,
            },
        ),
      };
    });
  const controller = useRef<AbortController | null>(null);
  const currentTask = useRef<Promise<void> | null>(null);
  const [previewBoard, setPreviewBoard] = useState(0);
  const [outputs, setOutputs] = useState<ProcessedImage[]>([]);
  const selection = useSelection(outputs.map((o) => o.id));
  const [processing, setProcessing] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');

  const today = new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  })
    .format(new Date())
    .replaceAll('/', '.');
  const collectionId = `collage-${today.replaceAll('.', '-')}`;
  const activeRatio = customRatio
    ? {
        label: `${Math.max(320, Math.min(8000, Math.round(ratioWidth)))}×${Math.max(320, Math.min(8000, Math.round(ratioHeight)))}`,
        w: Math.max(320, Math.min(8000, Math.round(ratioWidth))),
        h: Math.max(320, Math.min(8000, Math.round(ratioHeight))),
      }
    : ratio;
  const activeGrid = customGrid
    ? {
        label: '自定义',
        columns: Math.max(1, Math.min(20, Math.round(gridColumns))),
        rows: Math.max(1, Math.min(20, Math.round(gridRows))),
      }
    : grid;

  useEffect(() => {
    const receive = (event: Event) => {
      const detail =
        (event as CustomEvent<Array<File | PipelineSource>>).detail || [];
      const incoming = detail.map((item) =>
        item instanceof File ? { id: crypto.randomUUID(), file: item } : item,
      );
      setState((current) => ({
        ...current,
        sources: mergeSources(current.sources, incoming),
      }));
      if (workspace.current.current.sources.length >= 1000)
        setError(
          '拼图队列上限为 1000 张，超出的图片仍留在水印等待区，请腾出空间后再送入。',
        );
    };
    const remove = (event: Event) => {
      const ids = new Set((event as CustomEvent<string[]>).detail);
      setState((current) => ({
        ...current,
        sources: current.sources.filter((s) => !ids.has(s.id)),
      }));
    };
    const stop = () => controller.current?.abort();
    const checkpoint = (event: Event) => {
      stop();
      if (currentTask.current)
        (event as CustomEvent<Promise<unknown>[]>).detail.push(
          currentTask.current.then(() => workspace.flush()),
        );
    };
    window.addEventListener('prism:send-to-collage', receive);
    window.addEventListener('prism:remove-from-collage', remove);
    window.addEventListener('prism:stop-processing', stop);
    window.addEventListener('prism:checkpoint', checkpoint);
    return () => {
      stop();
      window.removeEventListener('prism:send-to-collage', receive);
      window.removeEventListener('prism:remove-from-collage', remove);
      window.removeEventListener('prism:stop-processing', stop);
      window.removeEventListener('prism:checkpoint', checkpoint);
    };
  }, [workspace.ready]);

  useEffect(() => {
    if (vault.status !== 'unlocked') {
      setOutputs([]);
      return;
    }
    vault
      .loadBlobs(`gallery:${collectionId}`)
      .then((blobs) =>
        setOutputs(
          blobs.map((entry) => ({
            id: entry.id,
            name: entry.name,
            sourceName: '今日拼图',
            blob: entry.blob,
            url: URL.createObjectURL(entry.blob),
          })),
        ),
      )
      .catch((reason) =>
        setError(reason instanceof Error ? reason.message : '当日拼图读取失败'),
      );
  }, [vault.status]);

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    setFiles((current) => [...current, ...Array.from(list)].slice(0, 1000));
    if (files.length + list.length > 1000)
      setError('单批最多 1000 张，已自动保留前 1000 张。');
    else setError('');
  };
  const removeSource = (index: number) =>
    setFiles((current) =>
      current.filter((_, itemIndex) => itemIndex !== index),
    );
  const boardCount = files.length
    ? Math.ceil(files.length / (activeGrid.columns * activeGrid.rows))
    : 0;

  const generate = (resume = false) => {
    if (processing || !workspace.ready) return;
    const job =
      resume && state.job
        ? state.job
        : {
            id: crypto.randomUUID(),
            files,
            nextBoard: 0,
            options: {
              ratioWidth: activeRatio.w,
              ratioHeight: activeRatio.h,
              columns: activeGrid.columns,
              rows: activeGrid.rows,
              numberImages,
              startNumber: Math.max(0, Math.round(startNumber)),
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
            },
          };
    if (!job.files.length) return;
    controller.current = new AbortController();
    const signal = controller.current.signal;
    setState((current) => ({ ...current, job }));
    setProcessing(true);
    setProgress(0);
    setError('');
    const task = (async () => {
      try {
        await workspace.flush();
        await createCollages(
          job.files,
          job.options,
          (done, total) => setProgress(Math.round((done / total) * 100)),
          signal,
          async (result, boardIndex) => {
            signal.throwIfAborted();
            const now = new Date();
            const day = now.toLocaleDateString('zh-CN').replaceAll('/', '.');
            const collection = 'collage-' + day.replaceAll('.', '-');
            const meta: GalleryImageMeta = {
              id: result.id,
              name: result.name,
              collection,
              note: `按 ${job.options.columns}×${job.options.rows} 生成`,
              tags: ['PRISM 拼图'],
              createdAt: now.toISOString(),
              updatedAt: now.toISOString(),
            };
            await vault.writeBatch({
              records: [
                {
                  scope: 'gallery-collections',
                  value: { id: collection, name: `${day} 拼图` },
                },
                { scope: 'gallery-image-meta', value: meta },
              ],
              blobs: [
                {
                  id: result.id,
                  scope: `gallery:${collection}`,
                  name: result.name,
                  blob: result.blob,
                },
              ],
            });
            setOutputs((current) => [
              result,
              ...current.filter((item) => item.id !== result.id),
            ]);
            setState((current) => ({
              ...current,
              job: { ...job, nextBoard: boardIndex + 1 },
            }));
            await workspace.flush();
            window.dispatchEvent(new CustomEvent('prism:gallery-refresh'));
          },
          job.nextBoard,
          job.id,
        );
        setState((current) => ({ ...current, job: null }));
        await workspace.flush();
      } catch (reason) {
        if (!signal.aborted)
          setError(reason instanceof Error ? reason.message : '拼图失败');
      } finally {
        setProcessing(false);
      }
    })();
    currentTask.current = task;
    void task.finally(() => {
      currentTask.current = null;
    });
  };

  const deleteOutput = async (output: ProcessedImage) => {
    if (!window.confirm(`删除拼图“${output.name}”吗？`)) return;
    try {
      await removeOutputs([output.id]);
    } catch (e) {
      setError(e instanceof Error ? e.message : '删除失败，拼图已保留。');
    }
  };

  const removeOutputs = async (ids: string[]) => {
    if (vault.status !== 'unlocked') throw new Error('请先解锁保险库。');
    await vault.writeBatch({ deleteRecords: ids, deleteBlobs: ids });
    outputs
      .filter((o) => ids.includes(o.id))
      .forEach((o) => URL.revokeObjectURL(o.url));
    setOutputs((current) => current.filter((o) => !ids.includes(o.id)));
    window.dispatchEvent(new CustomEvent('prism:gallery-refresh'));
  };

  const downloadAll = async () => {
    if (!outputs.length || downloading) return;
    setDownloading(true);
    try {
      await downloadZip(
        outputs.map((output) => ({ name: output.name, blob: output.blob })),
        `${today}-PRISM-拼图.zip`,
      );
    } finally {
      setDownloading(false);
    }
  };

  const previewCells = activeGrid.columns * activeGrid.rows;
  const currentPreview = Math.min(previewBoard, Math.max(0, boardCount - 1));
  const previewUrls = useFileUrls(
    files.slice(
      currentPreview * previewCells,
      (currentPreview + 1) * previewCells,
    ),
  );
  const previewPositionClass = `number-${numberPosition}`;

  return (
    <div className="studio-page collage-page">
      <SectionHead
        eyebrow="COLLAGE ENGINE"
        number="08"
        title="拼图工坊"
        description="最多 1000 张批量分板；尺寸、宫格、编号位置与视觉样式全部开放给你。"
      />
      {workspace.saveError && (
        <p className="error-banner">{workspace.saveError}</p>
      )}
      <fieldset
        disabled={!workspace.ready || processing || vault.busy}
        className="workshop-fieldset"
      >
        <div className="collage-layout">
          <section className="collage-controls">
            <div className="control-section">
              <div className="control-title">
                <span>01</span>
                <div>
                  <p className="eyebrow">SOURCE IMAGES</p>
                  <h2>选择图片</h2>
                </div>
                <Badge variant="outline">{files.length} / 1000</Badge>
              </div>
              <label className="collage-drop">
                <Upload />
                <strong>
                  {files.length
                    ? `已进入队列 ${files.length} 张`
                    : '批量上传或从水印区/图库送入'}
                </strong>
                <span>未占满的最后一板只保留实际图片，空格不会编号</span>
                <input
                  accept="image/*"
                  multiple
                  onChange={(event) => addFiles(event.target.files)}
                  type="file"
                />
              </label>
              {files.length > 0 && (
                <>
                  <div className="source-file-list">
                    {files.slice(0, 12).map((file, index) => (
                      <span key={`${file.name}-${file.lastModified}-${index}`}>
                        {file.name}
                        <button
                          aria-label={`移除 ${file.name}`}
                          onClick={() => removeSource(index)}
                          type="button"
                        >
                          <X />
                        </button>
                      </span>
                    ))}
                    {files.length > 12 && <b>+{files.length - 12}</b>}
                  </div>
                  <SourceSelection
                    sources={state.sources}
                    disabled={processing}
                    onRemove={async (ids) => {
                      setState((s) => ({
                        ...s,
                        sources: s.sources.filter(
                          (source) => !ids.includes(source.id),
                        ),
                        job: null,
                      }));
                      setPreviewBoard(0);
                      await workspace.flush();
                    }}
                  />
                  <Button
                    disabled={files.length < 2}
                    onClick={() => {
                      setState((current) => ({
                        ...current,
                        sources: shuffleSources(current.sources),
                      }));
                      setPreviewBoard(0);
                    }}
                    type="button"
                    variant="outline"
                  >
                    <Shuffle />
                    一键打乱全部顺序
                  </Button>
                  <button
                    className="clear-files"
                    onClick={() => setFiles([])}
                    type="button"
                  >
                    <Trash2 /> 清空这一批
                  </button>
                </>
              )}
            </div>
            <div className="control-section">
              <div className="control-title">
                <span>02</span>
                <div>
                  <p className="eyebrow">CANVAS SIZE</p>
                  <h2>拼图尺寸</h2>
                </div>
              </div>
              <div className="preset-grid ratio-grid">
                {ratioPresets.map((item) => (
                  <button
                    className={
                      !customRatio && ratio.label === item.label
                        ? 'is-active'
                        : ''
                    }
                    key={item.label}
                    onClick={() => {
                      setRatio(item);
                      setCustomRatio(false);
                    }}
                    type="button"
                  >
                    <i style={{ aspectRatio: `${item.w}/${item.h}` }} />
                    <span>{item.label}</span>
                  </button>
                ))}
                <button
                  className={customRatio ? 'is-active' : ''}
                  onClick={() => setCustomRatio(true)}
                  type="button"
                >
                  <i className="custom-ratio-icon" />
                  <span>自定义像素</span>
                </button>
              </div>
              {customRatio && (
                <div className="custom-fields custom-pixel-fields">
                  <label>
                    <span>画布宽 px</span>
                    <Input
                      max="8000"
                      min="320"
                      onChange={(event) =>
                        setRatioWidth(Number(event.target.value))
                      }
                      type="number"
                      value={ratioWidth}
                    />
                  </label>
                  <b>×</b>
                  <label>
                    <span>画布高 px</span>
                    <Input
                      max="8000"
                      min="320"
                      onChange={(event) =>
                        setRatioHeight(Number(event.target.value))
                      }
                      type="number"
                      value={ratioHeight}
                    />
                  </label>
                  <small>生成文件会严格使用这个像素尺寸。</small>
                </div>
              )}
            </div>
            <div className="control-section">
              <div className="control-title">
                <span>03</span>
                <div>
                  <p className="eyebrow">GRID SYSTEM</p>
                  <h2>宫格数量</h2>
                </div>
              </div>
              <div className="grid-preset-row">
                {gridPresets.map((item) => (
                  <button
                    className={
                      !customGrid && grid.label === item.label
                        ? 'is-active'
                        : ''
                    }
                    key={item.label}
                    onClick={() => {
                      setGrid(item);
                      setCustomGrid(false);
                    }}
                    type="button"
                  >
                    <Grid3X3 />
                    <span>{item.label}</span>
                  </button>
                ))}
                <button
                  className={customGrid ? 'is-active' : ''}
                  onClick={() => setCustomGrid(true)}
                  type="button"
                >
                  <Plus />
                  <span>自定义</span>
                </button>
              </div>
              {customGrid && (
                <div className="custom-fields">
                  <label>
                    <span>列数</span>
                    <Input
                      max="20"
                      min="1"
                      onChange={(event) =>
                        setGridColumns(Number(event.target.value))
                      }
                      type="number"
                      value={gridColumns}
                    />
                  </label>
                  <b>×</b>
                  <label>
                    <span>行数</span>
                    <Input
                      max="20"
                      min="1"
                      onChange={(event) =>
                        setGridRows(Number(event.target.value))
                      }
                      type="number"
                      value={gridRows}
                    />
                  </label>
                </div>
              )}
            </div>
            <div className="control-section numbering-section">
              <div className="control-title">
                <span>04</span>
                <div>
                  <p className="eyebrow">NUMBERING</p>
                  <h2>编号与输出</h2>
                </div>
                <button
                  aria-pressed={numberImages}
                  className={`switch-control ${numberImages ? 'is-on' : ''}`}
                  onClick={() => setNumberImages((value) => !value)}
                  type="button"
                >
                  <i />
                </button>
              </div>
              <div className="number-style-grid">
                <label>
                  <span>起始序号</span>
                  <Input
                    disabled={!numberImages}
                    min="0"
                    onChange={(event) =>
                      setStartNumber(Number(event.target.value))
                    }
                    type="number"
                    value={startNumber}
                  />
                </label>
                <label>
                  <span>编号位置</span>
                  <select
                    disabled={!numberImages}
                    onChange={(event) =>
                      setNumberPosition(event.target.value as NumberPosition)
                    }
                    value={numberPosition}
                  >
                    {numberPositions.map((item) => (
                      <option key={item.value} value={item.value}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>编号大小 · {Math.round(numberSize * 100)}%</span>
                  <input
                    disabled={!numberImages}
                    max="0.4"
                    min="0.03"
                    onChange={(event) =>
                      setNumberSize(Number(event.target.value))
                    }
                    step="0.005"
                    type="range"
                    value={numberSize}
                  />
                </label>
                <label>
                  <span>字重</span>
                  <select
                    disabled={!numberImages}
                    onChange={(event) =>
                      setNumberWeight(
                        Number(event.target.value) as 400 | 600 | 800,
                      )
                    }
                    value={numberWeight}
                  >
                    <option value="400">常规</option>
                    <option value="600">半粗</option>
                    <option value="800">粗体</option>
                  </select>
                </label>
                <label>
                  <span>补零位数</span>
                  <select
                    disabled={!numberImages}
                    onChange={(event) =>
                      setNumberDigits(Number(event.target.value))
                    }
                    value={numberDigits}
                  >
                    <option value="0">不补零</option>
                    <option value="2">2 位</option>
                    <option value="3">3 位</option>
                    <option value="4">4 位</option>
                    <option value="5">5 位</option>
                  </select>
                </label>
                <label>
                  <span>底板形状</span>
                  <select
                    disabled={!numberImages}
                    onChange={(event) =>
                      setNumberShape(
                        event.target.value as 'none' | 'square' | 'pill',
                      )
                    }
                    value={numberShape}
                  >
                    <option value="none">无底板</option>
                    <option value="square">直角底板</option>
                    <option value="pill">圆角胶囊</option>
                  </select>
                </label>
                <label>
                  <span>文字颜色</span>
                  <input
                    disabled={!numberImages}
                    onChange={(event) => setNumberColor(event.target.value)}
                    type="color"
                    value={numberColor}
                  />
                </label>
                <label>
                  <span>底板颜色</span>
                  <input
                    disabled={!numberImages || numberShape === 'none'}
                    onChange={(event) =>
                      setNumberBackground(event.target.value)
                    }
                    type="color"
                    value={numberBackground}
                  />
                </label>
                <label>
                  <span>
                    底板透明度 · {Math.round(numberBackgroundOpacity * 100)}%
                  </span>
                  <input
                    disabled={!numberImages || numberShape === 'none'}
                    max="1"
                    min="0"
                    onChange={(event) =>
                      setNumberBackgroundOpacity(Number(event.target.value))
                    }
                    step="0.01"
                    type="range"
                    value={numberBackgroundOpacity}
                  />
                </label>
                <label>
                  <span>输出格式</span>
                  <select
                    onChange={(event) =>
                      setFormat(
                        event.target.value as 'image/png' | 'image/jpeg',
                      )
                    }
                    value={format}
                  >
                    <option value="image/jpeg">JPG · 较小</option>
                    <option value="image/png">PNG · 无损</option>
                  </select>
                </label>
              </div>
              <p>
                <CircleAlert />{' '}
                编号样式会实时反映在右侧预览；生成时按每个格子的实际尺寸精确计算。
              </p>
            </div>
          </section>
          <aside className="collage-preview">
            <div className="preview-sticky">
              <div className="preview-heading">
                <p className="eyebrow">LIVE SPEC</p>
                <span>{activeRatio.label}</span>
              </div>
              <div
                className="board-preview"
                style={{
                  aspectRatio: `${activeRatio.w}/${activeRatio.h}`,
                  maxWidth: `${(480 * activeRatio.w) / activeRatio.h}px`,
                  gridTemplateColumns: `repeat(${activeGrid.columns}, minmax(0, 1fr))`,
                  gridTemplateRows: `repeat(${activeGrid.rows}, minmax(0, 1fr))`,
                }}
              >
                {Array.from({ length: previewCells }, (_, index) => (
                  <i className="real-preview-cell" key={index}>
                    {previewUrls[index] && (
                      <img
                        alt={`第 ${currentPreview * previewCells + index + 1} 张`}
                        src={previewUrls[index]}
                      />
                    )}
                    {numberImages && index < previewUrls.length && (
                      <span
                        className={`${previewPositionClass} shape-${numberShape}`}
                        style={{
                          backgroundColor:
                            numberShape === 'none'
                              ? 'transparent'
                              : `${numberBackground}${Math.round(
                                  numberBackgroundOpacity * 255,
                                )
                                  .toString(16)
                                  .padStart(2, '0')}`,
                          color: numberColor,
                          fontSize: `${numberSize * 100}cqmin`,
                          fontWeight: numberWeight,
                        }}
                      >
                        {String(
                          Math.max(0, Math.round(startNumber)) +
                            currentPreview * previewCells +
                            index,
                        ).padStart(numberDigits, '0')}
                      </span>
                    )}
                  </i>
                ))}
              </div>
              <div className="preview-pagination">
                <Button
                  disabled={currentPreview === 0}
                  onClick={() => setPreviewBoard(currentPreview - 1)}
                  size="sm"
                  variant="outline"
                >
                  上一板
                </Button>
                <span>
                  {currentPreview + 1} / {Math.max(1, boardCount)}
                </span>
                <Button
                  disabled={currentPreview >= boardCount - 1}
                  onClick={() => setPreviewBoard(currentPreview + 1)}
                  size="sm"
                  variant="outline"
                >
                  下一板
                </Button>
              </div>
              <div className="spec-list">
                <div>
                  <span>单板容量</span>
                  <strong>{activeGrid.columns * activeGrid.rows} 张</strong>
                </div>
                <div>
                  <span>预计生成</span>
                  <strong>{boardCount} 张拼图</strong>
                </div>
                <div>
                  <span>今日已收纳</span>
                  <strong>{outputs.length} 张</strong>
                </div>
                <div>
                  <span>自动图库</span>
                  <strong>
                    {vault.status === 'unlocked'
                      ? `${today} 拼图`
                      : '解锁后启用'}
                  </strong>
                </div>
              </div>
              {processing ? (
                <Progress className="collage-progress" value={progress}>
                  <ProgressLabel>正在拼贴</ProgressLabel>
                  <ProgressValue>{() => `${progress}%`}</ProgressValue>
                </Progress>
              ) : (
                <Button
                  className="generate-button"
                  disabled={!files.length}
                  onClick={() => generate(false)}
                >
                  <WandSparkles /> 开始批量拼图
                </Button>
              )}
              <p className="local-note">
                <ShieldCheck /> 全程在本机处理，不上传原图。
              </p>
            </div>
          </aside>
        </div>
      </fieldset>
      {processing && (
        <Button onClick={() => controller.current?.abort()} variant="outline">
          <Pause />
          暂停并保留进度
        </Button>
      )}
      {state.job && !processing && (
        <Button onClick={() => generate(true)} variant="outline">
          继续未完成拼图（已完成 {state.job.nextBoard} 板）
        </Button>
      )}
      {error && (
        <p className="error-banner">
          <CircleAlert /> {error}
        </p>
      )}
      {outputs.length > 0 && (
        <section className="collage-results">
          <div className="result-head">
            <div>
              <p className="eyebrow">GENERATED TODAY</p>
              <h2>{today} 拼图</h2>
            </div>
            <div>
              <Badge className="success-badge">共 {outputs.length} 张</Badge>
              <Button
                disabled={downloading}
                onClick={downloadAll}
                variant="outline"
              >
                <Download /> {downloading ? '正在打包…' : '一键下载全部'}
              </Button>
            </div>
          </div>
          <BulkActions
            selection={selection}
            onDelete={removeOutputs}
            disabled={processing}
            noun="张当日拼图"
          />
          <div className="collage-result-grid">
            {outputs.map((output) => (
              <article key={output.id}>
                <SelectItem
                  selection={selection}
                  id={output.id}
                  name={output.name}
                />
                <ExampleImage alt={output.name} src={output.url} />
                <div>
                  <span>{output.name}</span>
                  <div>
                    <button
                      onClick={() => downloadBlob(output.blob, output.name)}
                      type="button"
                    >
                      <Download /> 下载
                    </button>
                    <button onClick={() => deleteOutput(output)} type="button">
                      <Trash2 /> 删除
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}
      {!outputs.length && !processing && (
        <div className="collage-empty-note">
          <ImageIcon />
          <span>今天还没有生成拼图。</span>
        </div>
      )}
    </div>
  );
}
