/* oxlint-disable next/no-img-element */
'use client';
import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { useWorkspaceState, useFileUrls } from './use-workspace-state';
import { useVault } from './vault-provider';
import { SectionHead } from './studio-shared';
import { ExampleImage } from './example-image';
import { downloadBlob } from '@/lib/download';
import { startTask } from '@/lib/task-center';
import {
  posterTemplate,
  posterTitle,
  posterPresets,
  posterSymbols,
  renderPoster,
  type PosterDocument,
  type PosterLayer,
} from '@/lib/poster';
import type { PipelineTransfer } from '@/lib/pipeline';
import { usePosterPreviews } from './poster-previews';
import {
  PosterTypeControls,
  type PosterFontFile,
} from './poster-type-controls';
import { usePosterFonts } from './poster-fonts';
import { PosterLettering } from './poster-lettering';
import { PosterLayoutPicker } from './poster-layout-picker';
import type { PosterLayout } from '@/lib/poster';
import { useEditorGestures } from './use-editor-gestures';
import { SortableList, SortHandle, moveListItem } from './sortable-list';
type Project = PosterDocument & { id: string; title: string; batchId?: string };
const fresh = (title = '新海报'): Project => ({
  id: crypto.randomUUID(),
  title,
  width: 1080,
  height: 1920,
  background: '#211b27',
  layers: [],
});
function NumberField({
  label,
  value,
  onChange,
  min,
  max,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const commit = () => {
    const next = Number(draft);
    if (Number.isFinite(next))
      onChange(Math.max(min ?? -Infinity, Math.min(max ?? Infinity, next)));
    else setDraft(String(value));
  };
  return (
    <label>
      {label}
      <input
        aria-label={label}
        inputMode="decimal"
        type="text"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur();
        }}
      />
    </label>
  );
}
export function PosterPanel() {
  const vault = useVault(),
    workspace = useWorkspaceState('poster-studio', {
      fonts: [] as PosterFontFile[],
      projects: [] as Project[],
      active: '',
    }),
    { state, setState } = workspace;
  const project =
      state.projects.find((item) => item.id === state.active) ||
      state.projects[0],
    [selectedId, setSelectedId] = useState(''),
    [panel, setPanel] = useState<string | null>('images'),
    [template, setTemplate] = useState<PosterLayout>('4-3-4'),
    [gap, setGap] = useState(0),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false),
    [navigation, setNavigation] = useState(false),
    [full, setFull] = useState(false),
    [output, setOutput] = useState<File | null>(null),
    [scaleContents, setScaleContents] = useState(false);
  usePosterFonts(state.fonts || [], setMessage);
  const selected = project?.layers.find((layer) => layer.id === selectedId),
    images = useMemo(
      () =>
        project?.layers.filter(
          (layer): layer is Extract<PosterLayer, { kind: 'image' }> =>
            layer.kind === 'image',
        ) || [],
      [project?.layers],
    ),
    previews = usePosterPreviews(images),
    previewUrls = previews.urls,
    previewMap = new Map(images.map((image, i) => [image.id, previewUrls[i]])),
    [outputUrl] = useFileUrls(output ? [output] : []),
    stage = useRef<HTMLDivElement>(null),
    surface = useRef<HTMLDivElement>(null),
    [bounds, setBounds] = useState({ width: 0, height: 0 }),
    controller = useRef<AbortController | null>(null),
    history = useRef<{ id: string; undo: Project[]; redo: Project[] }>({
      id: '',
      undo: [],
      redo: [],
    }),
    [, tickHistory] = useState(0),
    drag = useRef<{
      pointer: number;
      id: string;
      x: number;
      y: number;
      px: number;
      py: number;
      node: HTMLElement;
      next: { x: number; y: number };
    } | null>(null),
    frame = useRef(0);
  const change = (fn: (current: Project) => Project, record = true) => {
    if (!project) return;
    if (record) {
      if (history.current.id !== project.id)
        history.current = { id: project.id, undo: [], redo: [] };
      history.current.undo.push(project);
      history.current.undo = history.current.undo.slice(-30);
      history.current.redo = [];
      tickHistory((value) => value + 1);
    }
    setState((current) => ({
      ...current,
      projects: current.projects.map((item) =>
        item.id === project.id ? fn(item) : item,
      ),
    }));
  };
  useEffect(
    () => setOutput(null),
    [
      project?.id,
      project?.width,
      project?.height,
      project?.background,
      project?.layers,
    ],
  );
  const patch = (id: string, value: Partial<PosterLayer>) =>
    change((current) => ({
      ...current,
      layers: current.layers.map((layer) =>
        layer.id === id ? ({ ...layer, ...value } as PosterLayer) : layer,
      ),
    }));
  useEffect(() => {
    if (!workspace.ready) return;
    const receive = (event: Event) => {
      const incoming = (event as CustomEvent<PipelineTransfer>).detail;
      if (incoming.sources.length > 500) {
        event.preventDefault();
        incoming.complete(
          new Error('海报单次最多接收 500 张图片，请分批送入。'),
        );
        return;
      }
      event.preventDefault();
      const current = workspace.current.current,
        match = current.projects.find(
          (item) => item.batchId === incoming.batchId && incoming.batchId,
        ),
        next = match
          ? {
              ...match,
              layers: [
                ...match.layers.map((layer) =>
                  layer.kind === 'image' &&
                  incoming.sources.some(
                    (source) => source.id === layer.sourceId,
                  )
                    ? {
                        ...layer,
                        file: incoming.sources.find(
                          (source) => source.id === layer.sourceId,
                        )!.file,
                      }
                    : layer,
                ),
                ...posterTemplate(
                  incoming.sources.filter(
                    (source) =>
                      !match.layers.some(
                        (layer) =>
                          layer.kind === 'image' &&
                          layer.sourceId === source.id,
                      ),
                  ),
                  match,
                  'grid',
                ),
              ],
            }
          : {
              ...fresh(incoming.batchTitle || '水印成品海报'),
              batchId: incoming.batchId,
            };
      if (!match)
        next.layers = posterTemplate(
          incoming.sources,
          next,
          incoming.sources.length >= 11
            ? '4-3-4'
            : incoming.sources.length >= 9
              ? 'mosaic'
              : 'grid',
        );
      if (next.layers.filter((layer) => layer.kind === 'image').length > 500) {
        incoming.complete(
          new Error('这份海报合计超过 500 张图片，请新建另一份海报。'),
        );
        return;
      }
      setState({
        ...current,
        active: next.id,
        projects: match
          ? current.projects.map((item) => (item.id === match.id ? next : item))
          : [next, ...current.projects],
      });
      setPanel(null);
      void workspace.flush().then(
        () => incoming.complete(),
        (error) => incoming.complete(error),
      );
    };
    window.addEventListener('prism:send-to-poster', receive);
    return () => window.removeEventListener('prism:send-to-poster', receive);
  }, [workspace.ready]);
  useEffect(() => {
    const node = stage.current;
    if (!node) return;
    const observer = new ResizeObserver(() => {
      const rect = node.getBoundingClientRect();
      setBounds({
        width: Math.max(0, rect.width - 24),
        height: Math.max(0, rect.height - 24),
      });
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [project?.id, full]);
  useEffect(() => {
    const stop = () => controller.current?.abort();
    window.addEventListener('prism:stop-processing', stop);
    return () => {
      stop();
      window.removeEventListener('prism:stop-processing', stop);
      cancelAnimationFrame(frame.current);
    };
  }, []);
  const cancelDrag = () => {
    const current = drag.current;
    if (!current) return;
    cancelAnimationFrame(frame.current);
    current.node.style.left = `${(current.x / (project?.width || 1)) * 100}%`;
    current.node.style.top = `${(current.y / (project?.height || 1)) * 100}%`;
    drag.current = null;
  };
  const gestures = useEditorGestures({
    surface,
    transform: false,
    navigation,
    disabled: busy,
    onLayerChange: () => {},
    cancelDrag,
    resetKey: project?.id,
    fullscreen: full,
  });
  const startMove = (
    event: PointerEvent<HTMLDivElement>,
    layer: PosterLayer,
  ) => {
    if (layer.locked || busy || navigation || !surface.current) return;
    event.preventDefault();
    event.stopPropagation();
    setSelectedId(layer.id);
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = {
      pointer: event.pointerId,
      id: layer.id,
      x: layer.x,
      y: layer.y,
      px: event.clientX,
      py: event.clientY,
      node: event.currentTarget,
      next: { x: layer.x, y: layer.y },
    };
  };
  const move = (event: PointerEvent<HTMLDivElement>) => {
    const current = drag.current,
      rect = surface.current?.getBoundingClientRect();
    if (!current || current.pointer !== event.pointerId || !rect || !project)
      return;
    current.next = {
      x:
        current.x + ((event.clientX - current.px) * project.width) / rect.width,
      y:
        current.y +
        ((event.clientY - current.py) * project.height) / rect.height,
    };
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      current.node.style.left = `${(current.next.x / project.width) * 100}%`;
      current.node.style.top = `${(current.next.y / project.height) * 100}%`;
    });
  };
  const end = (event: PointerEvent<HTMLDivElement>) => {
    const current = drag.current;
    if (!current || current.pointer !== event.pointerId) return;
    cancelAnimationFrame(frame.current);
    if (event.type === 'pointercancel') {
      cancelDrag();
      return;
    }
    drag.current = null;
    patch(current.id, current.next);
  };
  const addImages = (files: File[]) => {
    if (!files.length || !workspace.ready) return;
    if (files.length + images.length > 500) {
      setMessage('每张海报最多 500 张图片，请分成多张海报。');
      return;
    }
    if (!project) {
      const next = fresh();
      next.layers = posterTemplate(
        files.map((file) => ({ file })),
        next,
        'grid',
      );
      setState((current) => ({
        ...current,
        projects: [next, ...current.projects],
        active: next.id,
      }));
      return;
    }
    change((current) => ({
      ...current,
      layers: [
        ...current.layers,
        ...posterTemplate(
          files.map((file) => ({ file })),
          current,
          'grid',
        ),
      ],
    }));
    setPanel(null);
  };
  const resize = (width: number, height: number) =>
    change((current) => ({
      ...current,
      width: Math.round(width),
      height: Math.round(height),
      layers: scaleContents
        ? current.layers.map((layer) => ({
            ...layer,
            x: (layer.x * width) / current.width,
            y: (layer.y * height) / current.height,
            width: (layer.width * width) / current.width,
            height: (layer.height * height) / current.height,
            ...(layer.kind === 'text'
              ? { size: (layer.size * width) / current.width }
              : {}),
          }))
        : current.layers,
    }));
  const exportPoster = async () => {
    if (!project || busy) return;
    setBusy(true);
    const control = new AbortController();
    controller.current = control;
    const task = startTask('poster-export', '海报输出', 'poster', {
      stop: () => control.abort(),
    });
    try {
      await workspace.flush();
      const file = await renderPoster(
        { ...project, fonts: state.fonts || [] },
        control.signal,
        (value) => task.progress(value, '正在绘制海报…'),
      );
      if (
        workspace.current.current.projects.find(
          (item) => item.id === project.id,
        ) === project
      )
        setOutput(file);
      downloadBlob(file, file.name);
      task.done('海报 PNG 已生成，可下载或收纳。');
      setMessage('海报已按画布原尺寸输出，文字与图片位置保持一致。');
    } catch (error) {
      if (control.signal.aborted) task.pause();
      else task.fail(error);
      setMessage(
        error instanceof Error ? error.message : '海报输出失败，原稿保留。',
      );
    } finally {
      controller.current = null;
      setBusy(false);
    }
  };
  const undo = (redo = false) => {
    if (!project) return;
    const from = redo ? history.current.redo : history.current.undo,
      to = redo ? history.current.undo : history.current.redo,
      next = from.pop();
    if (next) {
      to.push(project);
      change(() => next, false);
      tickHistory((value) => value + 1);
    }
  };
  const displayWidth = project
      ? Math.min(bounds.width, (bounds.height * project.width) / project.height)
      : 0,
    ratio = project ? displayWidth / project.width : 1;
  const preview = (
    <section className="poster-preview">
      <div className="poster-preview-toolbar">
        <Button
          variant="outline"
          onClick={() => setNavigation((value) => !value)}
        >
          {navigation ? '返回移动图层' : '查看 / 平移'}
        </Button>
        <Button variant="outline" onClick={gestures.reset}>
          复位
        </Button>
        <Button variant="outline" onClick={() => setFull((value) => !value)}>
          {full ? '退出全屏' : '全屏预览'}
        </Button>
        <small>双指缩放预览 · 拖动图层调整位置</small>
      </div>
      <div
        ref={stage}
        className="poster-preview-stage"
        data-file-drop-target="poster-images"
        {...gestures.handlers}
      >
        {(previews.pending > 0 || previews.failed > 0) && (
          <span className="poster-preview-status">
            {previews.pending > 0
              ? `正在准备预览 ${images.length - previews.pending} / ${images.length}`
              : `${previews.failed} 张图片无法预览，请检查原文件`}
          </span>
        )}
        {project ? (
          <div
            ref={surface}
            className="poster-surface"
            style={{
              width: displayWidth || '90%',
              height: displayWidth
                ? (displayWidth * project.height) / project.width
                : undefined,
              aspectRatio: `${project.width}/${project.height}`,
              background: project.background,
              ...gestures.style,
            }}
          >
            {project.layers
              .filter((layer) => layer.visible)
              .map((layer) => (
                <div
                  key={layer.id}
                  className={`poster-layer ${layer.id === selectedId ? 'selected' : ''}`}
                  role="button"
                  aria-label={`选择海报图层 ${layer.kind === 'image' ? layer.name : layer.kind === 'text' ? layer.text : layer.symbol}`}
                  tabIndex={0}
                  onClick={() => {
                    setSelectedId(layer.id);
                    if (layer.kind === 'text') setPanel('text');
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      setSelectedId(layer.id);
                      setPanel(layer.kind === 'text' ? 'text' : 'adjust');
                    }
                  }}
                  onPointerDown={(event) => startMove(event, layer)}
                  onPointerMove={move}
                  onPointerUp={end}
                  onPointerCancel={end}
                  style={{
                    left: `${(layer.x / project.width) * 100}%`,
                    top: `${(layer.y / project.height) * 100}%`,
                    width: `${(layer.width / project.width) * 100}%`,
                    height: `${(layer.height / project.height) * 100}%`,
                    transform: `rotate(${layer.rotation}deg)`,
                    opacity: layer.opacity,
                  }}
                >
                  {layer.kind === 'image' ? (
                    <img
                      src={previewMap.get(layer.id) || undefined}
                      alt=""
                      draggable={false}
                      style={{
                        width: '100%',
                        height: '100%',
                        objectFit: layer.fit,
                        transform: `translate(${layer.offsetX * 100}%,${layer.offsetY * 100}%) scale(${layer.zoom})`,
                      }}
                    />
                  ) : layer.kind === 'shape' ? (
                    <span
                      style={{
                        fontSize: Math.min(layer.width, layer.height) * ratio,
                        color: layer.color,
                      }}
                    >
                      {layer.symbol}
                    </span>
                  ) : (
                    <PosterLettering text={layer} ratio={ratio} />
                  )}
                </div>
              ))}
          </div>
        ) : (
          <p className="empty-state">
            新建海报，导入图片，或从水印工坊送入成品。
          </p>
        )}
      </div>
    </section>
  );
  return (
    <div className="studio-page poster-page">
      <SectionHead
        eyebrow="POSTER STUDIO"
        number="17"
        title="海报工坊"
        description="独立设置画布与各张图片的尺寸，组合图片、艺术字和符号。草稿自动加密保存。"
      />
      {(message || workspace.saveError) && (
        <p role="status">{workspace.saveError || message}</p>
      )}
      <div className="poster-project-bar">
        <label>
          海报
          <select
            aria-label="海报项目"
            value={project?.id || ''}
            onChange={(event) => {
              setState((current) => ({
                ...current,
                active: event.target.value,
              }));
              setSelectedId('');
            }}
          >
            {state.projects.map((item) => (
              <option value={item.id} key={item.id}>
                {item.title}
              </option>
            ))}
          </select>
        </label>
        <Button
          variant="outline"
          onClick={() => {
            const next = fresh();
            setState((current) => ({
              ...current,
              projects: [next, ...current.projects],
              active: next.id,
            }));
            setPanel('images');
          }}
        >
          新建海报
        </Button>
        {project && (
          <Button
            variant="ghost"
            onClick={() => {
              if (window.confirm('删除这份海报草稿？其他海报保留。'))
                setState((current) => ({
                  ...current,
                  projects: current.projects.filter(
                    (item) => item.id !== project.id,
                  ),
                  active:
                    current.projects.find((item) => item.id !== project.id)
                      ?.id || '',
                }));
            }}
          >
            删除草稿
          </Button>
        )}
      </div>
      <div className="poster-workspace" data-controls-open={panel !== null}>
        <div className="poster-preview-host">{!full && preview}</div>
        <section
          className="poster-controls"
          data-mobile-active={panel !== null}
        >
          <div className="poster-controls-heading">
            <strong>
              {panel === 'images'
                ? '图片与图层'
                : panel === 'text'
                  ? '文字与符号'
                  : panel === 'output'
                    ? '输出'
                    : '画布、布局与调整'}
            </strong>
            <Button variant="ghost" onClick={() => setPanel(null)}>
              收起操作区
            </Button>
          </div>
          <div className="poster-control-group" hidden={panel !== 'images'}>
            <label className="poster-file-control">
              导入海报图片
              <input
                id="poster-images"
                type="file"
                accept="image/*"
                multiple
                disabled={!workspace.ready || busy}
                onChange={(event) => {
                  addImages(Array.from(event.target.files || []));
                  event.target.value = '';
                }}
              />
            </label>
            {project && (
              <SortableList
                className="poster-layer-list"
                disabled={busy}
                onMove={(from, to) =>
                  change((current) => ({
                    ...current,
                    layers: moveListItem(current.layers, from, to),
                  }))
                }
              >
                {project.layers.map((layer) => (
                  <div key={layer.id}>
                    <SortHandle disabled={busy} />
                    <button
                      type="button"
                      key={layer.id}
                      className={layer.id === selectedId ? 'selected' : ''}
                      onClick={() => {
                        setSelectedId(layer.id);
                        setPanel('adjust');
                      }}
                    >
                      {layer.locked ? '🔒 ' : ''}
                      {layer.kind === 'image'
                        ? layer.name
                        : layer.kind === 'text'
                          ? layer.text
                          : layer.symbol}
                    </button>
                  </div>
                ))}
              </SortableList>
            )}
          </div>
          {project && (
            <>
              <div className="poster-control-group" hidden={panel !== 'layout'}>
                <label>
                  海报名称
                  <input
                    value={project.title}
                    onChange={(event) =>
                      change(
                        (current) => ({
                          ...current,
                          title: event.target.value,
                        }),
                        false,
                      )
                    }
                  />
                </label>
                <label>
                  画布预设
                  <select
                    aria-label="海报画布预设"
                    onChange={(event) => {
                      const preset = posterPresets[Number(event.target.value)];
                      if (preset) resize(preset.width, preset.height);
                    }}
                    defaultValue=""
                  >
                    <option value="">选择尺寸</option>
                    {posterPresets.map((preset, i) => (
                      <option value={i} key={preset.name}>
                        {preset.name} · {preset.width}×{preset.height}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="poster-fields">
                  <NumberField
                    label="海报宽 px"
                    value={project.width}
                    min={64}
                    max={8000}
                    onChange={(value) => resize(value, project.height)}
                  />
                  <NumberField
                    label="海报高 px"
                    value={project.height}
                    min={64}
                    max={8000}
                    onChange={(value) => resize(project.width, value)}
                  />
                </div>
                <label>
                  <input
                    type="checkbox"
                    checked={scaleContents}
                    onChange={(event) => setScaleContents(event.target.checked)}
                  />
                  改变画布时同比例调整内容
                </label>
                <label>
                  底色
                  <input
                    aria-label="海报底色"
                    type="color"
                    value={project.background}
                    onChange={(event) =>
                      change((current) => ({
                        ...current,
                        background: event.target.value,
                      }))
                    }
                  />
                </label>
                <PosterLayoutPicker
                  value={template}
                  count={images.length}
                  onSelect={(layout) => {
                    setTemplate(layout);
                    if (!images.length) return;
                    const layers = posterTemplate(
                      images.map((image) => ({
                        file: image.file,
                        id: image.sourceId,
                      })),
                      project,
                      layout,
                      gap,
                    );
                    change((current) => ({
                      ...current,
                      layers: [
                        ...layers,
                        ...current.layers.filter(
                          (layer) => layer.kind !== 'image',
                        ),
                      ],
                    }));
                    setSelectedId(layers[0]?.id || '');
                  }}
                />
                <NumberField
                  label="海报图片间距 px"
                  value={gap}
                  min={0}
                  max={100}
                  onChange={setGap}
                />
                <Button
                  disabled={!images.length}
                  onClick={() => {
                    const layers = posterTemplate(
                      images.map((image) => ({
                        file: image.file,
                        id: image.sourceId,
                      })),
                      project,
                      template,
                      gap,
                    );
                    change((current) => ({
                      ...current,
                      layers: [
                        ...layers,
                        ...current.layers.filter(
                          (layer) => layer.kind !== 'image',
                        ),
                      ],
                    }));
                    setSelectedId(layers[0]?.id || '');
                  }}
                >
                  应用图片布局
                </Button>
              </div>
              <div className="poster-control-group" hidden={panel !== 'text'}>
                <Button
                  onClick={() => {
                    const layer = posterTitle(project);
                    change((current) => ({
                      ...current,
                      layers: [...current.layers, layer],
                    }));
                    setSelectedId(layer.id);
                    setPanel('text');
                  }}
                >
                  添加标题 / 艺术字
                </Button>
                <label className="poster-file-control">
                  导入 TXT 文本
                  <input
                    type="file"
                    accept="text/plain,.txt"
                    onChange={async (event) => {
                      const file = event.target.files?.[0];
                      if (file) {
                        const value = await file.text();
                        if (value.length > 8000) {
                          setMessage(
                            '文字较长，请拆成多个文字图层（每层最多 8000 字）。',
                          );
                          return;
                        }
                        const layer = posterTitle(project, value, 'plain');
                        change((current) => ({
                          ...current,
                          layers: [...current.layers, layer],
                        }));
                        setSelectedId(layer.id);
                        setPanel('adjust');
                      }
                      event.target.value = '';
                    }}
                  />
                </label>
                <details className="poster-symbol-library">
                  <summary>符号与装饰</summary>
                  <div className="poster-symbols">
                    {posterSymbols.map((symbol) => (
                      <Button
                        variant="outline"
                        key={symbol}
                        onClick={() => {
                          const layer: PosterLayer = {
                            id: crypto.randomUUID(),
                            kind: 'shape',
                            symbol,
                            x: project.width * 0.4,
                            y: project.height * 0.4,
                            width: project.width * 0.2,
                            height: project.width * 0.2,
                            rotation: 0,
                            opacity: 1,
                            locked: false,
                            visible: true,
                            color: '#ff66b6',
                          };
                          change((current) => ({
                            ...current,
                            layers: [...current.layers, layer],
                          }));
                          setSelectedId(layer.id);
                        }}
                      >
                        {symbol}
                      </Button>
                    ))}
                  </div>
                </details>

                {selected?.kind === 'text' && (
                  <PosterTypeControls
                    value={selected}
                    onChange={(update) => patch(selected.id, update)}
                    fonts={state.fonts || []}
                    onImportFont={(file) => {
                      if (file.size > 30_000_000) {
                        setMessage('字体文件最大 30 MB，请选择较小的字体。');
                        return;
                      }
                      const next = {
                        id:
                          'PrismFont_' +
                          crypto.randomUUID().replaceAll('-', ''),
                        name: file.name.replace(/\.[^.]+$/, ''),
                        file,
                      };
                      setState((current) => ({
                        ...current,
                        fonts: [...(current.fonts || []), next],
                      }));
                      patch(selected.id, { font: next.id });
                    }}
                    onRemoveFont={(id) => {
                      setState((current) => ({
                        ...current,
                        fonts: (current.fonts || []).filter(
                          (font) => font.id !== id,
                        ),
                        projects: current.projects.map((item) => ({
                          ...item,
                          layers: item.layers.map((layer) =>
                            layer.kind === 'text' && layer.font === id
                              ? { ...layer, font: 'Noto Sans SC' }
                              : layer,
                          ),
                        })),
                      }));
                    }}
                  />
                )}
              </div>
              <div className="poster-control-group" hidden={panel !== 'adjust'}>
                <div className="poster-history">
                  <Button
                    variant="outline"
                    disabled={!history.current.undo.length}
                    onClick={() => undo()}
                  >
                    撤销
                  </Button>
                  <Button
                    variant="outline"
                    disabled={!history.current.redo.length}
                    onClick={() => undo(true)}
                  >
                    重做
                  </Button>
                </div>
                {selected ? (
                  <>
                    <div className="poster-fields">
                      <NumberField
                        label="图层 X px"
                        value={selected.x}
                        onChange={(value) => patch(selected.id, { x: value })}
                      />
                      <NumberField
                        label="图层 Y px"
                        value={selected.y}
                        onChange={(value) => patch(selected.id, { y: value })}
                      />
                      <NumberField
                        label="单张 / 图层宽 px"
                        value={selected.width}
                        min={8}
                        max={16000}
                        onChange={(value) =>
                          patch(selected.id, { width: value })
                        }
                      />
                      <NumberField
                        label="单张 / 图层高 px"
                        value={selected.height}
                        min={8}
                        max={16000}
                        onChange={(value) =>
                          patch(selected.id, { height: value })
                        }
                      />
                      <NumberField
                        label="旋转角度"
                        value={selected.rotation}
                        onChange={(value) =>
                          patch(selected.id, { rotation: value })
                        }
                      />
                    </div>
                    <label>
                      透明度
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.01}
                        value={selected.opacity}
                        onChange={(event) =>
                          patch(selected.id, {
                            opacity: Number(event.target.value),
                          })
                        }
                      />
                    </label>
                    <div className="poster-layer-actions">
                      <Button
                        variant="outline"
                        onClick={() =>
                          patch(selected.id, { locked: !selected.locked })
                        }
                      >
                        {selected.locked ? '解锁图层' : '锁定图层'}
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() =>
                          patch(selected.id, { visible: !selected.visible })
                        }
                      >
                        {selected.visible ? '隐藏图层' : '显示图层'}
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => {
                          const copy = {
                            ...selected,
                            id: crypto.randomUUID(),
                            x: selected.x + 30,
                            y: selected.y + 30,
                          };
                          change((current) => ({
                            ...current,
                            layers: [...current.layers, copy],
                          }));
                          setSelectedId(copy.id);
                        }}
                      >
                        复制图层
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() =>
                          patch(selected.id, {
                            x: (project.width - selected.width) / 2,
                            y: (project.height - selected.height) / 2,
                          })
                        }
                      >
                        居中
                      </Button>
                      {[-1, 1].map((direction) => (
                        <Button
                          key={direction}
                          variant="outline"
                          onClick={() =>
                            change((current) => {
                              const layers = [...current.layers],
                                i = layers.findIndex(
                                  (layer) => layer.id === selected.id,
                                ),
                                next = i + direction;
                              if (next < 0 || next >= layers.length)
                                return current;
                              [layers[i], layers[next]] = [
                                layers[next],
                                layers[i],
                              ];
                              return { ...current, layers };
                            })
                          }
                        >
                          {direction < 0 ? '下移一层' : '上移一层'}
                        </Button>
                      ))}
                      <Button
                        variant="ghost"
                        onClick={() => {
                          change((current) => ({
                            ...current,
                            layers: current.layers.filter(
                              (layer) => layer.id !== selected.id,
                            ),
                          }));
                          setSelectedId('');
                        }}
                      >
                        删除图层
                      </Button>
                    </div>
                    {selected.kind === 'image' && (
                      <>
                        <label>
                          图片填充
                          <select
                            value={selected.fit}
                            onChange={(event) =>
                              patch(selected.id, {
                                fit: event.target.value as 'cover' | 'contain',
                              })
                            }
                          >
                            <option value="cover">铺满图框 · 可调整取景</option>
                            <option value="contain">完整显示图片</option>
                          </select>
                        </label>
                        <label>
                          图片取景缩放
                          <input
                            type="range"
                            min={0.5}
                            max={4}
                            step={0.01}
                            value={selected.zoom}
                            onChange={(event) =>
                              patch(selected.id, {
                                zoom: Number(event.target.value),
                              })
                            }
                          />
                        </label>
                        <label>
                          取景左右
                          <input
                            type="range"
                            min={-1}
                            max={1}
                            step={0.01}
                            value={selected.offsetX}
                            onChange={(event) =>
                              patch(selected.id, {
                                offsetX: Number(event.target.value),
                              })
                            }
                          />
                        </label>
                        <label>
                          取景上下
                          <input
                            type="range"
                            min={-1}
                            max={1}
                            step={0.01}
                            value={selected.offsetY}
                            onChange={(event) =>
                              patch(selected.id, {
                                offsetY: Number(event.target.value),
                              })
                            }
                          />
                        </label>
                      </>
                    )}
                    {selected.kind === 'shape' && (
                      <label>
                        符号颜色
                        <input
                          type="color"
                          value={selected.color}
                          onChange={(event) =>
                            patch(selected.id, { color: event.target.value })
                          }
                        />
                      </label>
                    )}
                  </>
                ) : (
                  <p>
                    在预览里点选图层，或从图片列表选择。单指移动图层，双指缩放预览。
                  </p>
                )}
              </div>
              <div className="poster-control-group" hidden={panel !== 'output'}>
                <p>
                  输出尺寸：{project.width} × {project.height}{' '}
                  px。图片图框、艺术字与符号按当前位置导出。
                </p>
                <Button
                  disabled={busy || !project.layers.length}
                  onClick={() => void exportPoster()}
                >
                  {busy ? '输出中…' : '导出海报 PNG'}
                </Button>
                {busy && (
                  <Button
                    variant="outline"
                    onClick={() => controller.current?.abort()}
                  >
                    取消输出
                  </Button>
                )}
                {output && (
                  <>
                    <ExampleImage src={outputUrl} alt="海报输出结果" />
                    <Button
                      variant="outline"
                      onClick={() => void downloadBlob(output, output.name)}
                    >
                      再次下载
                    </Button>
                    <Button
                      variant="outline"
                      onClick={async () => {
                        const id = crypto.randomUUID(),
                          now = new Date().toISOString();
                        await vault.writeBatch({
                          records: [
                            {
                              scope: 'gallery-image-meta',
                              value: {
                                id,
                                name: output.name,
                                collection: 'posters',
                                note: project.title,
                                tags: ['海报'],
                                createdAt: now,
                                updatedAt: now,
                              },
                            },
                            {
                              scope: 'gallery-collections',
                              value: { id: 'posters', name: '海报成品' },
                            },
                          ],
                          blobs: [
                            {
                              id,
                              scope: 'gallery:posters',
                              blob: output,
                              name: output.name,
                            },
                          ],
                        });
                        setMessage('海报已收纳到图片库。');
                        window.dispatchEvent(
                          new CustomEvent('prism:gallery-refresh'),
                        );
                      }}
                    >
                      收纳到图片库
                    </Button>
                  </>
                )}
              </div>
            </>
          )}
        </section>
        <nav className="poster-mobile-tabs" aria-label="海报功能">
          {[
            ['images', '图片'],
            ['layout', '布局'],
            ['text', '文字'],
            ['adjust', '调整'],
            ['output', '输出'],
          ].map(([key, label]) => (
            <button
              key={key}
              type="button"
              aria-pressed={panel === key}
              onClick={() => setPanel((value) => (value === key ? null : key))}
            >
              {label}
            </button>
          ))}
        </nav>
      </div>
      <Dialog open={full} onOpenChange={setFull}>
        <DialogContent
          className="poster-fullscreen-dialog"
          showCloseButton={false}
        >
          <DialogTitle className="sr-only">海报全屏预览</DialogTitle>
          <DialogDescription className="sr-only">
            双指缩放、平移预览，单指移动图层；点击退出全屏返回。
          </DialogDescription>
          {full && preview}
        </DialogContent>
      </Dialog>
    </div>
  );
}
