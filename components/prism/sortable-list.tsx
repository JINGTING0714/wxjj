'use client';
import { Children, cloneElement, isValidElement, useEffect, useRef, useState, type HTMLAttributes, type ReactNode } from 'react';

export function moveListItem<T>(items: T[], from: number, to: number) {
  if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) return items;
  const next = [...items]; next.splice(to, 0, next.splice(from, 1)[0]); return next;
}
export function SortHandle({ disabled = false }: { disabled?: boolean }) {
  return <button type="button" className="sort-handle" data-sort-handle disabled={disabled} aria-label="拖拽调整顺序" title="拖动排序；也可用 Alt + 方向键">⠿ <span>拖动</span></button>;
}
/** Handle-only sorting keeps file drops and text editing independent. */
export function SortableList({ children, onMove, className = '', disabled = false, ...props }: {
  children: ReactNode; onMove: (from: number, to: number) => void; disabled?: boolean;
} & HTMLAttributes<HTMLDivElement>) {
  const root = useRef<HTMLDivElement>(null);
  const move = useRef(onMove); move.current = onMove;
  const active = useRef<{ from: number; to: number; pointer: number; x: number; y: number; cx: number; cy: number; started: boolean } | null>(null);
  const [preview, setPreview] = useState<{ from: number; to: number } | null>(null);
  useEffect(() => {
    let frame = 0;
    const locate = () => {
      const drag = active.current;
      if (!drag?.started) { frame = 0; return; }
      const node = document.elementFromPoint(drag.cx, drag.cy)?.closest<HTMLElement>('[data-sort-index]');
      if (node?.parentElement === root.current) drag.to = Number(node.dataset.sortIndex);
      setPreview(old => old?.to === drag.to && old.from === drag.from ? old : { from: drag.from, to: drag.to });
      let scroll: HTMLElement | null = root.current;
      while (scroll && (scroll.scrollHeight <= scroll.clientHeight + 2 || !/(auto|scroll)/.test(getComputedStyle(scroll).overflowY))) scroll = scroll.parentElement;
      scroll ||= document.scrollingElement as HTMLElement | null;
      if (scroll) {
        const rect = scroll.getBoundingClientRect();
        if (drag.cy > Math.min(rect.bottom, innerHeight) - 48) scroll.scrollTop += 12;
        if (drag.cy < Math.max(rect.top, 0) + 48) scroll.scrollTop -= 12;
      }
      if (root.current && root.current.scrollWidth > root.current.clientWidth + 2) {
        const rect = root.current.getBoundingClientRect();
        if (drag.cx > rect.right - 40) root.current.scrollLeft += 12;
        if (drag.cx < rect.left + 40) root.current.scrollLeft -= 12;
      }
      frame = requestAnimationFrame(locate);
    };
    const update = (event: PointerEvent) => {
      const drag = active.current;
      if (!drag || event.pointerId !== drag.pointer) return;
      if (!drag.started && Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 5) return;
      drag.started = true; event.preventDefault();
      drag.cx = event.clientX; drag.cy = event.clientY;
      if (!frame) locate();
    };
    const finish = (event: PointerEvent) => {
      const drag = active.current;
      if (!drag || drag.pointer !== event.pointerId) return;
      const destination = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('[data-sort-index]');
      if (destination?.parentElement === root.current) drag.to = Number(destination.dataset.sortIndex);
      cancelAnimationFrame(frame); frame = 0;
      active.current = null; setPreview(null);
      if (event.type !== 'pointercancel' && drag.started && drag.from !== drag.to) move.current(drag.from, drag.to);
    };
    document.addEventListener('pointermove', update, { passive: false }); document.addEventListener('pointerup', finish); document.addEventListener('pointercancel', finish);
    return () => { cancelAnimationFrame(frame); document.removeEventListener('pointermove', update); document.removeEventListener('pointerup', finish); document.removeEventListener('pointercancel', finish); };
  }, []);
  return <div {...props} ref={root} className={`${className} sortable-list`} onPointerDownCapture={event => {
    if (disabled || !(event.target instanceof Element) || !event.target.closest('[data-sort-handle]:not(:disabled)') || event.button !== 0) return;
    const item = event.target.closest<HTMLElement>('[data-sort-index]');
    if (item?.parentElement !== root.current) return;
    const from = Number(item.dataset.sortIndex);
    active.current = { from, to: from, pointer: event.pointerId, x: event.clientX, y: event.clientY, cx: event.clientX, cy: event.clientY, started: false };
  }} onKeyDownCapture={event => {
    if (disabled || !event.altKey || !(event.target instanceof Element) || !event.target.closest('[data-sort-handle]')) return;
    const from = Number(event.target.closest<HTMLElement>('[data-sort-index]')?.dataset.sortIndex);
    const delta = ['ArrowUp', 'ArrowLeft'].includes(event.key) ? -1 : ['ArrowDown', 'ArrowRight'].includes(event.key) ? 1 : 0;
    if (delta && from + delta >= 0 && from + delta < Children.count(children)) { event.preventDefault(); onMove(from, from + delta); }
  }}>{Children.map(children, (child, index) => isValidElement<HTMLAttributes<HTMLElement>>(child) ? cloneElement(child, {
    'data-sort-index': index, 'data-sort-source': preview?.from === index ? 'true' : undefined,
    'data-sort-destination': preview?.to === index ? `放到第 ${index + 1} 位` : undefined,
  } as HTMLAttributes<HTMLElement>) : child)}<span className="sr-only" role="status">{preview ? `放到第 ${preview.to + 1} 位` : ''}</span></div>;
}
