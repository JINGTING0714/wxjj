'use client';

import type { ReactNode } from 'react';

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
}: {
  label: string;
  tabs: MobileWorkspaceTab<Value>[];
  value: Value;
  onValueChange: (value: Value) => void;
}) {
  return (
    <div className="mobile-workspace-tabs" role="tablist" aria-label={label}>
      {tabs.map((tab) => (
        <button
          aria-selected={tab.value === value}
          className={tab.value === value ? 'is-active' : ''}
          key={tab.value}
          onClick={() => onValueChange(tab.value)}
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
