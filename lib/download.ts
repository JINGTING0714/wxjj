import JSZip from 'jszip';

export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function downloadZip(
  items: Array<{ name: string; blob: Blob }>,
  archiveName: string,
) {
  const zip = new JSZip();
  const used = new Map<string, number>();
  for (const item of items) {
    const count = used.get(item.name) || 0;
    used.set(item.name, count + 1);
    const safeName = count ? item.name.replace(/(\.[^.]+)?$/, `-${count + 1}$1`) : item.name;
    zip.file(safeName, item.blob);
  }
  const payload = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
  downloadBlob(payload, archiveName);
}
