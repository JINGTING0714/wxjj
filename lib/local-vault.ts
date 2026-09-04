const DB_NAME = 'prism-local-vault';
const DB_VERSION = 1;
const META_STORE = 'meta';
const RECORD_STORE = 'records';
const BLOB_STORE = 'blobs';
const VERIFY_TEXT = 'PRISM_LOCAL_VAULT_V1';

type VaultMeta = {
  key: 'vault';
  salt: string;
  iv: string;
  verifier: string;
  iterations: number;
};

type EncryptedRecord = {
  id: string;
  scope: string;
  iv: string;
  payload: ArrayBuffer;
  updatedAt: string;
};

type EncryptedBlobRecord = {
  id: string;
  scope: string;
  iv: string;
  payload: ArrayBuffer;
  type: string;
  name: string;
  updatedAt: string;
};

export type DecryptedBlob = {
  id: string;
  scope: string;
  name: string;
  blob: Blob;
  updatedAt: string;
};

function bytesToBase64(bytes: Uint8Array) {
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

function base64ToBytes(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

function requestResult<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('本地数据库操作失败'));
  });
}

function transactionDone(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error('本地数据库写入失败'));
    transaction.onabort = () => reject(transaction.error || new Error('本地数据库写入已取消'));
  });
}

function openVaultDb() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(META_STORE)) database.createObjectStore(META_STORE, { keyPath: 'key' });
      if (!database.objectStoreNames.contains(RECORD_STORE)) {
        const store = database.createObjectStore(RECORD_STORE, { keyPath: 'id' });
        store.createIndex('scope', 'scope', { unique: false });
      }
      if (!database.objectStoreNames.contains(BLOB_STORE)) {
        const store = database.createObjectStore(BLOB_STORE, { keyPath: 'id' });
        store.createIndex('scope', 'scope', { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('无法打开本地保险库'));
  });
}

async function deriveKey(password: string, salt: Uint8Array, iterations: number) {
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: toArrayBuffer(salt), iterations, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

async function encryptBytes(key: CryptoKey, bytes: Uint8Array) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const payload = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: toArrayBuffer(iv) }, key, toArrayBuffer(bytes));
  return { iv, payload };
}

async function decryptBytes(key: CryptoKey, iv: string, payload: ArrayBuffer) {
  return crypto.subtle.decrypt({ name: 'AES-GCM', iv: toArrayBuffer(base64ToBytes(iv)) }, key, payload);
}

export async function vaultExists() {
  const database = await openVaultDb();
  const transaction = database.transaction(META_STORE, 'readonly');
  const result = await requestResult(transaction.objectStore(META_STORE).get('vault'));
  database.close();
  return Boolean(result);
}

export async function createVault(password: string) {
  if (password.length < 8) throw new Error('保险库密码至少需要 8 个字符');
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iterations = 310_000;
  const key = await deriveKey(password, salt, iterations);
  const verified = await encryptBytes(key, new TextEncoder().encode(VERIFY_TEXT));
  const meta: VaultMeta = {
    key: 'vault',
    salt: bytesToBase64(salt),
    iv: bytesToBase64(verified.iv),
    verifier: bytesToBase64(new Uint8Array(verified.payload)),
    iterations,
  };
  const database = await openVaultDb();
  const transaction = database.transaction(META_STORE, 'readwrite');
  transaction.objectStore(META_STORE).put(meta);
  await transactionDone(transaction);
  database.close();
  return key;
}

export async function unlockVault(password: string) {
  const database = await openVaultDb();
  const transaction = database.transaction(META_STORE, 'readonly');
  const meta = await requestResult(transaction.objectStore(META_STORE).get('vault')) as VaultMeta | undefined;
  database.close();
  if (!meta) throw new Error('这台设备还没有创建保险库');
  const key = await deriveKey(password, base64ToBytes(meta.salt), meta.iterations);
  try {
    const plain = await decryptBytes(key, meta.iv, toArrayBuffer(base64ToBytes(meta.verifier)));
    if (new TextDecoder().decode(plain) !== VERIFY_TEXT) throw new Error('密码不正确');
  } catch {
    throw new Error('保险库密码不正确');
  }
  return key;
}

export async function saveEncryptedRecord<T extends { id: string }>(key: CryptoKey, scope: string, value: T) {
  const encrypted = await encryptBytes(key, new TextEncoder().encode(JSON.stringify(value)));
  const record: EncryptedRecord = { id: value.id, scope, iv: bytesToBase64(encrypted.iv), payload: encrypted.payload, updatedAt: new Date().toISOString() };
  const database = await openVaultDb();
  const transaction = database.transaction(RECORD_STORE, 'readwrite');
  transaction.objectStore(RECORD_STORE).put(record);
  await transactionDone(transaction);
  database.close();
}

export async function loadEncryptedRecords<T>(key: CryptoKey, scope: string) {
  const database = await openVaultDb();
  const transaction = database.transaction(RECORD_STORE, 'readonly');
  const records = await requestResult(transaction.objectStore(RECORD_STORE).index('scope').getAll(scope)) as EncryptedRecord[];
  database.close();
  return Promise.all(records.map(async (record) => {
    const plain = await decryptBytes(key, record.iv, record.payload);
    return JSON.parse(new TextDecoder().decode(plain)) as T;
  }));
}

export async function deleteEncryptedRecord(id: string) {
  const database = await openVaultDb();
  const transaction = database.transaction(RECORD_STORE, 'readwrite');
  transaction.objectStore(RECORD_STORE).delete(id);
  await transactionDone(transaction);
  database.close();
}

export async function saveEncryptedBlob(key: CryptoKey, scope: string, blob: Blob, name: string, id = `blob-${Date.now()}-${crypto.randomUUID()}`) {
  const encrypted = await encryptBytes(key, new Uint8Array(await blob.arrayBuffer()));
  const record: EncryptedBlobRecord = { id, scope, iv: bytesToBase64(encrypted.iv), payload: encrypted.payload, type: blob.type || 'application/octet-stream', name, updatedAt: new Date().toISOString() };
  const database = await openVaultDb();
  const transaction = database.transaction(BLOB_STORE, 'readwrite');
  transaction.objectStore(BLOB_STORE).put(record);
  await transactionDone(transaction);
  database.close();
  return id;
}

export async function loadEncryptedBlobs(key: CryptoKey, scope: string): Promise<DecryptedBlob[]> {
  const database = await openVaultDb();
  const transaction = database.transaction(BLOB_STORE, 'readonly');
  const records = await requestResult(transaction.objectStore(BLOB_STORE).index('scope').getAll(scope)) as EncryptedBlobRecord[];
  database.close();
  return Promise.all(records.map(async (record) => {
    const bytes = await decryptBytes(key, record.iv, record.payload);
    return { id: record.id, scope: record.scope, name: record.name, blob: new Blob([bytes], { type: record.type }), updatedAt: record.updatedAt };
  }));
}

export async function deleteEncryptedBlob(id: string) {
  const database = await openVaultDb();
  const transaction = database.transaction(BLOB_STORE, 'readwrite');
  transaction.objectStore(BLOB_STORE).delete(id);
  await transactionDone(transaction);
  database.close();
}

export async function exportVaultFile() {
  const database = await openVaultDb();
  const transaction = database.transaction([META_STORE, RECORD_STORE, BLOB_STORE], 'readonly');
  const completed = transactionDone(transaction);
  const [meta, records, blobs] = await Promise.all([
    requestResult(transaction.objectStore(META_STORE).getAll()),
    requestResult(transaction.objectStore(RECORD_STORE).getAll()) as Promise<EncryptedRecord[]>,
    requestResult(transaction.objectStore(BLOB_STORE).getAll()) as Promise<EncryptedBlobRecord[]>,
  ]);
  await completed;
  database.close();
  const serialized = {
    format: 'PRISM-VAULT',
    version: 1,
    exportedAt: new Date().toISOString(),
    meta,
    records: records.map((record) => ({ ...record, payload: bytesToBase64(new Uint8Array(record.payload)) })),
    blobs: blobs.map((record) => ({ ...record, payload: bytesToBase64(new Uint8Array(record.payload)) })),
  };
  return new Blob([JSON.stringify(serialized)], { type: 'application/json' });
}

export async function importVaultFile(file: File) {
  const parsed = JSON.parse(await file.text()) as {
    format: string;
    version: number;
    meta: VaultMeta[];
    records: Array<Omit<EncryptedRecord, 'payload'> & { payload: string }>;
    blobs: Array<Omit<EncryptedBlobRecord, 'payload'> & { payload: string }>;
  };
  if (parsed.format !== 'PRISM-VAULT' || parsed.version !== 1) throw new Error('不是受支持的 PRISM 备份文件');
  const database = await openVaultDb();
  const transaction = database.transaction([META_STORE, RECORD_STORE, BLOB_STORE], 'readwrite');
  parsed.meta.forEach((entry) => transaction.objectStore(META_STORE).put(entry));
  parsed.records.forEach((record) => transaction.objectStore(RECORD_STORE).put({ ...record, payload: toArrayBuffer(base64ToBytes(record.payload)) }));
  parsed.blobs.forEach((record) => transaction.objectStore(BLOB_STORE).put({ ...record, payload: toArrayBuffer(base64ToBytes(record.payload)) }));
  await transactionDone(transaction);
  database.close();
}
