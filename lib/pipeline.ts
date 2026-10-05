export type PipelineSource = { id: string; file: File; batchId?: string; batchTitle?: string };
export type PipelineTransfer = {
  sources: PipelineSource[];
  complete: (error?: Error) => void;
  batchId?: string;
  batchTitle?: string;
};
export function moveSource<T extends { id: string }>(
  sources: T[],
  id: string,
  targetIndex: number,
) {
  const from = sources.findIndex((item) => item.id === id);
  if (from < 0 || !sources.length || !Number.isFinite(targetIndex))
    return sources;
  const to = Math.max(0, Math.min(sources.length - 1, Math.round(targetIndex)));
  if (from === to) return sources;
  const next = [...sources];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}
export function shuffleSources<T>(sources: T[], random = Math.random) {
  const next = [...sources];
  for (let i = next.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
}
export function mergeSources(
  current: PipelineSource[],
  incoming: PipelineSource[],
  limit = 1000,
) {
  const next = [...current];
  const indexes = new Map(next.map((item, i) => [item.id, i]));
  for (const item of incoming) {
    const existing = indexes.get(item.id);
    if (existing !== undefined) next[existing] = item;
    else if (next.length < limit) {
      indexes.set(item.id, next.length);
      next.push(item);
    }
  }
  return next;
}

/** Hash only same-sized files, one at a time, to find exact duplicate images. */
export async function duplicateSourceIndexes(sources: PipelineSource[]): Promise<number[]> {
  const bySize = new Map<number, number[]>();
  sources.forEach((source, index) => bySize.set(source.file.size, [...(bySize.get(source.file.size) || []), index]));
  const duplicate: number[] = [];
  for (const indexes of bySize.values()) {
    if (indexes.length < 2) continue;
    const known = new Map<string, number>();
    for (const index of indexes) {
      const digest = await crypto.subtle.digest('SHA-256', await sources[index].file.arrayBuffer());
      const hash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
      if (known.has(hash)) duplicate.push(index);
      else known.set(hash, index);
    }
  }
  return duplicate;
}
