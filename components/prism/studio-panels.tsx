'use client';

import {
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  Copy,
  Download,
  Eye,
  EyeOff,
  FileArchive,
  FolderPlus,
  Grid3X3,
  Image as ImageIcon,
  KeyRound,
  Layers3,
  LockKeyhole,
  Maximize2,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Stamp,
  Trash2,
  Upload,
  WandSparkles,
  X,
} from 'lucide-react';
import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  Progress,
  ProgressLabel,
  ProgressValue,
} from '@/components/ui/progress';
import {
  applyWatermarks,
  asFiles,
  createCollages,
  type ProcessedImage,
  type WatermarkLayerInput,
  type WatermarkPosition,
} from '@/lib/image-processing';
import { useVault } from '@/components/prism/vault-provider';

export type AssetKind = 'prompt' | 'profile' | 'moodboard';

type LibraryAsset = {
  id: string;
  kind: AssetKind;
  title: string;
  secret: string;
  author: string;
  origin: string;
  acquisition: string;
  note: string;
  tags: string[];
  collection: string;
  images: string[];
  swatch: string;
};

const assetSeeds: LibraryAsset[] = [
  { id: 'p-01', kind: 'prompt', title: 'Chrome Nocturne', secret: 'industrial fashion portrait, liquid chrome, brutalist atrium, violet rim light, hard flash, precise material study --ar 3:4 --stylize 240', author: 'LZY', origin: '私人实验', acquisition: '自创', note: '冷银高光稳定；人物近景建议降低 stylize。', tags: ['冷硬', '人像', '金属'], collection: 'editorial', images: [], swatch: 'swatch-a' },
  { id: 'p-02', kind: 'prompt', title: 'Quiet Monolith', secret: 'monolithic skincare bottle on limestone plinth, museum lighting, negative space, soft brutalism, tactile grain --ar 4:5', author: 'LZY', origin: '私人实验', acquisition: '自创', note: '浅色产品用黑底效果最好。', tags: ['产品', '留白'], collection: 'product', images: [], swatch: 'swatch-c' },
  { id: 'pr-01', kind: 'profile', title: 'Verdant Signal', secret: 'QVRN7PX', author: 'Neo Atelier', origin: '创作者商店', acquisition: '付费购入', note: '紫底时会增加荧光绿边缘，适合产品视觉。', tags: ['荧光', '高对比'], collection: 'signal', images: [], swatch: 'swatch-b' },
  { id: 'pr-02', kind: 'profile', title: 'Carbon Skin', secret: 'CX9M2RA', author: 'Mori', origin: 'Discord 社群', acquisition: '免费分享', note: '肤色偏冷，黑色层次非常丰富。', tags: ['暗调', '肤质'], collection: 'portrait', images: [], swatch: 'swatch-a' },
  { id: 'mb-01', kind: 'moodboard', title: 'Soft Brutalist', secret: 'MBX4L2A', author: 'Rin', origin: '私人交流', acquisition: '朋友赠送', note: '材质细腻、留白多；与高对比 Profile 搭配更好。', tags: ['静物', '材质'], collection: 'material', images: [], swatch: 'swatch-c' },
  { id: 'mb-02', kind: 'moodboard', title: 'Acid Archive', secret: 'A7C3D9Q', author: 'Archive 09', origin: '独立商店', acquisition: '付费购入', note: '酸绿只做局部点缀，不建议叠加高 chaos。', tags: ['档案', '酸性'], collection: 'signal', images: [], swatch: 'swatch-b' },
];

const kindCopy = {
  prompt: { number: '02', eyebrow: 'PROMPT ARCHIVE', title: '提示词库', noun: '提示词', description: '用例图辨认风格，用完整来源保留每一段提示词的来路。' },
  profile: { number: '03', eyebrow: 'PROFILE INDEX', title: 'Profile 库', noun: 'Profile', description: '所有 7 位 Profile 常态只显示前三位，按需单条解锁。' },
  moodboard: { number: '04', eyebrow: 'MOODBOARD INDEX', title: 'Moodboard 库', noun: 'Moodboard', description: '把视觉倾向、来源、版权与实测备注放在同一条记录里。' },
};

const collectionSeeds: Record<AssetKind, { id: string; name: string }[]> = {
  prompt: [
    { id: 'all', name: '全部提示词' },
    { id: 'editorial', name: '编辑人像' },
    { id: 'product', name: '产品静物' },
  ],
  profile: [
    { id: 'all', name: '全部 Profiles' },
    { id: 'signal', name: '高对比信号' },
    { id: 'portrait', name: '人物肤质' },
  ],
  moodboard: [
    { id: 'all', name: '全部 Moodboards' },
    { id: 'material', name: '材质研究' },
    { id: 'signal', name: '酸性档案' },
  ],
};

function SectionHead({ eyebrow, number, title, description, actions }: { eyebrow: string; number: string; title: string; description: string; actions?: React.ReactNode }) {
  return (
    <section className="studio-head">
      <div>
        <p className="eyebrow">{eyebrow} <span>/ {number}</span></p>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {actions && <div className="studio-head-actions">{actions}</div>}
    </section>
  );
}

function VisualTile({ asset, compact = false }: { asset: LibraryAsset; compact?: boolean }) {
  return (
    <div className={`record-visual ${asset.swatch} ${compact ? 'is-compact' : ''}`}>
      {asset.images[0] && <img alt="" src={asset.images[0]} />}
      <small><ImageIcon /> {Math.max(asset.images.length, asset.kind === 'prompt' ? 4 : 3)}</small>
    </div>
  );
}

export function LibraryPanel({ kind, globalQuery }: { kind: AssetKind; globalQuery: string }) {
  const vault = useVault();
  const copy = kindCopy[kind];
  const [assets, setAssets] = useState(assetSeeds.filter((asset) => asset.kind === kind));
  const [collections, setCollections] = useState(collectionSeeds[kind]);
  const [activeCollection, setActiveCollection] = useState('all');
  const [localQuery, setLocalQuery] = useState('');
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const [assetDialog, setAssetDialog] = useState(false);
  const [collectionDialog, setCollectionDialog] = useState(false);
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [formError, setFormError] = useState('');

  useEffect(() => {
    const hide = () => setRevealed(new Set());
    window.addEventListener('prism:hide-secrets', hide);
    return () => window.removeEventListener('prism:hide-secrets', hide);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const seed = assetSeeds.filter((asset) => asset.kind === kind);
    if (vault.status !== 'unlocked') {
      setAssets(seed);
      setCollections(collectionSeeds[kind]);
      return;
    }
    Promise.all([
      vault.loadRecords<LibraryAsset>(`assets:${kind}`),
      vault.loadRecords<{ id: string; name: string }>(`collections:${kind}`),
    ]).then(async ([storedAssets, storedCollections]) => {
      const hydrated = await Promise.all(storedAssets.map(async (asset) => {
        const blobs = await vault.loadBlobs(`asset-image:${asset.id}`);
        return { ...asset, images: blobs.map((entry) => URL.createObjectURL(entry.blob)) };
      }));
      if (cancelled) return;
      const storedIds = new Set(hydrated.map((asset) => asset.id));
      setAssets([...hydrated, ...seed.filter((asset) => !storedIds.has(asset.id))]);
      setCollections([...collectionSeeds[kind], ...storedCollections.filter((collection) => !collectionSeeds[kind].some((seedCollection) => seedCollection.id === collection.id))]);
    }).catch((reason) => setFormError(reason instanceof Error ? reason.message : '本地资产读取失败'));
    return () => { cancelled = true; };
  }, [kind, vault.status]);

  const query = `${globalQuery} ${localQuery}`.trim().toLocaleLowerCase();
  const filtered = useMemo(() => assets.filter((asset) => {
    const inCollection = activeCollection === 'all' || asset.collection === activeCollection;
    const haystack = [asset.title, asset.author, asset.origin, asset.acquisition, asset.note, ...asset.tags].join(' ').toLocaleLowerCase();
    return inCollection && (!query || haystack.includes(query));
  }), [activeCollection, assets, query]);

  const toggleReveal = (id: string) => {
    setRevealed((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const submitAsset = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError('');
    if (vault.status !== 'unlocked') {
      setFormError('请先在“安全与备份”中创建或解锁本机保险库。');
      return;
    }
    const form = new FormData(event.currentTarget);
    const secret = String(form.get('secret') || '').trim();
    if (kind !== 'prompt' && secret.length !== 7) return;
    const record: LibraryAsset = {
      id: `${kind}-${Date.now()}`,
      kind,
      title: String(form.get('title') || '未命名资产'),
      secret,
      author: String(form.get('author') || '未知'),
      origin: String(form.get('origin') || '未记录'),
      acquisition: String(form.get('acquisition') || '未分类'),
      note: String(form.get('note') || ''),
      tags: String(form.get('tags') || '').split(/[,，]/).map((tag) => tag.trim()).filter(Boolean),
      collection: String(form.get('collection') || 'unfiled'),
      images: imageFiles.map((file) => URL.createObjectURL(file)),
      swatch: ['swatch-a', 'swatch-b', 'swatch-c'][assets.length % 3],
    };
    try {
      await vault.saveRecord(`assets:${kind}`, { ...record, images: [] });
      for (const file of imageFiles) await vault.saveBlob(`asset-image:${record.id}`, file, file.name);
      setAssets((current) => [record, ...current]);
      setImageFiles([]);
      setAssetDialog(false);
    } catch (reason) {
      setFormError(reason instanceof Error ? reason.message : '资产保存失败');
    }
  };

  const submitCollection = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError('');
    if (vault.status !== 'unlocked') {
      setFormError('请先创建或解锁本机保险库，再新建分类。');
      return;
    }
    const form = new FormData(event.currentTarget);
    const name = String(form.get('name') || '').trim();
    if (!name) return;
    const id = `collection-${Date.now()}`;
    try {
      await vault.saveRecord(`collections:${kind}`, { id, name });
      setCollections((current) => [...current, { id, name }]);
      setActiveCollection(id);
      setCollectionDialog(false);
    } catch (reason) {
      setFormError(reason instanceof Error ? reason.message : '分类创建失败');
    }
  };

  const deleteCollection = async (id: string) => {
    if (id === 'all') return;
    const reassigned = assets.map((asset) => asset.collection === id ? { ...asset, collection: 'unfiled' } : asset);
    setAssets(reassigned);
    setCollections((current) => current.filter((collection) => collection.id !== id));
    setActiveCollection('all');
    if (vault.status === 'unlocked') {
      await vault.deleteRecord(id).catch(() => undefined);
      for (const asset of reassigned.filter((record) => record.collection === 'unfiled')) {
        await vault.saveRecord(`assets:${kind}`, { ...asset, images: [] }).catch(() => undefined);
      }
    }
  };

  return (
    <div className="studio-page">
      <SectionHead
        description={copy.description}
        eyebrow={copy.eyebrow}
        number={copy.number}
        title={copy.title}
        actions={
          <>
            <Button onClick={() => setCollectionDialog(true)} variant="outline"><FolderPlus /> 新建库</Button>
            <Button className="add-button" onClick={() => setAssetDialog(true)}><Plus /> 添加{copy.noun}</Button>
          </>
        }
      />

      <div className="collection-rail">
        <div className="collection-tabs">
          {collections.map((collection) => (
            <button className={collection.id === activeCollection ? 'is-active' : ''} key={collection.id} onClick={() => setActiveCollection(collection.id)} type="button">
              <span>{collection.name}</span>
              <small>{collection.id === 'all' ? assets.length : assets.filter((asset) => asset.collection === collection.id).length}</small>
              {collection.id !== 'all' && collection.id === activeCollection && (
                <Trash2 className="collection-delete" onClick={(event) => { event.stopPropagation(); deleteCollection(collection.id); }} />
              )}
            </button>
          ))}
        </div>
        <p><CircleAlert /> 删除库只会移除分类，库内资产会回到“未分类”。</p>
      </div>
      {vault.status !== 'unlocked' && <div className="vault-gate"><LockKeyhole /><p><strong>当前展示的是安全演示数据</strong><span>创建或解锁本机保险库后，新增内容才会以 AES-256-GCM 加密写入此设备。</span></p></div>}

      <div className="library-toolbar">
        <div className="inner-search"><Search /><Input onChange={(event) => setLocalQuery(event.target.value)} placeholder={`在当前${copy.noun}库中搜索…`} value={localQuery} /></div>
        <div className="result-count"><strong>{String(filtered.length).padStart(2, '0')}</strong><span>条匹配资产</span></div>
      </div>

      <div className="record-list">
        <div className="record-head"><span>例图 / 资产</span><span>{copy.noun} / 来源</span><span>备注</span><span /></div>
        {filtered.map((asset) => {
          const isRevealed = revealed.has(asset.id);
          const visibleValue = kind === 'prompt' ? asset.secret : `${asset.secret.slice(0, 3)}${isRevealed ? asset.secret.slice(3) : '••••'}`;
          return (
            <article className="record-row" key={asset.id}>
              <div className="record-identity">
                <VisualTile asset={asset} />
                <div><Badge variant="outline">{copy.noun}</Badge><h3>{asset.title}</h3><p>{asset.tags.join(' / ')}</p></div>
              </div>
              <div className="record-secret">
                <div className={kind === 'prompt' && !isRevealed ? 'is-obscured' : ''}><code>{visibleValue}</code></div>
                <div className="record-secret-actions">
                  <button onClick={() => toggleReveal(asset.id)} type="button">{isRevealed ? <EyeOff /> : <Eye />} {isRevealed ? '隐藏' : '显示'}</button>
                  <button disabled={!isRevealed} onClick={() => navigator.clipboard?.writeText(asset.secret)} type="button"><Copy /> 复制</button>
                </div>
                <p><strong>{asset.author}</strong><span>·</span>{asset.origin}<span>·</span>{asset.acquisition}</p>
              </div>
              <p className="record-note">{asset.note || '暂无私人备注。'}</p>
              <button className="more-button" type="button"><MoreHorizontal /></button>
            </article>
          );
        })}
        {filtered.length === 0 && <div className="empty-state"><Search /><h3>没有找到匹配资产</h3><p>换一个关键词，或切换到“全部”库查看。</p></div>}
      </div>

      <Dialog onOpenChange={setAssetDialog} open={assetDialog}>
        <DialogContent className="asset-dialog">
          <DialogHeader><DialogTitle>添加{copy.noun}</DialogTitle><DialogDescription>所有字段与图片只会写入这台设备的本地保险库。</DialogDescription></DialogHeader>
          <form className="editor-form" id="asset-form" onSubmit={submitAsset}>
            <label><span>名称</span><Input name="title" placeholder="方便辨认的名称" required /></label>
            <label className="wide-field"><span>{copy.noun}{kind !== 'prompt' && '（7 位）'}</span>{kind === 'prompt' ? <textarea name="secret" placeholder="粘贴完整提示词…" required /> : <Input maxLength={7} minLength={7} name="secret" placeholder="ABC1234" required />}</label>
            <label><span>作者</span><Input name="author" placeholder="作者或卖家" /></label>
            <label><span>来自哪里</span><Input name="origin" placeholder="网站、社群、私人交流…" /></label>
            <label><span>获得方式</span><select defaultValue="自创" name="acquisition"><option>自创</option><option>免费分享</option><option>朋友赠送</option><option>付费购入</option><option>其他</option></select></label>
            <label><span>归属库</span><select name="collection">{collections.filter((collection) => collection.id !== 'all').map((collection) => <option key={collection.id} value={collection.id}>{collection.name}</option>)}<option value="unfiled">未分类</option></select></label>
            <label className="wide-field"><span>标签</span><Input name="tags" placeholder="冷硬，产品，荧光（用逗号分隔）" /></label>
            <label className="wide-field"><span>私人备注</span><textarea name="note" placeholder="记录参数建议、使用感受或搭配提醒…" /></label>
            <label className="wide-field upload-field"><span>例图（可多选）</span><input accept="image/*" multiple onChange={(event) => setImageFiles(Array.from(event.target.files || []))} type="file" /><div><Upload /><strong>{imageFiles.length ? `已选择 ${imageFiles.length} 张` : '拖入或选择例图'}</strong><small>PNG / JPG / WEBP</small></div></label>
          </form>
          {formError && <p className="dialog-error"><CircleAlert /> {formError}</p>}
          <DialogFooter><Button onClick={() => setAssetDialog(false)} variant="ghost">取消</Button><Button form="asset-form" type="submit"><LockKeyhole /> 加密保存</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog onOpenChange={setCollectionDialog} open={collectionDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>新建{copy.noun}库</DialogTitle><DialogDescription>库只是自由分类；删除库不会删除里面的资产。</DialogDescription></DialogHeader>
          <form className="single-form" id="collection-form" onSubmit={submitCollection}><label><span>库名称</span><Input autoFocus name="name" placeholder="例如：实验性人像" required /></label></form>
          {formError && <p className="dialog-error"><CircleAlert /> {formError}</p>}
          <DialogFooter><Button onClick={() => setCollectionDialog(false)} variant="ghost">取消</Button><Button form="collection-form" type="submit">创建图库</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

type Recipe = { id: string; title: string; profile: string; moodboard: string; ratio: string; note: string; images: number; swatch: string };
const seedRecipes: Recipe[] = [
  { id: 'r-01', title: 'Acid Monolith', profile: 'QVRN7PX', moodboard: 'A7C3D9Q', ratio: '3:4', note: '酸绿轮廓非常稳定；产品主体要保留 35% 以上暗部。', images: 6, swatch: 'recipe-one' },
  { id: 'r-02', title: 'Quiet Carbon', profile: 'CX9M2RA', moodboard: 'MBX4L2A', ratio: '1:1', note: '肤质与石材细节互相增强，适合低饱和近景。', images: 4, swatch: 'recipe-two' },
  { id: 'r-03', title: 'Violet Editorial', profile: 'QVRN7PX', moodboard: 'MBX4L2A', ratio: '9:16', note: 'Profile 权重建议高于 Moodboard；过强时会丢失肤色。', images: 8, swatch: 'recipe-three' },
];

export function RecipePanel({ globalQuery }: { globalQuery: string }) {
  const vault = useVault();
  const [recipes, setRecipes] = useState(seedRecipes);
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const [dialog, setDialog] = useState(false);
  const [formError, setFormError] = useState('');
  const query = globalQuery.trim().toLocaleLowerCase();
  const visible = recipes.filter((recipe) => !query || `${recipe.title} ${recipe.note}`.toLocaleLowerCase().includes(query));

  useEffect(() => {
    const hide = () => setRevealed(new Set());
    window.addEventListener('prism:hide-secrets', hide);
    return () => window.removeEventListener('prism:hide-secrets', hide);
  }, []);

  useEffect(() => {
    if (vault.status !== 'unlocked') {
      setRecipes(seedRecipes);
      return;
    }
    vault.loadRecords<Recipe>('recipes').then((stored) => {
      const ids = new Set(stored.map((recipe) => recipe.id));
      setRecipes([...stored, ...seedRecipes.filter((recipe) => !ids.has(recipe.id))]);
    }).catch((reason) => setFormError(reason instanceof Error ? reason.message : '配方读取失败'));
  }, [vault.status]);

  const addRecipe = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError('');
    if (vault.status !== 'unlocked') {
      setFormError('请先创建或解锁本机保险库，再保存配方。');
      return;
    }
    const data = new FormData(event.currentTarget);
    const recipe = { id: `r-${Date.now()}`, title: String(data.get('title')), profile: String(data.get('profile')).toUpperCase(), moodboard: String(data.get('moodboard')).toUpperCase(), ratio: String(data.get('ratio')), note: String(data.get('note')), images: 0, swatch: 'recipe-one' };
    try {
      await vault.saveRecord('recipes', recipe);
      setRecipes((current) => [recipe, ...current]);
      setDialog(false);
    } catch (reason) {
      setFormError(reason instanceof Error ? reason.message : '配方保存失败');
    }
  };

  return (
    <div className="studio-page recipe-page">
      <SectionHead eyebrow="FORMULA LAB" number="05" title="搭配配方" description="用成片观察 Profile 与 Moodboard 相遇后的化学反应。" actions={<Button className="add-button" onClick={() => setDialog(true)}><Plus /> 新建配方</Button>} />
      {vault.status !== 'unlocked' && <div className="vault-gate"><LockKeyhole /><p><strong>当前展示的是安全演示配方</strong><span>真实组合会在解锁后加密保存在本机。</span></p></div>}
      <div className="recipe-summary"><div><span>已验证配方</span><strong>{recipes.length}</strong></div><div><span>本月测试</span><strong>42</strong></div><p><Sparkles /> 先看结果，再决定要不要解锁密钥。</p></div>
      <div className="recipe-grid">
        {visible.map((recipe, index) => {
          const open = revealed.has(recipe.id);
          return (
            <article className="recipe-card" key={recipe.id}>
              <div className={`recipe-collage ${recipe.swatch}`}><span>0{index + 1}</span><small><ImageIcon /> {recipe.images}</small><i /><i /><i /><i /></div>
              <div className="recipe-body"><div className="recipe-title"><div><p className="eyebrow">FORMULA / {recipe.ratio}</p><h2>{recipe.title}</h2></div><button onClick={() => setRevealed((current) => { const next = new Set(current); open ? next.delete(recipe.id) : next.add(recipe.id); return next; })} type="button">{open ? <EyeOff /> : <Eye />}</button></div>
                <div className="formula-line"><div><span>PROFILE</span><code>{recipe.profile.slice(0, 3)}{open ? recipe.profile.slice(3) : '••••'}</code></div><b>×</b><div><span>MOODBOARD</span><code>{recipe.moodboard.slice(0, 3)}{open ? recipe.moodboard.slice(3) : '••••'}</code></div></div>
                <p className="recipe-note">{recipe.note}</p><button className="text-link" type="button">打开配方记录 <ArrowRight /></button>
              </div>
            </article>
          );
        })}
      </div>
      <Dialog onOpenChange={setDialog} open={dialog}><DialogContent className="asset-dialog"><DialogHeader><DialogTitle>新建搭配配方</DialogTitle><DialogDescription>先记录组合，例图可以稍后持续补充。</DialogDescription></DialogHeader><form className="editor-form" id="recipe-form" onSubmit={addRecipe}><label><span>配方名称</span><Input name="title" required /></label><label><span>画幅</span><select defaultValue="3:4" name="ratio"><option>9:16</option><option>16:9</option><option>3:4</option><option>1:1</option></select></label><label><span>Profile（7 位）</span><Input maxLength={7} minLength={7} name="profile" required /></label><label><span>Moodboard（7 位）</span><Input maxLength={7} minLength={7} name="moodboard" required /></label><label className="wide-field"><span>私人备注</span><textarea name="note" /></label></form>{formError && <p className="dialog-error"><CircleAlert /> {formError}</p>}<DialogFooter><Button onClick={() => setDialog(false)} variant="ghost">取消</Button><Button form="recipe-form" type="submit">保存配方</Button></DialogFooter></DialogContent></Dialog>
    </div>
  );
}

type GalleryImage = { id: string; name: string; url: string; collection: string };

export function GalleryPanel({ onOpenCollage }: { onOpenCollage: () => void }) {
  const vault = useVault();
  const gallerySeeds = [{ id: 'daily', name: '每日刷图' }, { id: 'favorites', name: '待复刻' }, { id: 'reference', name: '材质参考' }];
  const [collections, setCollections] = useState(gallerySeeds);
  const [active, setActive] = useState('daily');
  const [images, setImages] = useState<GalleryImage[]>([]);
  const [dialog, setDialog] = useState(false);
  const [preview, setPreview] = useState<GalleryImage | null>(null);
  const [error, setError] = useState('');
  const [refreshTick, setRefreshTick] = useState(0);
  const visible = images.filter((image) => image.collection === active);

  useEffect(() => {
    const refresh = () => setRefreshTick((value) => value + 1);
    window.addEventListener('prism:gallery-refresh', refresh);
    return () => window.removeEventListener('prism:gallery-refresh', refresh);
  }, []);

  useEffect(() => {
    if (vault.status !== 'unlocked') {
      setCollections(gallerySeeds);
      setImages([]);
      return;
    }
    vault.loadRecords<{ id: string; name: string }>('gallery-collections').then(async (storedCollections) => {
      const merged = [...gallerySeeds, ...storedCollections.filter((collection) => !gallerySeeds.some((seed) => seed.id === collection.id))];
      const loaded = (await Promise.all(merged.map(async (collection) => {
        const blobs = await vault.loadBlobs(`gallery:${collection.id}`);
        return blobs.map((entry) => ({ id: entry.id, name: entry.name, url: URL.createObjectURL(entry.blob), collection: collection.id }));
      }))).flat();
      setCollections(merged);
      setImages(loaded);
    }).catch((reason) => setError(reason instanceof Error ? reason.message : '图库读取失败'));
  }, [refreshTick, vault.status]);

  const upload = async (files: FileList | null) => {
    if (!files) return;
    setError('');
    if (vault.status !== 'unlocked') {
      setError('请先创建或解锁本机保险库，再上传图片。');
      return;
    }
    try {
      const next: GalleryImage[] = [];
      for (const file of Array.from(files)) {
        const id = await vault.saveBlob(`gallery:${active}`, file, file.name);
        next.push({ id, name: file.name, url: URL.createObjectURL(file), collection: active });
      }
      setImages((current) => [...next, ...current]);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '图片保存失败');
    }
  };
  const addCollection = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    if (vault.status !== 'unlocked') {
      setError('请先创建或解锁本机保险库，再新建图库。');
      return;
    }
    const name = String(new FormData(event.currentTarget).get('name') || '').trim();
    if (!name) return;
    const id = `gallery-${Date.now()}`;
    try {
      await vault.saveRecord('gallery-collections', { id, name });
      setCollections((current) => [...current, { id, name }]);
      setActive(id);
      setDialog(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '图库创建失败');
    }
  };
  const removeCollection = async (id: string) => {
    setImages((current) => current.map((image) => image.collection === id ? { ...image, collection: 'daily' } : image));
    setCollections((current) => current.filter((collection) => collection.id !== id));
    setActive('daily');
    if (vault.status === 'unlocked') {
      const entries = await vault.loadBlobs(`gallery:${id}`).catch(() => []);
      for (const entry of entries) await vault.saveBlob('gallery:daily', entry.blob, entry.name, entry.id).catch(() => undefined);
      await vault.deleteRecord(id).catch(() => undefined);
    }
  };

  return (
    <div className="studio-page gallery-page">
      <SectionHead eyebrow="IMAGE ARCHIVE" number="06" title="图片收纳" description="每天刷到的图、待复刻的方向和成片，按你的方式自由归档。" actions={<><Button onClick={() => setDialog(true)} variant="outline"><FolderPlus /> 新建图库</Button><label className="button-file"><Upload /> 上传图片<input accept="image/*" multiple onChange={(event) => upload(event.target.files)} type="file" /></label></>} />
      {vault.status !== 'unlocked' && <div className="vault-gate"><LockKeyhole /><p><strong>图库正在安全锁定</strong><span>先创建或解锁本机保险库，才能把图片加密写入此设备。</span></p></div>}
      {error && <p className="error-banner"><CircleAlert /> {error}</p>}
      <div className="gallery-layout"><aside className="gallery-libraries"><p className="eyebrow">YOUR LIBRARIES</p>{collections.map((collection, index) => <button className={active === collection.id ? 'is-active' : ''} key={collection.id} onClick={() => setActive(collection.id)} type="button"><span><i>0{index + 1}</i>{collection.name}</span><small>{images.filter((image) => image.collection === collection.id).length}</small>{collections.length > 1 && active === collection.id && <Trash2 onClick={(event) => { event.stopPropagation(); removeCollection(collection.id); }} />}</button>)}<p className="library-hint">删除图库不会删除图片，内容会自动移入“每日刷图”。</p></aside><section className="gallery-surface"><div className="gallery-surface-head"><div><p className="eyebrow">CURRENT LIBRARY</p><h2>{collections.find((collection) => collection.id === active)?.name}</h2></div><span>{visible.length} IMAGES</span></div>
        {visible.length ? <div className="masonry-grid">{visible.map((image, index) => <button className={`gallery-image gallery-size-${(index % 3) + 1}`} key={image.id} onClick={() => setPreview(image)} type="button"><img alt={image.name} src={image.url} /><span><Maximize2 />{image.name}</span></button>)}</div> : <div className="demo-gallery"><div className="demo-art demo-art-a"><span>01</span></div><div className="demo-art demo-art-b"><span>02</span></div><div className="demo-art demo-art-c"><span>03</span></div><label className="gallery-drop"><Upload /><strong>把今天的图放进来</strong><span>支持批量选择；所有图片只留在本机</span><input accept="image/*" multiple onChange={(event) => upload(event.target.files)} type="file" /></label></div>}
        <div className="gallery-footer"><p><ShieldCheck /> 此图库不会公开，也不会上传到 PRISM 的服务器。</p><Button onClick={onOpenCollage} variant="outline"><Grid3X3 /> 把选中的图送去拼贴</Button></div></section></div>
      <Dialog onOpenChange={setDialog} open={dialog}><DialogContent><DialogHeader><DialogTitle>新建图片库</DialogTitle><DialogDescription>用任何你喜欢的名称组织图片。</DialogDescription></DialogHeader><form className="single-form" id="gallery-form" onSubmit={addCollection}><label><span>图库名称</span><Input name="name" placeholder="例如：2026 秋冬灵感" required /></label></form>{error && <p className="dialog-error"><CircleAlert /> {error}</p>}<DialogFooter><Button onClick={() => setDialog(false)} variant="ghost">取消</Button><Button form="gallery-form" type="submit">创建图库</Button></DialogFooter></DialogContent></Dialog>
      <Dialog onOpenChange={(open) => !open && setPreview(null)} open={Boolean(preview)}><DialogContent className="image-preview-dialog">{preview && <><DialogHeader><DialogTitle>{preview.name}</DialogTitle></DialogHeader><img alt={preview.name} src={preview.url} /></>}</DialogContent></Dialog>
    </div>
  );
}

type WatermarkLayerState = { id: string; file: File; url: string; opacity: number; position: WatermarkPosition; scale: number };
const positionLabels: Record<WatermarkPosition, string> = { full: '全屏覆盖', 'top-left': '左上', top: '上方居中', 'top-right': '右上', left: '左侧居中', center: '正中央', right: '右侧居中', 'bottom-left': '左下', bottom: '下方居中', 'bottom-right': '右下' };

export function WatermarkPanel({ onOpenCollage }: { onOpenCollage: () => void }) {
  const [sourceFiles, setSourceFiles] = useState<File[]>([]);
  const [layers, setLayers] = useState<WatermarkLayerState[]>([]);
  const [outputs, setOutputs] = useState<ProcessedImage[]>([]);
  const [rejected, setRejected] = useState<Set<string>>(new Set());
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');

  const chooseSources = (files: FileList | null) => {
    if (!files) return;
    const selected = Array.from(files).slice(0, 200);
    setSourceFiles(selected);
    setOutputs([]);
    setRejected(new Set());
  };
  const addLayer = (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    setLayers((current) => [...current, { id: `layer-${Date.now()}`, file, url: URL.createObjectURL(file), opacity: 1, position: 'full', scale: 0.3 }]);
  };
  const updateLayer = (id: string, patch: Partial<WatermarkLayerState>) => setLayers((current) => current.map((layer) => layer.id === id ? { ...layer, ...patch } : layer));

  const run = async (onlyFiles = sourceFiles) => {
    if (!onlyFiles.length || !layers.length || processing) return;
    setProcessing(true);
    setError('');
    setProgress(0);
    if (onlyFiles === sourceFiles) setOutputs([]);
    try {
      const layerInput: WatermarkLayerInput[] = layers.map(({ file, opacity, position, scale }) => ({ file, opacity, position, scale }));
      const fresh: ProcessedImage[] = [];
      await applyWatermarks(onlyFiles, layerInput, (done, total) => setProgress(Math.round((done / total) * 100)), (item) => {
        fresh.push(item);
        setOutputs((current) => onlyFiles === sourceFiles ? [...current, item] : [...current.filter((output) => output.sourceName !== item.sourceName), item]);
      });
      setRejected(new Set());
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '水印处理失败');
    } finally {
      setProcessing(false);
    }
  };

  const rerunRejected = () => {
    const names = new Set(outputs.filter((output) => rejected.has(output.id)).map((output) => output.sourceName));
    run(sourceFiles.filter((file) => names.has(file.name)));
  };
  const sendQualified = () => {
    const accepted = outputs.filter((output) => !rejected.has(output.id));
    window.dispatchEvent(new CustomEvent('prism:send-to-collage', { detail: asFiles(accepted) }));
    onOpenCollage();
  };

  return (
    <div className="studio-page pipeline-page">
      <SectionHead eyebrow="WATERMARK PIPELINE" number="07" title="水印工坊" description="多层水印按顺序逐张合并；合格与重打两条队列互不干扰。" />
      <div className="pipeline-steps"><div className={sourceFiles.length ? 'is-done' : 'is-current'}><i>01</i><span>上传原图</span><small>最多 200 张</small></div><ArrowRight /><div className={layers.length ? 'is-done' : sourceFiles.length ? 'is-current' : ''}><i>02</i><span>设置水印层</span><small>由下至上叠加</small></div><ArrowRight /><div className={processing ? 'is-current' : outputs.length ? 'is-done' : ''}><i>03</i><span>检查与分流</span><small>合格 / 重新打</small></div></div>
      <div className="watermark-workspace"><section className="config-panel"><div className="panel-heading"><div><p className="eyebrow">SOURCE / 01</p><h2>原图批次</h2></div><Badge variant="outline">{sourceFiles.length} / 200</Badge></div><label className="large-drop"><Upload /><strong>{sourceFiles.length ? `已载入 ${sourceFiles.length} 张图片` : '选择要打水印的图片'}</strong><span>支持 PNG / JPG / WEBP；批量上限 200 张</span><input accept="image/*" multiple onChange={(event) => chooseSources(event.target.files)} type="file" /></label>{sourceFiles.length > 0 && <div className="file-strip">{sourceFiles.slice(0, 6).map((file) => <div key={`${file.name}-${file.lastModified}`}><img alt="" src={URL.createObjectURL(file)} /><span>{file.name}</span></div>)}{sourceFiles.length > 6 && <strong>+{sourceFiles.length - 6}</strong>}</div>}</section>
        <section className="config-panel layer-panel"><div className="panel-heading"><div><p className="eyebrow">LAYERS / 02</p><h2>水印层</h2></div><label className="mini-file"><Plus /> 添加一层<input accept="image/*" onChange={(event) => addLayer(event.target.files)} type="file" /></label></div>{layers.length === 0 ? <div className="layer-empty"><Layers3 /><p>还没有水印层</p><span>按实际叠加顺序上传；第 1 层最先与原图合并。</span></div> : <div className="layer-stack">{layers.map((layer, index) => <article key={layer.id}><div className="layer-thumb"><img alt="" src={layer.url} /><span>{String(index + 1).padStart(2, '0')}</span></div><div className="layer-fields"><strong>{layer.file.name}</strong><label><span>位置</span><select onChange={(event) => updateLayer(layer.id, { position: event.target.value as WatermarkPosition })} value={layer.position}>{Object.entries(positionLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>{layer.position !== 'full' && <label><span>大小 {Math.round(layer.scale * 100)}%</span><input max="0.9" min="0.08" onChange={(event) => updateLayer(layer.id, { scale: Number(event.target.value) })} step="0.01" type="range" value={layer.scale} /></label>}<label><span>透明度 {Math.round(layer.opacity * 100)}%</span><input max="1" min="0.05" onChange={(event) => updateLayer(layer.id, { opacity: Number(event.target.value) })} step="0.01" type="range" value={layer.opacity} /></label></div><button aria-label="删除水印层" onClick={() => setLayers((current) => current.filter((item) => item.id !== layer.id))} type="button"><X /></button></article>)}</div>}<div className="position-note"><CircleAlert /><p><strong>非全屏水印只需在这里确认一次位置。</strong>重打时会沿用设置，除非你主动调整。</p></div></section>
      </div>
      <section className="run-bar"><div><WandSparkles /><p><strong>{processing ? '正在后台逐张合并…' : '设置确认后即可启动'}</strong><span>页面内切换到拼图区不会中断这条队列。</span></p></div>{processing ? <Progress className="run-progress" value={progress}><ProgressLabel>处理中</ProgressLabel><ProgressValue>{() => `${progress}%`}</ProgressValue></Progress> : <Button disabled={!sourceFiles.length || !layers.length} onClick={() => run()}><Stamp /> 开始打水印</Button>}</section>
      {error && <p className="error-banner"><CircleAlert /> {error}</p>}
      {(outputs.length > 0 || processing) && <section className="result-zone"><div className="result-head"><div><p className="eyebrow">WAITING AREA / 03</p><h2>等待检查</h2></div><div><Badge className="success-badge">{outputs.length - rejected.size} 合格</Badge><Badge variant="destructive">{rejected.size} 待重打</Badge></div></div><div className="result-grid">{outputs.map((output, index) => { const bad = rejected.has(output.id); return <article className={bad ? 'is-rejected' : ''} key={output.id}><a href={output.url} target="_blank"><img alt={output.name} src={output.url} /><Maximize2 /></a><div><span>{String(index + 1).padStart(3, '0')}</span><p>{output.name}</p><button onClick={() => setRejected((current) => { const next = new Set(current); bad ? next.delete(output.id) : next.add(output.id); return next; })} type="button">{bad ? <RefreshCw /> : <Check />} {bad ? '等待重打' : '标记不合格'}</button></div></article>; })}</div><div className="result-actions"><Button disabled={!rejected.size || processing} onClick={rerunRejected} variant="outline"><RefreshCw /> 重打已选 {rejected.size} 张</Button><Button disabled={!outputs.length || outputs.length === rejected.size} onClick={sendQualified}><Grid3X3 /> 合格图片送往拼图区</Button></div></section>}
    </div>
  );
}

const ratioPresets = [{ label: '9:16', w: 9, h: 16 }, { label: '16:9', w: 16, h: 9 }, { label: '3:4', w: 3, h: 4 }, { label: '1:1', w: 1, h: 1 }];
const gridPresets = [{ label: '四宫格', columns: 2, rows: 2 }, { label: '九宫格', columns: 3, rows: 3 }, { label: '16 宫格', columns: 4, rows: 4 }, { label: '25 宫格', columns: 5, rows: 5 }];

export function CollagePanel() {
  const vault = useVault();
  const [files, setFiles] = useState<File[]>([]);
  const [ratio, setRatio] = useState(ratioPresets[0]);
  const [grid, setGrid] = useState(gridPresets[1]);
  const [customRatio, setCustomRatio] = useState(false);
  const [customGrid, setCustomGrid] = useState(false);
  const [numberImages, setNumberImages] = useState(true);
  const [startNumber, setStartNumber] = useState(1);
  const [format, setFormat] = useState<'image/png' | 'image/jpeg'>('image/jpeg');
  const [outputs, setOutputs] = useState<ProcessedImage[]>([]);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const ratioW = useRef<HTMLInputElement>(null);
  const ratioH = useRef<HTMLInputElement>(null);
  const gridC = useRef<HTMLInputElement>(null);
  const gridR = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const receive = (event: Event) => {
      const detail = (event as CustomEvent<File[]>).detail;
      setFiles((current) => [...current, ...detail].slice(0, 1000));
    };
    window.addEventListener('prism:send-to-collage', receive);
    return () => window.removeEventListener('prism:send-to-collage', receive);
  }, []);

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    setFiles((current) => [...current, ...Array.from(list)].slice(0, 1000));
    setOutputs([]);
  };
  const boardCount = files.length ? Math.ceil(files.length / (grid.columns * grid.rows)) : 0;
  const today = new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'numeric', day: 'numeric' }).format(new Date()).replaceAll('/', '.');

  const generate = async () => {
    if (!files.length || processing) return;
    setProcessing(true);
    setProgress(0);
    setError('');
    setOutputs([]);
    const nextRatio = customRatio ? { label: '自定义', w: Math.max(1, Number(ratioW.current?.value || 1)), h: Math.max(1, Number(ratioH.current?.value || 1)) } : ratio;
    const nextGrid = customGrid ? { label: '自定义', columns: Math.max(1, Math.min(20, Number(gridC.current?.value || 1))), rows: Math.max(1, Math.min(20, Number(gridR.current?.value || 1))) } : grid;
    if (customRatio) setRatio(nextRatio);
    if (customGrid) setGrid(nextGrid);
    try {
      const results = await createCollages(files, { ratioWidth: nextRatio.w, ratioHeight: nextRatio.h, columns: nextGrid.columns, rows: nextGrid.rows, numberImages, startNumber, format }, (done, total) => setProgress(Math.round((done / total) * 100)));
      setOutputs(results);
      if (vault.status === 'unlocked') {
        const collectionId = `collage-${today.replaceAll('.', '-')}`;
        await vault.saveRecord('gallery-collections', { id: collectionId, name: `${today} 拼图` });
        for (const result of results) await vault.saveBlob(`gallery:${collectionId}`, result.blob, result.name, result.id);
        window.dispatchEvent(new CustomEvent('prism:gallery-refresh'));
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '拼图处理失败');
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="studio-page collage-page">
      <SectionHead eyebrow="COLLAGE ENGINE" number="08" title="拼图工坊" description="最多 1000 张批量分板；尺寸、宫格与编号规则全部由你决定。" />
      <div className="collage-layout"><section className="collage-controls"><div className="control-section"><div className="control-title"><span>01</span><div><p className="eyebrow">SOURCE IMAGES</p><h2>选择图片</h2></div><Badge variant="outline">{files.length} / 1000</Badge></div><label className="collage-drop"><Upload /><strong>{files.length ? `已进入队列 ${files.length} 张` : '批量上传或从水印区送入'}</strong><span>未占满的最后一板会自动保留实际图片，空格不编号</span><input accept="image/*" multiple onChange={(event) => addFiles(event.target.files)} type="file" /></label>{files.length > 0 && <button className="clear-files" onClick={() => { setFiles([]); setOutputs([]); }} type="button"><Trash2 /> 清空这一批</button>}</div>
        <div className="control-section"><div className="control-title"><span>02</span><div><p className="eyebrow">CANVAS RATIO</p><h2>拼图尺寸</h2></div></div><div className="preset-grid ratio-grid">{ratioPresets.map((item) => <button className={!customRatio && ratio.label === item.label ? 'is-active' : ''} key={item.label} onClick={() => { setRatio(item); setCustomRatio(false); }} type="button"><i style={{ aspectRatio: `${item.w}/${item.h}` }} /><span>{item.label}</span></button>)}<button className={customRatio ? 'is-active' : ''} onClick={() => setCustomRatio(true)} type="button"><i className="custom-ratio-icon" /><span>自定义</span></button></div>{customRatio && <div className="custom-fields"><label><span>宽</span><Input defaultValue="4" min="1" ref={ratioW} type="number" /></label><b>:</b><label><span>高</span><Input defaultValue="5" min="1" ref={ratioH} type="number" /></label></div>}</div>
        <div className="control-section"><div className="control-title"><span>03</span><div><p className="eyebrow">GRID SYSTEM</p><h2>宫格数量</h2></div></div><div className="grid-preset-row">{gridPresets.map((item) => <button className={!customGrid && grid.label === item.label ? 'is-active' : ''} key={item.label} onClick={() => { setGrid(item); setCustomGrid(false); }} type="button"><Grid3X3 /><span>{item.label}</span></button>)}<button className={customGrid ? 'is-active' : ''} onClick={() => setCustomGrid(true)} type="button"><Plus /><span>自定义</span></button></div>{customGrid && <div className="custom-fields"><label><span>列数</span><Input defaultValue="5" max="20" min="1" ref={gridC} type="number" /></label><b>×</b><label><span>行数</span><Input defaultValue="5" max="20" min="1" ref={gridR} type="number" /></label></div>}</div>
        <div className="control-section numbering-section"><div className="control-title"><span>04</span><div><p className="eyebrow">NUMBERING</p><h2>编号与格式</h2></div><button aria-pressed={numberImages} className={`switch-control ${numberImages ? 'is-on' : ''}`} onClick={() => setNumberImages((value) => !value)} type="button"><i /></button></div><div className="number-options"><label><span>起始序号</span><Input disabled={!numberImages} min="0" onChange={(event) => setStartNumber(Number(event.target.value))} type="number" value={startNumber} /></label><label><span>输出格式</span><select onChange={(event) => setFormat(event.target.value as 'image/png' | 'image/jpeg')} value={format}><option value="image/jpeg">JPG · 较小</option><option value="image/png">PNG · 无损</option></select></label></div><p><CircleAlert /> 序号大小会随格子自动计算，确保看得见但不抢画面。</p></div></section>
        <aside className="collage-preview"><div className="preview-sticky"><div className="preview-heading"><p className="eyebrow">LIVE SPEC</p><span>{ratio.w}:{ratio.h}</span></div><div className="board-preview" style={{ aspectRatio: `${ratio.w}/${ratio.h}`, gridTemplateColumns: `repeat(${Math.min(grid.columns, 5)}, 1fr)` }}>{Array.from({ length: Math.min(grid.columns * grid.rows, 25) }, (_, index) => <i className={index < Math.min(files.length || 7, 25) ? `cell-${(index % 3) + 1}` : ''} key={index}>{numberImages && index < Math.min(files.length || 7, 25) && <span>{String(startNumber + index).padStart(3, '0')}</span>}</i>)}</div><div className="spec-list"><div><span>单板容量</span><strong>{grid.columns * grid.rows} 张</strong></div><div><span>预计生成</span><strong>{boardCount} 张拼图</strong></div><div><span>自动收纳</span><strong>{vault.status === 'unlocked' ? `${today} 拼图` : '解锁后启用'}</strong></div></div>{processing ? <Progress className="collage-progress" value={progress}><ProgressLabel>正在拼贴</ProgressLabel><ProgressValue>{() => `${progress}%`}</ProgressValue></Progress> : <Button className="generate-button" disabled={!files.length} onClick={generate}><WandSparkles /> 开始批量拼图</Button>}<p className="local-note"><ShieldCheck /> 全程在本机处理，不上传原图。{vault.status !== 'unlocked' && ' 当前结果请手动下载。'}</p></div></aside></div>
      {error && <p className="error-banner"><CircleAlert /> {error}</p>}
      {outputs.length > 0 && <section className="collage-results"><div className="result-head"><div><p className="eyebrow">GENERATED TODAY</p><h2>{today} 拼图</h2></div><Badge className="success-badge">已生成 {outputs.length} 张</Badge></div><div className="collage-result-grid">{outputs.map((output) => <article key={output.id}><img alt={output.name} src={output.url} /><div><span>{output.name}</span><a download={output.name} href={output.url}><Download /> 下载</a></div></article>)}</div></section>}
    </div>
  );
}

export function SecurityPanel() {
  const vault = useVault();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [backupDone, setBackupDone] = useState(false);
  const [localError, setLocalError] = useState('');

  const submitPassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setLocalError('');
    try {
      if (vault.status === 'uninitialized') await vault.setup(password);
      else await vault.unlock(password);
      setPassword('');
    } catch (reason) {
      setLocalError(reason instanceof Error ? reason.message : '保险库操作失败');
    } finally {
      setBusy(false);
    }
  };

  const exportBackup = async () => {
    setLocalError('');
    const payload = await vault.exportBackup();
    const url = URL.createObjectURL(payload);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `PRISM-backup-${new Date().toISOString().slice(0, 10)}.prism`;
    anchor.click();
    URL.revokeObjectURL(url);
    setBackupDone(true);
  };
  const importBackup = async (file: File | undefined) => {
    if (!file) return;
    setLocalError('');
    try {
      await vault.importBackup(file);
      setBackupDone(false);
    } catch (reason) {
      setLocalError(reason instanceof Error ? reason.message : '备份导入失败');
    }
  };
  return (
    <div className="studio-page security-page"><SectionHead eyebrow="LOCAL SECURITY" number="09" title="安全与备份" description="PRISM 没有账号中心、云端数据库或行为分析；你的浏览器就是保险库。" />
      <section className="security-hero"><div className="security-orbit"><ShieldCheck /><i /><i /></div><div><Badge className="success-badge">ZERO-COLLECTION</Badge><h2>没有任何数据需要交给我们</h2><p>提示词、Profile、Moodboard、例图与处理结果全部留在设备本地。敏感字段默认锁定，只有主动点击才短暂显示。</p></div><div className="security-score"><strong>LOCAL</strong><span>DATA MODE</span></div></section>
      <div className="security-grid"><article><div className="security-card-title"><LockKeyhole /><div><p className="eyebrow">VAULT LOCK</p><h3>本机保险库密码</h3></div><Badge variant={vault.status === 'unlocked' ? 'default' : 'outline'}>{vault.status === 'unlocked' ? '本次会话已解锁' : vault.status === 'uninitialized' ? '尚未创建' : '已锁定'}</Badge></div><p>密码只用于在本机派生 AES-256 加密密钥，不会保存明文，也不会发送到网络。</p>{vault.status === 'unlocked' ? <Button onClick={vault.lock}><LockKeyhole />立即锁定</Button> : <form className="vault-password-form" onSubmit={submitPassword}><label><span>{vault.status === 'uninitialized' ? '创建保险库密码（至少 8 位）' : '保险库密码'}</span><Input minLength={8} onChange={(event) => setPassword(event.target.value)} placeholder="输入本机密码" required type="password" value={password} /></label><Button disabled={busy || vault.status === 'loading'} type="submit"><KeyRound />{busy ? '正在派生密钥…' : vault.status === 'uninitialized' ? '创建并解锁' : '解锁本次会话'}</Button></form>}{(localError || vault.error) && <span className="security-error"><CircleAlert /> {localError || vault.error}</span>}</article>
        <article><div className="security-card-title"><FileArchive /><div><p className="eyebrow">ENCRYPTED BACKUP</p><h3>离线备份</h3></div></div><p>定期导出加密备份文件，换设备时再手动导入。PRISM 不会自动同步。</p><div className="backup-actions"><Button disabled={vault.status === 'uninitialized'} onClick={exportBackup} variant="outline"><Download /> 导出备份</Button><label className="mini-file"><Upload /> 导入备份<input accept="application/json,.prism" onChange={(event) => importBackup(event.target.files?.[0])} type="file" /></label></div>{backupDone && <span className="success-line"><CheckCircle2 /> 加密备份文件已生成</span>}</article>
        <article><div className="security-card-title"><ShieldCheck /><div><p className="eyebrow">PRIVACY DEFAULTS</p><h3>默认防泄露规则</h3></div></div><ul><li><Check /> 提示词整段默认隐藏</li><li><Check /> 7 位代码只展示前三位</li><li><Check /> 离开页面时自动重新遮蔽</li><li><Check /> 不加载广告、分析或第三方脚本</li></ul></article></div>
      <section className="threat-note"><CircleAlert /><div><h3>关于“后台运行”</h3><p>同一页面内切换功能不会中断图片队列；刷新或彻底关闭浏览器会停止当前批次，已经写入图库的成品仍会保留。纯本地网页无法在浏览器关掉后继续运算——如果你需要真正的关窗后台处理，下一阶段应封装为本地桌面版。</p></div></section>
    </div>
  );
}
