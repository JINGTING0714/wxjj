'use client';
import { SortableList, SortHandle, moveListItem } from './sortable-list';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import type { ProfileShortCode } from '@/lib/prism-types';
import { natureLabel } from '@/lib/profile-model';
import { copyText } from '@/lib/clipboard';
import { formatProfileCode } from '@/lib/short-codes';
import { secretPreview } from '@/lib/prism-types';

export function ProfileCopyDialog({
  title,
  codes,
}: {
  title: string;
  codes: ProfileShortCode[];
}) {
  const [open, setOpen] = useState(false),
    [order, setOrder] = useState<ProfileShortCode[]>([]),
    [selected, setSelected] = useState<string[]>([]);
  const value = formatProfileCode(
    order
      .filter((code) => selected.includes(code.id))
      .map((code) => code.secret.replace(/^--profile\s+/i, '').trim())
      .join(' '),
  );
  function move(index: number, delta: number) {
    setOrder((list) => {
      const next = [...list];
      [next[index], next[index + delta]] = [next[index + delta], next[index]];
      return next;
    });
  }
  return (
    <>
      <Button
        type="button"
        variant="outline"
        onClick={() => {
          setOrder(codes);
          setSelected(codes.map((code) => code.id));
          setOpen(true);
        }}
      >
        复制文件夹
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="profile-copy-dialog"
          onClick={(event) => event.stopPropagation()}
        >
          <DialogTitle>复制 {title}</DialogTitle>
          <DialogDescription>
            勾选要使用的短码，并调整本次复制的顺序。
          </DialogDescription>
          <SortableList className="profile-copy-list" onMove={(from, to) => setOrder(current => moveListItem(current, from, to))}>
            {order.map((code, index) => (
              <article key={code.id}><SortHandle />
                <label aria-label={`选择 ${code.label || `短码 ${index + 1}`}`}>
                  <input
                    type="checkbox"
                    checked={selected.includes(code.id)}
                    onChange={(event) =>
                      setSelected((ids) =>
                        event.target.checked
                          ? [...ids, code.id]
                          : ids.filter((id) => id !== code.id),
                      )
                    }
                  />
                  <span>
                    <strong>{code.label || `短码 ${index + 1}`}</strong>
                    <small>{natureLabel(code)}</small>
                    <code>{secretPreview(code.secret)}</code>
                  </span>
                </label>
                <div>
                  <Button
                    variant="outline"
                    disabled={!index}
                    onClick={() => move(index, -1)}
                  >
                    上移
                  </Button>
                  <Button
                    variant="outline"
                    disabled={index === order.length - 1}
                    onClick={() => move(index, 1)}
                  >
                    下移
                  </Button>
                </div>
              </article>
            ))}
          </SortableList>
          <pre className="copy-parameter-preview">
            {selected.length ? formatProfileCode(order.filter(code => selected.includes(code.id)).map(code => secretPreview(code.secret)).join(' ')) : '请选择短码'}
          </pre>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              取消
            </Button>
            <Button
              disabled={!selected.length}
              onClick={async () => {
                if (await copyText(value)) setOpen(false);
              }}
            >
              确认复制 {selected.length} 个短码
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
