'use client';
import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import type { LibraryAsset, StoredLibraryAsset } from '@/lib/prism-types';
import type { DecryptedBlob } from '@/lib/local-vault';
import { useVault } from './vault-provider';
import { useFileUrls } from './use-workspace-state';
import { ExampleImage } from './example-image';

export function PromptExampleAssignment({ family, onClose, onSaved }: { family: LibraryAsset[]; onClose: () => void; onSaved: () => void }) {
  const vault = useVault();
  const [images, setImages] = useState<DecryptedBlob[]>([]);
  const [choices, setChoices] = useState<Record<string, string[]>>({});
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const urls = useFileUrls(images.map(image => image.blob));
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const scope = family[0]?.promptExamplePoolScope;
      if (!scope) return;
      const pool = await vault.loadBlobs(scope);
      const signature = async (blob: Blob) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer()))).join(',');
      const currentGroups = await Promise.all(family.map(version => vault.loadBlobs(`asset-image:${version.id}`)));
      const signatures = await Promise.all(pool.map(async image => `${image.name}:${await signature(image.blob)}`));
      const known = new Set(signatures);
      for (const image of currentGroups.flat()) {
        const key = `${image.name}:${await signature(image.blob)}`;
        if (!known.has(key)) { known.add(key); pool.push(image); signatures.push(key); }
      }
      const selected = await Promise.all(family.map(async version => {
        if (version.promptExampleReviewRequired) return [version.id, []] as const;
        const current = currentGroups[family.indexOf(version)];
        const existing = new Set(await Promise.all(current.map(async image => `${image.name}:${await signature(image.blob)}`)));
        return [version.id, pool.filter((_, index) => existing.has(signatures[index])).map(image => image.id)] as const;
      }));
      if (!cancelled) { setImages(pool); setChoices(Object.fromEntries(selected)); }
    })().catch(reason => { if (!cancelled) setError(String(reason)); });
    return () => { cancelled = true; };
  }, [family, vault.session]);
  const save = async () => {
    setBusy(true);
    try {
      await vault.writeBatch({
        records: family.map(({ images: _images, ...record }) => ({ scope: 'assets:prompt', value: { ...record, promptExampleReviewRequired: false, updatedAt: new Date().toISOString() } satisfies StoredLibraryAsset })),
        deleteBlobs: family.flatMap(version => version.images.map(image => image.id)),
        blobs: [
          ...images.filter(image => image.scope !== family[0].promptExamplePoolScope).map(image => ({ id: crypto.randomUUID(), scope: family[0].promptExamplePoolScope!, name: image.name, blob: image.blob })),
          ...family.flatMap(version => images.filter(image => (choices[version.id] || []).includes(image.id)).map(image => ({ id: crypto.randomUUID(), scope: `asset-image:${version.id}`, name: image.name, blob: image.blob }))),
        ],
      });
      onSaved(); onClose();
    } catch (reason) { setError(reason instanceof Error ? reason.message : '例图分配保存失败，请重试。'); }
    finally { setBusy(false); }
  };
  return <Dialog open={!!family.length} onOpenChange={open => { if (!open && !busy) onClose(); }}><DialogContent className="prompt-example-assignment">
    <DialogHeader><DialogTitle>为各版本分配例图</DialogTitle></DialogHeader>
    <p>逐个版本勾选对应图片。一个版本可有多张例图；没有选图的版本会显示“暂无例图”。原始例图仍保留在加密副本中。</p>
    <div className="prompt-example-assignment-body">{family.map(version => <section key={version.id}><h3>{version.title}</h3><div className="variant-example-grid">{images.map((image, index) => <article key={image.id}><ExampleImage src={urls[index]} alt={image.name} /><label><input type="checkbox" checked={(choices[version.id] || []).includes(image.id)} onChange={event => setChoices(current => ({ ...current, [version.id]: event.target.checked ? [...(current[version.id] || []), image.id] : (current[version.id] || []).filter(id => id !== image.id) }))} />{image.name}</label></article>)}</div></section>)}</div>
    {error && <p role="alert">{error}</p>}<div className="sales-actions"><Button variant="outline" disabled={busy} onClick={onClose}>稍后分配</Button><Button disabled={busy || !images.length} onClick={() => void save()}>{busy ? '正在保存…' : '确认各版本例图'}</Button></div>
  </DialogContent></Dialog>;
}
