'use client';
import { useState } from 'react';
import { CalculatorPanel } from './calculator-panel';
import { BookOpen, Download, Plus, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { downloadBlob } from '@/lib/download';
import {
  initialLedger,
  parseMoney,
  money,
  ledgerSummary,
  validateTransaction,
  appendLedgerImport,
  type LedgerData,
  type LedgerTransaction,
  type LedgerUndo,
  type TransactionKind,
} from '@/lib/accounting';
import { exportLedger, importLedger } from '@/lib/accounting-file';
import { SectionHead } from './studio-shared';
import { useWorkspaceState } from './use-workspace-state';
import { useConfirmation } from './use-confirmation';
import { useFileUrls } from './use-workspace-state';
import { ExampleImage } from './example-image';

const labels: Record<TransactionKind, string> = {
  income: '收入',
  expense: '支出',
  transfer: '转账',
  refund: '退款',
  adjustment: '余额调整',
};
const formText = (form: FormData, name: string, fallback = '') => {
  const value = form.get(name);
  return typeof value === 'string' ? value : fallback;
};
const today = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};
function ReceiptList({
  files,
  onRemove,
}: {
  files: File[];
  onRemove?: (index: number) => void;
}) {
  const urls = useFileUrls(files);
  return (
    <div className="ledger-receipts">
      {files.map((file, index) => (
        <figure key={index}>
          {file.type.startsWith('image/') && (
            <ExampleImage src={urls[index]} alt={file.name} />
          )}
          <figcaption>{file.name}</figcaption>
          <Button
            type="button"
            variant="outline"
            onClick={() => downloadBlob(file, file.name)}
          >
            下载凭证
          </Button>
          {onRemove && (
            <Button
              type="button"
              variant="ghost"
              onClick={() => onRemove(index)}
            >
              移除
            </Button>
          )}
        </figure>
      ))}
    </div>
  );
}
export function AccountingPanel() {
  const workspace = useWorkspaceState('accounting', {
    ...initialLedger(),
    undo: [] as LedgerUndo[],
  });
  const { state, setState } = workspace;
  const confirmation = useConfirmation();
  const [editing, setEditing] = useState<LedgerTransaction | null>(null);
  const [dialog, setDialog] = useState(false);
  const [kind, setKind] = useState<TransactionKind>('expense');
  const [receipts, setReceipts] = useState<File[]>([]);
  const [query, setQuery] = useState('');
  const [from, setFrom] = useState(today().slice(0, 7) + '-01');
  const [to, setTo] = useState(today());
  const [account, setAccount] = useState('all');
  const [category, setCategory] = useState('all');
  const [book, setBook] = useState('all');
  const [page, setPage] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [calculatorOpen, setCalculatorOpen] = useState(false);
  const [formCalculatorOpen, setFormCalculatorOpen] = useState(false);
  const [manage, setManage] = useState<
    'accounts' | 'categories' | 'books' | null
  >(null);
  const [incoming, setIncoming] = useState<LedgerData | null>(null);
  const visible = state.transactions
    .filter(
      (entry) =>
        (!from || entry.date >= from) &&
        (!to || entry.date <= to) &&
        (account === 'all' ||
          entry.accountId === account ||
          entry.toAccountId === account) &&
        (category === 'all' || entry.categoryId === category) &&
        (book === 'all' || entry.bookId === book) &&
        (!query.trim() ||
          [
            entry.note,
            ...entry.tags,
            labels[entry.kind],
            state.accounts.find((item) => item.id === entry.accountId)?.name,
            state.categories.find((item) => item.id === entry.categoryId)?.name,
          ]
            .join(' ')
            .toLocaleLowerCase()
            .includes(query.trim().toLocaleLowerCase())),
    )
    .sort(
      (a, b) =>
        b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt),
    );
  const pages = Math.max(1, Math.ceil(visible.length / 30));
  const currentPage = Math.min(page, pages - 1);
  const summary = ledgerSummary(state, visible);
  const monthly = ledgerSummary(
    state,
    state.transactions.filter(
      (entry) =>
        entry.date.slice(0, 7) === today().slice(0, 7) &&
        (book === 'all' || entry.bookId === book),
    ),
  );
  const groupName = (key: 'accounts' | 'categories' | 'books', id?: string) =>
    state[key].find((item) => item.id === id)?.name || '未找到';
  const open = (transaction?: LedgerTransaction, duplicate = false) => {
    const entry = transaction
      ? { ...transaction, ...(duplicate ? { id: '', date: today() } : {}) }
      : null;
    setEditing(entry);
    setKind(transaction?.kind || 'expense');
    setReceipts(transaction?.receipts || []);
    setMessage('');
    setDialog(true);
  };
  const save = async (event: React.SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy || !workspace.ready) return;
    const form = new FormData(event.currentTarget);
    try {
      const now = new Date().toISOString();
      const entry: LedgerTransaction = {
        id: editing?.id || crypto.randomUUID(),
        date: formText(form, 'date'),
        kind,
        amount: parseMoney(formText(form, 'amount'), kind === 'adjustment'),
        accountId: formText(form, 'account'),
        toAccountId:
          kind === 'transfer' ? formText(form, 'toAccount') : undefined,
        categoryId: formText(form, 'category'),
        bookId: formText(form, 'book'),
        note: formText(form, 'note').trim(),
        tags: formText(form, 'tags')
          .split(/[,，]/)
          .map((tag) => tag.trim())
          .filter(Boolean),
        refundDirection:
          kind === 'refund'
            ? (formText(form, 'refundDirection') as 'income' | 'expense')
            : undefined,
        receipts,
        createdAt: editing?.id ? editing.createdAt : now,
        updatedAt: now,
      };
      validateTransaction(entry, state);
      if (
        editing?.id &&
        !(await confirmation.ask(
          `将修改 ${editing.date} 的${labels[editing.kind]}记录（¥${money(editing.amount)}）。保存后可撤销。`,
          '确认修改交易',
          '保存修改',
        ))
      )
        return;
      setBusy(true);
      const previous = state.transactions.find((item) => item.id === entry.id);
      const next = {
        ...state,
        transactions: [
          entry,
          ...state.transactions.filter((item) => item.id !== entry.id),
        ],
      };
      ledgerSummary(next);
      setState({
        ...next,
        undo: [
          ...state.undo,
          { id: entry.id, previous, label: previous ? '修改交易' : '添加交易' },
        ].slice(-20),
      });
      setEditing(entry);
      await workspace.flush();
      setDialog(false);
      setMessage('账目已保存到本地保险库。');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '保存失败');
    } finally {
      setBusy(false);
    }
  };
  const remove = async (entry: LedgerTransaction) => {
    if (
      busy ||
      !(await confirmation.ask(
        `删除 ${entry.date} 的${labels[entry.kind]} ¥${money(entry.amount)}？可通过“撤销”恢复。`,
        '删除交易',
        '删除',
      ))
    )
      return;
    setBusy(true);
    try {
      setState((current) => ({
        ...current,
        transactions: current.transactions.filter(
          (item) => item.id !== entry.id,
        ),
        undo: [
          ...current.undo,
          { id: entry.id, previous: entry, label: '删除交易' },
        ].slice(-20),
      }));
      await workspace.flush();
      setMessage('已删除，可撤销。');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '删除保存失败');
    } finally {
      setBusy(false);
    }
  };
  const undo = async () => {
    const action = state.undo.at(-1);
    if (!action || busy) return;
    setBusy(true);
    try {
      setState((current) => ({
        ...current,
        transactions: [
          ...(action.previous ? [action.previous] : []),
          ...current.transactions.filter((entry) => entry.id !== action.id),
        ],
        undo: current.undo.slice(0, -1),
      }));
      await workspace.flush();
      setMessage(`已撤销${action.label}。`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '撤销保存失败');
    } finally {
      setBusy(false);
    }
  };
  const selection = (
    key: 'accounts' | 'categories' | 'books',
    name: string,
    value?: string,
  ) => (
    <select
      id={`ledger-${name}`}
      name={name}
      defaultValue={value || state[key].find((item) => !item.archived)?.id}
      required
    >
      {state[key]
        .filter((item) => !item.archived || item.id === value)
        .map((item) => (
          <option key={item.id} value={item.id}>
            {item.name}
            {item.archived ? '（停用）' : ''}
          </option>
        ))}
    </select>
  );
  return (
    <div className="studio-page ledger-page">
      {confirmation.dialog}
      <SectionHead
        eyebrow="LOCAL LEDGER"
        number="11"
        title="记账本"
        description="你录入，你确认。收入、支出和资金变化在本机保险库保存。"
        actions={
          <>
            <Button disabled={busy || !workspace.ready} onClick={() => open()}>
              <Plus />
              记一笔
            </Button>
            <Button
              variant="outline"
              disabled={busy || !state.undo.length}
              onClick={() => void undo()}
            >
              <Undo2 />
              撤销
            </Button>
          </>
        }
      />
      <button className="ledger-calculator-button" type="button" onClick={() => setCalculatorOpen((value) => !value)} aria-expanded={calculatorOpen}>计算器</button>
      <div className="ledger-floating-calculator" hidden={!calculatorOpen}><button type="button" onClick={() => setCalculatorOpen(false)} aria-label="关闭计算器">关闭</button><CalculatorPanel compact /></div>
      {message && <output className="ledger-message">{message}</output>}
      {workspace.saveError && (
        <p role="alert">
          保存失败：{workspace.saveError}。
          <Button
            onClick={() =>
              void workspace.flush().catch((error) => setMessage(String(error)))
            }
          >
            重试保存
          </Button>
        </p>
      )}
      <div className="ledger-overview">
        <div>
          <small>本月收入（退款已冲减）</small>
          <strong>¥{money(monthly.income)}</strong>
        </div>
        <div>
          <small>本月支出（退款已冲减）</small>
          <strong>¥{money(monthly.expense)}</strong>
        </div>
        <div>
          <small>本月结余</small>
          <strong>¥{money(monthly.net)}</strong>
        </div>
      </div>
      <details className="ledger-section" open>
        <summary>当前账户余额 · 全部账本</summary>
        <div className="ledger-accounts">
          {state.accounts.map((item) => (
            <div key={item.id}>
              <span>
                {item.name}
                {item.archived ? '（停用）' : ''}
              </span>
              <strong>¥{money(summary.balances.get(item.id) || 0)}</strong>
            </div>
          ))}
        </div>
      </details>
      <div className="ledger-tools">
        <Button variant="outline" onClick={() => setManage('accounts')}>
          管理账户
        </Button>
        <Button variant="outline" onClick={() => setManage('categories')}>
          管理分类
        </Button>
        <Button variant="outline" onClick={() => setManage('books')}>
          <BookOpen />
          管理账本
        </Button>
        <Button
          disabled={busy || !workspace.ready}
          variant="outline"
          onClick={async () => {
            setBusy(true);
            try {
              downloadBlob(
                await exportLedger(state),
                `PRISM-ledger-${today()}.zip`,
              );
              setMessage(
                '已准备完整账本及凭证下载。ZIP 为明文，请自行妥善保存。',
              );
            } catch (error) {
              setMessage(String(error));
            } finally {
              setBusy(false);
            }
          }}
        >
          <Download />
          导出账本与凭证
        </Button>
        <label className="ledger-import">
          导入账本
          <input
            aria-label="导入账本文件"
            type="file"
            accept=".json,.zip"
            disabled={busy || !workspace.ready}
            onChange={async (event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (!file) return;
              setBusy(true);
              try {
                setIncoming(await importLedger(file));
              } catch (error) {
                setMessage(error instanceof Error ? error.message : '导入失败');
              } finally {
                setBusy(false);
              }
            }}
          />
        </label>
      </div>
      <details className="ledger-section" open>
        <summary>查账与统计</summary>
        <div className="ledger-filters">
          <label htmlFor="ledger-search">
            搜索
            <Input
              id="ledger-search"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setPage(0);
              }}
              placeholder="备注、标签、账户或分类"
            />
          </label>
          <label>
            开始日期
            <input
              type="date"
              value={from}
              onChange={(event) => {
                setFrom(event.target.value);
                setPage(0);
              }}
            />
          </label>
          <label>
            结束日期
            <input
              type="date"
              value={to}
              onChange={(event) => {
                setTo(event.target.value);
                setPage(0);
              }}
            />
          </label>
          {(
            [
              ['accounts', account, setAccount, '账户'],
              ['categories', category, setCategory, '分类'],
              ['books', book, setBook, '账本'],
            ] as const
          ).map(([key, value, setter, label]) => (
            <label key={key}>
              {label}
              <select
                value={value}
                onChange={(event) => {
                  setter(event.target.value);
                  setPage(0);
                }}
              >
                <option value="all">全部{label}</option>
                {state[key].map((item) => (
                  <option value={item.id} key={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
        <div className="ledger-tools">
          <Button
            variant="outline"
            onClick={() => {
              setFrom(today());
              setTo(today());
              setPage(0);
            }}
          >
            今天
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              setFrom(today().slice(0, 7) + '-01');
              setTo(today());
              setPage(0);
            }}
          >
            本月
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              setFrom('');
              setTo('');
              setPage(0);
            }}
          >
            全部日期
          </Button>
        </div>
        <p>
          当前筛选：{visible.length} 笔 · 收入 ¥{money(summary.income)} · 支出 ¥
          {money(summary.expense)} · 结余 ¥{money(summary.net)}
          （转账及余额调整不计入收支）
        </p>
        {from && to && from > to && (
          <p role="alert">开始日期须早于结束日期。</p>
        )}
        <details>
          <summary>分类支出概览</summary>
          {[...summary.byCategory].map(([id, amount]) => (
            <p key={id}>
              {groupName('categories', id)}：¥{money(amount)}
            </p>
          ))}
        </details>
      </details>
      <section className="ledger-transactions">
        <h2>最近交易 · 按当前筛选</h2>
        {visible
          .slice(currentPage * 30, (currentPage + 1) * 30)
          .map((entry) => (
            <article key={entry.id}>
              <div>
                <strong>
                  {labels[entry.kind]} ¥{money(entry.amount)}
                </strong>
                <span>
                  {entry.date} · {groupName('accounts', entry.accountId)}
                  {entry.toAccountId
                    ? ` → ${groupName('accounts', entry.toAccountId)}`
                    : ''}
                </span>
                <small>
                  {groupName('books', entry.bookId)} /{' '}
                  {groupName('categories', entry.categoryId)} ·{' '}
                  {entry.tags.join(' / ')}
                </small>
                <p>
                  {entry.note || '无备注'}
                  {entry.kind === 'refund'
                    ? entry.refundDirection === 'expense'
                      ? ' · 支出退回（入账）'
                      : ' · 收入退回（出账）'
                    : ''}
                </p>
              </div>
              <div className="ledger-row-actions">
                <Button
                  disabled={busy}
                  variant="outline"
                  onClick={() => open(entry)}
                >
                  编辑
                </Button>
                <Button
                  disabled={busy}
                  variant="outline"
                  onClick={() => open(entry, true)}
                >
                  复制
                </Button>
                <Button
                  disabled={busy}
                  variant="ghost"
                  onClick={() => void remove(entry)}
                >
                  删除
                </Button>
              </div>
              {entry.receipts.length > 0 && (
                <details>
                  <summary>{entry.receipts.length} 张凭证</summary>
                  <ReceiptList files={entry.receipts} />
                </details>
              )}
            </article>
          ))}
        {!visible.length && (
          <p className="empty-state">还没有匹配账目。点击“记一笔”手动录入。</p>
        )}
        <div className="png-cleaner-pagination">
          <Button
            variant="outline"
            disabled={!currentPage}
            onClick={() => setPage(currentPage - 1)}
          >
            上一页
          </Button>
          <span>
            {currentPage + 1} / {pages}
          </span>
          <Button
            variant="outline"
            disabled={currentPage >= pages - 1}
            onClick={() => setPage(currentPage + 1)}
          >
            下一页
          </Button>
        </div>
      </section>
      <Dialog
        open={dialog}
        onOpenChange={(value) => {
          if (!busy) setDialog(value);
        }}
      >
        <DialogContent className="asset-dialog ledger-dialog">
          <DialogHeader>
            <DialogTitle>
              {editing?.id ? '编辑交易' : editing ? '复制为新交易' : '记一笔'}
            </DialogTitle>
            <DialogDescription>
              金额以人民币记录。余额调整填写差额，减少余额请填写负数；退款方向由你确认。
            </DialogDescription>
          </DialogHeader>
          <form
            id="ledger-transaction"
            className="asset-form"
            key={editing?.id || 'new'}
            onSubmit={save}
          >
            <label>
              交易类型
              <select
                value={kind}
                onChange={(event) =>
                  setKind(event.target.value as TransactionKind)
                }
              >
                {Object.entries(labels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              日期
              <input
                type="date"
                name="date"
                defaultValue={editing?.date || today()}
                required
              />
            </label>
            <label htmlFor="ledger-amount">
              金额
              <Input
                id="ledger-amount"
                name="amount"
                defaultValue={editing ? (editing.amount / 100).toFixed(2) : ''}
                inputMode="decimal"
                required
                placeholder={
                  kind === 'adjustment' ? '增加 100 或减少 -100' : '0.00'
                }
              />
            </label>
            <div className="ledger-form-calculator"><Button type="button" variant="outline" onClick={() => setFormCalculatorOpen((value) => !value)}>{formCalculatorOpen ? '收起计算器' : '打开计算器'}</Button>{formCalculatorOpen && <CalculatorPanel compact canUse onUse={(value) => { const input = document.getElementById('ledger-amount') as HTMLInputElement | null; if (input) { input.value = value; input.dispatchEvent(new Event('input', { bubbles: true })); input.focus(); } }} />}</div>
            <label htmlFor="ledger-account">
              {kind === 'transfer' ? '转出账户' : '账户'}
              {selection('accounts', 'account', editing?.accountId)}
            </label>
            {kind === 'transfer' && (
              <label htmlFor="ledger-toAccount">
                转入账户
                {selection('accounts', 'toAccount', editing?.toAccountId)}
              </label>
            )}
            {kind === 'refund' && (
              <label>
                退款方向
                <select
                  name="refundDirection"
                  defaultValue={editing?.refundDirection || 'expense'}
                >
                  <option value="expense">支出退回 · 收到退款</option>
                  <option value="income">收入退回 · 退还给对方</option>
                </select>
              </label>
            )}
            <label htmlFor="ledger-category">
              分类{selection('categories', 'category', editing?.categoryId)}
            </label>
            <label htmlFor="ledger-book">
              账本{selection('books', 'book', editing?.bookId)}
            </label>
            <label className="wide-field" htmlFor="ledger-tags">
              标签
              <Input
                id="ledger-tags"
                name="tags"
                defaultValue={editing?.tags.join('，')}
                placeholder="个人，经营，待确认"
              />
            </label>
            <label className="wide-field">
              备注
              <textarea name="note" defaultValue={editing?.note} />
            </label>
            <label className="wide-field">
              凭证图片（可选，最多 20 张，每张 10 MB）
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={(event) => {
                  const files = Array.from(event.target.files || []);
                  event.target.value = '';
                  if (
                    receipts.length + files.length > 20 ||
                    files.some(
                      (file) =>
                        file.size > 10 * 1024 * 1024 ||
                        !file.type.startsWith('image/'),
                    )
                  ) {
                    setMessage('请选择最多 20 张图片，每张不超过 10 MB。');
                    return;
                  }
                  setReceipts((current) => [...current, ...files]);
                }}
              />
            </label>
            <div className="wide-field">
              <ReceiptList
                files={receipts}
                onRemove={(index) =>
                  setReceipts((current) =>
                    current.filter((_, i) => i !== index),
                  )
                }
              />
            </div>
          </form>
          {message && <p role="alert">{message}</p>}
          <DialogFooter>
            <Button
              disabled={busy}
              variant="ghost"
              onClick={() => setDialog(false)}
            >
              取消
            </Button>
            <Button disabled={busy} type="submit" form="ledger-transaction">
              保存交易
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!manage}
        onOpenChange={(value) => {
          if (!value && !busy) setManage(null);
        }}
      >
        <DialogContent className="asset-dialog">
          <DialogHeader>
            <DialogTitle>
              管理
              {manage === 'accounts'
                ? '账户'
                : manage === 'categories'
                  ? '分类'
                  : '账本'}
            </DialogTitle>
            <DialogDescription>
              停用后不再出现在新交易选项中，已有交易和余额继续保留。账户初始余额在新建时设定，后续修改余额请记录一笔余额调整。
            </DialogDescription>
          </DialogHeader>
          {manage && (
            <>
              <div className="ledger-manage-list">
                {state[manage].map((item) => (
                  <form
                    key={item.id}
                    onSubmit={async (event) => {
                      event.preventDefault();
                      const name = formText(
                        new FormData(event.currentTarget),
                        'name',
                      ).trim();
                      if (!name || busy) return;
                      setBusy(true);
                      try {
                        setState((current) => ({
                          ...current,
                          [manage]: current[manage].map((old) =>
                            old.id === item.id ? { ...old, name } : old,
                          ),
                        }));
                        await workspace.flush();
                      } catch (error) {
                        setMessage(String(error));
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    <Input
                      name="name"
                      defaultValue={item.name}
                      aria-label="名称"
                      required
                    />
                    <Button disabled={busy} type="submit" variant="outline">
                      重命名
                    </Button>
                    <Button
                      disabled={
                        busy ||
                        (!item.archived &&
                          state[manage].filter((group) => !group.archived)
                            .length <= 1)
                      }
                      variant="ghost"
                      type="button"
                      onClick={() =>
                        setState((current) => ({
                          ...current,
                          [manage]: current[manage].map((old) =>
                            old.id === item.id
                              ? { ...old, archived: !old.archived }
                              : old,
                          ),
                        }))
                      }
                    >
                      {item.archived ? '启用' : '停用'}
                    </Button>
                  </form>
                ))}
              </div>
              <form
                className="asset-form"
                onSubmit={async (event) => {
                  event.preventDefault();
                  const element = event.currentTarget;
                  const form = new FormData(element);
                  const name = formText(form, 'name').trim();
                  if (!name || busy) return;
                  setBusy(true);
                  try {
                    const openingText = formText(form, 'opening', '0').trim();
                    const item = {
                      id: crypto.randomUUID(),
                      name,
                      ...(manage === 'accounts'
                        ? {
                            opening: /^-?0(\.0{1,2})?$/.test(openingText)
                              ? 0
                              : parseMoney(openingText, true),
                          }
                        : {}),
                    };
                    setState((current) => ({
                      ...current,
                      [manage]: [...current[manage], item],
                    }));
                    await workspace.flush();
                    element.reset();
                  } catch (error) {
                    setMessage(String(error));
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <label htmlFor="ledger-new-name">
                  新名称
                  <Input id="ledger-new-name" name="name" required />
                </label>
                {manage === 'accounts' && (
                  <label htmlFor="ledger-opening">
                    初始余额
                    <Input
                      id="ledger-opening"
                      name="opening"
                      defaultValue="0"
                      inputMode="decimal"
                    />
                  </label>
                )}
                <Button type="submit" disabled={busy}>
                  添加
                </Button>
              </form>
            </>
          )}
          {message && <output>{message}</output>}
          <DialogFooter>
            <Button disabled={busy} onClick={() => setManage(null)}>
              完成
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!incoming}
        onOpenChange={(value) => {
          if (!value && !busy) setIncoming(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>确认导入账本</DialogTitle>
            <DialogDescription>
              以独立账户、分类和账本追加，不覆盖现有数据。重复导入会产生重复账目，请先核对。
            </DialogDescription>
          </DialogHeader>
          {incoming && (
            <div>
              <p>
                {incoming.accounts.length} 个账户 · {incoming.books.length}{' '}
                个账本 · {incoming.transactions.length} 笔交易 ·{' '}
                {incoming.transactions.reduce(
                  (total, entry) => total + entry.receipts.length,
                  0,
                )}{' '}
                张凭证
              </p>
              <p>账本：{incoming.books.map((item) => item.name).join('、')}</p>
              <p>
                账户：{incoming.accounts.map((item) => item.name).join('、')}
              </p>
              {incoming.transactions.slice(0, 5).map((entry) => (
                <p key={entry.id}>
                  {entry.date} · {labels[entry.kind]} · ¥{money(entry.amount)}
                </p>
              ))}
            </div>
          )}
          <DialogFooter>
            <Button
              disabled={busy}
              variant="ghost"
              onClick={() => setIncoming(null)}
            >
              取消
            </Button>
            <Button
              disabled={busy || !incoming}
              onClick={async () => {
                if (!incoming) return;
                setBusy(true);
                try {
                  const merged = appendLedgerImport(state, incoming);
                  ledgerSummary(merged);
                  setState({ ...merged, undo: state.undo });
                  // A failed disk save is retried via flush, never by appending twice.
                  setIncoming(null);
                  await workspace.flush();
                  setMessage('账本已追加导入。');
                } catch (error) {
                  setMessage(String(error));
                } finally {
                  setBusy(false);
                }
              }}
            >
              确认追加导入
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <p className="ledger-note">
        记账本导出为明文
        ZIP；“安全与备份”的完整备份为密文，并包含账目与凭证。统计用于查看与核对，不会自动创建账目或读取支付应用。
      </p>
    </div>
  );
}
