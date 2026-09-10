'use client';
import { useEffect, useRef, useState, type PointerEvent } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Lock,
  Unlock,
  Plus,
  RefreshCw,
  Scan,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useVault } from './vault-provider';
import { useFileUrls } from './use-workspace-state';
import {
  loadImage,
  imageContentBounds,
  type WatermarkLayerInput,
} from '@/lib/image-processing';
import type { StoredWatermark } from '@/lib/prism-types';
import {
  compositionStack,
  fitCompositionToContent,
  layerGeometry,
  layerStretch,
  compositionSize,
  sourceCoversCanvas,
  type ContentBounds,
  defaultComposition,
  resolveComposition,
  SOURCE_LAYER_ID,
  type WatermarkComposition,
} from '@/lib/watermark-composition';
import {
  alignLayerToSource,
  stretchLayer,
  fitLayerToSource,
  type AlignmentGuides,
  type SceneSize,
  type StretchEdge,
} from '@/lib/watermark-interaction';
import type { LayerDimensions } from '@/lib/watermark-composition';

export type EditorLayer = WatermarkLayerInput & { id: string };
export const defaultLayer = (file: File): EditorLayer => ({
  id: crypto.randomUUID(),
  file,
  x: 0.5,
  y: 0.5,
  scale: 0.6,
  scaleX: 1,
  scaleY: 1,
  rotation: 0,
  opacity: 1,
  locked: false,
  crop: { top: 0, bottom: 0, left: 0, right: 0 },
});

function CanvasPercent({
  value,
  label,
  onChange,
}: {
  value: number;
  label: string;
  onChange: (value: number) => void;
}) {
  const display = (n: number) => String(Math.round(n * 10000) / 100);
  const [edit, setEdit] = useState({ value, draft: display(value) });
  if (edit.value !== value) setEdit({ value, draft: display(value) });
  const draft = edit.value === value ? edit.draft : display(value);
  const setDraft = (draft: string) => setEdit({ value, draft });
  return (
    <input
      type="number"
      min="0.01"
      step="0.01"
      aria-label={label}
      value={draft}
      onChange={(e) => {
        setDraft(e.target.value);
        const n = Number(e.target.value);
        if (e.target.value && Number.isFinite(n) && n > 0) onChange(n / 100);
      }}
      onBlur={() => {
        const n = Number(draft);
        const bounded =
          draft && Number.isFinite(n) ? Math.max(0.01, n) : value * 100;
        setDraft(String(bounded));
        // Merely focusing a fitted percentage must not resize the canvas.
        if (draft !== display(value)) onChange(bounded / 100);
      }}
    />
  );
}
export function WatermarkEditor({
  source,
  layers,
  onChange: publishChange,
  composition,
  disabled = false,
  sourceKind = 'image',
}: {
  source?: File;
  layers: EditorLayer[];
  onChange: (layers: EditorLayer[], composition?: WatermarkComposition) => void;
  composition?: WatermarkComposition;
  disabled?: boolean;
  sourceKind?: 'image' | 'video';
}) {
  const vault = useVault();
  const [active, setActive] = useState('');
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [guides, setGuides] = useState<AlignmentGuides | null>(null);
  const [dimensions, setDimensions] = useState(
    new Map<
      File,
      { w: number; h: number; bounds?: ContentBounds | null; opaque: boolean }
    >(),
  );
  const [error, setError] = useState('');
  const [library, setLibrary] = useState<
    Array<{ record: StoredWatermark; file: File }>
  >([]);
  const surface = useRef<HTMLDivElement>(null);
  const [sourceUrl] = useFileUrls(source ? [source] : []);
  const layerUrls = useFileUrls(layers.map((l) => l.file));
  const canvas = resolveComposition(composition);
  const onChange = (
    nextLayers: EditorLayer[],
    nextCanvas?: WatermarkComposition,
  ) =>
    publishChange(nextLayers, { ...(nextCanvas ?? canvas), fitContent: false });
  const stack = source
    ? compositionStack(
        layers,
        { ...canvas.source, id: SOURCE_LAYER_ID, file: source },
        canvas.sourceIndex,
      )
    : layers;
  const selected = stack.find((l) => l.id === active) || layers[0] || stack[0];
  const selectedId = selected?.id;
  const drag = useRef<{
    pointer: number;
    id: string;
    x: number;
    y: number;
    scale: number;
    rotation: number;
    px: number;
    py: number;
    angle: number;
    distance: number;
    mode: string;
    element: HTMLElement;
    next: Partial<EditorLayer>;
    layer: EditorLayer;
    dimensions: LayerDimensions;
    scene: SceneSize;
  } | null>(null);
  const frame = useRef<number>(0);
  const currentLayers = useRef(layers);
  currentLayers.current = layers;
  const currentCanvas = useRef(canvas);
  currentCanvas.current = canvas;
  const change = (id: string, patch: Partial<EditorLayer>) => {
    if (disabled) return;
    const old =
      id === SOURCE_LAYER_ID
        ? currentCanvas.current.source
        : currentLayers.current.find((l) => l.id === id);
    if (!old || (old.locked && patch.locked === undefined)) return;
    if (id === SOURCE_LAYER_ID)
      onChange(currentLayers.current, {
        ...currentCanvas.current,
        source: { ...old, ...patch },
      });
    else
      onChange(
        currentLayers.current.map((l) =>
          l.id === id ? { ...l, ...patch } : l,
        ),
      );
  };
  const publishStack = (next: EditorLayer[]) =>
    onChange(
      next.filter((l) => l.id !== SOURCE_LAYER_ID),
      {
        ...canvas,
        sourceIndex: Math.max(
          0,
          next.findIndex((l) => l.id === SOURCE_LAYER_ID),
        ),
      },
    );
  const reorder = (id: string, direction: number) => {
    const i = stack.findIndex((l) => l.id === id),
      j = i + direction;
    if (disabled || stack[i]?.locked || j < 0 || j >= stack.length) return;
    const next = [...stack];
    [next[i], next[j]] = [next[j], next[i]];
    publishStack(next);
  };
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const list = [...(source ? [source] : []), ...layers.map((l) => l.file)];
      const updated = new Map(dimensions);
      let changed = false;
      for (const file of list)
        if (!updated.has(file)) {
          const image = await loadImage(file);
          const content = imageContentBounds(image);
          updated.set(file, {
            w: image.naturalWidth,
            h: image.naturalHeight,
            ...content,
          });
          changed = true;
        }
      if (!cancelled && changed) setDimensions(updated);
    })().catch((e) => setError(String(e)));
    return () => {
      cancelled = true;
    };
  }, [source, layers]);
  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      const records = await vault.loadRecords<StoredWatermark>('watermarks');
      const items = [];
      for (const record of records) {
        const [blob] = await vault.loadBlobs(`watermark-file:${record.id}`);
        if (blob)
          items.push({
            record,
            file: new File([blob.blob], blob.name, { type: blob.blob.type }),
          });
      }
      if (!cancelled) setLibrary(items);
    };
    void refresh().catch((e) => {
      if (!cancelled) setError(String(e));
    });
    const update = () => {
      void refresh().catch(() => {});
    };
    window.addEventListener('prism:watermarks-changed', update);
    return () => {
      cancelled = true;
      window.removeEventListener('prism:watermarks-changed', update);
    };
  }, [vault.session]);
  useEffect(() => () => cancelAnimationFrame(frame.current), []);
  const add = async (files: File[]) => {
    try {
      setError('');
      const added: EditorLayer[] = [];
      for (const file of files) {
        await loadImage(file);
        const id = crypto.randomUUID();
        const record: StoredWatermark = {
          id,
          title: file.name.replace(/\.[^.]+$/, ''),
          collection: 'unfiled',
          author: '未记录',
          origin: '本地上传',
          acquisition: '其他',
          note: '',
          tags: [],
          fileName: file.name,
          blobId: `${id}-file`,
          createdAt: new Date().toISOString(),
        };
        await vault.writeBatch({
          records: [{ scope: 'watermarks', value: record }],
          blobs: [
            {
              id: record.blobId!,
              scope: `watermark-file:${id}`,
              blob: file,
              name: file.name,
            },
          ],
        });
        added.push(defaultLayer(file));
      }
      onChange([...currentLayers.current, ...added]);
      if (added[0]) setActive(added[0].id);
      window.dispatchEvent(new CustomEvent('prism:watermarks-changed'));
    } catch (e) {
      setError(e instanceof Error ? e.message : '水印导入失败');
    }
  };
  const begin = (event: PointerEvent<HTMLDivElement>, layer: EditorLayer) => {
    if (disabled || layer.locked || !surface.current) return;
    if (drag.current && drag.current.pointer !== event.pointerId) return;
    const dim = dimensions.get(layer.file);
    const original = source && dimensions.get(source);
    if (!dim || !original) return;
    let size;
    try {
      size = compositionSize(original.w, original.h, canvas);
    } catch (e) {
      setError(e instanceof Error ? e.message : '画布尺寸无效');
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    setActive(layer.id);
    const rect = surface.current.getBoundingClientRect();
    const cx = rect.left + rect.width * layer.x;
    const cy = rect.top + rect.height * layer.y;
    drag.current = {
      pointer: event.pointerId,
      id: layer.id,
      x: layer.x,
      y: layer.y,
      scale: layer.scale,
      rotation: layer.rotation,
      px: event.clientX,
      py: event.clientY,
      angle: Math.atan2(event.clientY - cy, event.clientX - cx),
      distance: Math.max(1, Math.hypot(event.clientX - cx, event.clientY - cy)),
      mode: (event.target as HTMLElement).dataset.action || 'move',
      element: event.currentTarget,
      next: {},
      layer,
      dimensions: { width: dim.w, height: dim.h, bounds: dim.bounds },
      scene: { ...size, referenceWidth: original.w },
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const move = (event: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.pointer !== event.pointerId || !surface.current) return;
    const rect = surface.current.getBoundingClientRect();
    if (d.mode === 'scale')
      d.next = {
        scale: Math.min(
          6,
          Math.max(
            0.01,
            (d.scale *
              Math.hypot(
                event.clientX - rect.left - rect.width * d.x,
                event.clientY - rect.top - rect.height * d.y,
              )) /
              d.distance,
          ),
        ),
      };
    else if (d.mode === 'rotate')
      d.next = {
        rotation:
          d.rotation +
          ((Math.atan2(
            event.clientY - rect.top - rect.height * d.y,
            event.clientX - rect.left - rect.width * d.x,
          ) -
            d.angle) *
            180) /
            Math.PI,
      };
    else if (d.mode.startsWith('stretch-')) {
      const next = stretchLayer(
        d.layer,
        d.dimensions,
        d.scene,
        d.mode.slice(8) as StretchEdge,
        {
          x: ((event.clientX - d.px) * d.scene.width) / rect.width,
          y: ((event.clientY - d.py) * d.scene.height) / rect.height,
        },
      );
      d.next = {
        x: next.x,
        y: next.y,
        scaleX: next.scaleX,
        scaleY: next.scaleY,
      };
    } else
      d.next = {
        x: d.x + (event.clientX - d.px) / rect.width,
        y: d.y + (event.clientY - d.py) / rect.height,
      };
    let nextGuides: AlignmentGuides | null = null;
    const original = source && dimensions.get(source);
    if (d.id !== SOURCE_LAYER_ID && original) {
      const aligned = alignLayerToSource(
        { ...d.layer, ...d.next },
        d.dimensions,
        currentCanvas.current.source,
        { width: original.w, height: original.h },
        d.scene,
        ((event.pointerType === 'touch' ? 10 : 7) * d.scene.width) / rect.width,
        d.mode === 'move' && snapEnabled && !event.altKey,
      );
      nextGuides = aligned.guides.lines.length ? aligned.guides : null;
      if (d.mode === 'move')
        d.next = { ...d.next, x: aligned.layer.x, y: aligned.layer.y };
    }
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      if (!drag.current) return;
      const p = { ...d.layer, ...d.next };
      const size = layerGeometry(
        p,
        d.dimensions.width,
        d.dimensions.height,
        d.scene.referenceWidth,
      );
      d.element.style.left = `${p.x * 100}%`;
      d.element.style.top = `${p.y * 100}%`;
      d.element.style.width = `${(size.width / d.scene.width) * 100}%`;
      d.element.style.aspectRatio = `${size.width}/${size.height}`;
      d.element.style.transform = `translate(-50%, -50%) rotate(${p.rotation}deg)`;
      setGuides(nextGuides);
    });
  };
  const end = (event: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.pointer !== event.pointerId) return;
    cancelAnimationFrame(frame.current);
    change(d.id, d.next);
    drag.current = null;
    setGuides(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
  };
  const base = source && dimensions.get(source);
  const backgroundVisible = (() => {
    if (!base || !base.opaque) return true;
    try {
      return !sourceCoversCanvas(base.w, base.h, canvas);
    } catch {
      return true;
    }
  })();
  return (
    <div className="watermark-layout watermark-free-editor">
      <section className="watermark-input-panel">
        <h3>第一张样本 · 自由摆放</h3>
        <label className="watermark-snap-control">
          <input
            type="checkbox"
            checked={snapEnabled}
            disabled={disabled}
            onChange={(event) => setSnapEnabled(event.target.checked)}
          />
          贴边自动吸附
          <span>继续拖动可越过边界 · 电脑按住 Alt 可暂时关闭</span>
        </label>
        <div className="watermark-stage dom-watermark-stage">
          {base && sourceUrl ? (
            <div
              aria-label="水印样本编辑画布"
              className="watermark-surface"
              ref={surface}
              style={{
                aspectRatio: `${base.w * canvas.canvasWidth}/${base.h * canvas.canvasHeight}`,
                backgroundColor: canvas.background,
              }}
            >
              {stack.map((layer, i) => {
                const dim = dimensions.get(layer.file);
                if (!dim) return null;
                const widthFactor = 1 - layer.crop.left - layer.crop.right;
                const heightFactor = 1 - layer.crop.top - layer.crop.bottom;
                return (
                  <div
                    aria-label={`${layer.id === SOURCE_LAYER_ID ? '原图' : `水印层 ${i + 1}`}，${layer.locked ? '已锁定' : '方向键移动，Shift 加速'}`}
                    className={`watermark-dom-layer ${layer.id === selectedId && !layer.locked ? 'selected' : ''} ${layer.locked ? 'is-locked' : ''}`}
                    key={layer.id}
                    onKeyDown={(event) => {
                      if (disabled || layer.locked) return;
                      const step = event.shiftKey ? 0.05 : 0.005;
                      const delta: Record<string, Partial<EditorLayer>> = {
                        ArrowLeft: { x: layer.x - step },
                        ArrowRight: { x: layer.x + step },
                        ArrowUp: { y: layer.y - step },
                        ArrowDown: { y: layer.y + step },
                      };
                      if (delta[event.key]) {
                        event.preventDefault();
                        change(layer.id, delta[event.key]);
                      }
                    }}
                    onPointerCancel={end}
                    onPointerDown={(e) => begin(e, layer)}
                    onPointerMove={move}
                    onPointerUp={end}
                    role="img"
                    style={{
                      left: `${layer.x * 100}%`,
                      top: `${layer.y * 100}%`,
                      width: `${((layer.scale * layerStretch(layer.scaleX)) / canvas.canvasWidth) * 100}%`,
                      zIndex: i,
                      aspectRatio: `${dim.w * widthFactor * layerStretch(layer.scaleX)}/${dim.h * heightFactor * layerStretch(layer.scaleY)}`,
                      transform: `translate(-50%, -50%) rotate(${layer.rotation}deg)`,
                    }}
                    tabIndex={disabled || layer.locked ? -1 : 0}
                  >
                    <div
                      className="watermark-crop-viewport"
                      style={{ opacity: layer.opacity }}
                    >
                      <img
                        alt=""
                        draggable={false}
                        src={
                          layer.id === SOURCE_LAYER_ID
                            ? sourceUrl
                            : layerUrls[
                                layers.findIndex((l) => l.id === layer.id)
                              ]
                        }
                        style={{
                          width: `${100 / widthFactor}%`,
                          height: `${100 / heightFactor}%`,
                          left: `${(-layer.crop.left / widthFactor) * 100}%`,
                          top: `${(-layer.crop.top / heightFactor) * 100}%`,
                        }}
                      />
                    </div>
                    {layer.id === selectedId && !disabled && !layer.locked && (
                      <>
                        {(['left', 'right', 'top', 'bottom'] as const).map(
                          (edge) => (
                            <button
                              key={edge}
                              type="button"
                              tabIndex={-1}
                              className={`stretch-handle stretch-${edge}`}
                              data-action={`stretch-${edge}`}
                              aria-label={`向${{ left: '左', right: '右', top: '上', bottom: '下' }[edge]}拉伸当前图层`}
                              title="拖动此边可独立拉伸宽或高"
                            />
                          ),
                        )}
                        <i
                          className="transform-handle top-left"
                          data-action="scale"
                        />
                        <i
                          className="transform-handle top-right"
                          data-action="scale"
                        />
                        <i
                          className="transform-handle bottom-left"
                          data-action="scale"
                        />
                        <i
                          className="transform-handle bottom-right"
                          data-action="scale"
                        />
                        <i
                          className="rotation-handle"
                          data-action="rotate"
                          title="拖动旋转"
                        />
                      </>
                    )}
                  </div>
                );
              })}
              {guides && (
                <svg
                  className="watermark-alignment-guides"
                  viewBox={`0 0 ${base.w * canvas.canvasWidth} ${base.h * canvas.canvasHeight}`}
                  aria-hidden="true"
                >
                  <polygon
                    points={guides.outline
                      .map((point) => `${point.x},${point.y}`)
                      .join(' ')}
                  />
                  {guides.lines.map((line) => (
                    <line
                      key={line.label}
                      x1={line.from.x}
                      y1={line.from.y}
                      x2={line.to.x}
                      y2={line.to.y}
                    />
                  ))}
                </svg>
              )}
            </div>
          ) : (
            <div className="watermark-stage-empty">
              先导入原图 / 视频，再添加水印层。
            </div>
          )}
        </div>
        <output className="watermark-alignment-status">
          {guides
            ? `对齐提示：${guides.lines.map((line) => line.label).join(' · ')}`
            : '拖动水印靠近原图边缘或中心，会出现对齐参考线。'}
        </output>
        <p className="stage-tip">
          四角等比缩放，四条边中间的手柄分别拉伸宽、高，顶部圆点旋转；也可用滑块调整。原图默认锁定。对齐线只作辅助，水印可以放在原图外；摆好后点击“一键适应内容”收齐导出边界。样本按比例应用到整批。
        </p>
        {error && <p className="error-banner">{error}</p>}
      </section>
      <fieldset
        disabled={disabled}
        className="watermark-layer-panel workshop-fieldset"
      >
        <h3>画布、图层与变换</h3>
        <div className="composition-controls">
          <p>
            摆好原图和水印后，一键收齐四周边界。图层大小和相对位置保持不变。
          </p>
          <Button
            type="button"
            disabled={
              !base || layers.some((layer) => !dimensions.has(layer.file))
            }
            onClick={() => {
              if (!base) return;
              try {
                const fitted = fitCompositionToContent(
                  base.w,
                  base.h,
                  layers,
                  layers.map((layer) => {
                    const d = dimensions.get(layer.file)!;
                    return { width: d.w, height: d.h, bounds: d.bounds };
                  }),
                  canvas,
                  sourceKind === 'video' ? undefined : base.bounds,
                );
                publishChange(fitted.layers, fitted.composition);
                setError('');
              } catch (e) {
                setError(e instanceof Error ? e.message : '无法调整画布');
              }
            }}
          >
            <Scan />
            一键适应内容
          </Button>
          <Button
            className="composition-reset"
            variant="outline"
            type="button"
            onClick={() => {
              const oldWidth = canvas.canvasWidth,
                oldHeight = canvas.canvasHeight;
              // Keep every layer's pixel position relative to the original centre.
              onChange(
                layers.map((layer) => ({
                  ...layer,
                  x: 0.5 + (layer.x - 0.5) * oldWidth,
                  y: 0.5 + (layer.y - 0.5) * oldHeight,
                })),
                {
                  ...canvas,
                  canvasWidth: 1,
                  canvasHeight: 1,
                  source: {
                    ...canvas.source,
                    x: 0.5 + (canvas.source.x - 0.5) * oldWidth,
                    y: 0.5 + (canvas.source.y - 0.5) * oldHeight,
                  },
                },
              );
            }}
          >
            <RefreshCw />
            恢复原图画布大小
          </Button>
          <div className="transform-grid">
            {(['canvasWidth', 'canvasHeight'] as const).map((key) => (
              <label key={key}>
                <span>画布{key === 'canvasWidth' ? '宽' : '高'}（原图 %）</span>
                <CanvasPercent
                  value={canvas[key]}
                  label={
                    key === 'canvasWidth' ? '画布宽度百分比' : '画布高度百分比'
                  }
                  onChange={(value) => {
                    const next = { ...canvas, [key]: value };
                    try {
                      if (base) compositionSize(base.w, base.h, next);
                      onChange(layers, next);
                      setError('');
                    } catch (e) {
                      setError(e instanceof Error ? e.message : '画布尺寸无效');
                    }
                  }}
                />
              </label>
            ))}
            {backgroundVisible && (
              <label>
                <span>空白区域</span>
                <select
                  aria-label="空白区域底色"
                  value={
                    canvas.background === 'transparent'
                      ? 'transparent'
                      : 'color'
                  }
                  onChange={(e) =>
                    onChange(layers, {
                      ...canvas,
                      background:
                        e.target.value === 'transparent'
                          ? 'transparent'
                          : '#ffffff',
                    })
                  }
                >
                  <option value="transparent">保留透明</option>
                  <option value="color">自定义颜色</option>
                </select>
              </label>
            )}
            {backgroundVisible && canvas.background !== 'transparent' && (
              <label>
                <span>自定义底色</span>
                <input
                  type="color"
                  aria-label="自定义画布底色"
                  value={canvas.background}
                  onChange={(e) =>
                    onChange(layers, { ...canvas, background: e.target.value })
                  }
                />
              </label>
            )}
          </div>
          <p className="canvas-background-note">
            {backgroundVisible
              ? sourceKind === 'video'
                ? '底色只填原视频以外或透出的空白。保留透明会导出 WebM，处理较慢；选择颜色可导出更快的 MP4。'
                : '底色只填原图以外或透出的空白；透明棋盘格仅用于预览，不会出现在成品中。'
              : '原图已铺满画布，底色不会影响成品。'}
          </p>
        </div>
        <div className="layer-source-actions">
          <label className="mini-file">
            <Plus />
            上传水印
            <input
              accept="image/*"
              multiple
              onChange={(e) => {
                void add(Array.from(e.target.files || []));
                e.target.value = '';
              }}
              type="file"
            />
          </label>
          <select
            aria-label="从水印库选择"
            onChange={(e) => {
              const item = library.find((s) => s.record.id === e.target.value);
              if (item) {
                const layer = defaultLayer(item.file);
                onChange([...layers, layer]);
                setActive(layer.id);
              }
            }}
            value=""
          >
            <option value="">从水印库选择…</option>
            {library.map((item) => (
              <option key={item.record.id} value={item.record.id}>
                {item.record.title} · {item.record.author}
              </option>
            ))}
          </select>
        </div>
        <div className="transform-layer-list">
          {[...stack].reverse().map((layer) => (
            <article
              className={layer.id === selectedId ? 'is-active' : ''}
              key={layer.id}
            >
              <button
                className="layer-select"
                onClick={() => setActive(layer.id)}
                type="button"
              >
                <strong>
                  {layer.id === SOURCE_LAYER_ID ? '原图 · ' : '水印 · '}
                  {layer.file.name}
                  {layer.locked ? ' · 已锁定' : ''}
                </strong>
              </button>
              <span className="layer-order-actions">
                <button
                  type="button"
                  aria-label={`${layer.locked ? '解锁' : '锁定'}${layer.id === SOURCE_LAYER_ID ? '原图' : '水印层'}`}
                  onClick={() => change(layer.id, { locked: !layer.locked })}
                >
                  {layer.locked ? <Lock /> : <Unlock />}
                </button>
                <button
                  aria-label="上移图层（向前）"
                  disabled={layer.locked || stack.at(-1)?.id === layer.id}
                  onClick={() => reorder(layer.id, 1)}
                  type="button"
                >
                  <ArrowUp />
                </button>
                <button
                  aria-label="下移图层（向后）"
                  disabled={layer.locked || stack[0]?.id === layer.id}
                  onClick={() => reorder(layer.id, -1)}
                  type="button"
                >
                  <ArrowDown />
                </button>
                <button
                  aria-label="移除水印层"
                  disabled={layer.locked || layer.id === SOURCE_LAYER_ID}
                  onClick={() =>
                    publishStack(stack.filter((l) => l.id !== layer.id))
                  }
                  type="button"
                >
                  <X />
                </button>
              </span>
            </article>
          ))}
        </div>
        <p className="stage-tip">
          列表从上到下对应从前到后。锁定层不会响应拖动，也不会挡住未锁定图层的操作。
        </p>
        {selected && (
          <fieldset
            className="transform-controls workshop-fieldset"
            disabled={disabled || selected.locked}
          >
            <legend>
              {selected.id === SOURCE_LAYER_ID ? '原图' : '当前水印'}
              {selected.locked ? ' · 已锁定，请先解锁再调整' : ' · 自由调整'}
            </legend>
            <Button
              onClick={() =>
                change(selected.id, {
                  ...(selected.id === SOURCE_LAYER_ID
                    ? { ...defaultComposition().source, locked: false }
                    : defaultLayer(selected.file)),
                  id: selected.id,
                })
              }
              size="sm"
              variant="outline"
            >
              <RefreshCw />
              重置本层
            </Button>
            {selected.id !== SOURCE_LAYER_ID && base && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  const dim = dimensions.get(selected.file);
                  if (!dim) return;
                  try {
                    const size = compositionSize(base.w, base.h, canvas);
                    change(
                      selected.id,
                      fitLayerToSource(
                        selected,
                        { width: dim.w, height: dim.h, bounds: dim.bounds },
                        canvas.source,
                        { width: base.w, height: base.h },
                        { ...size, referenceWidth: base.w },
                      ),
                    );
                    setError('');
                  } catch (e) {
                    setError(e instanceof Error ? e.message : '无法贴合原图');
                  }
                }}
              >
                <Scan />
                拉伸贴合原图
              </Button>
            )}
            <div className="transform-grid">
              {(
                [
                  {
                    key: 'x',
                    label: '水平 X',
                    min: -0.5,
                    max: 1.5,
                    step: 0.005,
                  },
                  {
                    key: 'y',
                    label: '垂直 Y',
                    min: -0.5,
                    max: 1.5,
                    step: 0.005,
                  },
                  {
                    key: 'scale',
                    label: '等比缩放',
                    min: 0.01,
                    max: 6,
                    step: 0.005,
                  },
                  {
                    key: 'scaleX',
                    label: '横向拉伸',
                    min: 0.01,
                    max: 6,
                    step: 0.005,
                  },
                  {
                    key: 'scaleY',
                    label: '纵向拉伸',
                    min: 0.01,
                    max: 6,
                    step: 0.005,
                  },
                  {
                    key: 'opacity',
                    label: '透明度',
                    min: 0,
                    max: 1,
                    step: 0.01,
                  },
                  {
                    key: 'rotation',
                    label: '旋转',
                    min: -360,
                    max: 360,
                    step: 1,
                  },
                ] as const
              ).map((control) => (
                <label key={control.key}>
                  <span>
                    {control.label} ·{' '}
                    {control.key === 'rotation'
                      ? `${Math.round(selected.rotation)}°`
                      : `${Math.round((selected[control.key] ?? 1) * 100)}%`}
                  </span>
                  <input
                    aria-label={control.label}
                    max={control.max}
                    min={control.min}
                    onChange={(e) =>
                      change(selected.id, {
                        [control.key]: Number(e.target.value),
                      })
                    }
                    step={control.step}
                    type="range"
                    value={selected[control.key] ?? 1}
                  />
                </label>
              ))}
              <fieldset className="crop-controls">
                <legend>裁切当前图层</legend>
                {(['top', 'right', 'bottom', 'left'] as const).map((edge) => (
                  <label key={edge}>
                    <span>
                      {
                        { top: '上', right: '右', bottom: '下', left: '左' }[
                          edge
                        ]
                      }{' '}
                      · {Math.round(selected.crop[edge] * 100)}%
                    </span>
                    <input
                      max="0.49"
                      min="0"
                      onChange={(e) =>
                        change(selected.id, {
                          crop: {
                            ...selected.crop,
                            [edge]: Number(e.target.value),
                          },
                        })
                      }
                      step=".005"
                      type="range"
                      value={selected.crop[edge]}
                    />
                  </label>
                ))}
              </fieldset>
            </div>
          </fieldset>
        )}
        <p>
          新上传的水印会自动存入水印库，可再补充作者、来源和分类。原图和各水印都可以独立锁定，锁定状态也会保存。
        </p>
      </fieldset>
    </div>
  );
}
