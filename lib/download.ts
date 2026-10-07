import JSZip from 'jszip';
import { BackupZipWriter } from './backup-zip';

export type DownloadItem = { name: string; blob: Blob };
export type ImageDownloadRequest = { items: DownloadItem[]; archiveName: string };
let imageDownloadHandler: ((request: ImageDownloadRequest) => Promise<void>) | undefined;
export function registerImageDownloadHandler(handler: (request: ImageDownloadRequest) => Promise<void>) {
  imageDownloadHandler = handler;
  return () => { if (imageDownloadHandler === handler) imageDownloadHandler = undefined; };
}
export function safeDownloadName(name: string) { return name.replace(/[\\/<>:"|?*]/g, '_').trim() || 'image.png'; }

export function downloadBlob(blob: Blob, name: string, options?: { retainMs?: number }) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), options?.retainMs ?? 30000);
}

export async function downloadZip(
  items: DownloadItem[],
  archiveName: string,
) {
  if (!items.length) return;
  const images = items.every(item => item.blob.type.startsWith('image/') || /\.(?:png|jpe?g|webp|avif|gif|bmp|svg)$/i.test(item.name));
  if (images && items.length === 1) { downloadBlob(items[0].blob, items[0].name); return; }
  if (images) {
    if (!imageDownloadHandler) throw new Error('下载界面尚未准备好，请稍后重试。');
    await imageDownloadHandler({ items, archiveName }); return;
  }
  await downloadArchiveZip(items, archiveName);
}

export async function downloadArchiveZip(items: DownloadItem[], archiveName: string) {
  const images = items.every(item => item.blob.type.startsWith('image/') || /\.(?:png|jpe?g|webp|avif|gif|bmp|svg)$/i.test(item.name));
  if (images) {
    const writer = new BackupZipWriter(), used = new Set<string>();
    for (const item of items) {
      const base = safeDownloadName(item.name); let name = base, suffix = 2;
      while (used.has(name)) name = base.replace(/(\.[^.]+)?$/, `-${suffix++}$1`);
      used.add(name); await writer.add(name, new Uint8Array(await item.blob.arrayBuffer()));
    }
    const blob = await writer.finish(); if (blob) downloadBlob(blob, archiveName, { retainMs: 600000 }); return;
  }
  const zip = new JSZip();
  const used = new Set<string>();
  for (const item of items) {
    const base = item.name.replace(/[\\/]/g, '_') || 'image';
    let safeName = base;
    let suffix = 2;
    while (used.has(safeName))
      safeName = base.replace(/(\.[^.]+)?$/, `-${suffix++}$1`);
    used.add(safeName);
    zip.file(safeName, item.blob);
  }
  const payload = await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });
  downloadBlob(payload, archiveName);
}
