/* oxlint-disable next/no-img-element */
// Local Blob previews stay on this device and bypass server image optimization.
'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { useFileUrls } from './use-workspace-state';
import { DateTimeFields } from './date-time-fields';

export type ManualSaleDraft = {
  name: string;
  startTime: string;
  items: { number: number; sourceId: string; name: string; file?: File }[];
};
export function SaleRoundCreateDialog({
  onCreate,
  disabled,
}: {
  onCreate: (draft: ManualSaleDraft) => Promise<void>;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false),
    [name, setName] = useState(''),
    [startTime, setStartTime] = useState(''),
    [numbers, setNumbers] = useState(''),
    [mode, setMode] = useState('images'),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const [items, setItems] = useState<ManualSaleDraft['items']>([]);
  const urls = useFileUrls(
    items.flatMap((item) => (item.file ? [item.file] : [])),
  );
  async function create() {
    setBusy(true);
    setError('');
    try {
      let selected = items;
      if (mode === 'numbers') {
        const text = numbers.replace(
          /(\d+)\s*[-~～—至]\s*(\d+)/g,
          (_, left, right) => {
            const start = Number(left),
              end = Number(right);
            if (end < start || end - start >= 1000)
              throw new Error('号码范围须从小到大，单场最多 1000 个号码。');
            return Array.from(
              { length: end - start + 1 },
              (_, index) => start + index,
            ).join(',');
          },
        );
        selected = [...new Set((text.match(/\d+/g) || []).map(Number))].map(
          (number) => ({
            number,
            sourceId: crypto.randomUUID(),
            name: `${number} 号`,
          }),
        );
      }
      if (
        !selected.length ||
        selected.length > 1000 ||
        selected.some(
          (item) => !Number.isInteger(item.number) || item.number < 1,
        ) ||
        new Set(selected.map((item) => item.number)).size !== selected.length
      )
        throw new Error('请填写有效且不重复的号码，单场最多 1000 张。');
      await onCreate({
        name: name.trim() || `售图场次 ${new Date().toLocaleString('zh-CN')}`,
        startTime: startTime.split('.')[0],
        items: selected,
      });
      setOpen(false);
      setItems([]);
      setNumbers('');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '创建失败');
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Button disabled={disabled} onClick={() => setOpen(true)}>
        新建售图场次
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sale-round-create-dialog">
          <DialogTitle>自行创建售图场次</DialogTitle>
          <DialogDescription>
            可直接导入图片并核对编号，也可以只填号码开始核对。每个号码只对应一个购买者。
          </DialogDescription>
          <div className="sale-create-body">
            <label>
              场次名称
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </label>
            <DateTimeFields label="正式开始时间" value={startTime} onChange={setStartTime} />
            <label>
              图片来源
              <select
                value={mode}
                onChange={(event) => setMode(event.target.value)}
              >
                <option value="images">导入图片并设置编号</option>
                <option value="numbers">只填写号码</option>
              </select>
            </label>
            {mode === 'numbers' ? (
              <label>
                售图号码
                <textarea
                  placeholder="例如 1-54，或 1、3、5。未关联图片时可以核对号码，重拼需先有图片。"
                  value={numbers}
                  onChange={(event) => setNumbers(event.target.value)}
                />
              </label>
            ) : (
              <>
                <label>
                  选择本场图片
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={(event) => {
                      const files = Array.from(event.target.files || []);
                      setItems(
                        files.map((file, index) => ({
                          number:
                            Number(
                              file.name.match(/^(\d{1,4})(?=\D|$)/)?.[1],
                            ) || index + 1,
                          sourceId: crypto.randomUUID(),
                          name: file.name,
                          file,
                        })),
                      );
                      event.target.value = '';
                    }}
                  />
                </label>
                <div className="sale-create-images">
                  {items.map((item, index) => (
                    <article key={item.sourceId}>
                      <img src={urls[index]} alt={item.name} />
                      <span>{item.name}</span>
                      <label>
                        编号
                        <input
                          type="number"
                          min="1"
                          value={item.number}
                          onChange={(event) =>
                            setItems((current) =>
                              current.map((value, position) =>
                                position === index
                                  ? {
                                      ...value,
                                      number: Number(event.target.value),
                                    }
                                  : value,
                              ),
                            )
                          }
                        />
                      </label>
                    </article>
                  ))}
                </div>
              </>
            )}
          </div>
          {error && <p role="alert">{error}</p>}
          <DialogFooter>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => {
                setItems([]);
                setOpen(false);
              }}
            >
              取消
            </Button>
            <Button disabled={busy} onClick={() => void create()}>
              创建场次
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
