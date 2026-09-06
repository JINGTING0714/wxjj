'use client';
import { useEffect, useRef, useState } from 'react';
import {
  Upload,
  Eye,
  EyeOff,
  Check,
  X,
  Plus,
  Download,
  Archive,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useVault } from './vault-provider';
import { useFileUrls } from './use-workspace-state';
import {
  parseAssetFile,
  type ImportDocument,
  type ImportRow,
} from '@/lib/asset-import';
import type {
  AssetKind,
  StoredLibraryAsset,
  CollectionRecord,
} from '@/lib/prism-types';
import type { VaultWrite, DecryptedBlob } from '@/lib/local-vault';
import { profileNature } from '@/lib/profile-model';
import { downloadBlob, downloadZip } from '@/lib/download';

function ImportArchive({ kind }: { kind: AssetKind }) {
  const vault = useVault();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<CollectionRecord[]>([]);
  const [active, setActive] = useState('');
  const [originals, setOriginals] = useState<DecryptedBlob[]>([]);
  const [unmatched, setUnmatched] = useState<DecryptedBlob[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const urls = useFileUrls(unmatched.map((b) => b.blob));
  const show = async () => {
    setOpen(true);
    setError('');
    try {
      const [indexes, libraries] = await Promise.all([
        vault.loadRecords<{ id: string; collection: string; name: string }>(
          `imports:${kind}`,
        ),
        vault.loadRecords<CollectionRecord>(`collections:${kind}`),
      ]);
      const byId = new Map(libraries.map((l) => [l.id, l]));
      indexes.forEach((entry) => {
        if (!byId.has(entry.collection))
          byId.set(entry.collection, {
            id: entry.collection,
            name: entry.name,
          });
      });
      setItems([...byId.values()]);
    } catch (e) {
      setError(String(e));
    }
  };
  const choose = async (id: string) => {
    setActive(id);
    setOriginals([]);
    setUnmatched([]);
    if (!id) return;
    setBusy(true);
    try {
      const [source, images] = await Promise.all([
        vault.loadBlobs(`import-original:${id}`),
        vault.loadBlobs(`import-unmatched:${id}`),
      ]);
      setOriginals(source);
      setUnmatched(images);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <Button
        onClick={() => {
          void show();
        }}
        variant="ghost"
      >
        <Archive />
        导入原文件与附件
      </Button>
      <Dialog
        onOpenChange={(value) => {
          setOpen(value);
          if (!value) {
            setOriginals([]);
            setUnmatched([]);
            setActive('');
          }
        }}
        open={open}
      >
        <DialogContent className="asset-import-dialog">
          <DialogHeader>
            <DialogTitle>保留的导入原文件与待分配例图</DialogTitle>
            <DialogDescription>
              只在本机解密。原文件不会因自动提取而丢弃；下载待分配图后，可在对应资产的例图入口补入。删除分类也会保留导入归档。
            </DialogDescription>
          </DialogHeader>
          <select
            aria-label="选择导入归档"
            disabled={busy}
            onChange={(e) => {
              void choose(e.target.value);
            }}
            value={active}
          >
            <option value="">选择库或导入批次…</option>
            {items.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
          {error && <p className="error-banner">{error}</p>}
          {busy && <p>正在本机解密附件…</p>}
          {originals.map((file) => (
            <Button
              key={file.id}
              onClick={() => downloadBlob(file.blob, file.name)}
              variant="outline"
            >
              <Download />
              下载原文件 · {file.name}
            </Button>
          ))}
          {active && !busy && !originals.length && (
            <p>此库没有文件导入归档，可能是手工建立的库。</p>
          )}
          {unmatched.length > 0 && (
            <>
              <Button
                onClick={() => {
                  void downloadZip(
                    unmatched.map((b) => ({ name: b.name, blob: b.blob })),
                    '待分配例图.zip',
                  ).catch((e) => setError(String(e)));
                }}
                variant="outline"
              >
                下载全部待分配例图 · {unmatched.length} 张
              </Button>
              <div className="unmatched-grid">
                {unmatched.map((file, i) => (
                  <button
                    key={file.id}
                    onClick={() => downloadBlob(file.blob, file.name)}
                    type="button"
                  >
                    <img alt={file.name} src={urls[i]} />
                    <span>{file.name}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function PreviewRow({
  row,
  onChange,
}: {
  row: ImportRow;
  onChange: (patch: Partial<ImportRow>) => void;
}) {
  const urls = useFileUrls(row.images);
  const [show, setShow] = useState(false);
  useEffect(() => {
    const hide = () => setShow(false);
    window.addEventListener('prism:hide-secrets', hide);
    return () => window.removeEventListener('prism:hide-secrets', hide);
  }, []);
  return (
    <article className="import-row">
      <label className="check-line">
        <input
          checked={row.include}
          onChange={(e) => onChange({ include: e.target.checked })}
          type="checkbox"
        />
        导入此条 · {row.sheet || '正文'} {row.row ? `第 ${row.row} 行` : ''}
      </label>
      <div className="import-row-fields">
        <label>
          名称 / 序号
          <Input
            onChange={(e) => onChange({ title: e.target.value })}
            value={row.title}
          />
        </label>
        <label>
          作者
          <Input
            onChange={(e) => onChange({ author: e.target.value })}
            placeholder="待确认"
            value={row.author}
          />
        </label>
        <label>
          标签（逗号分隔）
          <Input
            onChange={(e) => onChange({ tags: e.target.value.split(/[,，]/) })}
            value={row.tags.join(', ')}
          />
        </label>
        <label>
          取得方式
          <Input
            onChange={(e) => onChange({ acquisition: e.target.value })}
            placeholder="未知可留空，不会猜测是否付费"
            value={row.acquisition}
          />
        </label>
      </div>
      <div className="import-secret">
        <Button onClick={() => setShow(!show)} size="sm" variant="outline">
          {show ? <EyeOff /> : <Eye />}
          {show ? '隐藏内容' : `查看 / 校对内容（${row.secret.length} 字符）`}
        </Button>
        {show && (
          <textarea
            aria-label="导入内容"
            onChange={(e) => onChange({ secret: e.target.value })}
            value={row.secret}
          />
        )}
      </div>
      {row.kind === 'profile' && (
        <div className="import-row-fields">
          <label>
            文件夹长码
            <Input
              onChange={(e) => onChange({ longCode: e.target.value })}
              type="password"
              value={row.longCode}
            />
          </label>
          <label>
            性质
            <Input
              onChange={(e) => onChange({ nature: e.target.value })}
              placeholder="阶段 P / 成品 P / 其他；空白则待确认"
              value={row.nature}
            />
          </label>
        </div>
      )}
      <div className="import-example-list">
        {urls.map((url, i) => (
          <div key={i}>
            <img alt={`例图 ${i + 1}`} src={url} />
            <button
              aria-label="移除例图"
              onClick={() =>
                onChange({ images: row.images.filter((_, j) => i !== j) })
              }
              type="button"
            >
              <X />
            </button>
          </div>
        ))}
        <label className="mini-file">
          <Plus />
          补充例图
          <input
            accept="image/*"
            multiple
            onChange={(e) => {
              onChange({
                images: [...row.images, ...Array.from(e.target.files || [])],
              });
              e.target.value = '';
            }}
            type="file"
          />
        </label>
      </div>
      <label>
        备注
        <textarea
          onChange={(e) => onChange({ note: e.target.value })}
          value={row.note}
        />
      </label>
      {row.warnings.length > 0 && (
        <p className="import-warning">
          {row.warnings
            .filter((w) => !(row.images.length && /未找到|未识别例图/.test(w)))
            .join('；')}
        </p>
      )}
      {row.customFields.length > 0 && (
        <details>
          <summary>保留的原文件附加字段 · {row.customFields.length} 项</summary>
          <dl>
            {row.customFields.map((field) => (
              <div key={field.id}>
                <dt>{field.label}</dt>
                <dd>{field.value}</dd>
              </div>
            ))}
          </dl>
        </details>
      )}
    </article>
  );
}
function Unmatched({
  document,
  onAssign,
}: {
  document: ImportDocument;
  onAssign: (image: number, rowId: string) => void;
}) {
  const urls = useFileUrls(document.unmatchedImages);
  return document.unmatchedImages.length ? (
    <details className="unmatched-zone" open>
      <summary>需要确认归属的图片 · {urls.length} 张（原图不会丢弃）</summary>
      <div className="unmatched-grid">
        {urls.map((url, i) => (
          <label key={i}>
            <img alt={document.unmatchedImages[i].name} src={url} />
            <select
              aria-label="指定例图所属条目"
              onChange={(e) => {
                if (e.target.value) onAssign(i, e.target.value);
              }}
              value=""
            >
              <option value="">选择所属条目…</option>
              {document.rows.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.title} · {row.author} · {row.sheet}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
    </details>
  ) : null;
}
export function FileImportDialog({
  kind,
  onImported,
}: {
  kind: AssetKind;
  onImported: () => void;
}) {
  const vault = useVault();
  const [open, setOpen] = useState(false);
  const [documents, setDocuments] = useState<ImportDocument[]>([]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [checked, setChecked] = useState(false);
  const [page, setPage] = useState(0);
  const [query, setQuery] = useState('');
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const select = async (files: File[]) => {
    setBusy(true);
    setError('');
    setChecked(false);
    setPage(0);
    try {
      const parsed: ImportDocument[] = [];
      for (const file of files)
        parsed.push(
          await parseAssetFile(file, kind, (message) => {
            if (mounted.current) setStatus(message);
          }),
        );
      if (mounted.current) {
        setDocuments((current) => [...current, ...parsed]);
        setStatus('本地解析完成，请核对后一次性导入。');
      }
    } catch (e) {
      if (mounted.current)
        setError(e instanceof Error ? e.message : '文件解析失败');
    } finally {
      if (mounted.current) setBusy(false);
    }
  };
  const patchRow = (
    documentIndex: number,
    rowId: string,
    patch: Partial<ImportRow>,
  ) =>
    setDocuments((current) =>
      current.map((doc, index) =>
        index !== documentIndex
          ? doc
          : {
              ...doc,
              rows: doc.rows.map((row) =>
                row.id === rowId ? { ...row, ...patch } : row,
              ),
            },
      ),
    );
  const allRows = documents.flatMap((doc, documentIndex) =>
    doc.rows.map((row) => ({ row, documentIndex })),
  );
  const filtered = allRows.filter(
    ({ row }) =>
      !query ||
      [row.title, row.author, row.sheet]
        .join(' ')
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const selected = allRows.filter(({ row }) => row.include);
  const pageCount = Math.max(1, Math.ceil(filtered.length / 20));
  const save = async () => {
    setBusy(true);
    setError('');
    try {
      if (selected.some(({ row }) => !row.title.trim() || !row.secret.trim()))
        throw new Error('有选中条目没有名称或内容，请补齐或取消选中。');
      if (
        selected.some(
          ({ row }) =>
            row.kind !== 'prompt' && !/^[a-z\d]{7}$/i.test(row.secret.trim()),
        )
      )
        throw new Error('短码应为 7 位字母或数字，请校对。');
      const batch: VaultWrite = { records: [], blobs: [] };
      const now = new Date().toISOString();
      for (const doc of documents) {
        const rows = doc.rows.filter((r) => r.include);
        if (!rows.length) continue;
        const collection = crypto.randomUUID();
        batch.records!.push({
          scope: `collections:${kind}`,
          value: {
            id: collection,
            name: doc.libraryName.trim() || doc.file.name,
          },
        });
        batch.records!.push({
          scope: `imports:${kind}`,
          value: {
            id: `import:${collection}`,
            collection,
            name: doc.file.name,
          },
        });
        batch.blobs!.push({
          id: crypto.randomUUID(),
          scope: `import-original:${collection}`,
          blob: doc.file,
          name: doc.file.name,
        });
        for (const image of doc.unmatchedImages)
          batch.blobs!.push({
            id: crypto.randomUUID(),
            scope: `import-unmatched:${collection}`,
            blob: image,
            name: image.name,
          });
        const groups = new Map<string, ImportRow[]>();
        for (const row of rows) {
          const group =
            kind === 'profile' && row.longCode.trim()
              ? `long:${row.longCode.trim()}`
              : row.id;
          groups.set(group, [...(groups.get(group) || []), row]);
        }
        for (const grouped of groups.values()) {
          const row = grouped[0];
          const record: StoredLibraryAsset = {
            id: row.id,
            kind,
            title: row.title.trim(),
            secret: row.secret.trim(),
            longCode: row.longCode,
            author: row.author.trim() || '未记录',
            origin: doc.file.name,
            acquisition: row.acquisition || '其他',
            acquisitionOther: row.acquisition ? undefined : '原文件未说明',
            note: row.note,
            tags: row.tags.filter(Boolean),
            collection,
            customFields: [
              ...row.customFields,
              {
                id: crypto.randomUUID(),
                label: '导入定位',
                value: `${row.sheet || '正文'}${row.row ? ` / 第 ${row.row} 行` : ''}`,
              },
            ],
            createdAt: now,
            updatedAt: now,
          };
          batch.records!.push({ scope: `assets:${kind}`, value: record });
          if (kind === 'profile') {
            record.profileCodes = grouped.map((r) => ({
              id: r.id,
              label: r.title,
              secret: r.secret.trim(),
              ...profileNature(r.nature),
              note: r.note,
              customFields: [
                ...r.customFields,
                {
                  id: crypto.randomUUID(),
                  label: '此短码原作者',
                  value: r.author || '未记录',
                },
                {
                  id: crypto.randomUUID(),
                  label: '此短码取得方式',
                  value: r.acquisition || '未说明',
                },
              ],
              imageScope: `profile-code-image:${record.id}:${r.id}`,
            }));
            for (const r of grouped)
              for (const image of r.images)
                batch.blobs!.push({
                  id: crypto.randomUUID(),
                  scope: `profile-code-image:${record.id}:${r.id}`,
                  blob: image,
                  name: image.name,
                });
          } else
            for (const image of row.images)
              batch.blobs!.push({
                id: crypto.randomUUID(),
                scope: `asset-image:${row.id}`,
                blob: image,
                name: image.name,
              });
        }
      }
      setStatus('正在本机加密并一次性保存全部条目与例图…');
      await vault.writeBatch(batch);
      const count = selected.length;
      setDocuments([]);
      setChecked(false);
      setOpen(false);
      onImported();
      window.dispatchEvent(new CustomEvent('prism:assets-changed'));
      setStatus(`完整导入 ${count} 条资料，原文件也已加密保存。`);
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存失败');
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <Button
        disabled={vault.status !== 'unlocked'}
        onClick={() => setOpen(true)}
        variant="outline"
      >
        <Upload />
        文件批量导入
      </Button>
      <ImportArchive kind={kind} />
      {!open && status.startsWith('完整导入') && (
        <span className="success-line">{status}</span>
      )}
      <Dialog
        onOpenChange={(value) => {
          if (!busy) setOpen(value);
        }}
        open={open}
      >
        <DialogContent className="asset-import-dialog">
          <DialogHeader>
            <DialogTitle>文件 → 自动识别 → 校对 → 完整入库</DialogTitle>
            <DialogDescription>
              一个文件建立一个库；按作者列 /
              工作表识别老师，名称使用序号，来源保留上传文件名。全部本地解析，不调用云端
              AI。
            </DialogDescription>
          </DialogHeader>
          <div className="import-toolbar">
            <label className="mini-file">
              <Upload />
              选择文件（可多选）
              <input
                accept=".xlsx,.xlsm,.docx,.csv,.tsv,.txt,.md,.json,.html,.htm,.pdf,.zip"
                disabled={busy}
                multiple
                onChange={(e) => {
                  void select(Array.from(e.target.files || []));
                  e.target.value = '';
                }}
                type="file"
              />
            </label>
            <span>
              {selected.length} / {allRows.length} 条已选
            </span>
          </div>
          <p>
            Excel / WPS 的工作表和嵌入图片、Word 表格、CSV / TSV、TXT /
            Markdown、JSON、HTML、文字版 PDF、带图片的 ZIP。扫描 PDF 需先本机
            OCR；无法确定的例图会留在待分配区，不会悄悄填错。
            {kind === 'profile' &&
              '同一文件中长码相同的条目归入同一 Profile 文件夹，各短码与例图独立保留；缺长码的不会擅自合并。'}
          </p>
          {status && <p role="status">{status}</p>}
          {error && (
            <p className="error-banner" role="alert">
              {error}
            </p>
          )}
          <fieldset disabled={busy} className="workshop-fieldset">
            <div className="import-documents">
              {documents.map((doc, di) => (
                <section key={`${doc.file.name}-${di}`}>
                  <label>
                    新库名称 · {doc.file.name}
                    <Input
                      onChange={(e) =>
                        setDocuments((current) =>
                          current.map((d, i) =>
                            i === di
                              ? { ...d, libraryName: e.target.value }
                              : d,
                          ),
                        )
                      }
                      value={doc.libraryName}
                    />
                  </label>
                  <span>
                    {doc.rows.length} 条 ·{' '}
                    {doc.rows.reduce((n, r) => n + r.images.length, 0)}{' '}
                    张关联例图
                  </span>
                  {doc.warnings.map((warning, i) => (
                    <p className="import-warning" key={i}>
                      {warning}
                    </p>
                  ))}
                  <Unmatched
                    document={doc}
                    onAssign={(imageIndex, rowId) => {
                      const image = doc.unmatchedImages[imageIndex];
                      setDocuments((current) =>
                        current.map((d, i) =>
                          i === di
                            ? {
                                ...d,
                                unmatchedImages: d.unmatchedImages.filter(
                                  (_, n) => n !== imageIndex,
                                ),
                                rows: d.rows.map((row) =>
                                  row.id === rowId
                                    ? { ...row, images: [...row.images, image] }
                                    : row,
                                ),
                              }
                            : d,
                        ),
                      );
                    }}
                  />
                </section>
              ))}
            </div>
            {allRows.length > 0 && (
              <>
                <div className="import-toolbar">
                  <Input
                    aria-label="筛选待导入条目"
                    onChange={(e) => {
                      setQuery(e.target.value);
                      setPage(0);
                    }}
                    placeholder="按作者、工作表、序号筛选"
                    value={query}
                  />
                  <Button
                    onClick={() =>
                      setDocuments((current) =>
                        current.map((doc) => ({
                          ...doc,
                          rows: doc.rows.map((r) => ({ ...r, include: true })),
                        })),
                      )
                    }
                    variant="outline"
                  >
                    全选
                  </Button>
                  <Button
                    onClick={() =>
                      setDocuments((current) =>
                        current.map((doc) => ({
                          ...doc,
                          rows: doc.rows.map((r) => ({ ...r, include: false })),
                        })),
                      )
                    }
                    variant="outline"
                  >
                    全不选
                  </Button>
                </div>
                {filtered
                  .slice(
                    Math.min(page, pageCount - 1) * 20,
                    (Math.min(page, pageCount - 1) + 1) * 20,
                  )
                  .map(({ row, documentIndex }) => (
                    <PreviewRow
                      key={row.id}
                      onChange={(patch) =>
                        patchRow(documentIndex, row.id, patch)
                      }
                      row={row}
                    />
                  ))}
                <div className="preview-pagination">
                  <Button
                    disabled={page === 0}
                    onClick={() => setPage(page - 1)}
                    variant="outline"
                  >
                    上一页
                  </Button>
                  <span>
                    {Math.min(page + 1, pageCount)} / {pageCount}
                  </span>
                  <Button
                    disabled={page >= pageCount - 1}
                    onClick={() => setPage(page + 1)}
                    variant="outline"
                  >
                    下一页
                  </Button>
                </div>
                <label className="check-line">
                  <input
                    checked={checked}
                    onChange={(e) => setChecked(e.target.checked)}
                    type="checkbox"
                  />
                  我已核对作者、条目边界和例图关联；不确定的信息已补充或保留待补充。
                </label>
                <Button disabled={!checked || !selected.length} onClick={save}>
                  <Check />
                  确认导入 {selected.length} 条（一个文件一个库）
                </Button>
              </>
            )}
          </fieldset>
        </DialogContent>
      </Dialog>
    </>
  );
}
