'use client';

import { useState, type ReactNode } from 'react';

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

export function MobileWorkspace({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cn('mobile-workspace', className)}>{children}</div>;
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
