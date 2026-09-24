'use client';

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type PointerEvent,
  type ReactNode,
  type TouchEvent,
} from 'react';

import { Button } from '@/components/ui/button';
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import { cn } from '@/lib/utils';

export type MobileWorkspaceTab<Value extends string = string> = {
  value: Value;
  label: string;
  icon?: ReactNode;
};

const MobileWorkspaceCloseContext = createContext<(() => void) | undefined>(
  undefined,
);

export function MobileWorkspace({
  children,
  className,
  onPanelClose,
}: {
  children: ReactNode;
  className?: string;
  onPanelClose?: () => void;
}) {
  const workspaceRef = useRef<HTMLDivElement>(null);
  const swipe = useRef<{
    pointerId: number;
    startY: number;
    lastY: number;
    surface: HTMLElement;
  } | null>(null);
  const findHandleSurface = (x: number, y: number) => {
    const root = workspaceRef.current;
    if (!root) return null;
    const activeSurfaces = Array.from(
      root.querySelectorAll<HTMLElement>('[data-mobile-active="true"]'),
    );
    for (const handle of root.querySelectorAll<HTMLElement>(
      '.mobile-workspace-drawer-handle',
    )) {
      const rect = handle.getBoundingClientRect();
      const style = getComputedStyle(handle);
      if (
        style.visibility !== 'hidden' &&
        style.display !== 'none' &&
        x >= rect.left &&
        x <= rect.right &&
        y >= rect.top &&
        y <= rect.bottom
      )
        return handle.parentElement;
    }
    // Some mobile browsers hit-test the preview underneath a transparent
    // drawer handle. Accept the first active tray whose top edge is within a
    // short touch slop, so the gesture still starts on the visible grab area.
    for (const surface of activeSurfaces) {
      const rect = surface.getBoundingClientRect();
      if (
        x >= rect.left &&
        x <= rect.right &&
        y >= rect.top - 160 &&
        y <= rect.top + 64
      )
        return surface;
    }
    return null;
  };
  const resetSwipe = () => {
    const current = swipe.current;
    if (current) current.surface.style.removeProperty('--drawer-drag-y');
    swipe.current = null;
  };
  const finishSwipe = (clientY: number, pointerId: number) => {
    const current = swipe.current;
    if (!current || current.pointerId !== pointerId) return;
    const distance = (clientY || current.lastY) - current.startY;
    resetSwipe();
    if (distance >= 48) onPanelClose?.();
  };
  const startPointerSwipe = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== 'touch' && event.pointerType !== 'pen') return;
    const surface = findHandleSurface(event.clientX, event.clientY);
    if (!surface) return;
    swipe.current = {
      pointerId: event.pointerId,
      startY: event.clientY,
      lastY: event.clientY,
      surface,
    };
  };
  const movePointerSwipe = (event: PointerEvent<HTMLDivElement>) => {
    const current = swipe.current;
    if (!current || current.pointerId !== event.pointerId) return;
    current.lastY = event.clientY;
    const distance = Math.max(0, event.clientY - current.startY);
    current.surface.style.setProperty(
      '--drawer-drag-y',
      `${Math.min(distance, 180)}px`,
    );
    if (distance > 4) event.preventDefault();
  };
  const startTouchSwipe = (event: TouchEvent<HTMLDivElement>) => {
    const touch = event.touches[0];
    if (!touch) return;
    const surface = findHandleSurface(touch.clientX, touch.clientY);
    if (!surface) return;
    swipe.current = {
      pointerId: -1,
      startY: touch.clientY,
      lastY: touch.clientY,
      surface,
    };
  };
  const moveTouchSwipe = (event: TouchEvent<HTMLDivElement>) => {
    const current = swipe.current;
    const touch = event.touches[0];
    if (!current || current.pointerId !== -1 || !touch) return;
    current.lastY = touch.clientY;
    const distance = Math.max(0, touch.clientY - current.startY);
    current.surface.style.setProperty(
      '--drawer-drag-y',
      `${Math.min(distance, 180)}px`,
    );
    if (distance > 4) event.preventDefault();
  };
  useEffect(() => {
    const root = workspaceRef.current;
    if (!root) return;
    const start = (event: globalThis.TouchEvent) => {
      const touch = event.touches[0];
      if (!touch) return;
      const surface = findHandleSurface(touch.clientX, touch.clientY);
      if (!surface) return;
      swipe.current = {
        pointerId: -1,
        startY: touch.clientY,
        lastY: touch.clientY,
        surface,
      };
    };
    const move = (event: globalThis.TouchEvent) => {
      const current = swipe.current;
      const touch = event.touches[0];
      if (!current || current.pointerId !== -1 || !touch) return;
      current.lastY = touch.clientY;
      const distance = Math.max(0, touch.clientY - current.startY);
      current.surface.style.setProperty(
        '--drawer-drag-y',
        `${Math.min(distance, 180)}px`,
      );
      if (distance > 4) event.preventDefault();
    };
    const end = (event: globalThis.TouchEvent) => {
      const current = swipe.current;
      if (!current || current.pointerId !== -1) return;
      const touch = event.changedTouches[0];
      const distance = (touch?.clientY || current.lastY) - current.startY;
      resetSwipe();
      if (distance >= 48) onPanelClose?.();
    };
    root.addEventListener('touchstart', start, {
      capture: true,
      passive: false,
    });
    root.addEventListener('touchmove', move, {
      capture: true,
      passive: false,
    });
    root.addEventListener('touchend', end, { capture: true });
    root.addEventListener('touchcancel', resetSwipe, { capture: true });
    return () => {
      root.removeEventListener('touchstart', start, true);
      root.removeEventListener('touchmove', move, true);
      root.removeEventListener('touchend', end, true);
      root.removeEventListener('touchcancel', resetSwipe, true);
    };
  }, [onPanelClose]);
  return (
    <MobileWorkspaceCloseContext.Provider value={onPanelClose}>
      <div
        className={cn('mobile-workspace', className)}
        onPointerCancelCapture={(event) => {
          if (swipe.current?.pointerId === event.pointerId) resetSwipe();
        }}
        onPointerDownCapture={startPointerSwipe}
        onPointerMoveCapture={movePointerSwipe}
        onPointerUpCapture={(event) =>
          finishSwipe(event.clientY, event.pointerId)
        }
        onTouchCancelCapture={resetSwipe}
        onTouchEndCapture={(event) => {
          const touch = event.changedTouches[0];
          if (touch) finishSwipe(touch.clientY, -1);
        }}
        onTouchMoveCapture={moveTouchSwipe}
        onTouchStartCapture={startTouchSwipe}
        ref={workspaceRef}
      >
        {children}
      </div>
    </MobileWorkspaceCloseContext.Provider>
  );
}

/**
 * The workshop drawers are deliberately non-modal so the preview stays live.
 * This handle gives those inline drawers the same downward-dismiss gesture as
 * the app's full bottom sheets without stealing gestures from sliders/content.
 */
export function MobileWorkspaceDrawerHandle({
  onClose,
}: {
  onClose?: () => void;
} = {}) {
  const closeFromWorkspace = useContext(MobileWorkspaceCloseContext);
  const close = onClose ?? closeFromWorkspace;
  const gesture = useRef<{
    pointerId: number;
    startY: number;
    lastY: number;
    surface: HTMLElement;
  } | null>(null);

  if (!close) return null;

  const reset = () => {
    const current = gesture.current;
    if (current) current.surface.style.removeProperty('--drawer-drag-y');
    gesture.current = null;
  };
  const finish = (event: PointerEvent<HTMLButtonElement>) => {
    const current = gesture.current;
    if (!current || current.pointerId !== event.pointerId) return;
    const distance = (event.clientY || current.lastY) - current.startY;
    reset();
    if (distance >= 48) close();
  };
  const startTouch = (event: TouchEvent<HTMLButtonElement>) => {
    const touch = event.touches[0];
    const surface = event.currentTarget.parentElement;
    if (!touch || !surface) return;
    gesture.current = {
      pointerId: -1,
      startY: touch.clientY,
      lastY: touch.clientY,
      surface,
    };
  };
  const moveTouch = (event: TouchEvent<HTMLButtonElement>) => {
    const current = gesture.current;
    const touch = event.touches[0];
    if (!current || current.pointerId !== -1 || !touch) return;
    const distance = Math.max(0, touch.clientY - current.startY);
    current.lastY = touch.clientY;
    if (distance > 4) event.preventDefault();
    current.surface.style.setProperty(
      '--drawer-drag-y',
      `${Math.min(distance, 180)}px`,
    );
  };
  const endTouch = (event: TouchEvent<HTMLButtonElement>) => {
    const current = gesture.current;
    const touch = event.changedTouches[0];
    if (!current || current.pointerId !== -1 || !touch) return;
    const distance = (touch?.clientY || current.lastY) - current.startY;
    reset();
    if (distance >= 48) close();
  };

  return (
    <button
      aria-label="向下滑动关闭操作抽屉"
      className="mobile-workspace-drawer-handle"
      onClick={(event) => event.preventDefault()}
      onPointerCancel={(event) => {
        if (gesture.current?.pointerId === event.pointerId) reset();
      }}
      onPointerDown={(event) => {
        const surface = event.currentTarget.parentElement;
        if (!surface) return;
        gesture.current = {
          pointerId: event.pointerId,
          startY: event.clientY,
          lastY: event.clientY,
          surface,
        };
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        const current = gesture.current;
        if (!current || current.pointerId !== event.pointerId) return;
        const distance = Math.max(0, event.clientY - current.startY);
        current.lastY = event.clientY;
        current.surface.style.setProperty(
          '--drawer-drag-y',
          `${Math.min(distance, 180)}px`,
        );
      }}
      onPointerUp={finish}
      onTouchCancel={() => {
        if (gesture.current?.pointerId === -1) reset();
      }}
      onTouchEnd={endTouch}
      onTouchMove={moveTouch}
      onTouchStart={startTouch}
      type="button"
    >
      <i />
    </button>
  );
}

export function MobileWorkspaceTabs<Value extends string>({
  label,
  tabs,
  value,
  onValueChange,
  onClose,
}: {
  label: string;
  tabs: MobileWorkspaceTab<Value>[];
  value: Value | null;
  onValueChange: (value: Value) => void;
  onClose?: () => void;
}) {
  return (
    <div className="mobile-workspace-tabs" role="tablist" aria-label={label}>
      {tabs.map((tab) => (
        <button
          aria-selected={tab.value === value}
          className={tab.value === value ? 'is-active' : ''}
          key={tab.value}
          onClick={() =>
            tab.value === value && onClose
              ? onClose()
              : onValueChange(tab.value)
          }
          role="tab"
          type="button"
        >
          {tab.icon}
          <span>{tab.label}</span>
        </button>
      ))}
    </div>
  );
}

export function MobileWorkspacePanel({
  active,
  children,
  className,
  label,
}: {
  active: boolean;
  children: ReactNode;
  className?: string;
  label?: string;
}) {
  return (
    <div
      aria-label={label}
      className={cn('mobile-workspace-panel', className)}
      data-mobile-active={active ? 'true' : 'false'}
    >
      {active && <MobileWorkspaceDrawerHandle />}
      {children}
    </div>
  );
}

export function MobileWorkspacePrimaryAction({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('mobile-workspace-primary-action', className)}>
      {children}
    </div>
  );
}

export function MobileWorkspaceSheet({
  children,
  description,
  footer,
  onOpenChange,
  open,
  title,
}: {
  children: ReactNode;
  description?: string;
  footer?: ReactNode;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  title: string;
}) {
  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      showSwipeHandle
      swipeDirection="down"
    >
      <DrawerContent className="mobile-workspace-sheet">
        <DrawerHeader>
          <DrawerTitle>{title}</DrawerTitle>
          {description && <DrawerDescription>{description}</DrawerDescription>}
        </DrawerHeader>
        <div className="mobile-workspace-sheet-body">{children}</div>
        <DrawerFooter>
          {footer}
          <DrawerClose render={<Button variant="outline" />}>完成</DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}

/** Keep existing desktop controls, and reveal their mobile detail on demand. */
export function MobileWorkspaceDetails({
  title,
  summary,
  children,
  disabled = false,
}: {
  title: string;
  summary?: ReactNode;
  children: ReactNode;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className="desktop-workspace-only workspace-detail-desktop">
        {children}
      </div>
      <div className="mobile-workspace-only workspace-detail-summary">
        {summary}
        <Button type="button" variant="outline" onClick={() => setOpen(true)}>
          {title} →
        </Button>
      </div>
      <MobileWorkspaceSheet open={open} onOpenChange={setOpen} title={title}>
        <fieldset className="workshop-fieldset" disabled={disabled}>
          {children}
        </fieldset>
      </MobileWorkspaceSheet>
    </>
  );
}
