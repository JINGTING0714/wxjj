'use client';
import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useConfirmation } from './use-confirmation';

export function useSelection(ids: string[]) {
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  // Selection is always scoped to the currently visible search/category results.
  const selected = new Set(ids.filter((id) => chosen.has(id)));
  return {
    selected,
    total: ids.length,
    toggle: (id: string) =>
      setChosen(() => {
        const next = new Set(selected);
        next.has(id) ? next.delete(id) : next.add(id);
        return next;
      }),
    all: () => setChosen(new Set(selected.size === ids.length ? [] : ids)),
    clear: () => setChosen(new Set()),
  };
}

export function BulkActions({
  selection,
  onDelete,
  disabled = false,
  noun = '条记录',
  confirmMessage,
}: {
  selection: ReturnType<typeof useSelection>;
  onDelete: (ids: string[]) => Promise<void> | void;
  disabled?: boolean;
  noun?: string;
  confirmMessage?: (count: number) => string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const confirmation = useConfirmation();
  if (!selection.total) return null;
  return (
    <div className="bulk-actions" onClick={(e) => e.stopPropagation()}>
      {confirmation.dialog}
      <label>
        <input
          type="checkbox"
          aria-label="全选当前结果"
          disabled={disabled || busy}
          checked={selection.selected.size === selection.total}
          onChange={selection.all}
        />
        全选当前结果（{selection.total}）
      </label>
      <span>已选 {selection.selected.size}</span>
      <Button
        type="button"
        variant="outline"
        disabled={!selection.selected.size || disabled || busy}
        onClick={selection.clear}
      >
        取消选择
      </Button>
      <Button
        type="button"
        variant="outline"
        disabled={!selection.selected.size || disabled || busy}
        onClick={async () => {
          const ids = [...selection.selected];
          if (
            !(await confirmation.ask(
              confirmMessage
                ? confirmMessage(ids.length)
                : `确定删除选中的 ${ids.length} ${noun}及其附属例图吗？\n只删除本地保险库中的这些内容，不会删除电脑上的原文件；此操作不能撤销，请先备份。`,
              '确认批量删除',
              '确认删除',
            ))
          )
            return;
          setBusy(true);
          setError('');
          try {
            await onDelete(ids);
            selection.clear();
          } catch (e) {
            setError(
              e instanceof Error ? e.message : '删除失败，内容已保留，请重试。',
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        <Trash2 />
        {busy ? '正在删除…' : '删除所选'}
      </Button>
      {error && (
        <p className="error-banner" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export function SelectItem({
  selection,
  id,
  name,
}: {
  selection: ReturnType<typeof useSelection>;
  id: string;
  name: string;
}) {
  return (
    <label className="bulk-item-select" onClick={(e) => e.stopPropagation()}>
      <input
        type="checkbox"
        aria-label={`选择：${name}`}
        checked={selection.selected.has(id)}
        onChange={() => selection.toggle(id)}
      />
      <span>选择</span>
    </label>
  );
}
