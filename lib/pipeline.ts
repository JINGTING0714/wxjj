export type PipelineSource = { id: string; file: File };
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
