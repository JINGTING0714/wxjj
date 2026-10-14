'use client';
import { IndexJump } from './index-jump';
import { SortableList, SortHandle } from './sortable-list';
import { useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { BulkActions, SelectItem, useSelection } from './bulk-selection';
import { DragSelection } from './drag-selection';
import type { PipelineSource } from '@/lib/pipeline';

export function SourceSelection({
  sources,
  onRemove,
  onReorder,
  disabled = false,
  openByDefault = false,
  onInspect,
  actions,
  confirmMessage,
}: {
  sources: PipelineSource[];
  onRemove: (ids: string[]) => void | Promise<void>;
  onReorder?: (from: number, to: number) => void;
  disabled?: boolean;
  openByDefault?: boolean;
  onInspect?: (id: string) => void;
  actions?: (ids: string[]) => ReactNode;
  confirmMessage?: (count: number) => string;
}) {
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  const visible = sources.filter((s) =>
    s.file.name.toLowerCase().includes(query.toLowerCase()),
  );
  const selection = useSelection(visible.map((s) => s.id));
  const pages = Math.max(1, Math.ceil(visible.length / 50));
  const current = Math.min(page, pages - 1);
  if (!sources.length) return null;
  return (
    <details className="source-selection" open={openByDefault || undefined}>
      <summary>
        管理全部原图 · 搜索 / 多选 / 批量移除（{sources.length}）
      </summary>
      <input
        aria-label="搜索原图文件名"
        placeholder="按文件名搜索原图"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setPage(0);
        }}
      />
      <BulkActions
        selection={selection}
        onDelete={onRemove}
        disabled={disabled}
        confirmMessage={
          confirmMessage ||
          ((count) =>
            `从此队列移除选中的 ${count} 个原文件副本？\n电脑原文件和已完成成品不会删除。被移除原图的成品将不能在本批重打；需要时可重新导入原文件。`)
        }
      />
      {actions?.([...selection.selected])}
      <DragSelection selection={selection} disabled={disabled}>
        <SortableList
          className="source-selection-list"
          disabled={disabled || !onReorder}
          onMove={(from, to) => {
            const rows = visible.slice(current * 50, (current + 1) * 50);
            onReorder?.(
              sources.findIndex((source) => source.id === rows[from].id),
              sources.findIndex((source) => source.id === rows[to].id),
            );
          }}
        >
          {visible.slice(current * 50, (current + 1) * 50).map((s) => (
            <div key={s.id} data-selection-id={s.id}>
              {onReorder && <SortHandle disabled={disabled} />}
              <SelectItem selection={selection} id={s.id} name={s.file.name} />
              {onInspect ? (
                <button
                  className="source-inspect"
                  disabled={disabled}
                  onClick={() => onInspect(s.id)}
                >
                  {s.file.name}
                </button>
              ) : (
                <span>{s.file.name}</span>
              )}
            </div>
          ))}
        </SortableList>
      </DragSelection>
      <div className="source-selection-pages">
        <Button
          type="button"
          variant="outline"
          disabled={current === 0}
          onClick={() => setPage(current - 1)}
        >
          上一页
        </Button>
        <IndexJump
          index={current}
          count={pages}
          onChange={setPage}
          label="跳转原图管理页码"
        />
        <Button
          type="button"
          variant="outline"
          disabled={current + 1 === pages}
          onClick={() => setPage(current + 1)}
        >
          下一页
        </Button>
      </div>
    </details>
  );
}
