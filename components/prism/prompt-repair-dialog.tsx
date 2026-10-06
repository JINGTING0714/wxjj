'use client';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { proposePromptRepair } from '@/lib/prompt-repair';
import type { LibraryAsset, StoredLibraryAsset } from '@/lib/prism-types';
import { useVault } from './vault-provider';

export function PromptRepairDialog({
  assets,
  onRepaired,
}: {
  assets: LibraryAsset[];
  onRepaired: () => void;
}) {
  const vault = useVault();
  const [history, setHistory] = useState<
    Array<{ id: string; original: StoredLibraryAsset }>
  >([]);
  const undoable = history.filter((entry) =>
    assets.some(
      (asset) =>
        asset.id === entry.original.id &&
        asset.updatedAt === entry.original.updatedAt &&
        !asset.promptAutoRepairDisabled,
    ),
  );
  async function undo() {
    if (
      !undoable.length ||
      !window.confirm(
        `撤销 ${undoable.length} 条尚未手动修改的自动整理？词文、备注和补充字段恢复为整理前内容，例图保留，之后可自行校对。`,
      )
    )
      return;
    setBusy(true);
    try {
      await vault.writeBatch({
        records: undoable.map((entry) => ({
          scope: 'assets:prompt',
          value: { ...entry.original, promptAutoRepairDisabled: true },
        })),
      });
      setHistory([]);
      onRepaired();
      setOpen(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '撤销失败');
    } finally {
      setBusy(false);
    }
  }
  const [open, setOpen] = useState(false),
    [selected, setSelected] = useState<string[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const proposals = useMemo(
    () =>
      assets
        .map(({ images: _images, ...asset }) => ({
          original: asset,
          repair: proposePromptRepair(asset),
        }))
        .filter((entry) => entry.repair),
    [assets],
  );
  async function save() {
    setBusy(true);
    setError('');
    try {
      const records = proposals.filter(({ original }) =>
        selected.includes(original.id),
      );
      await vault.writeBatch({
        records: records.map(({ repair }) => ({
          scope: 'assets:prompt',
          value: repair!,
        })),
      });
      onRepaired();
      setOpen(false);
      window.dispatchEvent(new CustomEvent('prism:assets-changed'));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '修正保存失败');
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Button
        variant="outline"
        disabled={vault.status !== 'unlocked'}
        onClick={() => {
          setSelected([]);
          setOpen(true);
          void vault
            .loadRecords<{ id: string; original: StoredLibraryAsset }>(
              'prompt-repair-history',
            )
            .then(setHistory)
            .catch(() => setHistory([]));
        }}
      >
        检查旧条目的双语字段{proposals.length ? `（${proposals.length}）` : ''}
      </Button>
      <Dialog open={open && vault.status === 'unlocked'} onOpenChange={setOpen}>
        <DialogContent className="prompt-repair-dialog">
          <DialogTitle>检查双语归类</DialogTitle>
          <DialogDescription>
            勾选并保存后，将识别出的词文移入英文／中文字段。例图、私人备注与其他补充字段保留；请先核对预览。
          </DialogDescription>
          <div className="prompt-repair-list">
            {!proposals.length && (
              <p>
                库中明确的中英文已经归类，没有发现额外候选。仍需核对的原文可以直接复制。
              </p>
            )}
            {proposals.map(({ original, repair }) => (
              <article key={original.id}>
                <label>
                  <input
                    type="checkbox"
                    checked={selected.includes(original.id)}
                    onChange={(event) =>
                      setSelected((ids) =>
                        event.target.checked
                          ? [...ids, original.id]
                          : ids.filter((id) => id !== original.id),
                      )
                    }
                  />
                  {original.title}
                </label>
                <strong>英文提示词</strong>
                <pre>{repair!.promptEnglish || '无'}</pre>
                <strong>中文提示词</strong>
                <pre>{repair!.promptChinese || '无'}</pre>
              </article>
            ))}
          </div>
          {error && <p role="alert">{error}</p>}
          <DialogFooter>
            <Button
              variant="outline"
              disabled={busy || !undoable.length}
              onClick={() => void undo()}
            >
              撤销自动整理{undoable.length ? `（${undoable.length}）` : ''}
            </Button>
            <Button
              variant="outline"
              onClick={() =>
                setSelected(proposals.map(({ original }) => original.id))
              }
            >
              选择全部候选
            </Button>
            <Button
              disabled={busy || !selected.length}
              onClick={() => void save()}
            >
              保存 {selected.length} 条修正
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
