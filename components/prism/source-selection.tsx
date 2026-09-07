'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { BulkActions, SelectItem, useSelection } from './bulk-selection';
import type { PipelineSource } from '@/lib/pipeline';

export function SourceSelection({
  sources,
  onRemove,
  disabled = false,
}: {
  sources: PipelineSource[];
  onRemove: (ids: string[]) => void | Promise<void>;
  disabled?: boolean;
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
    <details className="source-selection">
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
        confirmMessage={(count) =>
          `从此队列移除选中的 ${count} 个原文件副本？\n电脑原文件和已完成成品不会删除。被移除原图的成品将不能在本批重打；需要时可重新导入原文件。`
        }
      />
      <div className="source-selection-list">
        {visible.slice(current * 50, (current + 1) * 50).map((s) => (
          <div key={s.id}>
            <SelectItem selection={selection} id={s.id} name={s.file.name} />
            <span>{s.file.name}</span>
          </div>
        ))}
      </div>
      <div className="source-selection-pages">
        <Button
          type="button"
          variant="outline"
          disabled={current === 0}
          onClick={() => setPage(current - 1)}
        >
          上一页
        </Button>
        <span>
          {current + 1} / {pages}
        </span>
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
