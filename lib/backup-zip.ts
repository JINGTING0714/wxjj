// STORE entries keep encrypted bytes unchanged and can be written incrementally.
const encoder = new TextEncoder(), decoder = new TextDecoder();
const table = Uint32Array.from({ length: 256 }, (_, value) => {
  for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ value >>> 1 : value >>> 1;
  return value >>> 0;
});
const pause = () => new Promise<void>(resolve => setTimeout(resolve, 0));
export async function backupCrc(bytes: Uint8Array) {
  let crc = 0xffffffff;
  for (let offset = 0; offset < bytes.length; offset += 4 * 1024 * 1024) {
    const end = Math.min(bytes.length, offset + 4 * 1024 * 1024);
    for (let index = offset; index < end; index++) crc = table[(crc ^ bytes[index]) & 255] ^ crc >>> 8;
    if (end < bytes.length) await pause();
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function header(length: number, signature: number) { const bytes = new Uint8Array(length); const view = new DataView(bytes.buffer); view.setUint32(0, signature, true); return { bytes, view }; }

export class BackupZipWriter {
  private parts: Blob[] = [];
  private directory: Uint8Array<ArrayBuffer>[] = [];
  private offset = 0;
  constructor(private output?: (bytes: Uint8Array<ArrayBuffer>) => Promise<void>) {}
  private async emit(bytes: Uint8Array<ArrayBuffer>) {
    if (this.output) await this.output(bytes); else this.parts.push(new Blob([bytes]));
    this.offset += bytes.byteLength;
  }
  async add(name: string, data: Uint8Array<ArrayBuffer>) {
    const path = encoder.encode(name), start = this.offset, crc = await backupCrc(data);
    if (data.byteLength >= 0xffffffff) throw new Error('单个备份文件过大，请联系支持核对；原保险库没有改变。');
    const local = header(30 + path.length, 0x04034b50);
    local.view.setUint16(4, 20, true); local.view.setUint16(6, 0x800, true); local.view.setUint16(12, 0x21, true);
    local.view.setUint32(14, crc, true); local.view.setUint32(18, data.length, true); local.view.setUint32(22, data.length, true); local.view.setUint16(26, path.length, true); local.bytes.set(path, 30);
    await this.emit(local.bytes);
    for (let offset = 0; offset < data.length; offset += 1024 * 1024) await this.emit(data.subarray(offset, offset + 1024 * 1024));
    const zip64 = start >= 0xffffffff;
    const central = header(46 + path.length + (zip64 ? 12 : 0), 0x02014b50);
    central.view.setUint16(4, zip64 ? 45 : 20, true); central.view.setUint16(6, zip64 ? 45 : 20, true); central.view.setUint16(8, 0x800, true); central.view.setUint16(14, 0x21, true);
    central.view.setUint32(16, crc, true); central.view.setUint32(20, data.length, true); central.view.setUint32(24, data.length, true); central.view.setUint16(28, path.length, true); central.view.setUint16(30, zip64 ? 12 : 0, true); central.view.setUint32(42, zip64 ? 0xffffffff : start, true); central.bytes.set(path, 46);
    if (zip64) { const extra = 46 + path.length; central.view.setUint16(extra, 1, true); central.view.setUint16(extra + 2, 8, true); central.view.setBigUint64(extra + 4, BigInt(start), true); }
    this.directory.push(central.bytes);
  }
  async finish(): Promise<Blob | undefined> {
    const start = this.offset;
    for (const entry of this.directory) await this.emit(entry);
    const size = this.offset - start, count = this.directory.length;
    const zip64 = start >= 0xffffffff || size >= 0xffffffff || count >= 0xffff;
    if (zip64) {
      const offset = this.offset, end = header(56, 0x06064b50);
      end.view.setBigUint64(4, BigInt(44), true); end.view.setUint16(12, 45, true); end.view.setUint16(14, 45, true);
      end.view.setBigUint64(24, BigInt(count), true); end.view.setBigUint64(32, BigInt(count), true); end.view.setBigUint64(40, BigInt(size), true); end.view.setBigUint64(48, BigInt(start), true); await this.emit(end.bytes);
      const locator = header(20, 0x07064b50); locator.view.setBigUint64(8, BigInt(offset), true); locator.view.setUint32(16, 1, true); await this.emit(locator.bytes);
    }
    const end = header(22, 0x06054b50);
    end.view.setUint16(8, zip64 ? 0xffff : count, true); end.view.setUint16(10, zip64 ? 0xffff : count, true); end.view.setUint32(12, zip64 ? 0xffffffff : size, true); end.view.setUint32(16, zip64 ? 0xffffffff : start, true); await this.emit(end.bytes);
    return this.output ? undefined : new Blob(this.parts, { type: 'application/zip' });
  }
}

type ZipEntry = { name: string; size: number; packed: number; offset: number; method: number; crc: number };
export async function openBackupZip(file: Blob) {
  const read = async (start: number, length: number) => {
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(length) || start < 0 || length < 0 || start + length > file.size) throw new Error('备份文件范围不完整');
    return new Promise<Uint8Array<ArrayBuffer>>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('读取备份文件超时。请先把完整文件保存到设备本地，再重新选择；当前保险库保留。')), 120000);
      file.slice(start, start + length).arrayBuffer().then(bytes => { clearTimeout(timer); resolve(new Uint8Array(bytes)); }, reason => { clearTimeout(timer); reject(reason); });
    });
  };
  const tailStart = Math.max(0, file.size - 65557), tail = await read(tailStart, file.size - tailStart), tailView = new DataView(tail.buffer);
  let eocd = -1;
  for (let index = tail.length - 22; index >= 0; index--) if (tailView.getUint32(index, true) === 0x06054b50 && index + 22 + tailView.getUint16(index + 20, true) === tail.length) { eocd = index; break; }
  if (eocd < 0) throw new Error('缺少完整备份目录');
  let count = tailView.getUint16(eocd + 10, true), size = tailView.getUint32(eocd + 12, true), offset = tailView.getUint32(eocd + 16, true);
  if (count === 0xffff || size === 0xffffffff || offset === 0xffffffff) {
    const locator = new DataView((await read(tailStart + eocd - 20, 20)).buffer);
    if (locator.getUint32(0, true) !== 0x07064b50) throw new Error('大备份目录不完整');
    const zip64 = new DataView((await read(Number(locator.getBigUint64(8, true)), 56)).buffer);
    if (zip64.getUint32(0, true) !== 0x06064b50) throw new Error('大备份目录不正确');
    count = Number(zip64.getBigUint64(32, true)); size = Number(zip64.getBigUint64(40, true)); offset = Number(zip64.getBigUint64(48, true));
  }
  if (count > 250000 || size > 96 * 1024 * 1024) throw new Error('备份目录过大，请核对文件');
  const bytes = await read(offset, size), view = new DataView(bytes.buffer), entries = new Map<string, ZipEntry>();
  let position = 0;
  for (let index = 0; index < count; index++) {
    if (position + 46 > bytes.length || view.getUint32(position, true) !== 0x02014b50) throw new Error('备份目录损坏');
    const nameLength = view.getUint16(position + 28, true), extraLength = view.getUint16(position + 30, true), commentLength = view.getUint16(position + 32, true);
    const end = position + 46 + nameLength + extraLength + commentLength;
    if (end > bytes.length || view.getUint16(position + 8, true) & 1) throw new Error('不支持或不完整的备份条目');
    const name = decoder.decode(bytes.subarray(position + 46, position + 46 + nameLength));
    let entrySize = view.getUint32(position + 24, true), packed = view.getUint32(position + 20, true), localOffset = view.getUint32(position + 42, true);
    for (let extra = position + 46 + nameLength; extra + 4 <= position + 46 + nameLength + extraLength;) {
      const length = view.getUint16(extra + 2, true);
      if (extra + 4 + length > end) throw new Error('大备份扩展信息损坏');
      if (view.getUint16(extra, true) === 1) {
        let field = extra + 4;
        for (const kind of ['size','packed','offset']) {
          const value = kind === 'size' ? entrySize : kind === 'packed' ? packed : localOffset;
          if (value === 0xffffffff) { if (field + 8 > extra + 4 + length) throw new Error('大备份扩展信息缺失'); const next = Number(view.getBigUint64(field, true)); field += 8; if (kind === 'size') entrySize = next; else if (kind === 'packed') packed = next; else localOffset = next; }
        }
      }
      extra += length + 4;
    }
    if (entries.has(name)) throw new Error('备份文件名重复');
    entries.set(name, { name, size: entrySize, packed, offset: localOffset, method: view.getUint16(position + 10, true), crc: view.getUint32(position + 16, true) }); position = end;
  }
  return {
    async read(name: string, maximum = Number.MAX_SAFE_INTEGER): Promise<ArrayBuffer> {
      const entry = entries.get(name); if (!entry || entry.size > maximum) throw new Error('备份条目缺失或大小异常');
      const local = new DataView((await read(entry.offset, 30)).buffer);
      if (local.getUint32(0, true) !== 0x04034b50 || local.getUint16(8, true) !== entry.method) throw new Error('备份文件头不正确');
      const start = entry.offset + 30 + local.getUint16(26, true) + local.getUint16(28, true);
      if (start + entry.packed > offset) throw new Error('备份条目范围错误');
      let data = await read(start, entry.packed);
      if (entry.method === 8) {
        const reader = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader();
        const chunks: Uint8Array<ArrayBuffer>[] = []; let length = 0;
        try { while (true) { const next = await reader.read(); if (next.done) break; length += next.value.length; if (length > entry.size || length > maximum) throw new Error('备份解压大小异常'); chunks.push(next.value); } } finally { reader.releaseLock(); }
        data = new Uint8Array(await new Blob(chunks).arrayBuffer());
      } else if (entry.method !== 0) throw new Error('不支持的备份压缩方式');
      if (data.byteLength !== entry.size || await backupCrc(data) !== entry.crc) throw new Error('备份内容校验失败');
      return data.buffer;
    },
  };
}
