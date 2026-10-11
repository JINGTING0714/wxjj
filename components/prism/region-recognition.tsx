/* oxlint-disable next/no-img-element */
'use client';
import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { cropRegion, imageRegion, type ImageRegion } from '@/lib/ocr-region';
import { recognizeLocalImages } from '@/lib/local-ocr';
import { draftsFromOcr } from '@/lib/prompt-screenshot';
import { startTask } from '@/lib/task-center';
import { useFileUrls } from './use-workspace-state';
import { TextReview } from './text-review';
type Selection = { key: string; start: number; end: number; text?: string };
type Target = { key: string; label: string; text: string };
export function RegionRecognition({
  file,
  focusTop = 0,
  mode,
  targets,
  onApply,
  getSelection,
  disabled = false,
}: {
  file?: File;
  focusTop?: number;
  mode: 'prompt' | 'sales';
  targets: Target[];
  onApply: (key: string, text: string) => void | Promise<void>;
  disabled?: boolean;
  getSelection?: () => Selection | null;
}) {
  const [open, setOpen] = useState(false),
    [selecting, setSelecting] = useState(false),
    [zoom, setZoom] = useState(1),
    [region, setRegion] = useState<ImageRegion | null>(null),
    [result, setResult] = useState(''),
    [target, setTarget] = useState(targets[0]?.key || ''),
    [action, setAction] = useState<'replace' | 'append' | 'selection'>(
      'append',
    ),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState('');
  const [selection, setSelection] = useState<Selection | null>(null);
  const [url] = useFileUrls(file ? [file] : []),
    view = useRef<HTMLDivElement>(null),
    image = useRef<HTMLImageElement>(null),
    anchor = useRef<{ x: number; y: number } | null>(null),
    frame = useRef(0),
    alive = useRef(true),
    generation = useRef(0);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      generation.current++;
      cancelAnimationFrame(frame.current);
    };
  }, []);
  const align = () => {
    const node = image.current;
    if (node && view.current && node.naturalHeight)
      view.current.scrollTop = Math.max(
        0,
        (focusTop * node.getBoundingClientRect().height) / node.naturalHeight -
          40,
      );
  };
  useEffect(() => {
    generation.current++;
    setBusy(false);
    setSelection(null);
    setSelecting(false);
    setRegion(null);
    setResult('');
    setMessage('');
    setTarget(targets[0]?.key || '');
    setAction(mode === 'sales' ? 'replace' : 'append');
  }, [file]);
  useEffect(() => {
    const id = requestAnimationFrame(align);
    return () => cancelAnimationFrame(id);
  }, [open, zoom]);
  const point = (event: PointerEvent) => {
    const node = image.current!,
      rect = node.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) * node.naturalWidth) / rect.width,
      y: ((event.clientY - rect.top) * node.naturalHeight) / rect.height,
    };
  };
  const drag = (event: PointerEvent<HTMLDivElement>) => {
    if (!selecting || busy || !image.current?.naturalWidth) return;
    event.preventDefault();
    const node = image.current,
      p = point(event);
    if (event.type === 'pointerdown') {
      anchor.current = p;
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    const first = anchor.current;
    if (!first) return;
    cancelAnimationFrame(frame.current);
    const next = imageRegion(first, p, node.naturalWidth, node.naturalHeight);
    if (event.type === 'pointerup') {
      setRegion(next);
      anchor.current = null;
      event.currentTarget.releasePointerCapture(event.pointerId);
    } else frame.current = requestAnimationFrame(() => setRegion(next));
  };
  const visible = () => {
    const node = image.current,
      panel = view.current;
    if (!node || !panel) return;
    const r = node.getBoundingClientRect(),
      v = panel.getBoundingClientRect();
    setRegion(
      imageRegion(
        {
          x: (Math.max(0, v.left - r.left) * node.naturalWidth) / r.width,
          y: (Math.max(0, v.top - r.top) * node.naturalHeight) / r.height,
        },
        {
          x:
            (Math.min(r.width, v.right - r.left) * node.naturalWidth) / r.width,
          y:
            (Math.min(r.height, v.bottom - r.top) * node.naturalHeight) /
            r.height,
        },
        node.naturalWidth,
        node.naturalHeight,
      ),
    );
  };
  const recognize = async () => {
    if (!file || !region || busy) return;
    const token = ++generation.current;
    setBusy(true);
    setMessage('正在识别圈选区域…');
    const task = startTask(
      `region:${mode}`,
      '圈选文字识别',
      mode === 'prompt' ? 'prompts' : 'sales',
    );
    try {
      const cropped = await cropRegion(file, region);
      const [page] = await recognizeLocalImages(
        [cropped],
        (label) => {
          task.indeterminate(label);
          if (alive.current && token === generation.current) setMessage(label);
        },
        mode,
        'precise',
        'region',
      );
      if (!alive.current || token !== generation.current) {
        task.done('识别已完成；原候选保留。');
        return;
      }
      let text = page.text;
      if (mode === 'prompt') {
        const rows = draftsFromOcr([page]);
        const field = target as 'english' | 'chinese' | 'unconfirmed';
        text =
          rows
            .map((row) => row[field])
            .filter(Boolean)
            .join('\n\n') || page.text;
      } else if (target === 'text') {
        text =
          page.blocks
            .map((block) => block.text)
            .filter(
              (text) =>
                /^[\d\s.,，。/、;；]+$/.test(text) && !/^20\d{2}/.test(text),
            )
            .join('\n') || page.text;
      }
      setResult(text);
      setMessage(
        text
          ? '已识别，请对照原图和差异，确认后使用。'
          : '这块区域没有识别出文字，请扩大圈选范围或手动录入。',
      );
      task.done();
    } catch (error) {
      task.fail(error);
      if (alive.current && token === generation.current)
        setMessage(
          error instanceof Error ? error.message : '圈选识别失败，请重试。',
        );
    } finally {
      if (alive.current && token === generation.current) setBusy(false);
    }
  };
  const before = targets.find((item) => item.key === target)?.text || '',
    validSelection =
      !!selection &&
      selection.key === target &&
      (!selection.text || selection.text === before),
    proposed =
      action === 'selection' && selection && validSelection
        ? before.slice(0, selection.start) +
          result +
          before.slice(selection.end)
        : action === 'selection'
          ? before
          : action === 'append'
            ? [before, result].filter(Boolean).join('\n')
            : result;
  return (
    <>
      <Button
        size="sm"
        variant="outline"
        disabled={!file || disabled}
        onClick={() => {
          const selected = getSelection?.();
          if (!busy && selected && selected.end > selected.start) {
            setSelection(selected);
            setTarget(selected.key);
            setAction('selection');
          }
          setOpen(true);
        }}
      >
        圈选局部重新识别
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="region-recognition-dialog"
          showCloseButton={false}
        >
          <header>
            <DialogTitle>圈选一块文字</DialogTitle>
            <Button variant="outline" onClick={() => setOpen(false)}>
              {busy ? '返回（识别继续）' : '返回复核'}
            </Button>
          </header>
          <DialogDescription>
            先浏览到文字位置，再切到圈选，用手指或鼠标拖出范围。识别后会保留原文供你比较。
          </DialogDescription>
          <div className="region-recognition-tools">
            <Button
              size="sm"
              variant={selecting ? 'default' : 'outline'}
              disabled={busy}
              onClick={() => setSelecting((value) => !value)}
            >
              {selecting ? '圈选中 · 点此返回浏览' : '进入圈选'}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={visible}
            >
              选中当前可见区域
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={zoom >= 4 || busy}
              onClick={() => setZoom((value) => Math.min(4, value + 0.5))}
            >
              放大
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={zoom <= 1 || busy}
              onClick={() => setZoom((value) => Math.max(1, value - 0.5))}
            >
              缩小
            </Button>
          </div>
          <div className="region-recognition-body">
            <div ref={view} className="region-source-scroll">
              <div
                className="region-source-image"
                style={{
                  width: `${zoom * 100}%`,
                  touchAction: selecting ? 'none' : 'pan-x pan-y',
                }}
                onPointerDown={drag}
                onPointerMove={drag}
                onPointerUp={drag}
                onPointerCancel={() => {
                  anchor.current = null;
                  cancelAnimationFrame(frame.current);
                }}
              >
                <img
                  ref={image}
                  src={url}
                  alt="圈选用原截图"
                  draggable={false}
                  onLoad={align}
                />
                {region && image.current?.naturalWidth && (
                  <div
                    className="region-selection"
                    style={{
                      left: `${(region.x / image.current.naturalWidth) * 100}%`,
                      top: `${(region.y / image.current.naturalHeight) * 100}%`,
                      width: `${(region.width / image.current.naturalWidth) * 100}%`,
                      height: `${(region.height / image.current.naturalHeight) * 100}%`,
                    }}
                  />
                )}
              </div>
            </div>
            <section className="region-result">
              <label>
                放入哪个字段
                <select
                  aria-label="圈选文字目标字段"
                  value={target}
                  disabled={busy}
                  onChange={(event) => {
                    setTarget(event.target.value);
                    setResult('');
                    if (action === 'selection') setAction('append');
                  }}
                >
                  {targets.map((item) => (
                    <option key={item.key} value={item.key}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>
              <Button
                disabled={
                  busy || !region || region.width < 8 || region.height < 8
                }
                onClick={() => void recognize()}
              >
                {busy ? '识别中…' : '只识别圈选区域'}
              </Button>
              {message && <p role="status">{message}</p>}
              <label>
                识别文字（可修改）
                <textarea
                  aria-label="圈选识别文字"
                  value={result}
                  onChange={(event) => setResult(event.target.value)}
                  disabled={busy}
                />
              </label>
              <label>
                使用方式
                <select
                  aria-label="圈选文字使用方式"
                  value={action}
                  disabled={busy}
                  onChange={(event) =>
                    setAction(
                      event.target.value as 'replace' | 'append' | 'selection',
                    )
                  }
                >
                  <option value="append">添加到字段末尾</option>
                  {selection && selection.key === target && (
                    <option value="selection" disabled={!validSelection}>
                      只替换之前选中的文字
                    </option>
                  )}
                  <option value="replace">替换整个所选字段</option>
                </select>
              </label>
              {result && <TextReview before={before} after={proposed} />}
              {action === 'selection' && !validSelection && (
                <p role="alert">
                  原字段已经修改，请重新选择要替换的文字，或改用其他使用方式。
                </p>
              )}
              <Button
                disabled={
                  busy ||
                  !result.trim() ||
                  (action === 'selection' && !validSelection)
                }
                onClick={() => {
                  void Promise.resolve()
                    .then(() => onApply(target, proposed))
                    .then(() => setOpen(false))
                    .catch((error) =>
                      setMessage(
                        error instanceof Error
                          ? error.message
                          : '未修改原文，请重试。',
                      ),
                    );
                }}
              >
                确认使用这段文字
              </Button>
              <small>仅修改当前候选，正式入库或售图分配仍需要你确认。</small>
            </section>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
