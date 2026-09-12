'use client';
import { useEffect, useRef, useState } from 'react';
import { Download, Pause, Trash2, Upload, Video } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useFileUrls, useWorkspaceState } from './use-workspace-state';
import { WatermarkEditor, type EditorLayer } from './watermark-editor';
import { videoFirstFrame, watermarkVideo } from '@/lib/video-processing';
import { VideoEngineSession } from '@/lib/video-engine';
import { downloadBlob, downloadZip } from '@/lib/download';
import {
  defaultComposition,
  type WatermarkComposition,
} from '@/lib/watermark-composition';
import { BulkActions, SelectItem, useSelection } from './bulk-selection';
import { SourceSelection } from './source-selection';
import {
  defaultVideoExport,
  type VideoExportOptions,
} from '@/lib/video-export';
type VideoSource = { id: string; file: File; frame: File };
type VideoOutput = { id: string; file: File };
export function VideoWatermarkPanel() {
  const workspace = useWorkspaceState('video-watermarks', {
    sources: [] as VideoSource[],
    layers: [] as EditorLayer[],
    composition: defaultComposition(),
    outputs: [] as VideoOutput[],
    exportOptions: defaultVideoExport,
    job: null as {
      todo: VideoSource[];
      layers: EditorLayer[];
      next: number;
      composition?: WatermarkComposition;
      exportOptions?: VideoExportOptions;
    } | null,
  });
  const { state, setState } = workspace;
  const [busy, setBusy] = useState(false);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState('');
  const [progressValue, setProgressValue] = useState(0);
  const [error, setError] = useState('');
  const controller = useRef<AbortController | null>(null);
  const task = useRef<Promise<void> | null>(null);
  const urls = useFileUrls(state.outputs.map((o) => o.file));
  const selection = useSelection(state.outputs.map((o) => o.id));
  useEffect(() => {
    const stop = () => controller.current?.abort();
    const checkpoint = (e: Event) => {
      stop();
      if (task.current)
        (e as CustomEvent<Promise<unknown>[]>).detail.push(
          task.current.then(() => workspace.flush()),
        );
    };
    window.addEventListener('prism:stop-processing', stop);
    window.addEventListener('prism:checkpoint', checkpoint);
    return () => {
      stop();
      window.removeEventListener('prism:stop-processing', stop);
      window.removeEventListener('prism:checkpoint', checkpoint);
    };
  }, []);
  const choose = async (files: File[]) => {
    if (files.length + state.sources.length > 10) {
      setError('单批最多 10 个视频，请减少选择。');
      return;
    }
    setImporting(true);
    setError('');
    try {
      const sources: VideoSource[] = [];
      for (const file of files) {
        setProgress(`正在读取首帧：${file.name}`);
        sources.push({
          id: crypto.randomUUID(),
          file,
          frame: await videoFirstFrame(file),
        });
      }
      setState((s) => ({ ...s, sources: [...s.sources, ...sources] }));
      await workspace.flush();
      setProgress('首帧已就绪。请按第一段视频的首帧设置水印。');
    } catch (e) {
      setError(e instanceof Error ? e.message : '视频导入失败');
    } finally {
      setImporting(false);
    }
  };
  const run = (resume = false) => {
    if (busy || task.current) return;
    const job =
      resume && state.job
        ? state.job
        : {
            todo: state.sources,
            layers: state.layers,
            composition: state.composition,
            exportOptions: state.exportOptions || defaultVideoExport,
            next: 0,
          };
    controller.current = new AbortController();
    const signal = controller.current.signal;
    setState((s) => ({ ...s, job }));
    setBusy(true);
    setProgressValue(0);
    setError('');
    task.current = (async () => {
      const engine = new VideoEngineSession();
      try {
        await workspace.flush();
        for (let i = job.next; i < job.todo.length; i++) {
          signal.throwIfAborted();
          const source = job.todo[i];
          const file = await watermarkVideo(
            source.file,
            job.layers,
            signal,
            (value, phase) => {
              setProgressValue(value);
              setProgress(
                `${i + 1} / ${job.todo.length} · ${Math.round(value * 100)}% · ${phase}`,
              );
            },
            job.composition,
            job.exportOptions || defaultVideoExport,
            engine,
          );
          signal.throwIfAborted();
          setState((s) => ({
            ...s,
            outputs: [
              ...s.outputs.filter((o) => o.id !== source.id),
              { id: source.id, file },
            ],
            job: { ...job, next: i + 1 },
          }));
          await workspace.flush();
        }
        setState((s) => ({ ...s, job: null }));
        await workspace.flush();
        setProgress('本批视频水印已完成，可逐段检查并下载。');
      } catch (e) {
        if (!signal.aborted)
          setError(e instanceof Error ? e.message : '视频处理失败');
        else
          setProgress('已暂停；成品已保存，继续时从当前未完成视频重新处理。');
      } finally {
        engine.dispose();
        setBusy(false);
        task.current = null;
      }
    })();
  };
  return (
    <section className="video-workshop">
      <h2>视频水印 · 独立工区</h2>
      <p>
        最多 10
        个视频，使用第一段视频的第一帧作为整批模板。按原始分辨率与帧时间编码，扩展画布同比例输出并保留音轨。普通画面优先
        MP4，透明画面用
        WebM；视频会重新编码，不是原文件无损复制，也不会自动修复低清素材。
      </p>
      <p className="import-warning">
        自动选择本机快速处理，兼容音轨会直接保留。透明视频或浏览器不支持快速处理时，使用兼容引擎（首次约
        32 MB，同批只加载一次）。每个文件最多 512
        MB；大分辨率、长视频可能耗时较长或超出设备内存。处理不依赖前台播放；系统休眠、关窗或刷新仍会中断，可从未完成视频继续。MP4
        遇到奇数边长会补齐 1 像素。{' '}
        <a
          href={`${process.env.NEXT_PUBLIC_BASE_PATH || ''}/media-engine-notices.html`}
          target="_blank"
          rel="noreferrer"
        >
          引擎与开源许可
        </a>
      </p>
      {(error || workspace.saveError) && (
        <p className="error-banner" role="alert">
          {error || workspace.saveError}
        </p>
      )}
      {progress && <p role="status">{progress}</p>}
      {busy && (
        <progress
          className="video-processing-progress"
          aria-label="当前视频处理进度"
          max={1}
          value={progressValue}
        />
      )}
      <fieldset
        className="workshop-fieldset"
        disabled={busy || importing || !workspace.ready}
      >
        <label className="mini-file">
          <Upload />
          导入视频（{state.sources.length}/10）
          <input
            accept="video/*,.mp4,.webm,.mov,.m4v"
            multiple
            onChange={(e) => {
              void choose(Array.from(e.target.files || []));
              e.target.value = '';
            }}
            type="file"
          />
        </label>
        <div className="source-file-list">
          {state.sources.map((s, i) => (
            <span key={s.id}>
              {i + 1}. {s.file.name}
              <button
                aria-label={`移除视频 ${s.file.name}`}
                onClick={() =>
                  setState((current) => ({
                    ...current,
                    sources: current.sources.filter((item) => item.id !== s.id),
                  }))
                }
                type="button"
              >
                ×
              </button>
            </span>
          ))}
        </div>
        <SourceSelection
          sources={state.sources}
          disabled={busy}
          onRemove={async (ids) => {
            setState((s) => ({
              ...s,
              sources: s.sources.filter((source) => !ids.includes(source.id)),
              job: null,
            }));
            await workspace.flush();
          }}
        />
        <WatermarkEditor
          sourceKind="video"
          disabled={busy || importing}
          layers={state.layers}
          composition={state.composition}
          onChange={(layers, composition) =>
            setState((s) => ({
              ...s,
              layers,
              ...(composition ? { composition } : {}),
            }))
          }
          source={state.sources[0]?.frame}
        />
        <div className="video-export-settings">
          <label>
            <span>视频格式</span>
            <select
              aria-label="视频格式"
              value={(state.exportOptions || defaultVideoExport).format}
              onChange={(e) =>
                setState((s) => ({
                  ...s,
                  exportOptions: {
                    ...(s.exportOptions || defaultVideoExport),
                    format: e.target.value as VideoExportOptions['format'],
                  },
                }))
              }
            >
              <option value="auto">自动 · 普通 MP4 / 透明 WebM</option>
              <option value="mp4">MP4 · 通用播放（不支持透明）</option>
              <option value="webm-alpha">WebM · 保留透明背景</option>
            </select>
          </label>
          <label>
            <span>视频质量</span>
            <select
              aria-label="视频质量"
              value={(state.exportOptions || defaultVideoExport).quality}
              onChange={(e) =>
                setState((s) => ({
                  ...s,
                  exportOptions: {
                    ...(s.exportOptions || defaultVideoExport),
                    quality: e.target.value as VideoExportOptions['quality'],
                  },
                }))
              }
            >
              <option value="high">高清 · 原始分辨率</option>
              <option value="ultra">更高质量 · 文件更大</option>
            </select>
          </label>
        </div>
        <div className="result-actions">
          <Button
            disabled={!state.sources.length || !state.layers.length}
            onClick={() => run()}
          >
            <Video />
            确认首帧模板，开始视频水印
          </Button>
          {state.job && (
            <Button onClick={() => run(true)} variant="outline">
              继续未完成视频（{state.job.next}/{state.job.todo.length}）
            </Button>
          )}
        </div>
      </fieldset>
      {busy && (
        <Button onClick={() => controller.current?.abort()} variant="outline">
          <Pause />
          暂停本批视频
        </Button>
      )}
      {state.outputs.length > 0 && (
        <section className="result-zone">
          <div className="result-head">
            <h3>视频成品 · {state.outputs.length} 个</h3>
            <Button
              onClick={() =>
                downloadZip(
                  state.outputs.map((o) => ({
                    name: o.file.name,
                    blob: o.file,
                  })),
                  'wxjj-视频水印.zip',
                )
              }
              variant="outline"
            >
              <Download />
              下载全部视频
            </Button>
          </div>
          <BulkActions
            selection={selection}
            disabled={busy}
            noun="个视频成品"
            onDelete={async (ids) => {
              setState((s) => ({
                ...s,
                outputs: s.outputs.filter((o) => !ids.includes(o.id)),
              }));
              await workspace.flush();
            }}
          />
          <div className="video-result-grid">
            {state.outputs.map((o, i) => (
              <article key={o.id}>
                <SelectItem
                  selection={selection}
                  id={o.id}
                  name={o.file.name}
                />
                <video controls playsInline preload="metadata" src={urls[i]} />
                <p>{o.file.name}</p>
                <Button
                  onClick={() => downloadBlob(o.file, o.file.name)}
                  variant="outline"
                >
                  <Download />
                  下载
                </Button>
                <Button
                  onClick={() => {
                    if (confirm('删除这个视频成品的本地副本？原视频保留。'))
                      setState((s) => ({
                        ...s,
                        outputs: s.outputs.filter((item) => item.id !== o.id),
                      }));
                  }}
                  variant="outline"
                >
                  <Trash2 />
                  删除
                </Button>
              </article>
            ))}
          </div>
        </section>
      )}
    </section>
  );
}
