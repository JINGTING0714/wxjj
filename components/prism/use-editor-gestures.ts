'use client';
import {
  useEffect,
  useRef,
  useState,
  type RefObject,
  type PointerEvent,
} from 'react';
import {
  pinchLayer,
  pinchView,
  touchPair,
  type PreviewView,
  type TouchPoint,
} from '@/lib/editor-gestures';
type Layer = {
  id: string;
  x: number;
  y: number;
  scale: number;
  rotation: number;
  locked?: boolean;
};
const fitted: PreviewView = { zoom: 1, x: 0, y: 0 };
export function useEditorGestures({
  surface,
  transform,
  navigation,
  selected,
  disabled,
  onLayerChange,
  cancelDrag,
  resetKey,
  fullscreen,
}: {
  surface: RefObject<HTMLDivElement | null>;
  transform: boolean;
  navigation: boolean;
  selected?: Layer;
  disabled: boolean;
  onLayerChange: (id: string, change: Partial<Layer>) => void;
  cancelDrag: () => void;
  resetKey: unknown;
  fullscreen: boolean;
}) {
  const [view, setView] = useState(fitted),
    live = useRef(view),
    points = useRef(new Map<number, TouchPoint>()),
    blocked = useRef(false),
    frame = useRef(0);
  type Gesture =
    | {
        kind: 'view' | 'layer';
        ids: number[];
        first: ReturnType<typeof touchPair>;
        view: PreviewView;
        center: TouchPoint;
        layer?: Layer;
        element?: HTMLElement;
        width?: number;
        scene?: { width: number; height: number };
        next?: Partial<Layer>;
        nextView?: PreviewView;
      }
    | {
        kind: 'pan';
        ids: number[];
        first: TouchPoint;
        view: PreviewView;
        nextView?: PreviewView;
      };
  const gesture = useRef<Gesture | null>(null);
  const paintView = (next: PreviewView) => {
    if (surface.current)
      surface.current.style.transform = `translate(${next.x}px,${next.y}px) scale(${next.zoom})`;
  };
  const reset = () => {
    cancelAnimationFrame(frame.current);
    cancelDrag();
    gesture.current = null;
    points.current.clear();
    blocked.current = false;
    live.current = fitted;
    setView(fitted);
    paintView(fitted);
  };
  useEffect(() => {
    reset();
    return () => cancelAnimationFrame(frame.current);
  }, [resetKey, fullscreen]);
  const down = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== 'touch' || !surface.current) return;
    points.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (
      points.current.size === 1 &&
      event.target instanceof Element &&
      event.target.closest('.locked-layer-unlock')
    )
      return;
    if (blocked.current) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (points.current.size > 2) {
      event.preventDefault();
      event.stopPropagation();
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }
    if (points.current.size === 2) {
      cancelDrag();
      event.preventDefault();
      event.stopPropagation();
      const [a, b] = [...points.current.values()],
        rect = surface.current.getBoundingClientRect(),
        first = touchPair(a, b);
      const element = selected
        ? [
            ...surface.current.querySelectorAll<HTMLElement>('[data-layer-id]'),
          ].find((node) => node.dataset.layerId === selected.id)
        : undefined;
      const ids = [...points.current.keys()];
      gesture.current =
        transform &&
        selected &&
        !selected.locked &&
        !disabled &&
        element &&
        rect.width &&
        rect.height
          ? {
              kind: 'layer',
              ids,
              first,
              view: live.current,
              center: { x: 0, y: 0 },
              layer: { ...selected },
              element,
              width: parseFloat(element.style.width),
              scene: { width: rect.width, height: rect.height },
            }
          : {
              kind: 'view',
              ids,
              first,
              view: { ...live.current },
              center: {
                x: rect.left + rect.width / 2 - live.current.x,
                y: rect.top + rect.height / 2 - live.current.y,
              },
            };
      for (const id of points.current.keys())
        event.currentTarget.setPointerCapture(id);
    } else if (points.current.size === 1 && navigation) {
      cancelDrag();
      event.preventDefault();
      event.stopPropagation();
      gesture.current = {
        kind: 'pan',
        ids: [event.pointerId],
        first: { x: event.clientX, y: event.clientY },
        view: { ...live.current },
      };
      event.currentTarget.setPointerCapture(event.pointerId);
    }
  };
  const move = (event: PointerEvent<HTMLDivElement>) => {
    if (!points.current.has(event.pointerId)) return;
    points.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (blocked.current) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    const current = gesture.current;
    if (!current) return;
    event.preventDefault();
    event.stopPropagation();
    if (!current.ids.includes(event.pointerId)) return;
    if (current.kind === 'pan')
      current.nextView = {
        ...current.view,
        x: current.view.x + event.clientX - current.first.x,
        y: current.view.y + event.clientY - current.first.y,
      };
    else {
      const [a, b] = current.ids.map((id) => points.current.get(id));
      if (!a || !b) return;
      const now = touchPair(a, b);
      if (current.kind === 'view')
        current.nextView = pinchView(
          current.view,
          current.first,
          now,
          current.center,
        );
      else
        current.next = pinchLayer(
          current.layer!,
          current.first,
          now,
          current.scene!,
        );
    }
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      if (current.nextView) {
        live.current = current.nextView;
        paintView(current.nextView);
      }
      if (current.kind === 'layer' && current.next && current.element) {
        const next = current.next;
        current.element.style.left = `${next.x! * 100}%`;
        current.element.style.top = `${next.y! * 100}%`;
        current.element.style.width = `${(current.width! * next.scale!) / current.layer!.scale}%`;
        current.element.style.transform = `translate(-50%,-50%) rotate(${next.rotation}deg)`;
      }
    });
  };
  const end = (event: PointerEvent<HTMLDivElement>) => {
    if (!points.current.has(event.pointerId)) return;
    points.current.delete(event.pointerId);
    const current = gesture.current;
    if (current && !current.ids.includes(event.pointerId)) {
      event.preventDefault();
      event.stopPropagation();
      if (event.currentTarget.hasPointerCapture(event.pointerId))
        event.currentTarget.releasePointerCapture(event.pointerId);
      return;
    }
    if (current) {
      event.preventDefault();
      event.stopPropagation();
      cancelAnimationFrame(frame.current);
      const cancel = event.type === 'pointercancel';
      if (current.kind === 'layer' && current.layer && current.element) {
        if (cancel) {
          current.element.style.left = `${current.layer.x * 100}%`;
          current.element.style.top = `${current.layer.y * 100}%`;
          current.element.style.width = `${current.width}%`;
          current.element.style.transform = `translate(-50%,-50%) rotate(${current.layer.rotation}deg)`;
        } else if (current.next) onLayerChange(current.layer.id, current.next);
      } else {
        const next = cancel ? current.view : current.nextView || current.view;
        live.current = next;
        setView(next);
        paintView(next);
      }
      gesture.current = null;
      blocked.current = points.current.size > 0;
    } else if (blocked.current) {
      event.preventDefault();
      event.stopPropagation();
    }
    if (!points.current.size) blocked.current = false;
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
  };
  return {
    view,
    reset,
    handlers: {
      onPointerDownCapture: down,
      onPointerMoveCapture: move,
      onPointerUpCapture: end,
      onPointerCancelCapture: end,
    },
    style: {
      transform: `translate(${view.x}px,${view.y}px) scale(${view.zoom})`,
      transformOrigin: 'center center',
    },
  };
}
