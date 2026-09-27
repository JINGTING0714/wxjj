'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';

type Selection = { selected: Set<string>; toggle: (id: string) => void };
/** Gesture begins after a mouse drag or deliberate long-press; a normal click still previews. */
export function DragSelection({
  selection,
  children,
  className,
  disabled = false,
}: {
  selection: Selection;
  children: ReactNode;
  className?: string;
  disabled?: boolean;
}) {
  const root = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState(false);
  const latest = useRef({ selection, disabled, mode });
  useEffect(() => {
    latest.current = { selection, disabled, mode };
  }, [selection, disabled, mode]);
  useEffect(() => {
    const element = root.current;
    if (!element) return;
    let gesture:
      | {
          x: number;
          y: number;
          selecting: boolean;
          value: boolean;
          visited: Set<string>;
          touch: boolean;
        }
      | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let suppressUntil = 0;
    const idAt = (x: number, y: number) => {
      const card = document
        .elementFromPoint(x, y)
        ?.closest<HTMLElement>('[data-selection-id]');
      return card && element.contains(card)
        ? card.dataset.selectionId
        : undefined;
    };
    const paint = (x: number, y: number) => {
      const id = idAt(x, y);
      if (latest.current.disabled || !gesture || !id || gesture.visited.has(id))
        return;
      gesture.visited.add(id);
      if (latest.current.selection.selected.has(id) !== gesture.value)
        latest.current.selection.toggle(id);
    };
    const begin = (x: number, y: number, touch: boolean) => {
      if (latest.current.disabled || !idAt(x, y)) return;
      const target = document.elementFromPoint(x, y);
      if (target?.closest('input, textarea, select, [contenteditable="true"]'))
        return;
      const button = target?.closest('button');
      if (button && !button.querySelector('img')) return;
      const id = idAt(x, y)!;
      gesture = {
        x,
        y,
        selecting: false,
        value: !latest.current.selection.selected.has(id),
        visited: new Set(),
        touch,
      };
      if (touch && latest.current.mode) {
        gesture.selecting = true;
        paint(x, y);
        suppressUntil = Date.now() + 800;
      } else if (touch)
        timer = setTimeout(() => {
          if (gesture) {
            gesture.selecting = true;
            setMode(true);
            paint(x, y);
            suppressUntil = Date.now() + 800;
          }
        }, 400);
    };
    const move = (x: number, y: number, event: Event) => {
      if (!gesture) return;
      const distance = Math.hypot(x - gesture.x, y - gesture.y);
      if (!gesture.selecting && distance > 8) {
        clearTimeout(timer);
        if (gesture.touch) {
          gesture = undefined;
          return;
        }
        gesture.selecting = true;
        paint(gesture.x, gesture.y);
        setMode(true);
      }
      if (gesture.selecting) {
        if (event.cancelable) event.preventDefault();
        paint(x, y);
        suppressUntil = Date.now() + 800;
        // Continue painting near the viewport edge without a long round trip to actions.
        if (y < 90) window.scrollBy(0, -14);
        else if (y > window.innerHeight - 130) window.scrollBy(0, 14);
      }
    };
    const stop = () => {
      clearTimeout(timer);
      if (gesture?.selecting) suppressUntil = Date.now() + 800;
      gesture = undefined;
    };
    const down = (event: PointerEvent) => {
      if (event.pointerType !== 'touch' && event.button === 0)
        begin(event.clientX, event.clientY, false);
    };
    const pointerMove = (event: PointerEvent) => {
      if (event.pointerType !== 'touch')
        move(event.clientX, event.clientY, event);
    };
    const touchStart = (event: TouchEvent) => {
      const touch = event.touches[0];
      if (touch && event.touches.length === 1)
        begin(touch.clientX, touch.clientY, true);
      else stop();
    };
    const touchMove = (event: TouchEvent) => {
      const touch = event.touches[0];
      if (touch) move(touch.clientX, touch.clientY, event);
    };
    const click = (event: MouseEvent) => {
      if (Date.now() < suppressUntil) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    const drag = (event: DragEvent) => {
      if (gesture) event.preventDefault();
    };
    const contextMenu = (event: Event) => {
      if (gesture?.selecting || Date.now() < suppressUntil)
        event.preventDefault();
    };
    element.addEventListener('contextmenu', contextMenu);
    element.addEventListener('pointerdown', down, true);
    window.addEventListener('pointermove', pointerMove, { passive: false });
    window.addEventListener('pointerup', stop);
    window.addEventListener('pointercancel', stop);
    element.addEventListener('touchstart', touchStart, { passive: true });
    element.addEventListener('touchmove', touchMove, { passive: false });
    element.addEventListener('touchend', stop);
    element.addEventListener('touchcancel', stop);
    element.addEventListener('click', click, true);
    element.addEventListener('dragstart', drag);
    return () => {
      stop();
      element.removeEventListener('contextmenu', contextMenu);
      element.removeEventListener('pointerdown', down, true);
      window.removeEventListener('pointermove', pointerMove);
      window.removeEventListener('pointerup', stop);
      window.removeEventListener('pointercancel', stop);
      element.removeEventListener('touchstart', touchStart);
      element.removeEventListener('touchmove', touchMove);
      element.removeEventListener('touchend', stop);
      element.removeEventListener('touchcancel', stop);
      element.removeEventListener('click', click, true);
      element.removeEventListener('dragstart', drag);
    };
  }, []);
  return (
    <div className="drag-selection" ref={root}>
      <div
        className={`drag-selection-bar ${mode || selection.selected.size ? 'is-selecting' : ''}`}
      >
        <span>
          {mode || selection.selected.size
            ? `已选 ${selection.selected.size} · 长按或按住滑过连续选择`
            : '电脑按住滑过多选 · 手机长按后滑过多选'}
        </span>
        {mode && (
          <Button
            type="button"
            variant="outline"
            onClick={() => setMode(false)}
          >
            完成多选
          </Button>
        )}
      </div>
      <div className={className}>{children}</div>
    </div>
  );
}
