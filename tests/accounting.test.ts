import { test } from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import {
  initialLedger,
  parseMoney,
  validDate,
  validateTransaction,
  validateLedgerImport,
  ledgerSummary,
  appendLedgerImport,
  type LedgerTransaction,
} from '../lib/accounting';
import { exportLedger, importLedger } from '../lib/accounting-file';

const transaction = (
  patch: Partial<LedgerTransaction> = {},
): LedgerTransaction => ({
  id: 't1',
  date: '2026-09-27',
  kind: 'income',
  amount: 10000,
  accountId: 'account-0',
  categoryId: 'category-0',
  bookId: 'book-mj',
  note: '测试',
  tags: ['经营'],
  receipts: [],
  createdAt: '2026-09-27T00:00:00.000Z',
  updatedAt: '2026-09-27T00:00:00.000Z',
  ...patch,
});
void test('ledger uses integer cents and rejects precision loss and invalid dates', () => {
  assert.equal(parseMoney('0.29'), 29);
  assert.equal(parseMoney('-12.01', true), -1201);
  for (const amount of [
    '0',
    '-1',
    '1.001',
    'Infinity',
    '1e3',
    'NaN',
    '9999999999999',
  ])
    assert.throws(() => parseMoney(amount));
  assert.equal(validDate('2024-02-29'), true);
  assert.equal(validDate('2026-02-29'), false);
  assert.equal(validDate('2026-13-01'), false);
});
void test('transfers and adjustments affect balances, refunds reverse the correct income or expense', () => {
  const data = initialLedger();
  data.accounts[0].opening = 500;
  data.transactions = [
    transaction(),
    transaction({ id: 'expense', kind: 'expense', amount: 4000 }),
    transaction({
      id: 'transfer',
      kind: 'transfer',
      amount: 2000,
      toAccountId: 'account-1',
    }),
    transaction({
      id: 'refund-expense',
      kind: 'refund',
      amount: 1000,
      refundDirection: 'expense',
    }),
    transaction({
      id: 'refund-income',
      kind: 'refund',
      amount: 500,
      refundDirection: 'income',
    }),
    transaction({ id: 'adjust', kind: 'adjustment', amount: -300 }),
  ];
  const summary = ledgerSummary(data);
  assert.equal(summary.balances.get('account-0'), 4700);
  assert.equal(summary.balances.get('account-1'), 2000);
  assert.equal(summary.income, 9500);
  assert.equal(summary.expense, 3000);
  assert.equal(summary.net, 6500);
  assert.equal(summary.byCategory.get('category-0'), 3000);
  const filtered = ledgerSummary(data, [data.transactions[1]]);
  assert.equal(filtered.expense, 4000);
  assert.equal(filtered.balances.get('account-0'), 4700);
});
void test('import validates references, timestamps, duplicate IDs and null entries before mutation', () => {
  const data = initialLedger();
  for (const patch of [
    { kind: 'transfer', toAccountId: 'account-0' },
    { kind: 'refund' },
    { accountId: 'missing' },
    { date: '2026-02-30' },
    { createdAt: undefined },
    { amount: NaN },
    { receipts: [{}] },
  ])
    assert.throws(() =>
      validateTransaction(
        transaction(patch as Partial<LedgerTransaction>),
        data,
      ),
    );
  assert.throws(() => validateLedgerImport({ ...data, transactions: [null] }));
  assert.throws(() =>
    validateLedgerImport({
      ...data,
      transactions: [transaction(), transaction()],
    }),
  );
  assert.throws(() =>
    validateLedgerImport({
      ...data,
      accounts: [{ ...data.accounts[0], opening: Number.MAX_SAFE_INTEGER }],
      transactions: [transaction()],
    }),
  );
});
void test('explicit append remaps identities and preserves the original accounts and transactions', () => {
  const original = initialLedger();
  original.transactions = [transaction()];
  const imported = structuredClone(original);
  let n = 0;
  const merged = appendLedgerImport(original, imported, () => `new-${++n}`);
  assert.equal(original.transactions.length, 1);
  assert.equal(merged.transactions.length, 2);
  assert.equal(merged.transactions[0], original.transactions[0]);
  const appended = merged.transactions[1];
  assert.notEqual(appended.id, 't1');
  assert.notEqual(appended.accountId, 'account-0');
  assert.equal(ledgerSummary(merged).income, 20000);
});
void test('ledger ZIP round-trip preserves receipt bytes and metadata; missing receipts fail', async () => {
  const data = initialLedger();
  data.transactions = [
    transaction({
      receipts: [
        new File(['receipt bytes'], '凭证.png', { type: 'image/png' }),
      ],
    }),
  ];
  const exported = await exportLedger(data);
  const restored = await importLedger(new File([exported], '账本.zip'));
  assert.equal(restored.transactions[0].receipts[0].name, '凭证.png');
  assert.equal(
    await restored.transactions[0].receipts[0].text(),
    'receipt bytes',
  );
  assert.equal(restored.transactions[0].amount, 10000);
  const zip = await JSZip.loadAsync(await exported.arrayBuffer());
  zip.remove('receipts/0-0');
  await assert.rejects(
    importLedger(
      new File(
        [await zip.generateAsync({ type: 'arraybuffer' })],
        'missing.zip',
      ),
    ),
    /附件缺失/,
  );
});
void test('bounded ledger import rejects compressed oversized JSON before parsing', async () => {
  const zip = new JSZip();
  zip.file('ledger.json', ' '.repeat(10 * 1024 * 1024 + 1));
  await assert.rejects(
    importLedger(
      new File(
        [
          await zip.generateAsync({
            type: 'arraybuffer',
            compression: 'DEFLATE',
          }),
        ],
        'large.zip',
      ),
    ),
    /大小限制/,
  );
});
