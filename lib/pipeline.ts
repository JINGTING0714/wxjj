export type PipelineSource = { id: string; file: File; batchId?: string; batchTitle?: string; sequence?:number; revision?:string; inputRevision?:string };
export type PipelineTransfer = {
  sources: PipelineSource[];
  complete: (error?: Error) => void;
  batchId?: string;
  batchTitle?: string;
  pendingIds?:string[];
  pendingRevisions?:Record<string,string>;
  settledIds?:string[];
};
export async function sendPipeline(target:'watermark'|'enhancement'|'collage',detail:Omit<PipelineTransfer,'complete'>,waitForReady=false) {
  const deadline=Date.now()+30_000;
  while(true) {
    let handled=false;
    const task=new Promise<void>((resolve,reject)=>{const event=new CustomEvent(`prism:send-to-${target}`,{cancelable:true,detail:{...detail,complete:(error?:Error)=>error?reject(error):resolve()}});handled=!window.dispatchEvent(event);if(!handled)resolve();});
    await task;if(handled)return;
    if(!waitForReady||Date.now()>=deadline)throw new Error('目标工坊尚未就绪，请稍后重试；当前图片保留。');
    await new Promise(resolve=>setTimeout(resolve,50));
  }
}
export function mergeFlowSources(current:PipelineSource[],incoming:PipelineSource[],limit=200) {
  const merged=mergeSources(current,incoming,limit);
  return merged.sort((a,b)=>a.sequence!==undefined&&b.sequence!==undefined?a.sequence-b.sequence:0);
}
export function mergePendingIds(current:string[],incoming:string[],settled:string[]) {
  const done=new Set(settled);return [...new Set([...current,...incoming])].filter(id=>!done.has(id));
}
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

const imageHashes = new WeakMap<File, Promise<string>>();
const hexDigest = async (bytes: BufferSource) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), byte => byte.toString(16).padStart(2, '0')).join('');

async function visibleImageHash(file: File) {
  const byteHash = await hexDigest(await file.arrayBuffer());
  if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') return byteHash;
  const image = await createImageBitmap(file);
  const canvas = document.createElement('canvas');
  try {
    if (image.width * image.height > 64_000_000) throw new Error('有图片超过 6400 万像素，无法完成严格去重。请缩小后再拼图。');
    canvas.width = image.width; canvas.height = image.height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('浏览器无法核对图片内容，请重试。');
    context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    // RGB under fully transparent pixels does not change the visible image.
    for (let index = 0; index < pixels.length; index += 4) if (!pixels[index + 3]) pixels[index] = pixels[index + 1] = pixels[index + 2] = 0;
    return `${canvas.width}x${canvas.height}:${await hexDigest(pixels.buffer)}`;
  } finally { image.close(); canvas.width = canvas.height = 0; }
}

/** Compare decoded pixels as well as files: metadata, names and PNG encoding
 * can differ while the actual image is identical. Never merge similar art. */
export async function duplicateSourceIndexes(sources: PipelineSource[]): Promise<number[]> {
  const duplicate: number[] = [];
  const known = new Set<string>();
  for (let index = 0; index < sources.length; index++) {
    const file = sources[index].file;
    let pending = imageHashes.get(file);
    if (!pending) { pending = visibleImageHash(file); imageHashes.set(file, pending); void pending.catch(() => imageHashes.delete(file)); }
    const hash = await pending;
    if (known.has(hash)) duplicate.push(index); else known.add(hash);
  }
  return duplicate;
}
