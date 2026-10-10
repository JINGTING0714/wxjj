'use client';
import type { ReactNode } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
export function WatermarkFullscreen({
  active,
  onClose,
  children,
}: {
  active: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  if (!active) return children;
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        className="watermark-fullscreen-dialog"
        showCloseButton={false}
      >
        <DialogTitle className="sr-only">水印全屏编辑</DialogTitle>
        <DialogDescription className="sr-only">
          双指缩放预览，在变换模式中双指调整水印。关闭后返回工坊。
        </DialogDescription>
        {children}
      </DialogContent>
    </Dialog>
  );
}
