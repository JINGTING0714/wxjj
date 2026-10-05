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
import type { LibraryAsset } from '@/lib/prism-types';
import { useVault } from './vault-provider';

export function PromptRepairDialog({
  assets,
  onRepaired,
}: {
  assets: LibraryAsset[];
  onRepaired: () => void;
}) {
  const vault = useVault();
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
        }}
      >
        检查旧条目的双语字段{proposals.length ? `（${proposals.length}）` : ''}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="prompt-repair-dialog">
          <DialogTitle>修正原文件补充中的提示词</DialogTitle>
          <DialogDescription>
            勾选并保存后，将识别出的词文移入英文／中文字段。例图、私人备注与其他补充字段保留；请先核对预览。
          </DialogDescription>
          <div className="prompt-repair-list">
            {!proposals.length && <p>没有发现需要修正的条目。</p>}
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
