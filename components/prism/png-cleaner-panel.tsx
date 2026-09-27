'use client';
/* oxlint-disable next/no-img-element -- Local Blob previews must stay on-device. */

import { useEffect, useRef, useState } from 'react';
import {
  Download,
  Image as ImageIcon,
  ShieldCheck,
  Upload,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { downloadBlob, downloadZip } from '@/lib/download';
import {
  runPngQueue,
  type CleanMode,
  type PngJobResult,
} from '@/lib/png-cleaner';
import type { PipelineSource } from '@/lib/pipeline';
import { SectionHead } from './studio-shared';
import { useFileUrls, useWorkspaceState } from './use-workspace-state';
import { useVault } from './vault-provider';
import {
  MobileWorkspace,
  MobileWorkspacePanel,
  MobileWorkspacePrimaryAction,
  MobileWorkspaceSheet,
  MobileWorkspaceTabs,
} from './mobile-workspace';
import { SourceSelection } from './source-selection';

export function PngCleanerPanel({
  onOpen,
}: {
  onOpen: (target: 'gallery' | 'watermark' | 'collage') => void;
}) {
  const vault = useVault();
  const workspace = useWorkspaceState('png-cleaner', {
    sources: [] as PipelineSource[],
    results: [] as PngJobResult[],
    mode: 'deep' as CleanMode,
  });
  const { state, setState } = workspace;
  const [panel, setPanel] = useState<'sources' | 'mode' | 'output' | null>(
    'sources',
  );
  const [details, setDetails] = useState(false);
  const [busy, setBusy] = useState(false);
  const [processing, setProcessing] = useState(false);
  const flush = useRef(workspace.flush);
  useEffect(() => {
    flush.current = workspace.flush;
  }, [workspace.flush]);
  const [progress, setProgress] = useState({
    done: 0,
    total: 0,
    cancelled: false,
  });
  const [message, setMessage] = useState('');
  const [previewIndex, setPreviewIndex] = useState(0);
  const [resultPage, setResultPage] = useState(0);
  const [detailPage, setDetailPage] = useState(0);
  const controller = useRef<AbortController | null>(null);
  const task = useRef<Promise<unknown> | null>(null);
  const mounted = useRef(true);
  const previewSource =
    state.sources[
      Math.min(previewIndex, Math.max(0, state.sources.length - 1))
    ];
  const previewResult = state.results.find(
    (result) => result.id === previewSource?.id,
  );
  const canPreview =
    !!previewResult?.report &&
    previewResult.report.width * previewResult.report.height <= 32_000_000 &&
    previewResult.report.width <= 16384 &&
    previewResult.report.height <= 16384;
  const urls = useFileUrls(
    previewSource && canPreview
      ? [previewResult?.file || previewSource.file]
      : [],
  );
  const clean = state.results.filter(
    (result): result is PngJobResult & { file: File } => !!result.file,
  );
  const scanned = state.results.filter((result) => result.report);
  const metadataImages = scanned.filter(
    (result) => result.report!.removedChunks.length,
  ).length;
  const highRisk = scanned.reduce(
    (total, result) => total + result.report!.highRiskCount,
    0,
  );
  const fieldCount = scanned.reduce(
    (total, result) => total + result.report!.fieldCount,
    0,
  );
  const failed = state.results.filter((result) => result.error);
  const resultPages = Math.max(1, Math.ceil(state.results.length / 20));
  const detailPages = Math.max(1, Math.ceil(state.results.length / 10));

  useEffect(() => {
    mounted.current = true;
    const stop = () => controller.current?.abort();
    const checkpoint = (event: Event) => {
      stop();
      if (task.current)
        (event as CustomEvent<Promise<unknown>[]>).detail.push(
          task.current.then(() => flush.current()),
        );
    };
    window.addEventListener('prism:stop-processing', stop);
    window.addEventListener('prism:checkpoint', checkpoint);
    return () => {
      mounted.current = false;
      stop();
      window.removeEventListener('prism:stop-processing', stop);
      window.removeEventListener('prism:checkpoint', checkpoint);
    };
  }, []);

  const run = async (sources: PipelineSource[], mode?: CleanMode) => {
    if (controller.current || !sources.length) return;
    const control = new AbortController();
    controller.current = control;
    setBusy(true);
    setProcessing(true);
    setMessage('');
    setProgress({ done: 0, total: sources.length, cancelled: false });
    const operation = runPngQueue(sources, {
      mode,
      signal: control.signal,
      onResult: (result, completed) => {
        if (!mounted.current) return;
        setState((current) => ({
          ...current,
          results: [
            ...current.results.filter((old) => old.id !== result.id),
            result,
          ],
        }));
        setProgress({
          done: completed,
          total: sources.length,
          cancelled: false,
        });
      },
    });
    task.current = operation;
    try {
      const result = await operation;
      if (mounted.current) {
        setProgress({
          done: result.completed,
          total: sources.length,
          cancelled: result.cancelled,
        });
        setMessage(
          result.cancelled
            ? '已取消，已完成的结果保留；可以继续处理剩余图片。'
            : mode
              ? '清洗完成，请检查结果后下载或继续进入 PRISM。'
              : '检查完成，可以查看详情或开始清洗。',
        );
        if (mode) setPanel('output');
      }
    } catch (error) {
      if (mounted.current)
        setMessage(error instanceof Error ? error.message : '批处理失败');
    } finally {
      controller.current = null;
      task.current = null;
      if (mounted.current) {
        setBusy(false);
        setProcessing(false);
      }
    }
  };

  const upload = (files: FileList | null) => {
    if (!files || !workspace.ready || busy) return;
    const candidates = Array.from(files).filter(
      (file) => /\.png$/i.test(file.name) || file.type === 'image/png',
    );
    const available = Math.max(0, 200 - state.sources.length);
    const incoming = candidates
      .slice(0, available)
      .map((file) => ({ id: crypto.randomUUID(), file }));
    if (!incoming.length) {
      setMessage('请选择 PNG 文件；每批最多 200 张。');
      return;
    }
    setState((current) => ({
      ...current,
      sources: [...current.sources, ...incoming],
    }));
    void run(incoming).then(() => {
      if (candidates.length > available && mounted.current)
        setMessage('每批最多 200 张，超出的文件未导入，请完成本批后再添加。');
    });
  };
  const send = async (target: 'gallery' | 'watermark' | 'collage') => {
    if (!clean.length || busy) return;
    setBusy(true);
    setMessage('');
    try {
      // Persist the source/clean pairs before changing workflows.
      await workspace.flush();
      if (target === 'gallery') {
        const now = new Date().toISOString();
        await vault.writeBatch({
          blobs: clean.map((result) => ({
            id: `png-clean-${result.id}`,
            scope: 'gallery:daily',
            blob: result.file,
            name: result.file.name,
          })),
          records: clean.map((result) => ({
            scope: 'gallery-image-meta',
            value: {
              id: `png-clean-${result.id}`,
              name: result.file.name,
              collection: 'daily',
              note: '',
              tags: ['PNG 已清洗'],
              createdAt: now,
              updatedAt: now,
            },
          })),
        });
        window.dispatchEvent(new CustomEvent('prism:gallery-refresh'));
      } else {
        await new Promise<void>((resolve, reject) => {
          const unhandled = window.dispatchEvent(
            new CustomEvent(`prism:send-to-${target}`, {
              cancelable: true,
              detail: {
                sources: clean.map((result) => ({
                  id: `png-clean-${result.id}`,
                  file: result.file,
                })),
                complete: (error?: Error) =>
                  error ? reject(error) : resolve(),
              },
            }),
          );
          if (unhandled) reject(new Error('目标工坊尚未就绪，请稍后重试。'));
        });
      }
      setMessage(
        `已送入${target === 'gallery' ? '图片收纳' : target === 'watermark' ? '水印工坊' : '拼图工坊'}，原图和清洗副本继续保留。`,
      );
      onOpen(target);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '转入失败，请重试。');
    } finally {
      if (mounted.current) setBusy(false);
    }
  };
  const download = async () => {
    setBusy(true);
    try {
      if (clean.length === 1) downloadBlob(clean[0].file, clean[0].file.name);
      else
        await downloadZip(
          clean.map((result) => ({
            name: result.file.name,
            blob: result.file,
          })),
          'PRISM-clean-png.zip',
        );
      setMessage('已准备下载干净 PNG。');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '下载失败');
    } finally {
      if (mounted.current) setBusy(false);
    }
  };
  const remaining = state.sources.filter(
    (source) =>
      !state.results.some((result) => result.id === source.id && result.file),
  );
  const primary = (
    <Button
      disabled={busy || !workspace.ready || !remaining.length}
      onClick={() => void run(remaining, state.mode)}
    >
      <ShieldCheck />
      {clean.length ? '继续清洗' : '清洗'} {remaining.length} 张
    </Button>
  );

  return (
    <>
      <SectionHead
        eyebrow="PNG PRIVACY"
        number="09"
        title="PNG 隐私清洗"
        description="检查并移除图片内的附加信息，生成新的 PNG。原文件始终保留，所有处理都在本机完成。"
      />
      <MobileWorkspace
        className="png-cleaner-workspace"
        onPanelClose={() => setPanel(null)}
      >
        <section className="png-cleaner-summary">
          <div className="png-cleaner-preview">
            {/* Local Blob preview must stay on-device instead of using an image optimizer. */}
            {urls[0] && previewSource ? (
              <img src={urls[0]} alt={previewSource.file.name} />
            ) : (
              <ShieldCheck aria-hidden="true" />
            )}
            <div>
              <strong>{state.sources.length} 张图片</strong>
              <span>
                {previewSource?.file.name || '导入 PNG，先检查再清洗'}
              </span>
              {previewSource && (
                <small>
                  {!canPreview
                    ? previewResult?.error
                      ? '文件无法预览'
                      : previewResult?.report
                        ? '尺寸较大，未加载预览'
                        : '等待检查后加载预览'
                    : previewResult?.file
                      ? '清洗副本预览'
                      : '原图预览'}
                </small>
              )}
            </div>
          </div>
          {state.sources.length > 1 && (
            <div className="png-cleaner-pagination">
              <Button
                variant="outline"
                disabled={previewIndex <= 0}
                onClick={() => setPreviewIndex(Math.max(0, previewIndex - 1))}
              >
                上一张
              </Button>
              <span>
                {Math.min(previewIndex + 1, state.sources.length)} /{' '}
                {state.sources.length}
              </span>
              <Button
                variant="outline"
                disabled={previewIndex >= state.sources.length - 1}
                onClick={() => setPreviewIndex(previewIndex + 1)}
              >
                下一张
              </Button>
            </div>
          )}
          <div className="png-cleaner-stats">
            <div>
              <strong>{metadataImages}</strong>
              <span>发现附加字段的图片</span>
            </div>
            <div>
              <strong>{highRisk}</strong>
              <span>高风险字段</span>
            </div>
            <div>
              <strong>{fieldCount - highRisk}</strong>
              <span>普通字段</span>
            </div>
          </div>
          <p>
            已检查 {scanned.length} / {state.sources.length} 张 · 失败{' '}
            {failed.length} 张 · 已清洗 {clean.length} 张
          </p>
          <Button
            variant="outline"
            onClick={() => setDetails(true)}
            disabled={!state.results.length}
          >
            查看详情
          </Button>
          {progress.total > 0 && (
            <output className="png-cleaner-progress">
              <progress max={progress.total} value={progress.done} />
              <span>
                {processing
                  ? '处理中'
                  : progress.cancelled
                    ? '已取消'
                    : '已完成'}{' '}
                {progress.done} / {progress.total}
              </span>
              {processing && (
                <Button
                  variant="outline"
                  onClick={() => controller.current?.abort()}
                >
                  取消处理
                </Button>
              )}
            </output>
          )}
          {message && (
            <output className="png-cleaner-message">{message}</output>
          )}
          {workspace.saveError && (
            <p role="alert">
              保险库保存失败：{workspace.saveError}
              。请先下载结果，并检查本地存储空间。
            </p>
          )}
        </section>
        <MobileWorkspaceTabs
          label="PNG 清洗工作区"
          value={panel}
          onValueChange={setPanel}
          onClose={() => setPanel(null)}
          tabs={[
            { value: 'sources', label: '原图', icon: <ImageIcon /> },
            { value: 'mode', label: '清洗模式', icon: <ShieldCheck /> },
            { value: 'output', label: '输出', icon: <Download /> },
          ]}
        />
        <div className="png-cleaner-panels">
          <MobileWorkspacePanel
            active={panel === 'sources'}
            label="PNG 原图"
            className="png-cleaner-card"
          >
            <h2>导入原图</h2>
            <p>每批最多 200 张，单张最大 64 MB，逐张检查和清洗。</p>
            <label className="png-cleaner-upload">
              <Upload />
              选择 PNG 文件
              <input
                aria-label="选择 PNG 文件"
                type="file"
                accept=".png,image/png"
                multiple
                disabled={busy || !workspace.ready}
                onChange={(event) => {
                  upload(event.target.files);
                  event.target.value = '';
                }}
              />
            </label>
            <SourceSelection
              sources={state.sources}
              disabled={busy}
              onRemove={(ids) => {
                setState((current) => ({
                  ...current,
                  sources: current.sources.filter(
                    (source) => !ids.includes(source.id),
                  ),
                  results: current.results.filter(
                    (result) => !ids.includes(result.id),
                  ),
                }));
                setPreviewIndex(0);
              }}
            />
            <Button
              variant="outline"
              disabled={busy || !state.sources.length}
              onClick={() =>
                void run(
                  state.sources.filter(
                    (source) =>
                      !state.results.some(
                        (result) => result.id === source.id && result.file,
                      ),
                  ),
                )
              }
            >
              重新检查未清洗原图
            </Button>
          </MobileWorkspacePanel>
          <MobileWorkspacePanel
            active={panel === 'mode'}
            label="清洗模式"
            className="png-cleaner-card"
          >
            <h2>清洗模式</h2>
            <fieldset disabled={busy}>
              <legend className="sr-only">选择清洗模式</legend>
              <label aria-label="深度清洗" className="png-cleaner-mode">
                <input
                  type="radio"
                  name="png-clean-mode"
                  checked={state.mode === 'deep'}
                  onChange={() =>
                    setState((current) => ({ ...current, mode: 'deep' }))
                  }
                />
                <span>
                  <strong>深度清洗 · 推荐</strong>
                  <small>
                    保留原始像素、调色板、透明度和必要色彩信息，移除附加隐私字段。
                  </small>
                </span>
              </label>
              <label aria-label="快速清洗" className="png-cleaner-mode">
                <input
                  type="radio"
                  name="png-clean-mode"
                  checked={state.mode === 'fast'}
                  onChange={() =>
                    setState((current) => ({ ...current, mode: 'fast' }))
                  }
                />
                <span>
                  <strong>快速清洗</strong>
                  <small>
                    浏览器解码并重新导出
                    PNG；可能改变色彩和位深，适合普通静态图片。
                  </small>
                </span>
              </label>
            </fieldset>
            <p>
              深度清洗保留 ICC
              等显示配置；其中的配置名称也会保留。两种模式均不移除画面内可见的文字或水印。暂不支持
              APNG 动画。移除 EXIF
              后，依赖其中方向标记的图片可能改变显示方向，请检查清洗副本。
            </p>
            <div className="png-cleaner-desktop-action">{primary}</div>
          </MobileWorkspacePanel>
          <MobileWorkspacePanel
            active={panel === 'output'}
            label="清洗结果"
            className="png-cleaner-card"
          >
            <h2>
              清洗结果 <small>{clean.length} 张</small>
            </h2>
            <p>单个失败不会影响其他图片。取消后可继续清洗未完成图片。</p>
            <div className="png-cleaner-output-actions">
              <Button
                disabled={busy || !clean.length}
                onClick={() => void download()}
              >
                <Download />
                下载干净 PNG
              </Button>
              <Button
                variant="outline"
                disabled={busy || !clean.length || !!workspace.saveError}
                onClick={() => void send('gallery')}
              >
                存入图片收纳
              </Button>
              <Button
                variant="outline"
                disabled={busy || !clean.length || !!workspace.saveError}
                onClick={() => void send('watermark')}
              >
                进入水印工坊
              </Button>
              <Button
                variant="outline"
                disabled={busy || !clean.length || !!workspace.saveError}
                onClick={() => void send('collage')}
              >
                进入拼图工坊
              </Button>
            </div>
            <ul className="png-cleaner-results">
              {state.results
                .slice(
                  Math.min(resultPage, resultPages - 1) * 20,
                  (Math.min(resultPage, resultPages - 1) + 1) * 20,
                )
                .map((result) => (
                  <li key={result.id}>
                    <span>
                      {
                        state.sources.find((source) => source.id === result.id)
                          ?.file.name
                      }
                    </span>
                    <small>
                      {result.error ||
                        (result.file
                          ? `已清洗 · 移除 ${result.report?.removedChunks.length || 0} 个附加块`
                          : '已检查，等待清洗')}
                    </small>
                  </li>
                ))}
            </ul>
            {resultPages > 1 && (
              <div className="png-cleaner-pagination">
                <Button
                  variant="outline"
                  disabled={resultPage <= 0}
                  onClick={() => setResultPage(resultPage - 1)}
                >
                  上一页
                </Button>
                <span>
                  {Math.min(resultPage + 1, resultPages)} / {resultPages}
                </span>
                <Button
                  variant="outline"
                  disabled={resultPage >= resultPages - 1}
                  onClick={() => setResultPage(resultPage + 1)}
                >
                  下一页
                </Button>
              </div>
            )}
          </MobileWorkspacePanel>
        </div>
        <MobileWorkspacePrimaryAction>
          {primary}
          {processing && (
            <Button
              variant="outline"
              onClick={() => controller.current?.abort()}
            >
              取消
            </Button>
          )}
        </MobileWorkspacePrimaryAction>
      </MobileWorkspace>
      <MobileWorkspaceSheet
        title="PNG 附加字段详情"
        description="仅按需展示字段摘要；风险分类用于提示，清洗会移除全部列出的附加块。长文本只预览前 500 个字节，压缩和二进制内容不展开。"
        open={details}
        onOpenChange={setDetails}
      >
        {state.results
          .slice(
            Math.min(detailPage, detailPages - 1) * 10,
            (Math.min(detailPage, detailPages - 1) + 1) * 10,
          )
          .map((result) => (
            <details className="png-cleaner-detail" key={result.id}>
              <summary>
                {
                  state.sources.find((source) => source.id === result.id)?.file
                    .name
                }{' '}
                ·{' '}
                {result.error
                  ? '检查失败'
                  : `${result.report?.removedChunks.length || 0} 个附加块`}
              </summary>
              {result.error ? (
                <p>{result.error}</p>
              ) : (
                <>
                  <p>
                    {result.report?.width} × {result.report?.height} ·{' '}
                    {result.report?.removedChunks.length
                      ? '待移除：' +
                        [...new Set(result.report.removedChunks)].join(', ')
                      : '未发现待移除附加字段。'}
                  </p>
                  {result.report?.fields.slice(0, 100).map((field, index) => (
                    <div key={index}>
                      <strong>
                        {field.name}{' '}
                        <small>
                          {field.chunk} · {field.highRisk ? '高风险' : '普通'}
                        </small>
                      </strong>
                      <pre>{field.preview}</pre>
                    </div>
                  ))}
                  {(result.report?.fields.length || 0) > 100 && (
                    <p>仅展示前 100 项；全部附加块都会移除。</p>
                  )}
                </>
              )}
            </details>
          ))}
        {detailPages > 1 && (
          <div className="png-cleaner-pagination">
            <Button
              variant="outline"
              disabled={detailPage <= 0}
              onClick={() => setDetailPage(detailPage - 1)}
            >
              上一页
            </Button>
            <span>
              {Math.min(detailPage + 1, detailPages)} / {detailPages}
            </span>
            <Button
              variant="outline"
              disabled={detailPage >= detailPages - 1}
              onClick={() => setDetailPage(detailPage + 1)}
            >
              下一页
            </Button>
          </div>
        )}
      </MobileWorkspaceSheet>
    </>
  );
}
