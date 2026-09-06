import JSZip from 'jszip';

export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30000);
}

export async function downloadZip(
  items: Array<{ name: string; blob: Blob }>,
  archiveName: string,
) {
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
