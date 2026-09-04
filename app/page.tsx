'use client';

import {
  Aperture,
  Blocks,
  ChevronLeft,
  CircleDot,
  Droplets,
  Eye,
  Folder,
  Grid3X3,
  Image as ImageIcon,
  KeyRound,
  Library,
  LockKeyhole,
  Menu,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Stamp,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  CollagePanel,
  GalleryPanel,
  LibraryPanel,
  RecipePanel,
  SecurityPanel,
  WatermarkPanel,
  WatermarkLibraryPanel,
} from '@/components/prism/studio-panels';
import { useVault } from '@/components/prism/vault-provider';

type ViewId = 'overview' | 'prompts' | 'profiles' | 'moodboards' | 'watermarks' | 'recipes' | 'gallery' | 'watermark' | 'collage' | 'security';
type NavEntry = { id: ViewId; label: string; icon: LucideIcon; count?: number };

const primaryNav: NavEntry[] = [
  { id: 'overview' as const, label: '资产总览', icon: Aperture },
  { id: 'prompts' as const, label: '提示词库', icon: Library, count: 148 },
  { id: 'profiles' as const, label: 'Profile 库', icon: KeyRound, count: 36 },
  { id: 'moodboards' as const, label: 'Moodboard 库', icon: ImageIcon, count: 24 },
  { id: 'watermarks' as const, label: '水印库', icon: Droplets },
  { id: 'recipes' as const, label: '搭配配方', icon: Blocks, count: 18 },
];

const pipelineNav: NavEntry[] = [
  { id: 'gallery' as const, label: '图片收纳', icon: Folder },
  { id: 'watermark' as const, label: '水印工坊', icon: Stamp },
  { id: 'collage' as const, label: '拼图工坊', icon: Grid3X3 },
];

const assets = [
  {
    id: '01',
    title: 'Chrome Nocturne',
    type: '提示词',
    secret: 'industrial fashion portrait, liquid chrome, violet rim light',
    source: '自创 · 私有',
    author: 'Studio 09',
    note: '冷银高光很稳；人物近景建议降低 stylize。',
    swatch: 'swatch-a',
    images: 4,
    tag: '人像 / 冷硬',
  },
  {
    id: '02',
    title: 'Verdant Signal',
    type: 'Profile',
    secret: 'QVRN7PX',
    source: '付费购入',
    author: 'Neo Atelier',
    note: '紫底时会增加荧光绿边缘，适合产品视觉。',
    swatch: 'swatch-b',
    images: 3,
    tag: '产品 / 荧光',
  },
  {
    id: '03',
    title: 'Soft Brutalist',
    type: 'Moodboard',
    secret: 'MBX4L2A',
    source: '朋友赠送',
    author: 'Rin',
    note: '材质细腻、留白多；与高对比 Profile 搭配更好。',
    swatch: 'swatch-c',
    images: 5,
    tag: '静物 / 材质',
  },
];

function NavItem({
  item,
  collapsed,
  active,
  onSelect,
}: {
  item: NavEntry;
  collapsed: boolean;
  active: boolean;
  onSelect: (id: ViewId) => void;
}) {
  const Icon = item.icon;
  return (
    <button aria-current={active ? 'page' : undefined} className={`nav-item ${active ? 'is-active' : ''}`} onClick={() => onSelect(item.id)} type="button">
      <Icon aria-hidden="true" />
      {!collapsed && <span>{item.label}</span>}
      {!collapsed && item.count !== undefined && <small>{item.count}</small>}
    </button>
  );
}

export default function Home() {
  const vault = useVault();
  const [collapsed, setCollapsed] = useState(false);
  const [revealed, setRevealed] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<ViewId>('overview');
  const [overviewFilter, setOverviewFilter] = useState<'全部' | '提示词' | 'Profile' | 'Moodboard'>('全部');
  const [globalQuery, setGlobalQuery] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setRevealed(null);
    window.dispatchEvent(new CustomEvent('prism:hide-secrets'));
  }, [activeView]);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLocaleLowerCase() === 'k') {
        event.preventDefault();
        searchRef.current?.focus();
      }
    };
    const hide = () => setRevealed(null);
    window.addEventListener('keydown', handleKey);
    window.addEventListener('blur', hide);
    return () => {
      window.removeEventListener('keydown', handleKey);
      window.removeEventListener('blur', hide);
    };
  }, []);

  const overviewAssets = assets.filter((asset) => {
    const query = globalQuery.trim().toLocaleLowerCase();
    const typeMatches = overviewFilter === '全部' || asset.type === overviewFilter;
    return typeMatches && (!query || [asset.title, asset.type, asset.source, asset.author, asset.note, asset.tag].join(' ').toLocaleLowerCase().includes(query));
  });

  return (
    <TooltipProvider>
      <main className={`app-shell ${collapsed ? 'sidebar-collapsed' : ''}`}>
        <aside className="sidebar">
          <div className="brand-row">
            <div className="brand-mark"><CircleDot /></div>
            {!collapsed && (
              <div>
                <strong>PRISM</strong>
                <span>LOCAL VAULT</span>
              </div>
            )}
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    aria-label={collapsed ? '展开侧边栏' : '收起侧边栏'}
                    className="collapse-button"
                    onClick={() => setCollapsed((value) => !value)}
                    size="icon-sm"
                    variant="ghost"
                  />
                }
              >
                {collapsed ? <Menu /> : <ChevronLeft />}
              </TooltipTrigger>
              <TooltipContent side="right">{collapsed ? '展开索引' : '收起索引'}</TooltipContent>
            </Tooltip>
          </div>

          <nav aria-label="资产索引">
            {!collapsed && <p className="nav-label">COLLECTIONS</p>}
            <div className="nav-stack">
              {primaryNav.map((item) => <NavItem active={activeView === item.id} collapsed={collapsed} item={item} key={item.label} onSelect={setActiveView} />)}
            </div>
            {!collapsed && <p className="nav-label pipeline-label">PIPELINE</p>}
            <div className="nav-stack">
              {pipelineNav.map((item) => <NavItem active={activeView === item.id} collapsed={collapsed} item={item} key={item.label} onSelect={setActiveView} />)}
            </div>
          </nav>

          <div className="sidebar-footer">
            <div className="vault-status">
              <ShieldCheck />
              {!collapsed && (
                <div><strong>本地保险库</strong><span>AES-256 · {vault.status === 'unlocked' ? '本次会话已解锁' : vault.status === 'uninitialized' ? '等待初始化' : '已锁定'}</span></div>
              )}
            </div>
            <button className={`nav-item ${activeView === 'security' ? 'is-active' : ''}`} onClick={() => setActiveView('security')} type="button">
              <Settings2 />
              {!collapsed && <span>安全与备份</span>}
            </button>
          </div>
        </aside>

        <section className="workspace">
          <header className="topbar">
            <div className="search-wrap">
              <Search aria-hidden="true" />
              <Input aria-label="全局搜索" onChange={(event) => setGlobalQuery(event.target.value)} placeholder="搜索名称、标签、作者或备注…" ref={searchRef} value={globalQuery} />
              <kbd>⌘ K</kbd>
            </div>
            <div className="topbar-actions">
              <span className="privacy-pill"><LockKeyhole /> 数据从不离开此设备</span>
              <Button className="add-button" onClick={() => setActiveView(vault.status === 'unlocked' ? 'prompts' : 'security')}><Plus /> 新建资产</Button>
            </div>
          </header>

          <div className="content-frame" hidden={activeView !== 'overview'}>
            <section className="editorial-head">
              <div>
                <p className="eyebrow">ASSET INDEX <span>/ 01</span></p>
                <h1>资产总览</h1>
                <p className="intro">把灵感、密钥与成片收进同一套私人视觉系统。</p>
              </div>
              <div className="issue-note">
                <span>SEPTEMBER 04</span>
                <strong>214</strong>
                <small>PRIVATE ASSETS</small>
              </div>
            </section>

            <section className="metric-strip" aria-label="资产统计">
              <div><span>提示词</span><strong>148</strong><small>+12 本周</small></div>
              <div><span>Profiles</span><strong>36</strong><small>7 个库</small></div>
              <div><span>Moodboards</span><strong>24</strong><small>5 个库</small></div>
              <div className="active-job"><span>后台队列</span><strong>02</strong><small><i /> 正在处理</small></div>
            </section>

            <section className="asset-section">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">RECENTLY CURATED</p>
                  <h2>最近整理</h2>
                </div>
                <div className="filter-row">
                  {(['全部', '提示词', 'Profile', 'Moodboard'] as const).map((filter) => <button className={overviewFilter === filter ? 'filter-active' : ''} key={filter} onClick={() => setOverviewFilter(filter)} type="button">{filter}</button>)}
                </div>
              </div>

              <div className="asset-table" role="table" aria-label="最近资产">
                <div className="asset-table-head" role="row">
                  <span>例图 / 名称</span><span>机密内容 / 来源</span><span>私人备注</span><span />
                </div>
                {overviewAssets.map((asset) => {
                  const isRevealed = revealed === asset.id;
                  const displaySecret = asset.type === '提示词'
                    ? asset.secret
                    : `${asset.secret.slice(0, 3)}${isRevealed ? asset.secret.slice(3) : '••••'}`;
                  return (
                    <article className="asset-row" key={asset.id} role="row">
                      <div className="asset-identity">
                        <div className={`asset-visual ${asset.swatch}`}>
                          <span>{asset.id}</span>
                          <small><ImageIcon /> {asset.images}</small>
                        </div>
                        <div>
                          <Badge className="type-badge" variant="outline">{asset.type}</Badge>
                          <h3>{asset.title}</h3>
                          <span className="asset-tag">{asset.tag}</span>
                        </div>
                      </div>
                      <div className="secret-cell">
                        <div className={`secret-value ${asset.type === '提示词' && !isRevealed ? 'prompt-hidden' : ''}`}>
                          <code>{displaySecret}</code>
                          <button
                            aria-label={isRevealed ? '隐藏机密内容' : '显示机密内容'}
                            onClick={() => setRevealed(isRevealed ? null : asset.id)}
                            type="button"
                          ><Eye /></button>
                        </div>
                        <p>{asset.author}<span>·</span>{asset.source}</p>
                      </div>
                      <p className="note-cell">{asset.note}</p>
                      <button aria-label={`打开 ${asset.title}`} className="row-open" onClick={() => setActiveView(asset.type === '提示词' ? 'prompts' : asset.type === 'Profile' ? 'profiles' : 'moodboards')} type="button">↗</button>
                    </article>
                  );
                })}
                {overviewAssets.length === 0 && <div className="overview-empty"><Search /><span>没有匹配的最近资产</span></div>}
              </div>
            </section>

            <section className="pipeline-callout">
              <div className="pipeline-icon"><Sparkles /></div>
              <div><p className="eyebrow">NEXT IN PIPELINE</p><h2>300 张图已进入拼图队列</h2></div>
              <div className="pipeline-meta"><span>9:16</span><span>3 × 3</span><span>编号 001 起</span></div>
              <Button onClick={() => setActiveView('collage')} variant="outline">查看流水线</Button>
            </section>
          </div>
          <div className="content-frame studio-frame" hidden={activeView !== 'prompts'}><LibraryPanel globalQuery={globalQuery} kind="prompt" /></div>
          <div className="content-frame studio-frame" hidden={activeView !== 'profiles'}><LibraryPanel globalQuery={globalQuery} kind="profile" /></div>
          <div className="content-frame studio-frame" hidden={activeView !== 'moodboards'}><LibraryPanel globalQuery={globalQuery} kind="moodboard" /></div>
          <div className="content-frame studio-frame" hidden={activeView !== 'watermarks'}><WatermarkLibraryPanel globalQuery={globalQuery} /></div>
          <div className="content-frame studio-frame" hidden={activeView !== 'recipes'}><RecipePanel globalQuery={globalQuery} /></div>
          <div className="content-frame studio-frame" hidden={activeView !== 'gallery'}><GalleryPanel onOpenCollage={() => setActiveView('collage')} /></div>
          <div className="content-frame studio-frame" hidden={activeView !== 'watermark'}><WatermarkPanel onOpenCollage={() => setActiveView('collage')} /></div>
          <div className="content-frame studio-frame" hidden={activeView !== 'collage'}><CollagePanel /></div>
          <div className="content-frame studio-frame" hidden={activeView !== 'security'}><SecurityPanel /></div>
        </section>
      </main>
    </TooltipProvider>
  );
}
