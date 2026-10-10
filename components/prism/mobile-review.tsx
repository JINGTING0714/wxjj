'use client';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
export function MobileReview({
  open,
  onClose,
  title,
  index,
  count,
  onIndex,
  original,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  index: number;
  count: number;
  onIndex: (value: number) => void;
  original: ReactNode;
  children: ReactNode;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!value) onClose();
      }}
    >
      <DialogContent className="mobile-review-dialog" showCloseButton={false}>
        <header>
          <DialogTitle>{title}</DialogTitle>
          <Button variant="outline" onClick={onClose}>
            完成 / 返回
          </Button>
        </header>
        <DialogDescription className="sr-only">
          左侧原图、右侧当前结果分别滚动。切换条目会自动定位原图。
        </DialogDescription>
        <div className="mobile-review-panes">
          <aside>{original}</aside>
          <section>{children}</section>
        </div>
        <footer>
          <Button
            variant="outline"
            disabled={index <= 0}
            onClick={() => onIndex(index - 1)}
          >
            上一条
          </Button>
          <label>
            当前条目
            <select
              aria-label="选择复核条目"
              value={index}
              onChange={(event) => onIndex(Number(event.target.value))}
            >
              {Array.from({ length: count }, (_, i) => (
                <option value={i} key={i}>
                  第 {i + 1} / {count} 条
                </option>
              ))}
            </select>
          </label>
          <Button
            variant="outline"
            disabled={index >= count - 1}
            onClick={() => onIndex(index + 1)}
          >
            下一条
          </Button>
        </footer>
      </DialogContent>
    </Dialog>
  );
}
