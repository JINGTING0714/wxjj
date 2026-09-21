'use client';
import { useEffect, useRef, useState, type PointerEvent } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Bold,
  Check,
  Eye,
  EyeOff,
  Italic,
  Lock,
  Maximize2,
  Minimize2,
  Move,
  Unlock,
  Plus,
  RefreshCw,
  Scan,
  SlidersHorizontal,
  Redo2,
  Type,
  Underline,
  Undo2,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MobileWorkspacePanel, MobileWorkspaceSheet } from './mobile-workspace';
import { useVault } from './vault-provider';
import { useFileUrls } from './use-workspace-state';
import {
  canvasBlob,
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
import type { WatermarkMobilePanel } from './watermark-panel';

export type TextLayerStyle = {
  content: string;
  fontFamily: string;
  fontLabel: string;
  weight: 400 | 700;
  italic: boolean;
  underline: boolean;
  color: string;
};

export type EditorLayer = WatermarkLayerInput & {
  id: string;
  text?: TextLayerStyle;
};

const textFontOptions = [
  { label: '思源黑体', family: 'Noto Sans SC' },
  { label: '思源宋体', family: 'Noto Serif SC' },
  { label: '马善政毛笔', family: 'Ma Shan Zheng' },
  { label: 'Bebas 海报体', family: 'Bebas Neue' },
  { label: 'Caveat 手写体', family: 'Caveat' },
] as const;

const defaultTextStyle: TextLayerStyle = {
  content: '双击编辑文字',
  fontFamily: 'Noto Sans SC',
  fontLabel: '思源黑体',
  weight: 400,
  italic: false,
  underline: false,
  color: '#ffffff',
};

async function renderTextLayer(style: TextLayerStyle) {
  const content = style.content.trim() || '文字';
  const fontSize = 144;
  const font = `${style.italic ? 'italic ' : ''}${style.weight} ${fontSize}px "${style.fontFamily}"`;
  await document.fonts.load(font, content).catch(() => []);
  const measure = document.createElement('canvas');
  const measuring = measure.getContext('2d');
  if (!measuring) throw new Error('当前浏览器无法生成文字图层');
  measuring.font = font;
  const maxLineWidth = 2200;
  const lines: string[] = [];
  for (const paragraph of content.split(/\r?\n/)) {
    let line = '';
    for (const character of paragraph || ' ') {
      const candidate = `${line}${character}`;
      if (line && measuring.measureText(candidate).width > maxLineWidth) {
        lines.push(line);
        line = character;
      } else line = candidate;
    }
    lines.push(line || ' ');
  }
  const padding = 44;
  const lineHeight = Math.round(fontSize * 1.28);
  const widths = lines.map((line) => measuring.measureText(line).width);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(160, Math.ceil(Math.max(...widths) + padding * 2));
  canvas.height = Math.max(190, lines.length * lineHeight + padding * 2);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('当前浏览器无法生成文字图层');
  context.font = font;
  context.fillStyle = style.color;
  context.textBaseline = 'top';
  lines.forEach((line, index) => {
    const y = padding + index * lineHeight;
    context.fillText(line, padding, y);
    if (style.underline) {
      context.fillRect(
        padding,
        y + fontSize + 8,
        Math.max(1, widths[index]),
        Math.max(4, Math.round(fontSize / 22)),
      );
    }
  });
  const blob = await canvasBlob(canvas, 'image/png');
  canvas.width = canvas.height = 0;
  return new File([blob], `文字-${content.slice(0, 18)}.png`, {
    type: 'image/png',
    lastModified: Date.now(),
  });
}
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
  mobilePanel,
}: {
  source?: File;
  layers: EditorLayer[];
  onChange: (layers: EditorLayer[], composition?: WatermarkComposition) => void;
  composition?: WatermarkComposition;
  disabled?: boolean;
  sourceKind?: 'image' | 'video';
  mobilePanel?: WatermarkMobilePanel | null;
}) {
  const vault = useVault();
  const [active, setActive] = useState('');
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [mobileTouchEditing, setMobileTouchEditing] = useState(false);
  const [mobilePreviewFullscreen, setMobilePreviewFullscreen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [textDraft, setTextDraft] = useState<TextLayerStyle>(defaultTextStyle);
  const [textBusy, setTextBusy] = useState(false);
  const [guides, setGuides] = useState<AlignmentGuides | null>(null);
  const [dimensions, setDimensions] = useState(
    new Map<
      File,
      { w: number; h: number; bounds?: ContentBounds | null; opaque: boolean }
    >(),
  );
  const [error, setError] = useState('');
  const history = useRef<{
    source?: File;
    current: { layers: EditorLayer[]; composition?: WatermarkComposition };
    past: Array<{ layers: EditorLayer[]; composition?: WatermarkComposition }>;
    future: Array<{
      layers: EditorLayer[];
      composition?: WatermarkComposition;
    }>;
    applying: boolean;
  }>({
    source,
    current: { layers, composition },
    past: [],
    future: [],
    applying: false,
  });
  const [historyAvailability, setHistoryAvailability] = useState({
    undo: false,
    redo: false,
  });
  const refreshHistoryAvailability = () =>
    setHistoryAvailability({
      undo: history.current.past.length > 0,
      redo: history.current.future.length > 0,
    });
  const [library, setLibrary] = useState<
    Array<{ record: StoredWatermark; file: File }>
  >([]);
  useEffect(() => {
    const next = { layers, composition };
    if (history.current.source !== source) {
      history.current = {
        source,
        current: next,
        past: [],
        future: [],
        applying: false,
      };
      refreshHistoryAvailability();
      return;
    }
    if (history.current.applying) {
      history.current.applying = false;
      history.current.current = next;
      refreshHistoryAvailability();
      return;
    }
    if (
      history.current.current.layers !== layers ||
      history.current.current.composition !== composition
    ) {
      history.current.past.push(history.current.current);
      if (history.current.past.length > 80) history.current.past.shift();
      history.current.current = next;
      history.current.future = [];
      refreshHistoryAvailability();
    }
  }, [composition, layers, source]);
  const mobileDirectEditing = mobilePanel === 'actions' && mobileTouchEditing;
  useEffect(() => {
    if (!mobilePreviewFullscreen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMobilePreviewFullscreen(false);
    };
    const desktop = window.matchMedia('(min-width: 781px)');
    const closeOnDesktop = () => {
      if (desktop.matches) setMobilePreviewFullscreen(false);
    };
    document.addEventListener('keydown', closeOnEscape);
    desktop.addEventListener('change', closeOnDesktop);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener('keydown', closeOnEscape);
      desktop.removeEventListener('change', closeOnDesktop);
    };
  }, [mobilePreviewFullscreen]);
  const surface = useRef<HTMLDivElement>(null);
  const hiddenLayerOpacity = useRef(new Map<string, number>());
  const [sourceUrl] = useFileUrls(source ? [source] : []);
  const layerUrls = useFileUrls(layers.map((l) => l.file));
  const canvas = resolveComposition(composition);
  const undo = () => {
    const previous = history.current.past.pop();
    if (!previous || disabled) return;
    history.current.future.push({ layers, composition });
    history.current.applying = true;
    publishChange(previous.layers, previous.composition);
    refreshHistoryAvailability();
  };
  const redo = () => {
    const next = history.current.future.pop();
    if (!next || disabled) return;
    history.current.past.push({ layers, composition });
    history.current.applying = true;
    publishChange(next.layers, next.composition);
    refreshHistoryAvailability();
  };
  const canUndo = historyAvailability.undo;
  const canRedo = historyAvailability.redo;
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
  const commitTextLayer = async () => {
    if (disabled || textBusy || !source || !textDraft.content.trim()) return;
    if (selected?.locked) return;
    setTextBusy(true);
    try {
      const file = await renderTextLayer(textDraft);
      if (selected?.text && selected.id !== SOURCE_LAYER_ID) {
        change(selected.id, {
          file,
          text: { ...textDraft },
          crop: { top: 0, right: 0, bottom: 0, left: 0 },
          scaleX: 1,
          scaleY: 1,
        });
      } else {
        const layer: EditorLayer = {
          ...defaultLayer(file),
          scale: 0.36,
          text: { ...textDraft },
        };
        onChange([...currentLayers.current, layer]);
        setActive(layer.id);
      }
      setError('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '文字图层生成失败');
    } finally {
      setTextBusy(false);
    }
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
    if (event.pointerType === 'touch' && !mobileDirectEditing) return;
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
    if (layer.text) setTextDraft(layer.text);
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
      <section
        className={`watermark-input-panel mobile-workspace-preview ${mobilePreviewFullscreen ? 'is-mobile-fullscreen' : ''}`}
        data-interaction={mobileDirectEditing ? 'edit' : 'scroll'}
        data-fullscreen={mobilePreviewFullscreen ? 'true' : 'false'}
      >
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
        <div
          className="watermark-stage dom-watermark-stage"
          data-interaction={mobileDirectEditing ? 'edit' : 'scroll'}
        >
          {base && sourceUrl ? (
            <div
              aria-label="水印样本编辑画布"
              className="watermark-surface"
              ref={surface}
              style={
                {
                  aspectRatio: `${base.w * canvas.canvasWidth}/${base.h * canvas.canvasHeight}`,
                  '--watermark-ratio':
                    (base.w * canvas.canvasWidth) /
                    (base.h * canvas.canvasHeight),
                  backgroundColor: canvas.background,
                } as React.CSSProperties
              }
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
        <div
          className="mobile-preview-interaction mobile-workspace-only"
          data-mobile-active={mobilePanel === 'actions'}
        >
          <div className="mobile-preview-actions" aria-label="预览快捷操作">
            <Button
              aria-label="撤销上一步水印操作"
              disabled={disabled || !canUndo}
              onClick={undo}
              size="sm"
              type="button"
              variant="outline"
            >
              <Undo2 />
              撤销
            </Button>
            <Button
              aria-label="重做上一步水印操作"
              disabled={disabled || !canRedo}
              onClick={redo}
              size="sm"
              type="button"
              variant="outline"
            >
              <Redo2 />
              重做
            </Button>
            <label className="mini-file mobile-preview-action">
              <Plus />
              导入水印
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
            <Button
              disabled={
                disabled ||
                !selected ||
                selected.id === SOURCE_LAYER_ID ||
                !base
              }
              onClick={() => {
                if (!selected || selected.id === SOURCE_LAYER_ID || !base)
                  return;
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
                } catch (e) {
                  setError(e instanceof Error ? e.message : '无法贴合原图');
                }
              }}
              size="sm"
              type="button"
              variant="outline"
            >
              <Scan />
              一键贴合
            </Button>
            <Button
              aria-label={selected?.locked ? '解锁当前图层' : '锁定当前图层'}
              disabled={disabled || !selected}
              onClick={() =>
                selected && change(selected.id, { locked: !selected.locked })
              }
              size="sm"
              type="button"
              variant="outline"
            >
              {selected?.locked ? <Lock /> : <Unlock />}
              {selected?.locked ? '解锁' : '锁定'}
            </Button>
            <Button
              aria-label="删除当前水印图层"
              disabled={
                disabled ||
                !selected ||
                selected.id === SOURCE_LAYER_ID ||
                selected.locked
              }
              onClick={() => {
                if (
                  selected &&
                  selected.id !== SOURCE_LAYER_ID &&
                  !selected.locked
                )
                  publishStack(
                    stack.filter((layer) => layer.id !== selected.id),
                  );
              }}
              size="sm"
              type="button"
              variant="outline"
            >
              <X />
              删除
            </Button>
            <Button
              disabled={disabled || !base}
              onClick={() => setMobileTouchEditing((editing) => !editing)}
              size="sm"
              type="button"
              variant={mobileDirectEditing ? 'default' : 'outline'}
            >
              {mobileDirectEditing ? <Check /> : <Move />}
              {mobileDirectEditing ? '完成移动' : '移动 / 缩放'}
            </Button>
            <Button
              aria-label={mobilePreviewFullscreen ? '退出全屏预览' : '全屏预览'}
              disabled={!base}
              onClick={() => setMobilePreviewFullscreen((open) => !open)}
              size="sm"
              type="button"
              variant="outline"
            >
              {mobilePreviewFullscreen ? <Minimize2 /> : <Maximize2 />}
              {mobilePreviewFullscreen ? '退出全屏' : '全屏'}
            </Button>
          </div>
          <span>
            {mobileDirectEditing
              ? '直接拖动图层；四角缩放，顶部圆点旋转。'
              : '点击“移动 / 缩放”后可直接操作预览。'}
          </span>
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
        className="watermark-layer-panel workshop-fieldset mobile-editor-controls"
      >
        <h3 className="desktop-workspace-only">画布、图层与变换</h3>
        <div className="editor-history-actions desktop-workspace-only">
          <Button
            disabled={disabled || !canUndo}
            onClick={undo}
            size="sm"
            variant="outline"
          >
            <Undo2 /> 撤销
          </Button>
          <Button
            disabled={disabled || !canRedo}
            onClick={redo}
            size="sm"
            variant="outline"
          >
            <Redo2 /> 重做
          </Button>
        </div>
        <div className="composition-controls desktop-workspace-only">
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
        <MobileWorkspacePanel
          active={mobilePanel === 'watermarks'}
          className="watermark-layers-mobile-panel"
          label="水印图层"
        >
          <div className="mobile-workspace-panel-heading mobile-workspace-only">
            <p className="eyebrow">LAYERS</p>
            <h3>水印与图层</h3>
            <p>添加、选择、排序或锁定图层。</p>
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
                const item = library.find(
                  (s) => s.record.id === e.target.value,
                );
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
                  onClick={() => {
                    setActive(layer.id);
                    if (layer.text) setTextDraft(layer.text);
                  }}
                  type="button"
                >
                  <strong>
                    {layer.id === SOURCE_LAYER_ID
                      ? '原图 · '
                      : layer.text
                        ? '文字 · '
                        : '水印 · '}
                    {layer.text?.content || layer.file.name}
                    {layer.locked ? ' · 已锁定' : ''}
                  </strong>
                </button>
                <span className="layer-order-actions">
                  <button
                    type="button"
                    aria-label={layer.opacity <= 0 ? '显示图层' : '隐藏图层'}
                    onClick={() => {
                      if (layer.opacity <= 0) {
                        change(layer.id, {
                          opacity:
                            hiddenLayerOpacity.current.get(layer.id) ?? 1,
                        });
                      } else {
                        hiddenLayerOpacity.current.set(layer.id, layer.opacity);
                        change(layer.id, { opacity: 0 });
                      }
                    }}
                  >
                    {layer.opacity <= 0 ? <EyeOff /> : <Eye />}
                  </button>
                  <button
                    type="button"
                    aria-label={`${layer.locked ? '解锁' : '锁定'}${layer.id === SOURCE_LAYER_ID ? '原图' : layer.text ? '文字层' : '水印层'}`}
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
          <p className="watermark-library-note">
            新上传的水印会自动存入水印库，可再补充作者、来源和分类。原图和各水印都可以独立锁定，锁定状态也会保存。
          </p>
        </MobileWorkspacePanel>
        <MobileWorkspacePanel
          active={mobilePanel === 'text'}
          className="watermark-text-mobile-panel"
          label="添加与编辑文字"
        >
          <div className="mobile-workspace-panel-heading mobile-workspace-only">
            <p className="eyebrow">TEXT</p>
            <h3>{selected?.text ? '编辑文字图层' : '添加文字图层'}</h3>
            <p>文字会作为普通图层参与拖动、缩放、排序和批量导出。</p>
          </div>
          <div className="watermark-text-controls">
            <label className="watermark-text-content">
              <span>文字内容</span>
              <textarea
                disabled={disabled || textBusy || Boolean(selected?.locked)}
                maxLength={240}
                onChange={(event) =>
                  setTextDraft((current) => ({
                    ...current,
                    content: event.target.value,
                  }))
                }
                placeholder="输入中文或 English…"
                rows={2}
                value={textDraft.content}
              />
            </label>
            <label>
              <span>字体</span>
              <select
                disabled={disabled || textBusy || Boolean(selected?.locked)}
                onChange={(event) => {
                  const font = textFontOptions.find(
                    (item) => item.family === event.target.value,
                  );
                  if (font)
                    setTextDraft((current) => ({
                      ...current,
                      fontFamily: font.family,
                      fontLabel: font.label,
                    }));
                }}
                value={textDraft.fontFamily}
              >
                {textFontOptions.map((font) => (
                  <option key={font.family} value={font.family}>
                    {font.label}
                  </option>
                ))}
              </select>
            </label>
            <div className="watermark-text-style-buttons" aria-label="文字样式">
              <button
                aria-label="文字加粗"
                aria-pressed={textDraft.weight === 700}
                disabled={disabled || textBusy || Boolean(selected?.locked)}
                onClick={() =>
                  setTextDraft((current) => ({
                    ...current,
                    weight: current.weight === 700 ? 400 : 700,
                  }))
                }
                type="button"
              >
                <Bold />
                粗体
              </button>
              <button
                aria-label="文字斜体"
                aria-pressed={textDraft.italic}
                disabled={disabled || textBusy || Boolean(selected?.locked)}
                onClick={() =>
                  setTextDraft((current) => ({
                    ...current,
                    italic: !current.italic,
                  }))
                }
                type="button"
              >
                <Italic />
                斜体
              </button>
              <button
                aria-label="文字下划线"
                aria-pressed={textDraft.underline}
                disabled={disabled || textBusy || Boolean(selected?.locked)}
                onClick={() =>
                  setTextDraft((current) => ({
                    ...current,
                    underline: !current.underline,
                  }))
                }
                type="button"
              >
                <Underline />
                下划线
              </button>
              <label className="watermark-text-color">
                <input
                  aria-label="文字颜色"
                  disabled={disabled || textBusy || Boolean(selected?.locked)}
                  onChange={(event) =>
                    setTextDraft((current) => ({
                      ...current,
                      color: event.target.value,
                    }))
                  }
                  type="color"
                  value={textDraft.color}
                />
                <span>颜色</span>
              </label>
            </div>
            <p
              className="watermark-text-sample"
              style={{
                color: textDraft.color,
                fontFamily: textDraft.fontFamily,
                fontStyle: textDraft.italic ? 'italic' : 'normal',
                fontWeight: textDraft.weight,
                textDecoration: textDraft.underline ? 'underline' : 'none',
              }}
            >
              {textDraft.content || '文字预览 Text Preview'}
            </p>
            <Button
              disabled={
                disabled ||
                textBusy ||
                !source ||
                !textDraft.content.trim() ||
                Boolean(selected?.locked)
              }
              onClick={() => void commitTextLayer()}
              type="button"
            >
              <Type />
              {textBusy
                ? '正在生成…'
                : selected?.text
                  ? '应用文字修改'
                  : '添加文字图层'}
            </Button>
          </div>
        </MobileWorkspacePanel>
        <MobileWorkspacePanel
          active={mobilePanel === 'adjust'}
          className="watermark-adjust-mobile-panel"
          label="调整图层"
        >
          <div className="mobile-workspace-panel-heading mobile-workspace-only">
            <p className="eyebrow">ADJUST</p>
            <h3>调整当前图层</h3>
            <p>主面板只保留高频参数，精确设置按需展开。</p>
          </div>
          {selected && (
            <fieldset
              className="transform-controls workshop-fieldset"
              disabled={disabled || selected.locked}
            >
              <legend>
                {selected.id === SOURCE_LAYER_ID
                  ? '原图'
                  : selected.text
                    ? '当前文字'
                    : '当前水印'}
                {selected.locked ? ' · 已锁定，请先解锁再调整' : ' · 自由调整'}
              </legend>
              <Button
                onClick={() =>
                  change(selected.id, {
                    ...(selected.id === SOURCE_LAYER_ID
                      ? { ...defaultComposition().source, locked: false }
                      : {
                          ...defaultLayer(selected.file),
                          ...(selected.text ? { text: selected.text } : {}),
                        }),
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
              <div
                aria-label="快速定位当前图层"
                className="mobile-position-grid mobile-workspace-only"
              >
                {[
                  [0.08, 0.08, '左上'],
                  [0.5, 0.08, '上中'],
                  [0.92, 0.08, '右上'],
                  [0.08, 0.5, '左中'],
                  [0.5, 0.5, '居中'],
                  [0.92, 0.5, '右中'],
                  [0.08, 0.92, '左下'],
                  [0.5, 0.92, '下中'],
                  [0.92, 0.92, '右下'],
                ].map(([x, y, label]) => (
                  <button
                    aria-label={String(label)}
                    className={
                      Math.abs(selected.x - Number(x)) < 0.02 &&
                      Math.abs(selected.y - Number(y)) < 0.02
                        ? 'is-active'
                        : ''
                    }
                    key={String(label)}
                    onClick={() =>
                      change(selected.id, { x: Number(x), y: Number(y) })
                    }
                    title={String(label)}
                    type="button"
                  >
                    <i />
                  </button>
                ))}
              </div>
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
                  <label
                    className={
                      ['x', 'y', 'scaleX', 'scaleY'].includes(control.key)
                        ? 'mobile-advanced-control'
                        : undefined
                    }
                    key={control.key}
                  >
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
                <fieldset className="crop-controls mobile-advanced-control">
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
              <Button
                className="mobile-advanced-trigger mobile-workspace-only"
                onClick={() => setAdvancedOpen(true)}
                type="button"
                variant="outline"
              >
                <SlidersHorizontal />
                更多调整 →
              </Button>
            </fieldset>
          )}
        </MobileWorkspacePanel>
      </fieldset>
      <MobileWorkspaceSheet
        description="这些低频参数不会常驻主工作台；修改会立即反映在上方预览。"
        onOpenChange={setAdvancedOpen}
        open={advancedOpen}
        title="高级调整"
      >
        <div className="mobile-advanced-settings">
          <section>
            <h4>画布与内容边界</h4>
            <div className="mobile-advanced-actions">
              <Button
                disabled={
                  disabled ||
                  !base ||
                  layers.some((layer) => !dimensions.has(layer.file))
                }
                onClick={() => {
                  if (!base) return;
                  try {
                    const fitted = fitCompositionToContent(
                      base.w,
                      base.h,
                      layers,
                      layers.map((layer) => {
                        const dimension = dimensions.get(layer.file)!;
                        return {
                          width: dimension.w,
                          height: dimension.h,
                          bounds: dimension.bounds,
                        };
                      }),
                      canvas,
                      sourceKind === 'video' ? undefined : base.bounds,
                    );
                    publishChange(fitted.layers, fitted.composition);
                    setError('');
                  } catch (cause) {
                    setError(
                      cause instanceof Error ? cause.message : '无法调整画布',
                    );
                  }
                }}
                type="button"
              >
                <Scan /> 一键适应内容
              </Button>
              <Button
                disabled={disabled}
                onClick={() => {
                  const oldWidth = canvas.canvasWidth;
                  const oldHeight = canvas.canvasHeight;
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
                type="button"
                variant="outline"
              >
                <RefreshCw /> 恢复原图画布
              </Button>
            </div>
            <div className="mobile-advanced-grid">
              {(['canvasWidth', 'canvasHeight'] as const).map((key) => (
                <label key={key}>
                  <span>
                    画布{key === 'canvasWidth' ? '宽' : '高'}（原图 %）
                  </span>
                  <CanvasPercent
                    label={
                      key === 'canvasWidth'
                        ? '画布宽度百分比'
                        : '画布高度百分比'
                    }
                    onChange={(value) => {
                      const next = { ...canvas, [key]: value };
                      try {
                        if (base) compositionSize(base.w, base.h, next);
                        onChange(layers, next);
                        setError('');
                      } catch (cause) {
                        setError(
                          cause instanceof Error
                            ? cause.message
                            : '画布尺寸无效',
                        );
                      }
                    }}
                    value={canvas[key]}
                  />
                </label>
              ))}
              {backgroundVisible && (
                <label>
                  <span>空白区域</span>
                  <select
                    aria-label="空白区域底色"
                    disabled={disabled}
                    onChange={(event) =>
                      onChange(layers, {
                        ...canvas,
                        background:
                          event.target.value === 'transparent'
                            ? 'transparent'
                            : '#ffffff',
                      })
                    }
                    value={
                      canvas.background === 'transparent'
                        ? 'transparent'
                        : 'color'
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
                    aria-label="自定义画布底色"
                    disabled={disabled}
                    onChange={(event) =>
                      onChange(layers, {
                        ...canvas,
                        background: event.target.value,
                      })
                    }
                    type="color"
                    value={canvas.background}
                  />
                </label>
              )}
            </div>
          </section>
          {selected && (
            <fieldset disabled={disabled || selected.locked}>
              <legend>
                {selected.id === SOURCE_LAYER_ID ? '原图' : '当前水印'} ·
                精确参数
              </legend>
              <div className="mobile-advanced-grid">
                {(
                  [
                    { key: 'x', label: '水平 X', min: -0.5, max: 1.5 },
                    { key: 'y', label: '垂直 Y', min: -0.5, max: 1.5 },
                    { key: 'scaleX', label: '横向拉伸', min: 0.01, max: 6 },
                    { key: 'scaleY', label: '纵向拉伸', min: 0.01, max: 6 },
                  ] as const
                ).map((control) => (
                  <label key={control.key}>
                    <span>
                      {control.label} ·{' '}
                      {Math.round((selected[control.key] ?? 1) * 100)}%
                    </span>
                    <input
                      aria-label={control.label}
                      max={control.max}
                      min={control.min}
                      onChange={(event) =>
                        change(selected.id, {
                          [control.key]: Number(event.target.value),
                        })
                      }
                      step=".005"
                      type="range"
                      value={selected[control.key] ?? 1}
                    />
                  </label>
                ))}
              </div>
              <div className="mobile-advanced-crop">
                <h4>裁切当前图层</h4>
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
                      onChange={(event) =>
                        change(selected.id, {
                          crop: {
                            ...selected.crop,
                            [edge]: Number(event.target.value),
                          },
                        })
                      }
                      step=".005"
                      type="range"
                      value={selected.crop[edge]}
                    />
                  </label>
                ))}
              </div>
            </fieldset>
          )}
        </div>
      </MobileWorkspaceSheet>
    </div>
  );
}
