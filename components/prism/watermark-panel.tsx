'use client';
import { useEffect, useRef, useState } from 'react';
import {
  ChevronDown,
  Download,
  Grid3X3,
  Image as ImageIcon,
  Layers3,
  Pause,
  Plus,
  RefreshCw,
  SlidersHorizontal,
  Stamp,
  Trash2,
  Upload,
  Video,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SectionHead } from './studio-shared';
import { WatermarkEditor, type EditorLayer } from './watermark-editor';
import { useFileUrls, useWorkspaceState } from './use-workspace-state';
import { applyWatermarks } from '@/lib/image-processing';
import { downloadBlob, downloadZip } from '@/lib/download';
import type { PipelineSource } from '@/lib/pipeline';
import { VideoWatermarkPanel } from './video-watermark-panel';
import {
  defaultComposition,
  type WatermarkComposition,
} from '@/lib/watermark-composition';
import { ExampleImage } from './example-image';
import { BulkActions, SelectItem, useSelection } from './bulk-selection';
import { SourceSelection } from './source-selection';
import {
  MobileWorkspace,
  MobileWorkspacePanel,
  MobileWorkspacePrimaryAction,
  MobileWorkspaceSheet,
  MobileWorkspaceTabs,
  type MobileWorkspaceTab,
} from './mobile-workspace';

type Output = { id: string; sourceId: string; file: File; rejected: boolean };
type WatermarkMobilePanel = 'preview' | 'watermarks' | 'adjust' | 'output';

const mobileTabs: MobileWorkspaceTab<WatermarkMobilePanel>[] = [
  { value: 'preview', label: '预览', icon: <ImageIcon /> },
  { value: 'watermarks', label: '水印', icon: <Layers3 /> },
  { value: 'adjust', label: '调整', icon: <SlidersHorizontal /> },
  { value: 'output', label: '输出', icon: <Download /> },
];

type Batch = {
  id: string;
  title: string;
  sources: PipelineSource[];
  layers: EditorLayer[];
  outputs: Output[];
  retryIds: string[];
  autoSend: boolean;
  composition?: WatermarkComposition;
  job: {
    todo: PipelineSource[];
    layers: EditorLayer[];
    next: number;
    composition?: WatermarkComposition;
  } | null;
};
const freshBatch = (number: number): Batch => ({
  id: crypto.randomUUID(),
  title: `图片批次 ${number}`,
  sources: [],
  layers: [],
  outputs: [],
  retryIds: [],
  autoSend: true,
  composition: defaultComposition(),
  job: null,
});

function WaitingBatch({
  batch,
  processing,
  onChange,
  onRetry,
  onOpenCollage,
}: {
  batch: Batch;
  processing: boolean;
  onChange: (update: (batch: Batch) => Batch) => void;
  onRetry: () => void;
  onOpenCollage: () => void;
}) {
  const urls = useFileUrls(batch.outputs.map((o) => o.file));
  const selection = useSelection(batch.outputs.map((o) => o.id));
  const qualified = batch.outputs.filter((o) => !o.rejected);
  const bad = batch.outputs.filter((o) => o.rejected);
  const send = () => {
    window.dispatchEvent(
      new CustomEvent('prism:send-to-collage', {
        detail: qualified.map((o) => ({ id: o.id, file: o.file })),
      }),
    );
    onOpenCollage();
  };
  return (
    <section className="result-zone batch-waiting">
      <div className="result-head">
        <h3>{batch.title} · 等待检查</h3>
        <span>
          {qualified.length} 合格 · {bad.length} 待重打
        </span>
      </div>
      <BulkActions
        selection={selection}
        disabled={processing}
        noun="张等待区图片"
        onDelete={(ids) => {
          const removed = batch.outputs.filter((o) => ids.includes(o.id));
          onChange((b) => ({
            ...b,
            outputs: b.outputs.filter((o) => !ids.includes(o.id)),
            retryIds: b.retryIds.filter(
              (id) => !removed.some((o) => o.sourceId === id),
            ),
          }));
          window.dispatchEvent(
            new CustomEvent('prism:remove-from-collage', { detail: ids }),
          );
        }}
      />
      <div className="result-grid">
        {batch.outputs.map((output, i) => (
          <article
            className={output.rejected ? 'is-rejected' : ''}
            key={output.id}
          >
            <SelectItem
              selection={selection}
              id={output.id}
              name={output.file.name}
            />
            <ExampleImage
              alt={output.file.name}
              src={urls[i]}
              images={urls.map((url, j) => ({
                url,
                name: batch.outputs[j].file.name,
              }))}
              index={i}
            />
            <div>
              <p>{output.file.name}</p>
              <button
                onClick={() => {
                  const rejected = !output.rejected;
                  if (rejected)
                    window.dispatchEvent(
                      new CustomEvent('prism:remove-from-collage', {
                        detail: [output.id],
                      }),
                    );
                  else if (batch.autoSend)
                    window.dispatchEvent(
                      new CustomEvent('prism:send-to-collage', {
                        detail: [{ id: output.id, file: output.file }],
                      }),
                    );
                  onChange((b) => ({
                    ...b,
                    outputs: b.outputs.map((o) =>
                      o.id === output.id ? { ...o, rejected } : o,
                    ),
                  }));
                }}
                type="button"
              >
                {output.rejected ? '改为合格' : '标记不合格'}
              </button>
              <button
                onClick={() => downloadBlob(output.file, output.file.name)}
                type="button"
              >
                <Download />
                下载
              </button>
              <button
                onClick={() => {
                  if (
                    !confirm(
                      '删除等待区的这张成品，并从尚未处理的拼图队列移除？已生成的拼图不受影响。',
                    )
                  )
                    return;
                  window.dispatchEvent(
                    new CustomEvent('prism:remove-from-collage', {
                      detail: [output.id],
                    }),
                  );
                  onChange((b) => ({
                    ...b,
                    outputs: b.outputs.filter((o) => o.id !== output.id),
                  }));
                }}
                type="button"
              >
                <Trash2 />
                删除
              </button>
            </div>
          </article>
        ))}
      </div>
      <div className="result-actions">
        <Button
          disabled={!batch.outputs.length}
          onClick={() =>
            downloadZip(
              batch.outputs.map((o) => ({ blob: o.file, name: o.file.name })),
              `${batch.title}-水印.zip`,
            )
          }
          variant="outline"
        >
          <Download />
          下载本区全部
        </Button>
        <Button
          disabled={!bad.length || processing}
          onClick={onRetry}
          variant="outline"
        >
          <RefreshCw />
          调整样本并重打 {bad.length} 张
        </Button>
        <Button disabled={!qualified.length} onClick={send}>
          <Grid3X3 />
          合格图片送入拼图
        </Button>
      </div>
    </section>
  );
}
export function WatermarkPanel({
  onOpenCollage,
}: {
  onOpenCollage: () => void;
}) {
  const workspace = useWorkspaceState('watermark-batches', {
    batches: [] as Batch[],
    active: '',
    tab: 'images' as 'images' | 'video',
  });
  const { state, setState } = workspace;
  const controllers = useRef(new Map<string, AbortController>());
  const tasks = useRef(new Map<string, Promise<void>>());
  const [running, setRunning] = useState<Record<string, number>>({});
  const [error, setError] = useState('');
  const [mobilePanel, setMobilePanel] =
    useState<WatermarkMobilePanel>('preview');
  const [batchSheetOpen, setBatchSheetOpen] = useState(false);
  const [resultsOpen, setResultsOpen] = useState(false);
  const [sourceSheetOpen, setSourceSheetOpen] = useState(false);
  const batch =
    state.batches.find((b) => b.id === state.active) || state.batches[0];
  const update = (id: string, change: (old: Batch) => Batch) =>
    setState((current) => ({
      ...current,
      batches: current.batches.map((b) => (b.id === id ? change(b) : b)),
    }));
  useEffect(() => {
    if (workspace.ready && !workspace.current.current.batches.length) {
      const initial = freshBatch(1);
      setState((current) => ({
        ...current,
        batches: [initial],
        active: initial.id,
      }));
    }
  }, [workspace.ready]);
  useEffect(() => {
    const stop = () =>
      controllers.current.forEach((controller) => controller.abort());
    const checkpoint = (e: Event) => {
      stop();
      (e as CustomEvent<Promise<unknown>[]>).detail.push(
        Promise.all([...tasks.current.values()]).then(() => workspace.flush()),
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
  const run = (target: Batch, resume = false) => {
    if (tasks.current.has(target.id)) return;
    const job =
      resume && target.job
        ? target.job
        : {
            todo: target.retryIds.length
              ? target.sources.filter((s) => target.retryIds.includes(s.id))
              : target.sources,
            layers: target.layers,
            composition: target.composition,
            next: 0,
          };
    if (!job.todo.length || !job.layers.length) return;
    const controller = new AbortController();
    controllers.current.set(target.id, controller);
    const signal = controller.signal;
    update(target.id, (b) => ({ ...b, job, retryIds: [] }));
    setRunning((current) => ({ ...current, [target.id]: 0 }));
    setError('');
    const task = (async () => {
      try {
        await workspace.flush();
        const remaining = job.todo.slice(job.next);
        await applyWatermarks(
          remaining.map((s) => s.file),
          job.layers,
          (done, total) =>
            setRunning((current) => ({
              ...current,
              [target.id]: Math.round(
                ((job.next + done) / (job.next + total)) * 100,
              ),
            })),
          async (image, index) => {
            signal.throwIfAborted();
            const source = remaining[index];
            const file = new File([image.blob], image.name, {
              type: image.blob.type,
            });
            URL.revokeObjectURL(image.url);
            const output: Output = {
              id: `watermark-${target.id}-${source.id}`,
              sourceId: source.id,
              file,
              rejected: false,
            };
            update(target.id, (b) => ({
              ...b,
              outputs: [...b.outputs.filter((o) => o.id !== output.id), output],
              job: { ...job, next: job.next + index + 1 },
            }));
            await workspace.flush();
            if (
              workspace.current.current.batches.find((b) => b.id === target.id)
                ?.autoSend
            )
              window.dispatchEvent(
                new CustomEvent('prism:send-to-collage', {
                  detail: [{ id: output.id, file }],
                }),
              );
          },
          signal,
          job.composition,
        );
        update(target.id, (b) => ({ ...b, job: null }));
        await workspace.flush();
      } catch (e) {
        if (!signal.aborted)
          setError(e instanceof Error ? e.message : '水印处理失败');
      } finally {
        setRunning((current) => {
          const next = { ...current };
          delete next[target.id];
          return next;
        });
        controllers.current.delete(target.id);
        tasks.current.delete(target.id);
      }
    })();
    tasks.current.set(target.id, task);
  };
  return (
    <div className="studio-page watermark-page">
      <SectionHead
        eyebrow="WATERMARK PIPELINE"
        number="07"
        title="水印工坊"
        description="最多 5 批图片各用一套水印，等待区按批次分开。视频另有独立工区，最多 10 个。"
      />
      <div className="workshop-tabs">
        <Button
          onClick={() => setState((s) => ({ ...s, tab: 'images' }))}
          variant={state.tab === 'images' ? 'default' : 'outline'}
        >
          <Stamp />
          图片水印
        </Button>
        <Button
          onClick={() => setState((s) => ({ ...s, tab: 'video' }))}
          variant={state.tab === 'video' ? 'default' : 'outline'}
        >
          <Video />
          视频水印
        </Button>
      </div>
      <div hidden={state.tab !== 'images'}>
        {workspace.saveError && (
          <p className="error-banner">{workspace.saveError}</p>
        )}
        {error && <p className="error-banner">{error}</p>}
        <div className="batch-tabs desktop-workspace-only">
          {state.batches.map((b) => (
            <Button
              key={b.id}
              onClick={() => setState((s) => ({ ...s, active: b.id }))}
              variant={batch?.id === b.id ? 'default' : 'outline'}
            >
              {b.title}
              {running[b.id] !== undefined && ` · ${running[b.id]}%`}
            </Button>
          ))}
          <Button
            disabled={!workspace.ready || state.batches.length >= 5}
            onClick={() => {
              const added = freshBatch(state.batches.length + 1);
              setState((s) => ({
                ...s,
                batches: [...s.batches, added],
                active: added.id,
              }));
            }}
            variant="outline"
          >
            <Plus />
            新批次（{state.batches.length}/5）
          </Button>
        </div>
        {batch && (
          <button
            className="mobile-batch-selector mobile-workspace-only"
            onClick={() => setBatchSheetOpen(true)}
            type="button"
          >
            <span>
              <strong>{batch.title}</strong>
              <small>
                {batch.sources.length} 张原图 · {batch.layers.length} 层水印
                {running[batch.id] !== undefined
                  ? ` · ${running[batch.id]}%`
                  : batch.outputs.length
                    ? ` · ${batch.outputs.length} 张成品`
                    : ''}
              </small>
            </span>
            <ChevronDown />
          </button>
        )}
        <MobileWorkspaceSheet
          description="每个批次保留独立的原图、图层、排版和处理结果。"
          onOpenChange={setBatchSheetOpen}
          open={batchSheetOpen}
          title="选择图片批次"
        >
          <div className="mobile-batch-list">
            {state.batches.map((item) => (
              <button
                aria-current={batch?.id === item.id ? 'true' : undefined}
                className={batch?.id === item.id ? 'is-active' : ''}
                key={item.id}
                onClick={() => {
                  setState((current) => ({ ...current, active: item.id }));
                  setMobilePanel('preview');
                  setBatchSheetOpen(false);
                }}
                type="button"
              >
                <span>
                  <strong>{item.title}</strong>
                  <small>
                    {item.sources.length} 张 · {item.layers.length} 层
                    {item.outputs.length
                      ? ` · ${item.outputs.length} 张成品`
                      : ''}
                  </small>
                </span>
                {running[item.id] !== undefined && <b>{running[item.id]}%</b>}
              </button>
            ))}
            <Button
              disabled={!workspace.ready || state.batches.length >= 5}
              onClick={() => {
                const added = freshBatch(state.batches.length + 1);
                setState((current) => ({
                  ...current,
                  batches: [...current.batches, added],
                  active: added.id,
                }));
                setMobilePanel('preview');
                setBatchSheetOpen(false);
              }}
              variant="outline"
            >
              <Plus /> 新建批次（{state.batches.length}/5）
            </Button>
          </div>
        </MobileWorkspaceSheet>
        {batch && (
          <section className="batch-editor">
            <MobileWorkspace className="watermark-mobile-workspace">
              <MobileWorkspacePanel
                active={mobilePanel === 'preview'}
                className="watermark-source-panel"
                label="批次与原图"
              >
                <div className="batch-source-toolbar">
                  <label htmlFor={`watermark-batch-title-${batch.id}`}>
                    批次名称
                    <Input
                      id={`watermark-batch-title-${batch.id}`}
                      disabled={
                        !workspace.ready || running[batch.id] !== undefined
                      }
                      onChange={(e) =>
                        update(batch.id, (b) => ({
                          ...b,
                          title: e.target.value,
                        }))
                      }
                      value={batch.title}
                    />
                  </label>
                  <label className="mini-file">
                    <Upload />
                    导入本批原图
                    <input
                      accept="image/*"
                      disabled={
                        !workspace.ready || running[batch.id] !== undefined
                      }
                      multiple
                      onChange={(e) => {
                        const files = Array.from(e.target.files || []);
                        e.target.value = '';
                        if (files.length + batch.sources.length > 200) {
                          setError('每批最多 200 张，请减少文件或新建下一批。');
                          return;
                        }
                        update(batch.id, (b) => ({
                          ...b,
                          sources: [
                            ...b.sources,
                            ...files.map((file) => ({
                              id: crypto.randomUUID(),
                              file,
                            })),
                          ],
                        }));
                      }}
                      type="file"
                    />
                  </label>
                  <span>{batch.sources.length} / 200 张</span>
                  <Button
                    disabled={
                      !workspace.ready || running[batch.id] !== undefined
                    }
                    onClick={() => {
                      if (
                        confirm(
                          '删除这个批次及其原图、图层和等待区副本？水印库素材及已生成拼图保留。',
                        )
                      ) {
                        window.dispatchEvent(
                          new CustomEvent('prism:remove-from-collage', {
                            detail: batch.outputs.map((o) => o.id),
                          }),
                        );
                        setState((current) => ({
                          ...current,
                          batches: current.batches.filter(
                            (item) => item.id !== batch.id,
                          ),
                          active: '',
                        }));
                      }
                    }}
                    variant="outline"
                  >
                    <Trash2 /> 删除此批
                  </Button>
                </div>
                <div className="source-file-list desktop-workspace-only">
                  {batch.sources.map((source, i) => (
                    <span key={source.id}>
                      {i + 1}. {source.file.name}
                      <button
                        aria-label={`移除原图 ${source.file.name}`}
                        onClick={() =>
                          update(batch.id, (b) => ({
                            ...b,
                            sources: b.sources.filter(
                              (item) => item.id !== source.id,
                            ),
                          }))
                        }
                        type="button"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
                <div className="desktop-workspace-only">
                  <SourceSelection
                    sources={batch.sources}
                    disabled={running[batch.id] !== undefined}
                    onRemove={async (ids) => {
                      update(batch.id, (b) => ({
                        ...b,
                        sources: b.sources.filter((s) => !ids.includes(s.id)),
                        retryIds: b.retryIds.filter((id) => !ids.includes(id)),
                        job: null,
                      }));
                      await workspace.flush();
                    }}
                  />
                </div>
                {batch.sources.length > 0 && (
                  <button
                    className="mobile-source-summary mobile-workspace-only"
                    onClick={() => setSourceSheetOpen(true)}
                    type="button"
                  >
                    <span>
                      <strong>管理本批原图</strong>
                      <small>
                        {batch.sources.length} 张 · 搜索、多选或移除
                      </small>
                    </span>
                    <ChevronDown />
                  </button>
                )}
                {batch.retryIds.length > 0 && (
                  <p className="import-warning">
                    本次只重打 {batch.retryIds.length}{' '}
                    张不合格图片。请重新调整样本，然后确认启动；其他批次与拼图不受影响。
                  </p>
                )}
              </MobileWorkspacePanel>

              <WatermarkEditor
                disabled={running[batch.id] !== undefined}
                layers={batch.layers}
                mobilePanel={mobilePanel}
                composition={batch.composition}
                onChange={(layers, composition) =>
                  update(batch.id, (b) => ({
                    ...b,
                    layers,
                    ...(composition ? { composition } : {}),
                  }))
                }
                source={
                  (batch.retryIds.length
                    ? batch.sources.find((s) => batch.retryIds.includes(s.id))
                    : batch.sources[0]
                  )?.file
                }
              />

              <MobileWorkspaceTabs
                label="水印工坊功能"
                onValueChange={setMobilePanel}
                tabs={mobileTabs}
                value={mobilePanel}
              />

              <MobileWorkspacePanel
                active={mobilePanel === 'output'}
                className="watermark-output-panel"
                label="输出"
              >
                <div className="mobile-workspace-panel-heading mobile-workspace-only">
                  <p className="eyebrow">OUTPUT</p>
                  <h3>处理与结果</h3>
                  <p>
                    {batch.sources.length} 张原图 · {batch.layers.length} 层水印
                  </p>
                </div>
                <label className="check-line">
                  <input
                    checked={batch.autoSend}
                    disabled={running[batch.id] !== undefined}
                    onChange={(e) =>
                      update(batch.id, (b) => ({
                        ...b,
                        autoSend: e.target.checked,
                      }))
                    }
                    type="checkbox"
                  />
                  每张完成后自动送入拼图队列（仍可在等待区标记不合格并移除）
                </label>
                <div className="result-actions desktop-workspace-only">
                  <Button
                    disabled={!batch.sources.length || !batch.layers.length}
                    onClick={() => run(batch)}
                  >
                    <Stamp />
                    {batch.retryIds.length
                      ? `确认样本，重打 ${batch.retryIds.length} 张`
                      : '确认样本，处理整批'}
                  </Button>
                  {batch.job && (
                    <Button onClick={() => run(batch, true)} variant="outline">
                      继续未完成（{batch.job.next}/{batch.job.todo.length}）
                    </Button>
                  )}
                </div>
                {running[batch.id] !== undefined && (
                  <div className="run-bar">
                    <span>
                      正在处理 {batch.title} · {running[batch.id]}%
                    </span>
                    <Button
                      className="desktop-workspace-only"
                      onClick={() => controllers.current.get(batch.id)?.abort()}
                      variant="outline"
                    >
                      <Pause /> 暂停
                    </Button>
                  </div>
                )}
                {batch.outputs.length > 0 && (
                  <div className="mobile-result-summary mobile-workspace-only">
                    <span>
                      <strong>{batch.outputs.length} 张成品</strong>
                      <small>
                        {batch.outputs.filter((item) => !item.rejected).length}{' '}
                        合格 ·{' '}
                        {batch.outputs.filter((item) => item.rejected).length}{' '}
                        待调整
                      </small>
                    </span>
                    <Button
                      onClick={() => setResultsOpen(true)}
                      variant="outline"
                    >
                      查看结果
                    </Button>
                  </div>
                )}
              </MobileWorkspacePanel>

              <MobileWorkspacePrimaryAction>
                {running[batch.id] !== undefined ? (
                  <Button
                    onClick={() => controllers.current.get(batch.id)?.abort()}
                    variant="outline"
                  >
                    <Pause /> 暂停处理 · {running[batch.id]}%
                  </Button>
                ) : batch.job ? (
                  <Button onClick={() => run(batch, true)}>
                    <RefreshCw />
                    继续未完成（{batch.job.next}/{batch.job.todo.length}）
                  </Button>
                ) : (
                  <Button
                    disabled={
                      !workspace.ready ||
                      !batch.sources.length ||
                      !batch.layers.length
                    }
                    onClick={() => run(batch)}
                  >
                    <Stamp />
                    {batch.retryIds.length
                      ? `确认样本，重打 ${batch.retryIds.length} 张`
                      : '确认样本，处理整批'}
                  </Button>
                )}
              </MobileWorkspacePrimaryAction>
            </MobileWorkspace>

            <MobileWorkspaceSheet
              description="在独立列表中搜索、多选或移除文件，主工作台只保留数量摘要。"
              onOpenChange={setSourceSheetOpen}
              open={sourceSheetOpen}
              title={`${batch.title} · 原图`}
            >
              <SourceSelection
                sources={batch.sources}
                disabled={running[batch.id] !== undefined}
                openByDefault
                onRemove={async (ids) => {
                  update(batch.id, (b) => ({
                    ...b,
                    sources: b.sources.filter((s) => !ids.includes(s.id)),
                    retryIds: b.retryIds.filter((id) => !ids.includes(id)),
                    job: null,
                  }));
                  await workspace.flush();
                }}
              />
            </MobileWorkspaceSheet>

            <MobileWorkspaceSheet
              description="完整成品只在这里展开，不再占用主编辑页面高度。"
              onOpenChange={setResultsOpen}
              open={resultsOpen}
              title={`${batch.title} · 处理结果`}
            >
              {batch.outputs.length > 0 ? (
                <WaitingBatch
                  batch={batch}
                  onChange={(change) => update(batch.id, change)}
                  onOpenCollage={() => {
                    setResultsOpen(false);
                    onOpenCollage();
                  }}
                  onRetry={() => {
                    update(batch.id, (old) => ({
                      ...old,
                      retryIds: old.outputs
                        .filter((item) => item.rejected)
                        .map((item) => item.sourceId),
                    }));
                    setResultsOpen(false);
                    setMobilePanel('adjust');
                  }}
                  processing={running[batch.id] !== undefined}
                />
              ) : (
                <p className="mobile-workspace-empty">本批还没有处理结果。</p>
              )}
            </MobileWorkspaceSheet>
          </section>
        )}
        <div className="waiting-batches desktop-workspace-results">
          {state.batches
            .filter((b) => b.outputs.length)
            .map((b) => (
              <WaitingBatch
                batch={b}
                key={b.id}
                onChange={(change) => update(b.id, change)}
                onOpenCollage={onOpenCollage}
                onRetry={() => {
                  update(b.id, (old) => ({
                    ...old,
                    retryIds: old.outputs
                      .filter((o) => o.rejected)
                      .map((o) => o.sourceId),
                  }));
                  setState((s) => ({ ...s, active: b.id }));
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                processing={running[b.id] !== undefined}
              />
            ))}
        </div>
      </div>
      <div hidden={state.tab !== 'video'}>
        <VideoWatermarkPanel />
      </div>
    </div>
  );
}
