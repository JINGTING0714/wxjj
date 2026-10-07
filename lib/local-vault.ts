import { BackupZipWriter, openBackupZip } from './backup-zip';

const DB_NAME = 'prism-local-vault';
const STORES = ['meta', 'records', 'blobs'];
const VERIFY_TEXT = 'PRISM_LOCAL_VAULT_V1';
const keyIdentity = new WeakMap<CryptoKey, string>();
type Envelope = { iv: string; payload: string };
type VaultMeta = {
  key: 'vault';
  salt: string;
  iv: string;
  verifier: string;
  iterations: number;
  version?: 2;
  wrappedKey?: Envelope;
  recovery?: Envelope;
};
type EncryptedRecord = {
  id: string;
  scope: string;
  iv: string;
  payload: ArrayBuffer;
  updatedAt: string;
};
type EncryptedBlobRecord = EncryptedRecord & {
  type: string;
  name: string;
  privateMeta?: Envelope;
};
type Snapshot = {
  meta: VaultMeta[];
  records: EncryptedRecord[];
  blobs: EncryptedBlobRecord[];
};
export type DecryptedBlob = {
  id: string;
  scope: string;
  name: string;
  blob: Blob;
  updatedAt: string;
};
export type BackupInfo = {
  version: number;
  exportedAt: string;
  records: number;
  files: number;
  bytes: number;
  verified: boolean;
};
export type VaultWrite = {
  records?: { scope: string; value: { id: string; [key: string]: any } }[];
  blobs?: { id: string; scope: string; blob: Blob; name: string }[];
  deleteRecords?: string[];
  deleteBlobs?: string[];
};

function b64(bytes: Uint8Array) {
  let text = '';
  for (let i = 0; i < bytes.length; i += 0x8000)
    text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(text);
}
function unb64(value: string) {
  return Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
}
function buffer(bytes: Uint8Array): ArrayBuffer {
  return new Uint8Array(bytes).buffer;
}
function request<T>(req: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
function done(tx: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = tx.onerror = () =>
      reject(
        tx.error || new Error('本地写入失败；原有数据未替换。请检查可用空间。'),
      );
  });
}
async function openDatabase(version?: number) {
  return new Promise<IDBDatabase>((resolve, reject) => {
    // Unlocking an existing vault must never trigger an upgrade or scan its files.
    const req = version === undefined ? indexedDB.open(DB_NAME) : indexedDB.open(DB_NAME, version);
    let settled = false;
    req.onupgradeneeded = () => {
      if (settled) { req.transaction!.abort(); return; }
      if (!req.result.objectStoreNames.contains('meta')) req.result.createObjectStore('meta', { keyPath: 'key' });
      for (const name of ['records', 'blobs']) if (!req.result.objectStoreNames.contains(name)) {
        const store = req.result.createObjectStore(name, { keyPath: 'id' });
        store.createIndex('scope', 'scope'); store.createIndex('backup-revision', 'iv');
      }
      if (!req.result.objectStoreNames.contains('backup-staging')) req.result.createObjectStore('backup-staging', { keyPath: 'id' }).createIndex('job', 'job');
    };
    req.onsuccess = () => { if (settled) { req.result.close(); return; } settled = true; req.result.onversionchange = () => req.result.close(); resolve(req.result); };
    req.onblocked = () => { settled = true; reject(new Error('恢复备份需要准备暂存区。请关闭这个网站的旧标签页后重试；当前资料保留，解锁和导出仍可使用。')); };
    req.onerror = () => { settled = true; reject(
        req.error ||
          new Error('无法打开本地保险库，请允许浏览器保存网站数据。'),
      ); };
  });
}
async function db(requireStaging = false) {
  const database = await openDatabase();
  if (!requireStaging || database.objectStoreNames.contains('backup-staging')) return database;
  // Older vaults need only an empty staging store for restore, added on demand.
  // Do not create indexes over their existing encrypted media.
  const next = database.version + 1; database.close();
  try { return await openDatabase(next); }
  catch (reason) {
    if (!(reason instanceof DOMException) || reason.name !== 'VersionError') throw reason;
    const upgraded = await openDatabase();
    if (upgraded.objectStoreNames.contains('backup-staging')) return upgraded;
    upgraded.close(); throw reason;
  }
}
async function getMeta() {
  const database = await db();
  try {
    return (await request(
      database.transaction('meta').objectStore('meta').get('vault'),
    )) as VaultMeta | undefined;
  } finally {
    database.close();
  }
}
async function setMeta(meta: VaultMeta, add = false) {
  const database = await db();
  try {
    const tx = database.transaction('meta', 'readwrite');
    const complete = done(tx);
    if (add) tx.objectStore('meta').add(meta);
    else tx.objectStore('meta').put(meta);
    await complete;
  } finally {
    database.close();
  }
}
async function derive(
  password: string,
  meta: Pick<VaultMeta, 'salt' | 'iterations'>,
) {
  if (
    !Number.isInteger(meta.iterations) ||
    meta.iterations < 100_000 ||
    meta.iterations > 2_000_000 ||
    unb64(meta.salt).length !== 16
  )
    throw new Error('保险库密钥信息损坏或格式不受支持');
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: buffer(unb64(meta.salt)),
      iterations: meta.iterations,
      hash: 'SHA-256',
    },
    material,
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt'],
  );
}
async function encrypt(key: CryptoKey, bytes: ArrayBuffer) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  return {
    iv: b64(iv),
    payload: await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, bytes),
  };
}
async function decrypt(key: CryptoKey, iv: string, bytes: ArrayBuffer) {
  return crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: buffer(unb64(iv)) },
    key,
    bytes,
  );
}
async function envelope(key: CryptoKey, bytes: ArrayBuffer): Promise<Envelope> {
  const r = await encrypt(key, bytes);
  return { iv: r.iv, payload: b64(new Uint8Array(r.payload)) };
}
async function openEnvelope(key: CryptoKey, value: Envelope) {
  return decrypt(key, value.iv, buffer(unb64(value.payload)));
}
async function rawKey(raw: ArrayBuffer) {
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', true, [
    'encrypt',
    'decrypt',
  ]);
}
async function verify(key: CryptoKey, meta: VaultMeta) {
  if (
    new TextDecoder().decode(
      await decrypt(key, meta.iv, buffer(unb64(meta.verifier))),
    ) !== VERIFY_TEXT
  )
    throw new Error('密钥校验失败');
  keyIdentity.set(key, `${meta.iv}:${meta.verifier}`);
}
async function passwordKey(password: string, meta: VaultMeta) {
  const derived = await derive(password, meta);
  try {
    const key =
      meta.version === 2 && meta.wrappedKey
        ? await rawKey(await openEnvelope(derived, meta.wrappedKey))
        : derived;
    await verify(key, meta);
    return key;
  } catch {
    throw new Error(
      '密码无法解锁此保险库。请使用导出这份备份时的原保险库密码（不是新设备的密码），并检查空格和大小写。密钥信息损坏也可能导致此错误。',
    );
  }
}
async function withPassword(
  key: CryptoKey,
  password: string,
  previous?: VaultMeta,
): Promise<VaultMeta> {
  if (password.length < 8) throw new Error('保险库密码至少需要 8 个字符');
  const salt = b64(crypto.getRandomValues(new Uint8Array(16)));
  const iterations = 310_000;
  const wrapper = await derive(password, { salt, iterations });
  const verifier = previous
    ? { iv: previous.iv, payload: previous.verifier }
    : await envelope(key, buffer(new TextEncoder().encode(VERIFY_TEXT)));
  return {
    ...previous,
    key: 'vault',
    version: 2,
    salt,
    iterations,
    iv: verifier.iv,
    verifier: verifier.payload,
    wrappedKey: await envelope(
      wrapper,
      await crypto.subtle.exportKey('raw', key),
    ),
  };
}
export async function vaultExists() {
  return Boolean(await getMeta());
}
export async function createVault(password: string) {
  if (await vaultExists())
    throw new Error(
      '本机已有保险库，请解锁或通过完整恢复导入备份，不可覆盖密码。',
    );
  const key = await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt'],
  );
  const meta = await withPassword(key, password);
  const database = await db();
  try {
    const tx = database.transaction(STORES, 'readwrite');
    const complete = done(tx);
    let checks = 0;
    let occupied = false;
    for (const name of STORES) {
      const count = tx.objectStore(name).count();
      count.onsuccess = () => {
        occupied ||= count.result > 0;
        if (++checks === STORES.length) {
          if (occupied) tx.abort();
          else tx.objectStore('meta').add(meta);
        }
      };
    }
    await complete;
  } finally {
    database.close();
  }
  await verify(key, meta);
  return key;
}
export async function unlockVault(password: string) {
  const meta = await getMeta();
  if (!meta)
    throw new Error('这台设备尚无保险库，请创建或直接导入原设备备份。');
  return passwordKey(password, meta);
}
function recoveryBytes(code: string) {
  const clean = code
    .trim()
    .toUpperCase()
    .replace(/^PRISM[-\s]*/, '')
    .replace(/[-\s]/g, '');
  if (!/^[0-9A-F]{64}$/.test(clean))
    throw new Error('恢复密钥格式不正确，应包含 PRISM 和 8 组字符。');
  return buffer(Uint8Array.from(clean.match(/.{2}/g)!, (s) => parseInt(s, 16)));
}
export async function createRecoveryKey(key: CryptoKey, password: string) {
  const old = await getMeta();
  if (!old) throw new Error('请先创建保险库');
  await verify(key, old);
  await passwordKey(password, old);
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const code = `PRISM-${Array.from(bytes, (b) =>
    b.toString(16).padStart(2, '0'),
  )
    .join('')
    .toUpperCase()
    .match(/.{8}/g)!
    .join('-')}`;
  const meta = await withPassword(key, password, old);
  meta.recovery = await envelope(
    await rawKey(buffer(bytes)),
    await crypto.subtle.exportKey('raw', key),
  );
  await setMeta(meta);
  return code;
}
export async function resetVaultPassword(code: string, password: string) {
  const meta = await getMeta();
  if (!meta?.recovery)
    throw new Error(
      '这个保险库尚未设置恢复密钥。请在仍可解锁的原设备中设置并重新导出备份。',
    );
  let key: CryptoKey;
  try {
    key = await rawKey(
      await openEnvelope(await rawKey(recoveryBytes(code)), meta.recovery),
    );
    await verify(key, meta);
  } catch {
    throw new Error('恢复密钥不匹配或已被重新生成。没有修改任何数据。');
  }
  await setMeta(await withPassword(key, password, meta));
  return key;
}
export async function writeVaultBatch(
  key: CryptoKey,
  batch: VaultWrite,
  assertSession = () => {},
) {
  const identity = keyIdentity.get(key);
  if (!identity) throw new Error('请重新解锁保险库后再保存');
  const records: EncryptedRecord[] = [];
  const blobs: EncryptedBlobRecord[] = [];
  for (const e of batch.records || [])
    records.push({
      id: e.value.id,
      scope: e.scope,
      ...(await encrypt(
        key,
        buffer(new TextEncoder().encode(JSON.stringify(e.value))),
      )),
      updatedAt: new Date().toISOString(),
    });
  for (const e of batch.blobs || [])
    blobs.push({
      id: e.id,
      scope: e.scope,
      ...(await encrypt(key, await e.blob.arrayBuffer())),
      name: '',
      type: '',
      privateMeta: await envelope(
        key,
        buffer(
          new TextEncoder().encode(
            JSON.stringify({ name: e.name, type: e.blob.type }),
          ),
        ),
      ),
      updatedAt: new Date().toISOString(),
    });
  assertSession();
  const database = await db();
  try {
    assertSession();
    const tx = database.transaction(STORES, 'readwrite');
    const complete = done(tx);
    const metaRequest = tx.objectStore('meta').get('vault');
    metaRequest.onsuccess = () => {
      const meta = metaRequest.result as VaultMeta | undefined;
      if (!meta || `${meta.iv}:${meta.verifier}` !== identity) {
        tx.abort();
        return;
      }
      records.forEach((r) => tx.objectStore('records').put(r));
      blobs.forEach((r) => tx.objectStore('blobs').put(r));
      batch.deleteRecords?.forEach((id) =>
        tx.objectStore('records').delete(id),
      );
      batch.deleteBlobs?.forEach((id) => tx.objectStore('blobs').delete(id));
    };
    await complete;
  } finally {
    database.close();
  }
}
export async function saveEncryptedRecord<T extends { id: string }>(
  key: CryptoKey,
  scope: string,
  value: T,
  assertSession?: () => void,
) {
  await writeVaultBatch(key, { records: [{ scope, value }] }, assertSession);
}
export async function saveEncryptedBlob(
  key: CryptoKey,
  scope: string,
  blob: Blob,
  name: string,
  id = crypto.randomUUID(),
  assertSession?: () => void,
) {
  await writeVaultBatch(
    key,
    { blobs: [{ id, scope, blob, name }] },
    assertSession,
  );
  return id;
}
async function loadScope<T>(store: string, scope: string) {
  const database = await db();
  try {
    return (await request(
      database
        .transaction(store)
        .objectStore(store)
        .index('scope')
        .getAll(scope),
    )) as T[];
  } finally {
    database.close();
  }
}
export async function loadEncryptedRecords<T>(
  key: CryptoKey,
  scope: string,
): Promise<T[]> {
  return Promise.all(
    (await loadScope<EncryptedRecord>('records', scope)).map(async (r) =>
      JSON.parse(new TextDecoder().decode(await decrypt(key, r.iv, r.payload))),
    ),
  );
}
export async function loadEncryptedBlobs(
  key: CryptoKey,
  scope: string,
): Promise<DecryptedBlob[]> {
  const result: DecryptedBlob[] = [];
  for (const r of await loadScope<EncryptedBlobRecord>('blobs', scope)) {
    const meta = r.privateMeta
      ? JSON.parse(
          new TextDecoder().decode(await openEnvelope(key, r.privateMeta)),
        )
      : r;
    result.push({
      id: r.id,
      scope,
      name: meta.name,
      blob: new Blob([await decrypt(key, r.iv, r.payload)], {
        type: meta.type,
      }),
      updatedAt: r.updatedAt,
    });
  }
  return result;
}
export type BackupProgress = { stage: string; current: number; total: number };
export type VaultExportOptions = {
  write?: (bytes: Uint8Array<ArrayBuffer>) => Promise<void>;
  onProgress?: (progress: BackupProgress) => void;
  assertSession?: () => void;
};
async function hash(bytes: ArrayBuffer) { return b64(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))); }
async function validateRecord(record: EncryptedRecord, key: CryptoKey, files: Map<string, string>) {
  let value: { id: string; data?: unknown };
  try {
    value = JSON.parse(new TextDecoder().decode(await decrypt(key, record.iv, record.payload)));
    if (value.id !== record.id) throw new Error();
  } catch { throw new Error('备份中有文字记录无法解密或不完整。未修改当前设备，请回原设备核对资料。'); }
  if (record.scope === 'workspaces') {
    const scope = `workspace-files:${record.id.replace(/^workspace:/, '')}`, pending: unknown[] = [value.data];
    while (pending.length) {
      const item = pending.pop();
      if (!item || typeof item !== 'object') continue;
      if ('__prismFile' in item) {
        const reference = item as { id?: unknown };
        if (typeof reference.id !== 'string' || files.get(reference.id) !== scope) throw new Error('备份中的工坊队列缺少引用的原图、视频或水印文件。未修改当前设备，请回原设备重新导出完整备份。');
      } else pending.push(...Object.values(item));
    }
  }
}
async function validateBlob(record: EncryptedBlobRecord, key: CryptoKey) {
  try { await decrypt(key, record.iv, record.payload); if (record.privateMeta) JSON.parse(new TextDecoder().decode(await openEnvelope(key, record.privateMeta))); }
  catch { throw new Error('备份中有图片或文件无法解密。未修改当前设备，请使用完整的原设备备份。'); }
}
async function exportPlan(database: IDBDatabase, kind: 'records' | 'blobs') {
  const store = database.transaction(kind).objectStore(kind);
  if (!store.indexNames.contains('backup-revision')) return new Promise<{ id: string; scope: string; revision: string }[]>((resolve, reject) => {
    const rows: { id: string; scope: string; revision: string }[] = [], cursor = store.index('scope').openCursor();
    cursor.onerror = () => reject(cursor.error);
    cursor.onsuccess = () => { const value = cursor.result; if (!value) { resolve(rows); return; } rows.push({ id: String(value.primaryKey), scope: String(value.key), revision: value.value.iv }); value.continue(); };
  });
  // Both key cursors share one snapshot and never materialize file payloads.
  const collect = (index: string) => new Promise<[string,string][]>((resolve, reject) => {
    const rows: [string,string][] = [], cursor = store.index(index).openKeyCursor();
    cursor.onerror = () => reject(cursor.error);
    cursor.onsuccess = () => { const value = cursor.result; if (!value) { resolve(rows); return; } rows.push([String(value.primaryKey), String(value.key)]); value.continue(); };
  });
  const [scopes, revisions] = await Promise.all([collect('scope'), collect('backup-revision')]);
  const byId = new Map(revisions);
  return scopes.map(([id,scope]) => ({ id, scope, revision: byId.get(id)! }));
}
export function exportVaultFile(key: CryptoKey): Promise<Blob>;
export function exportVaultFile(key: CryptoKey, options: VaultExportOptions): Promise<Blob | undefined>;
export async function exportVaultFile(key: CryptoKey, options: VaultExportOptions = {}) {
  const database = await db();
  try {
    const meta = await getMeta(); if (!meta) throw new Error('没有可导出的保险库');
    await verify(key, meta);
    const [records, blobs] = await Promise.all([exportPlan(database, 'records'), exportPlan(database, 'blobs')]);
    const fileScopes = new Map(blobs.map(row => [row.id, row.scope]));
    const zip = new BackupZipWriter(options.write), entries: Record<string, unknown[]> = { records: [], blobs: [] };
    let current = 0; const total = records.length + blobs.length;
    for (const [kind, rows] of [['records', records], ['blobs', blobs]] as const) {
      for (const [index, planned] of rows.entries()) {
        options.assertSession?.(); options.onProgress?.({ stage: '正在校验并写入备份', current, total });
        const row = await request(database.transaction(kind).objectStore(kind).get(planned.id)) as EncryptedBlobRecord;
        if (!row || row.scope !== planned.scope || row.iv !== planned.revision) throw new Error('导出期间资料发生变化，请重新导出。现有资料保留。');
        if (kind === 'records') await validateRecord(row, key, fileScopes); else await validateBlob(row, key);
        const { payload, ...record } = row, path = `${kind}/${index}.bin`;
        const sha256 = await hash(payload); await zip.add(path, new Uint8Array(payload));
        entries[kind].push({ ...record, path, size: payload.byteLength, sha256 }); current++;
        options.onProgress?.({ stage: '正在校验并写入备份', current, total });
      }
    }
    options.assertSession?.();
    const finalMeta = await getMeta();
    if (JSON.stringify(finalMeta) !== JSON.stringify(meta)) throw new Error('导出期间保险库发生变化，请重新导出。');
    const [finalRecords, finalBlobs] = await Promise.all([exportPlan(database, 'records'), exportPlan(database, 'blobs')]);
    if (JSON.stringify(finalRecords) !== JSON.stringify(records) || JSON.stringify(finalBlobs) !== JSON.stringify(blobs)) throw new Error('导出期间资料发生变化，请重新导出。现有资料保留。');
    const manifest = new TextEncoder().encode(JSON.stringify({ format: 'PRISM-VAULT', version: 2, exportedAt: new Date().toISOString(), meta: [meta], ...entries }));
    await zip.add('manifest.json', manifest); await zip.add('manifest.sha256', new TextEncoder().encode(await hash(manifest.buffer)));
    options.onProgress?.({ stage: '正在完成备份文件', current: total, total });
    return await zip.finish();
  } finally { database.close(); }
}

type BackupReference = Omit<EncryptedBlobRecord, 'payload'> & { payload?: string; path?: string; size?: number; sha256?: string };
type BackupSource = { meta: VaultMeta; records: BackupReference[]; blobs: BackupReference[]; info: BackupInfo; read: (entry: BackupReference) => Promise<EncryptedBlobRecord> };
async function parseBackup(file: File): Promise<BackupSource> {
  try {
    const head = new Uint8Array(await file.slice(0, 2).arrayBuffer());
    const zip = head[0] === 0x50 && head[1] === 0x4b ? await openBackupZip(file) : undefined;
    let parsed;
    if (zip) {
      const raw = await zip.read('manifest.json', 96 * 1024 * 1024), digest = new TextDecoder().decode(await zip.read('manifest.sha256', 1024));
      if (await hash(raw) !== digest) throw new Error('目录校验失败');
      parsed = JSON.parse(new TextDecoder().decode(raw));
    } else parsed = JSON.parse(await file.text());
    if (parsed.format !== 'PRISM-VAULT' || ![1, 2].includes(parsed.version) || parsed.version === 2 && !zip) throw new Error('不支持的版本');
    if (!Array.isArray(parsed.meta) || parsed.meta.length !== 1 || parsed.meta[0].key !== 'vault' || !Array.isArray(parsed.records) || !Array.isArray(parsed.blobs)) throw new Error('缺少必要数据');
    for (const kind of ['records', 'blobs'] as const) {
      const ids = new Set<string>();
      for (const entry of parsed[kind]) {
        if (typeof entry.id !== 'string' || !entry.id || ids.has(entry.id) || typeof entry.scope !== 'string' || !entry.scope || typeof entry.iv !== 'string' || unb64(entry.iv).length !== 12) throw new Error('记录重复或缺少标识');
        if (zip && (typeof entry.path !== 'string' || !Number.isSafeInteger(entry.size) || entry.size < 16 || typeof entry.sha256 !== 'string')) throw new Error('文件描述不完整');
        ids.add(entry.id);
      }
    }
    return {
      meta: parsed.meta[0], records: parsed.records, blobs: parsed.blobs,
      info: { version: parsed.version, exportedAt: parsed.exportedAt || '', records: parsed.records.length, files: parsed.blobs.length, bytes: file.size, verified: Boolean(zip) },
      async read(entry) {
        const payload = zip ? await zip.read(entry.path!) : buffer(unb64(entry.payload!));
        if (payload.byteLength < 16 || zip && (entry.size !== payload.byteLength || entry.sha256 !== await hash(payload))) throw new Error('备份结构或完整性校验失败，没有修改本机数据。文件不完整。');
        const { path: _path, sha256: _hash, size: _size, payload: _payload, ...rest } = entry;
        return { ...rest, payload };
      },
    };
  } catch (reason) { throw new Error(`备份结构或完整性校验失败，没有修改本机数据。${reason instanceof Error ? reason.message : ''}`); }
}
export async function inspectVaultFile(file: File) {
  const source = await parseBackup(file);
  for (const entry of [...source.records, ...source.blobs]) await source.read(entry);
  return source.info;
}
export async function importVaultFile(file: File, password: string, options?: { recovery?: boolean; assertSession?: () => void }) {
  const source = await parseBackup(file), meta = source.meta;
  let key: CryptoKey;
  if (options?.recovery) {
    if (!meta.recovery) throw new Error('该备份还没有恢复密钥，请使用原密码。');
    try { key = await rawKey(await openEnvelope(await rawKey(recoveryBytes(password)), meta.recovery)); await verify(key, meta); }
    catch { throw new Error('恢复密钥不匹配，没有修改本机数据。'); }
  } else key = await passwordKey(password, meta);
  const database = await db(true), job = crypto.randomUUID();
  const cleanup = async () => {
    const tx = database.transaction('backup-staging', 'readwrite'), complete = done(tx);
    const cursor = tx.objectStore('backup-staging').index('job').openKeyCursor(IDBKeyRange.only(job));
    cursor.onsuccess = () => { const row = cursor.result; if (row) { tx.objectStore('backup-staging').delete(row.primaryKey); row.continue(); } };
    await complete;
  };
  try {
    const files = new Map(source.blobs.map(entry => [entry.id, entry.scope]));
    // Authenticate and stage one file at a time. The live vault is untouched.
    for (const kind of ['records', 'blobs'] as const) for (const [index, entry] of source[kind].entries()) {
      options?.assertSession?.(); const record = await source.read(entry);
      if (kind === 'records') await validateRecord(record, key, files); else await validateBlob(record, key);
      const tx = database.transaction('backup-staging', 'readwrite'), complete = done(tx);
      tx.objectStore('backup-staging').put({ id: `${job}:${kind}:${index}`, job, kind, value: record }); await complete;
    }
    options?.assertSession?.();
    // Copy staged encrypted entries in one atomic transaction, with one put in flight.
    const tx = database.transaction([...STORES, 'backup-staging'], 'readwrite'), complete = done(tx);
    let cancellation: unknown;
    STORES.forEach(store => tx.objectStore(store).clear()); tx.objectStore('meta').put(meta);
    const cursor = tx.objectStore('backup-staging').index('job').openCursor(IDBKeyRange.only(job));
    cursor.onsuccess = () => {
      const row = cursor.result; if (!row) return;
      try {
        options?.assertSession?.();
        const put = tx.objectStore(row.value.kind).put(row.value.value);
        put.onsuccess = () => { row.delete(); row.continue(); };
      } catch (reason) { cancellation = reason; tx.abort(); }
    };
    try { await complete; } catch (reason) { throw cancellation || reason; }
    return { key, info: source.info };
  } finally { await cleanup().catch(() => {}); database.close(); }
}
