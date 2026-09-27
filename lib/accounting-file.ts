import JSZip from 'jszip';
import { validateLedgerImport, type LedgerData } from './accounting';

export async function exportLedger(data: LedgerData) {
  const zip = new JSZip();
  const transactions = await Promise.all(
    data.transactions.map(async (transaction, index) => ({
      ...transaction,
      receipts: await Promise.all(
        transaction.receipts.map(async (file, receiptIndex) => {
          const path = `receipts/${index}-${receiptIndex}`;
          zip.file(path, await file.arrayBuffer());
          return { path, name: file.name, type: file.type };
        }),
      ),
    })),
  );
  zip.file(
    'ledger.json',
    JSON.stringify(
      { format: 'prism-ledger', version: 1, data: { ...data, transactions } },
      null,
      2,
    ),
  );
  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
}
async function limitedEntry(entry: JSZip.JSZipObject, maximum: number) {
  return new Promise<Uint8Array>((resolve, reject) => {
    const parts: Uint8Array[] = [];
    let length = 0;
    // JSZip implements this bounded browser stream; its declarations omit the method.
    const stream = (
      entry as JSZip.JSZipObject & {
        internalStream: (type: 'uint8array') => {
          on: (
            event: string,
            callback: (...args: unknown[]) => void,
          ) => unknown;
          pause: () => void;
          resume: () => void;
        };
      }
    ).internalStream('uint8array');
    stream.on('data', (...args: unknown[]) => {
      const bytes = args[0] as Uint8Array;
      length += bytes.length;
      if (length > maximum) {
        stream.pause();
        reject(new Error('账本解压内容超过安全大小限制。'));
        return;
      }
      parts.push(bytes);
    });
    stream.on('error', reject);
    stream.on('end', () => {
      const bytes = new Uint8Array(length);
      let position = 0;
      for (const part of parts) {
        bytes.set(part, position);
        position += part.length;
      }
      resolve(bytes);
    });
    stream.resume();
  });
}
export async function importLedger(file: File) {
  if (file.size > 50 * 1024 * 1024)
    throw new Error(
      '账本导入最大支持 50 MB。较大附件请通过保险库完整备份迁移。',
    );
  if (!/\.zip$/i.test(file.name) && file.size > 10 * 1024 * 1024)
    throw new Error('账本 JSON 最大支持 10 MB。');
  const zip = /\.zip$/i.test(file.name)
    ? await JSZip.loadAsync(await file.arrayBuffer())
    : undefined;
  if (zip && Object.keys(zip.files).length > 2000)
    throw new Error('账本附件数量过多。');
  const jsonEntry = zip?.file('ledger.json');
  if (zip && !jsonEntry) throw new Error('ZIP 中缺少 ledger.json。');
  const text = jsonEntry
    ? new TextDecoder().decode(await limitedEntry(jsonEntry, 10 * 1024 * 1024))
    : await file.text();
  const envelope = JSON.parse(text) as {
    format: string;
    version: number;
    data: LedgerData;
  };
  if (envelope.format !== 'prism-ledger' || envelope.version !== 1)
    throw new Error('请选择 PRISM 导出的账本 ZIP 或 JSON。');
  const data = envelope.data;
  if (
    !data ||
    !Array.isArray(data.transactions) ||
    data.transactions.length > 10000
  )
    throw new Error('账本交易列表无效。');
  let receiptBytes = 0;
  const transactions = [];
  for (const transaction of data.transactions) {
    if (
      !transaction ||
      !Array.isArray(transaction.receipts) ||
      transaction.receipts.length > 20
    )
      throw new Error('交易附件列表无效。');
    const receipts: File[] = [];
    for (const receipt of transaction.receipts as unknown as {
      path: string;
      name: string;
      type: string;
    }[]) {
      if (
        !receipt ||
        typeof receipt.path !== 'string' ||
        !/^receipts\/\d+-\d+$/.test(receipt.path) ||
        typeof receipt.name !== 'string' ||
        typeof receipt.type !== 'string'
      )
        throw new Error('附件引用格式无效。');
      const entry = zip?.file(receipt.path);
      if (!entry) throw new Error('附件缺失，请导入包含附件的完整 ZIP。');
      const bytes = await limitedEntry(entry, 10 * 1024 * 1024);
      receiptBytes += bytes.length;
      if (receiptBytes > 64 * 1024 * 1024)
        throw new Error('附件解压总量超过 64 MB。');
      receipts.push(
        new File([new Uint8Array(bytes)], receipt.name, { type: receipt.type }),
      );
    }
    transactions.push({
      id: transaction.id,
      date: transaction.date,
      kind: transaction.kind,
      amount: transaction.amount,
      accountId: transaction.accountId,
      toAccountId: transaction.toAccountId,
      categoryId: transaction.categoryId,
      bookId: transaction.bookId,
      note: transaction.note,
      tags: transaction.tags,
      refundDirection: transaction.refundDirection,
      receipts,
      createdAt: transaction.createdAt,
      updatedAt: transaction.updatedAt,
    });
  }
  return validateLedgerImport({
    accounts: Array.isArray(data.accounts)
      ? data.accounts.map((account) => ({
          id: account.id,
          name: account.name,
          opening: account.opening,
          archived: !!account.archived,
        }))
      : undefined,
    categories: Array.isArray(data.categories)
      ? data.categories.map((group) => ({
          id: group.id,
          name: group.name,
          archived: !!group.archived,
        }))
      : undefined,
    books: Array.isArray(data.books)
      ? data.books.map((group) => ({
          id: group.id,
          name: group.name,
          archived: !!group.archived,
        }))
      : undefined,
    transactions,
  });
}
