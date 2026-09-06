'use client';
import { useEffect, useRef, useState } from 'react';
import { useVault } from './vault-provider';
import type { VaultWrite } from '@/lib/local-vault';

// Files are encrypted once; changes to position/order only rewrite a small encrypted snapshot.
export function useWorkspaceState<T>(id: string, initial: T) {
  const vault = useVault();
  const [state, render] = useState<T>(initial);
  const [ready, setReady] = useState(false);
  const [saveError, setSaveError] = useState('');
  const current = useRef(initial);
  const readyRef = useRef(false);
  const dirty = useRef(false);
  const mounted = useRef(true);
  const files = useRef(new WeakMap<Blob, string>());
  const persisted = useRef(new Set<string>());
  const chain = useRef<Promise<void>>(Promise.resolve());
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const writer = useRef(vault.writeBatch);
  writer.current = vault.writeBatch;
  const flushRef = useRef<() => Promise<void>>(async () => {});
  const flush = () => {
    clearTimeout(timer.current);
    if (!readyRef.current || !dirty.current) return chain.current;
    dirty.current = false;
    const snapshot = current.current;
    const task = chain.current
      .catch(() => {})
      .then(async () => {
        const batch: VaultWrite = { records: [], blobs: [], deleteBlobs: [] };
        const keep = new Set<string>();
        const encode = (value: unknown): unknown => {
          if (value instanceof Blob) {
            let fileId = files.current.get(value);
            if (!fileId) {
              fileId = crypto.randomUUID();
              files.current.set(value, fileId);
            }
            keep.add(fileId);
            const name = value instanceof File ? value.name : 'file';
            if (!persisted.current.has(fileId))
              batch.blobs!.push({
                id: fileId,
                scope: `workspace-files:${id}`,
                blob: value,
                name,
              });
            return {
              __prismFile: true,
              id: fileId,
              name,
              type: value.type,
              lastModified: value instanceof File ? value.lastModified : 0,
            };
          }
          if (Array.isArray(value)) return value.map(encode);
          if (value && typeof value === 'object')
            return Object.fromEntries(
              Object.entries(value)
                .filter(([key]) => key !== 'url')
                .map(([key, item]) => [key, encode(item)]),
            );
          return value;
        };
        const record = { id: `workspace:${id}`, data: encode(snapshot) };
        batch.records!.push({ scope: 'workspaces', value: record });
        batch.deleteBlobs = [...persisted.current].filter(
          (key) => !keep.has(key),
        );
        await writer.current(batch);
        persisted.current = keep;
        if (mounted.current) setSaveError('');
      })
      .catch((e) => {
        dirty.current = true;
        if (mounted.current)
          setSaveError(e instanceof Error ? e.message : '工坊保存失败');
        throw e;
      });
    chain.current = task;
    void task.catch(() => {});
    return task;
  };
  flushRef.current = flush;
  const setState = (next: T | ((old: T) => T)) => {
    if (!readyRef.current) return;
    current.current =
      typeof next === 'function'
        ? (next as (old: T) => T)(current.current)
        : next;
    dirty.current = true;
    render(current.current);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      void flushRef.current().catch(() => {});
    }, 250);
  };
  useEffect(() => {
    mounted.current = true;
    let cancelled = false;
    (async () => {
      const records = await vault.loadRecords<{ id: string; data: unknown }>(
        'workspaces',
      );
      const record = records.find((r) => r.id === `workspace:${id}`);
      if (record) {
        const blobs = await vault.loadBlobs(`workspace-files:${id}`);
        const byId = new Map(blobs.map((b) => [b.id, b]));
        const decode = (value: unknown): unknown => {
          if (value && typeof value === 'object' && '__prismFile' in value) {
            const ref = value as unknown as {
              id: string;
              name: string;
              type: string;
              lastModified: number;
            };
            const entry = byId.get(ref.id);
            if (!entry) throw new Error('工坊快照缺少原文件，请导入完整备份。');
            const file = new File([entry.blob], ref.name, {
              type: ref.type,
              lastModified: ref.lastModified,
            });
            files.current.set(file, ref.id);
            persisted.current.add(ref.id);
            return file;
          }
          if (Array.isArray(value)) return value.map(decode);
          if (value && typeof value === 'object')
            return Object.fromEntries(
              Object.entries(value).map(([key, item]) => [key, decode(item)]),
            );
          return value;
        };
        const restored = decode(record.data) as T;
        if (!cancelled) {
          current.current = { ...initial, ...restored };
          render(current.current);
        }
      }
      if (!cancelled) {
        readyRef.current = true;
        setReady(true);
      }
    })().catch((e) => {
      if (!cancelled)
        setSaveError(e instanceof Error ? e.message : '读取工坊失败');
    });
    const checkpoint = (e: Event) => {
      (e as CustomEvent<Promise<unknown>[]>).detail.push(flushRef.current());
    };
    window.addEventListener('prism:checkpoint', checkpoint);
    return () => {
      cancelled = true;
      mounted.current = false;
      clearTimeout(timer.current);
      window.removeEventListener('prism:checkpoint', checkpoint);
    };
  }, [id, vault.session]);
  return { state, setState, ready, saveError, flush, current };
}

export function useFileUrls(files: Blob[]) {
  const urls = useRef(new Map<Blob, string>());
  const disposal = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const keep = new Set(files);
  for (const [file, url] of urls.current)
    if (!keep.has(file)) {
      URL.revokeObjectURL(url);
      urls.current.delete(file);
    }
  for (const file of files)
    if (!urls.current.has(file))
      urls.current.set(file, URL.createObjectURL(file));
  useEffect(() => {
    clearTimeout(disposal.current);
    return () => {
      disposal.current = setTimeout(() => {
        for (const url of urls.current.values()) URL.revokeObjectURL(url);
        urls.current.clear();
      }, 0);
    };
  }, []);
  return files.map((file) => urls.current.get(file)!);
}
