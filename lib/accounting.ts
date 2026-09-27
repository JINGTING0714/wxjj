export type TransactionKind =
  | 'income'
  | 'expense'
  | 'transfer'
  | 'refund'
  | 'adjustment';
export type LedgerAccount = {
  id: string;
  name: string;
  opening: number;
  archived?: boolean;
};
export type LedgerGroup = { id: string; name: string; archived?: boolean };
export type LedgerTransaction = {
  id: string;
  date: string;
  kind: TransactionKind;
  amount: number;
  accountId: string;
  toAccountId?: string;
  categoryId: string;
  bookId: string;
  note: string;
  tags: string[];
  refundDirection?: 'income' | 'expense';
  receipts: File[];
  createdAt: string;
  updatedAt: string;
};
export type LedgerData = {
  accounts: LedgerAccount[];
  categories: LedgerGroup[];
  books: LedgerGroup[];
  transactions: LedgerTransaction[];
};
export type LedgerUndo = {
  id: string;
  previous?: LedgerTransaction;
  label: string;
};
export const initialLedger = (): LedgerData => ({
  accounts: ['微信', '支付宝', '银行卡', '现金'].map((name, i) => ({
    id: `account-${i}`,
    name,
    opening: 0,
  })),
  categories: [
    'Midjourney',
    'Profile',
    'Prompt',
    '订阅',
    '图片销售',
    '餐饮',
    '交通',
    '其他',
  ].map((name, i) => ({ id: `category-${i}`, name })),
  books: [
    { id: 'book-mj', name: 'MJ 经营' },
    { id: 'book-personal', name: '个人生活' },
  ],
  transactions: [],
});
export function parseMoney(value: string, signed = false) {
  const text = value.trim();
  if (
    !(signed ? /^-?\d{1,12}(\.\d{1,2})?$/ : /^\d{1,12}(\.\d{1,2})?$/).test(text)
  )
    throw new Error('金额须为最多两位小数的数字。');
  const negative = text.startsWith('-');
  const [whole, fraction = ''] = text.replace('-', '').split('.');
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  if (!Number.isSafeInteger(cents) || cents === 0)
    throw new Error('金额须非零且在可计算范围内。');
  return negative ? -cents : cents;
}
export const money = (cents: number) =>
  (cents / 100).toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
export function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return (
    Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}
export function validateTransaction(
  transaction: LedgerTransaction,
  data: LedgerData,
) {
  if (!validDate(transaction.date)) throw new Error('交易日期无效。');
  if (
    !['income', 'expense', 'transfer', 'refund', 'adjustment'].includes(
      transaction.kind,
    )
  )
    throw new Error('交易类型无效。');
  if (
    !Number.isSafeInteger(transaction.amount) ||
    !transaction.amount ||
    Math.abs(transaction.amount) > 99_999_999_999_999 ||
    (transaction.kind !== 'adjustment' && transaction.amount < 0)
  )
    throw new Error('交易金额无效。');
  if (!data.accounts.some((account) => account.id === transaction.accountId))
    throw new Error('交易账户不存在。');
  if (
    !data.categories.some(
      (category) => category.id === transaction.categoryId,
    ) ||
    !data.books.some((book) => book.id === transaction.bookId)
  )
    throw new Error('交易分类或账本不存在。');
  if (
    transaction.kind === 'transfer' &&
    (!data.accounts.some((account) => account.id === transaction.toAccountId) ||
      transaction.toAccountId === transaction.accountId)
  )
    throw new Error('转入账户必须存在且与转出账户不同。');
  if (
    transaction.kind === 'refund' &&
    !['income', 'expense'].includes(transaction.refundDirection || '')
  )
    throw new Error('请选择退款方向。');
  if (
    !Array.isArray(transaction.tags) ||
    transaction.tags.some((tag) => typeof tag !== 'string') ||
    typeof transaction.note !== 'string' ||
    !Array.isArray(transaction.receipts)
  )
    throw new Error('交易备注、标签或附件无效。');
  if (
    typeof transaction.createdAt !== 'string' ||
    typeof transaction.updatedAt !== 'string' ||
    !Number.isFinite(Date.parse(transaction.createdAt)) ||
    !Number.isFinite(Date.parse(transaction.updatedAt))
  )
    throw new Error('交易创建或修改时间无效。');
  if (
    transaction.receipts.length > 20 ||
    transaction.receipts.some(
      (receipt) =>
        !(receipt instanceof File) || receipt.size > 10 * 1024 * 1024,
    )
  )
    throw new Error('交易附件无效或过大。');
}
export function transactionImpact(transaction: LedgerTransaction) {
  if (transaction.kind === 'transfer')
    return [
      { accountId: transaction.accountId, amount: -transaction.amount },
      { accountId: transaction.toAccountId!, amount: transaction.amount },
    ];
  const sign =
    transaction.kind === 'expense' ||
    (transaction.kind === 'refund' && transaction.refundDirection === 'income')
      ? -1
      : 1;
  return [
    { accountId: transaction.accountId, amount: transaction.amount * sign },
  ];
}
export function ledgerSummary(
  data: LedgerData,
  transactions = data.transactions,
) {
  const balances = new Map(
    data.accounts.map((account) => [account.id, account.opening]),
  );
  for (const transaction of data.transactions)
    for (const effect of transactionImpact(transaction)) {
      const amount = (balances.get(effect.accountId) || 0) + effect.amount;
      if (!Number.isSafeInteger(amount))
        throw new Error('账户余额超出安全计算范围。');
      balances.set(effect.accountId, amount);
    }
  let income = 0,
    expense = 0;
  const byCategory = new Map<string, number>();
  for (const transaction of transactions) {
    if (transaction.kind === 'income') income += transaction.amount;
    if (transaction.kind === 'expense') {
      expense += transaction.amount;
      byCategory.set(
        transaction.categoryId,
        (byCategory.get(transaction.categoryId) || 0) + transaction.amount,
      );
    }
    if (transaction.kind === 'refund') {
      if (transaction.refundDirection === 'income')
        income -= transaction.amount;
      else {
        expense -= transaction.amount;
        byCategory.set(
          transaction.categoryId,
          (byCategory.get(transaction.categoryId) || 0) - transaction.amount,
        );
      }
    }
    if (!Number.isSafeInteger(income) || !Number.isSafeInteger(expense))
      throw new Error('统计金额超出安全计算范围。');
  }
  if (
    !Number.isSafeInteger(income - expense) ||
    [...byCategory.values()].some((amount) => !Number.isSafeInteger(amount))
  )
    throw new Error('统计金额超出安全计算范围。');
  return { balances, income, expense, net: income - expense, byCategory };
}
export function validateLedgerImport(input: unknown): LedgerData {
  if (!input || typeof input !== 'object')
    throw new Error('账本文件格式无效。');
  const data = input as LedgerData;
  for (const key of [
    'accounts',
    'categories',
    'books',
    'transactions',
  ] as const)
    if (!Array.isArray(data[key]) || data[key].length > 10000)
      throw new Error('账本列表无效或过大。');
  for (const list of [data.accounts, data.categories, data.books]) {
    if (
      !list.length ||
      list.some(
        (item) =>
          !item ||
          typeof item.id !== 'string' ||
          !item.id ||
          typeof item.name !== 'string' ||
          !item.name.trim(),
      )
    )
      throw new Error('账户、分类和账本须有名称与唯一标识。');
    if (new Set(list.map((item) => item.id)).size !== list.length)
      throw new Error('账本文件含重复标识。');
  }
  if (data.accounts.some((account) => !Number.isSafeInteger(account.opening)))
    throw new Error('初始余额无效。');
  if (
    new Set(data.transactions.map((item) => item?.id)).size !==
    data.transactions.length
  )
    throw new Error('交易标识重复。');
  for (const transaction of data.transactions) {
    if (!transaction || typeof transaction.id !== 'string' || !transaction.id)
      throw new Error('交易标识无效。');
    validateTransaction(transaction, data);
  }
  ledgerSummary(data);
  return data;
}
/** Explicit append import remaps every incoming identity; never overwrite existing data. */
export function appendLedgerImport(
  current: LedgerData,
  incoming: LedgerData,
  id = () => crypto.randomUUID(),
): LedgerData {
  const accountIds = new Map(incoming.accounts.map((item) => [item.id, id()]));
  const categoryIds = new Map(
    incoming.categories.map((item) => [item.id, id()]),
  );
  const bookIds = new Map(incoming.books.map((item) => [item.id, id()]));
  return {
    accounts: [
      ...current.accounts,
      ...incoming.accounts.map((item) => ({
        ...item,
        id: accountIds.get(item.id)!,
        name: `${item.name}（导入）`,
      })),
    ],
    categories: [
      ...current.categories,
      ...incoming.categories.map((item) => ({
        ...item,
        id: categoryIds.get(item.id)!,
        name: `${item.name}（导入）`,
      })),
    ],
    books: [
      ...current.books,
      ...incoming.books.map((item) => ({
        ...item,
        id: bookIds.get(item.id)!,
        name: `${item.name}（导入）`,
      })),
    ],
    transactions: [
      ...current.transactions,
      ...incoming.transactions.map((item) => ({
        ...item,
        id: id(),
        accountId: accountIds.get(item.accountId)!,
        toAccountId: item.toAccountId
          ? accountIds.get(item.toAccountId)
          : undefined,
        categoryId: categoryIds.get(item.categoryId)!,
        bookId: bookIds.get(item.bookId)!,
      })),
    ],
  };
}
