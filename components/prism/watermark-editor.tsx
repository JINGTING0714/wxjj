'use client';
import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { ArrowDown, ArrowUp, Plus, RefreshCw, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useVault } from './vault-provider';
import { useFileUrls } from './use-workspace-state';
import { loadImage, type WatermarkLayerInput } from '@/lib/image-processing';
import type { StoredWatermark } from '@/lib/prism-types';

export type EditorLayer = WatermarkLayerInput & { id: string };
export const defaultLayer = (file: File): EditorLayer => ({
  id: crypto.randomUUID(),
  file,
  x: 0.5,
  y: 0.5,
  scale: 0.6,
  rotation: 0,
  opacity: 1,
  crop: { top: 0, bottom: 0, left: 0, right: 0 },
});
export function WatermarkEditor({
  source,
  layers,
  onChange,
  disabled = false,
}: {
  source?: File;
  layers: EditorLayer[];
  onChange: (layers: EditorLayer[]) => void;
  disabled?: boolean;
}) {
  const vault = useVault();
  const [active, setActive] = useState('');
  const [dimensions, setDimensions] = useState(
    new Map<File, { w: number; h: number }>(),
  );
  const [error, setError] = useState('');
  const [library, setLibrary] = useState<
    Array<{ record: StoredWatermark; file: File }>
  >([]);
  const surface = useRef<HTMLDivElement>(null);
  const [sourceUrl] = useFileUrls(source ? [source] : []);
  const layerUrls = useFileUrls(layers.map((l) => l.file));
  const selected = layers.find((l) => l.id === active) || layers[0];
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
  } | null>(null);
  const frame = useRef<number>(0);
  const currentLayers = useRef(layers);
  currentLayers.current = layers;
  const change = (id: string, patch: Partial<EditorLayer>) =>
    onChange(
      currentLayers.current.map((l) => (l.id === id ? { ...l, ...patch } : l)),
    );
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const list = [...(source ? [source] : []), ...layers.map((l) => l.file)];
      const updated = new Map(dimensions);
      let changed = false;
      for (const file of list)
        if (!updated.has(file)) {
          const image = await loadImage(file);
          updated.set(file, { w: image.naturalWidth, h: image.naturalHeight });
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
    if (disabled || !surface.current) return;
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
          3,
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
    else
      d.next = {
        x: Math.max(
          -0.5,
          Math.min(1.5, d.x + (event.clientX - d.px) / rect.width),
        ),
        y: Math.max(
          -0.5,
          Math.min(1.5, d.y + (event.clientY - d.py) / rect.height),
        ),
      };
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      if (!drag.current) return;
      const p = d.next;
      if (p.x !== undefined) d.element.style.left = `${p.x * 100}%`;
      if (p.y !== undefined) d.element.style.top = `${p.y * 100}%`;
      if (p.scale !== undefined) d.element.style.width = `${p.scale * 100}%`;
      if (p.rotation !== undefined)
        d.element.style.transform = `translate(-50%, -50%) rotate(${p.rotation}deg)`;
    });
  };
  const end = (event: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.pointer !== event.pointerId) return;
    cancelAnimationFrame(frame.current);
    change(d.id, d.next);
    drag.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
  };
  const base = source && dimensions.get(source);
  return (
    <div className="watermark-layout watermark-free-editor">
      <section className="watermark-input-panel">
        <h3>第一张样本 · 自由摆放</h3>
        <div className="watermark-stage dom-watermark-stage">
          {base && sourceUrl ? (
            <div
              aria-label="水印样本编辑画布"
              className="watermark-surface"
              ref={surface}
              style={{ aspectRatio: `${base.w}/${base.h}` }}
            >
              <img
                alt="第一张样本"
                className="watermark-base-image"
                draggable={false}
                src={sourceUrl}
              />
              {layers.map((layer, i) => {
                const dim = dimensions.get(layer.file);
                if (!dim) return null;
                const widthFactor = 1 - layer.crop.left - layer.crop.right;
                const heightFactor = 1 - layer.crop.top - layer.crop.bottom;
                return (
                  <div
                    aria-label={`水印层 ${i + 1}，方向键移动，Shift 加速`}
                    className={`watermark-dom-layer ${layer.id === selectedId ? 'selected' : ''}`}
                    key={layer.id}
                    onKeyDown={(event) => {
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
                      width: `${layer.scale * 100}%`,
                      aspectRatio: `${dim.w * widthFactor}/${dim.h * heightFactor}`,
                      transform: `translate(-50%, -50%) rotate(${layer.rotation}deg)`,
                    }}
                    tabIndex={disabled ? -1 : 0}
                  >
                    <div
                      className="watermark-crop-viewport"
                      style={{ opacity: layer.opacity }}
                    >
                      <img
                        alt=""
                        draggable={false}
                        src={layerUrls[i]}
                        style={{
                          width: `${100 / widthFactor}%`,
                          height: `${100 / heightFactor}%`,
                          left: `${(-layer.crop.left / widthFactor) * 100}%`,
                          top: `${(-layer.crop.top / heightFactor) * 100}%`,
                        }}
                      />
                    </div>
                    {layer.id === selectedId && !disabled && (
                      <>
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
            </div>
          ) : (
            <div className="watermark-stage-empty">
              先导入原图 / 视频，再添加水印层。
            </div>
          )}
        </div>
        <p className="stage-tip">
          拖动水印移动，拖动四角等比缩放，拖动顶部圆点旋转。手机可单指操作把手，或使用右侧滑块精确调整。位置按样本比例应用到整批。
        </p>
        {error && <p className="error-banner">{error}</p>}
      </section>
      <fieldset
        disabled={disabled}
        className="watermark-layer-panel workshop-fieldset"
      >
        <h3>水印层与变换</h3>
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
          {layers.map((layer, i) => (
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
                  {i + 1}. {layer.file.name}
                </strong>
              </button>
              <span className="layer-order-actions">
                <button
                  aria-label="上移水印层"
                  disabled={i === 0}
                  onClick={() => {
                    const next = [...layers];
                    [next[i - 1], next[i]] = [next[i], next[i - 1]];
                    onChange(next);
                  }}
                  type="button"
                >
                  <ArrowUp />
                </button>
                <button
                  aria-label="下移水印层"
                  disabled={i === layers.length - 1}
                  onClick={() => {
                    const next = [...layers];
                    [next[i + 1], next[i]] = [next[i], next[i + 1]];
                    onChange(next);
                  }}
                  type="button"
                >
                  <ArrowDown />
                </button>
                <button
                  aria-label="移除水印层"
                  onClick={() =>
                    onChange(layers.filter((l) => l.id !== layer.id))
                  }
                  type="button"
                >
                  <X />
                </button>
              </span>
            </article>
          ))}
        </div>
        {selected && (
          <div className="transform-controls">
            <Button
              onClick={() =>
                change(selected.id, {
                  ...defaultLayer(selected.file),
                  id: selected.id,
                })
              }
              size="sm"
              variant="outline"
            >
              <RefreshCw />
              重置本层
            </Button>
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
                    label: '缩放',
                    min: 0.01,
                    max: 3,
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
                      : `${Math.round(selected[control.key] * 100)}%`}
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
                    value={selected[control.key]}
                  />
                </label>
              ))}
              <fieldset className="crop-controls">
                <legend>裁切原水印</legend>
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
          </div>
        )}
        <p>
          新上传的水印会自动存入水印库，可再补充作者、来源和分类。图层顺序从上到下依次叠加，末层最靠前。
        </p>
      </fieldset>
    </div>
  );
}
