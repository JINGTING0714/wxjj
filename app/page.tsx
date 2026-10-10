'use client';
import { ImageDownloadDialog } from '@/components/prism/image-download-dialog';
import { ImageEnhancementPanel } from '@/components/prism/image-enhancement-panel';

import {
  Aperture,
  ArrowDown,
  ArrowRight,
  Blocks,
  ChevronLeft,
  CircleDot,
  Droplets,
  Folder,
  Grid3X3,
  Image as ImageIcon,
  KeyRound,
  Library,
  LockKeyhole,
  Menu,
  Settings2,
  ShieldCheck,
  SunMoon,
  Stamp,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
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
import { MobileWorkspaceSheet } from '@/components/prism/mobile-workspace';
import { PngCleanerPanel } from '@/components/prism/png-cleaner-panel';
import { AccountingPanel } from '@/components/prism/accounting-panel';
import { SalesPanel } from '@/components/prism/sales-panel';
import { SiteTools } from '@/components/prism/site-tools';

type ViewId =
  | 'overview'
  | 'prompts'
  | 'profiles'
  | 'moodboards'
  | 'watermarks'
  | 'recipes'
  | 'gallery'
  | 'watermark'
  | 'collage'
  | 'png-cleaner'
  | 'enhancement'
  | 'accounting'
  | 'sales'
  | 'security';
type NavEntry = { id: ViewId; label: string; icon: LucideIcon; count?: number };

type GuideEntry = {
  id: ViewId;
  number: string;
  label: string;
  icon: LucideIcon;
  responsibility: string;
  firstAction: string;
  result: string;
};

const primaryNav: NavEntry[] = [
  { id: 'overview' as const, label: '开始与总览', icon: Aperture },
  { id: 'prompts' as const, label: '提示词库', icon: Library },
  { id: 'profiles' as const, label: 'Profile 库', icon: KeyRound },
  { id: 'moodboards' as const, label: 'Moodboard 库', icon: ImageIcon },
  { id: 'watermarks' as const, label: '水印库', icon: Droplets },
  { id: 'recipes' as const, label: '搭配配方', icon: Blocks },
];

const pipelineNav: NavEntry[] = [
  { id: 'gallery' as const, label: '图片收纳', icon: Folder },
  { id: 'png-cleaner', label: 'PNG 隐私清洗', icon: ShieldCheck },
  { id: 'enhancement', label: '画质增强', icon: Aperture },
  { id: 'watermark' as const, label: '水印工坊', icon: Stamp },
  { id: 'collage' as const, label: '拼图工坊', icon: Grid3X3 },
  { id: 'sales', label: '售图核对', icon: Grid3X3 },
  { id: 'accounting', label: '记账本', icon: Library },
];

type MobileNavGroupId = 'assets' | 'workshop' | 'library' | 'more';

const mobileNavGroups: Array<{
  id: MobileNavGroupId;
  label: string;
  icon: LucideIcon;
  items: NavEntry[];
}> = [
  {
    id: 'assets',
    label: '资产',
    icon: Blocks,
    items: primaryNav.filter((item) =>
      ['prompts', 'profiles', 'moodboards', 'recipes'].includes(item.id),
    ),
  },
  {
    id: 'workshop',
    label: '工坊',
    icon: Stamp,
    items: pipelineNav.filter((item) =>
      ['gallery', 'png-cleaner', 'enhancement', 'watermark', 'collage', 'sales'].includes(
        item.id,
      ),
    ),
  },
  {
    id: 'library',
    label: '记账',
    icon: Library,
    items: [pipelineNav.find((item) => item.id === 'accounting')!],
  },
  {
    id: 'more',
    label: '更多',
    icon: Menu,
    items: [
      primaryNav.find((item) => item.id === 'watermarks')!,
      { id: 'security', label: '安全与备份', icon: ShieldCheck },
    ],
  },
];

const workflowSteps: Array<{
  id: ViewId;
  number: string;
  title: string;
  detail: string;
}> = [
  {
    id: 'security',
    number: '01',
    title: '建立保险库',
    detail: '设置密码和恢复密钥，定期完整备份。',
  },
  {
    id: 'prompts',
    number: '02',
    title: '整理资产',
    detail: '导入提示词、Profile、Moodboard 和水印；看例图、复制使用。',
  },
  {
    id: 'recipes',
    number: '03',
    title: '组合与创作',
    detail: '搭配 Profile / Moodboard，复制参数到 Midjourney 刷图。',
  },
  {
    id: 'gallery',
    number: '04',
    title: '收纳原图',
    detail: '按项目或日期整理成片。',
  },
  {
    id: 'png-cleaner',
    number: '05',
    title: '隐私清洗 · 可选',
    detail: '检查 PNG 附加信息，清洗副本继续送往水印。',
  },
  {
    id: 'watermark',
    number: '06',
    title: '按批打水印',
    detail: '每批独立调整图层，检查成品后送往拼图。',
  },
  {
    id: 'collage',
    number: '07',
    title: '按批拼图',
    detail: '设置单图比例和行列数，生成编号拼图并创建售图场次。',
  },
  {
    id: 'sales',
    number: '08',
    title: '核对与交付',
    detail: '按聊天顺序分配号码，交付后清理已售图，重拼剩图。',
  },
  {
    id: 'accounting',
    number: '09',
    title: '记账与备份',
    detail: '核对收入支出，保存账目并导出完整备份。',
  },
];

const moduleGuide: GuideEntry[] = [
  { id: 'enhancement', number: '14', label: '画质增强', icon: Aperture, responsibility: '在本机去灰雾、增强层次与边缘细节，保留原图画风和尺寸。', firstAction: '导入图片，选择自然保真或调整强度，先看原图与结果对照。', result: '增强结果另存为 PNG，支持逐张或打包下载。' },
  {
    id: 'accounting',
    number: '10',
    label: '记账本',
    icon: Library,
    responsibility:
      '手动记录收入、支出、转账、退款和余额调整，账目与凭证在本地加密保存。',
    firstAction: '确认账户与初始余额，选择账本，然后记一笔。',
    result:
      '按日期、账户、分类和账本查账，查看收支与余额，导入导出或完整备份。',
  },
  {
    id: 'png-cleaner',
    number: '09',
    label: 'PNG 隐私清洗',
    icon: ShieldCheck,
    responsibility:
      '在本机检查 PNG 的文本、EXIF 等附加字段，保留原图并生成清洗副本。',
    firstAction: '导入最多 200 张静态 PNG，查看检查摘要后选择深度或快速清洗。',
    result: '下载干净 PNG，或继续进入图片收纳、水印和拼图工坊。',
  },
  {
    id: 'security',
    number: '00',
    label: '安全与备份',
    icon: ShieldCheck,
    responsibility:
      '创建或解锁只属于当前浏览器的加密保险库，生成恢复密钥，并导入、导出完整密文备份。',
    firstAction: '新用户先设至少 8 位密码和恢复密钥；换设备直接导入旧备份。',
    result: '所有已保存资料与工坊队列可以完整迁移，密码与恢复密钥须自行保管。',
  },
  {
    id: 'prompts',
    number: '01',
    label: '提示词库',
    icon: Library,
    responsibility:
      '保存完整提示词、例图、作者、来源、获得方式、备注、标签与任意自定义字段。',
    firstAction:
      '有词会文件先点“文件批量导入”，核对作者与例图后整份入库；也可单条添加。',
    result: '一个文件建立一个库，提示词整段默认隐藏，点击才显示。',
  },
  {
    id: 'profiles',
    number: '02',
    label: 'Profile 库',
    icon: KeyRound,
    responsibility: '共用文件夹长码，分别保存阶段与成品短码、例图和说明。',
    firstAction: '先建文件夹，再添加短码、标注性质并上传例图。',
    result: '阶段与成品清楚区分，配方引用具体短码。',
  },
  {
    id: 'moodboards',
    number: '03',
    label: 'Moodboard 库',
    icon: ImageIcon,
    responsibility:
      '用多张例图直观标记画面气质，并补齐短码、创作者、来源与私人说明。',
    firstAction: '上传最能代表特点的例图并填写短码。',
    result: '之后可以在配方中不限数量地重复调用。',
  },
  {
    id: 'watermarks',
    number: '04',
    label: '水印库',
    icon: Droplets,
    responsibility:
      '分类保管透明水印或其他叠加素材，记录作者、版权来源、取得方式和补充信息。',
    firstAction: '可在这里添加，也可在水印工坊上传后自动归档。',
    result: '保存过的水印可直接作为新图层反复使用。',
  },
  {
    id: 'recipes',
    number: '05',
    label: '搭配配方',
    icon: Blocks,
    responsibility:
      '从库中选取或手动填写 Profile、Moodboard，不限数量地混合搭配并自由分类。',
    firstAction: '新建配方，选择已有条目或自行填写短码。',
    result: '用多张例图、备注和自定义字段记录实际效果。',
  },
  {
    id: 'gallery',
    number: '06',
    label: '图片收纳',
    icon: Folder,
    responsibility:
      '创建任意图库来存放每日刷图、参考图、水印成品和自动生成的拼图成品。',
    firstAction: '建立一个图库并批量导入当天图片。',
    result: '可编辑、移动、删除、送往拼图或整库下载。',
  },
  {
    id: 'watermark',
    number: '07',
    label: '水印工坊',
    icon: Stamp,
    responsibility:
      '最多 5 批图片独立排版，每批最多 200 张；视频工区最多 10 个，以第一帧设定水印。',
    firstAction:
      '先导入本批原图，再上传或从库中选择多层水印，拖动、裁切、缩放、旋转后确认。',
    result:
      '图片成品按批次进入等待区并可自动送往拼图，不合格重新调整样本再重打。',
  },
  {
    id: 'collage',
    number: '08',
    label: '拼图工坊',
    icon: Grid3X3,
    responsibility:
      '设置单张图片的比例或尺寸、行列、格式与序号样式，最多处理 1000 张图片。',
    firstAction: '选择批次，设置单图尺寸与行列，生成后创建售图场次。',
    result: '未占满的末板自动忽略空格，成品自动按日期归档。',
  },
];

const orderedModuleGuide: GuideEntry[] = [
  'security',
  'prompts',
  'profiles',
  'moodboards',
  'watermarks',
  'recipes',
  'gallery',
  'png-cleaner',
  'enhancement',
  'watermark',
  'collage',
  'sales',
  'accounting',
].map((id, index) => ({
  ...(moduleGuide.find((entry) => entry.id === id) || {
    id: 'sales' as const,
    label: '售图核对',
    icon: Grid3X3,
    responsibility: '按截图真实顺序核对号码，每个号码只售给一个人。',
    firstAction: '从生成的编号拼图创建场次，上传完整聊天截图。',
    result: '确认交付、清理已售图片和旧拼图，把剩图送回拼图。',
  }),
  number: String(index).padStart(2, '0'),
}));

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
    <button
      aria-current={active ? 'page' : undefined}
      className={`nav-item ${active ? 'is-active' : ''}`}
      onClick={() => onSelect(item.id)}
      type="button"
    >
      <Icon aria-hidden="true" />
      {!collapsed && <span>{item.label}</span>}
      {!collapsed && item.count !== undefined && <small>{item.count}</small>}
    </button>
  );
}

export default function Home() {
  const vault = useVault();
  useEffect(() => {
    const viewport = window.visualViewport;
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        document.documentElement.style.setProperty('--prism-viewport-height', `${viewport?.height || window.innerHeight}px`);
        document.documentElement.style.setProperty('--prism-viewport-top', `${viewport?.offsetTop || 0}px`);
      });
    };
    update(); window.addEventListener('resize', update); viewport?.addEventListener('resize', update); viewport?.addEventListener('scroll', update);
    return () => { cancelAnimationFrame(frame); window.removeEventListener('resize', update); viewport?.removeEventListener('resize', update); viewport?.removeEventListener('scroll', update); };
  }, []);
  useEffect(() => { let clean: (() => void) | undefined; let stopped = false; void import('@/lib/file-drop').then(module => { if (!stopped) clean = module.installFileDrop(); }); return () => { stopped = true; clean?.(); }; }, []);
  const [collapsed, setCollapsed] = useState(false);
  const [activeView, setActiveView] = useState<ViewId>('overview');
  const visitedLibraries = useRef(new Set<ViewId>());
  const librarySession = useRef(vault.session);
  if (librarySession.current !== vault.session) { visitedLibraries.current.clear(); librarySession.current = vault.session; }
  visitedLibraries.current.add(activeView);
  const flowDrag = useRef({ startX: 0, left: 0, down: false, moved: false });
  const globalQuery = '';
  const [theme, setTheme] = useState<'system' | 'light' | 'dark'>(() => {
    if (typeof window === 'undefined') return 'system';
    const saved = localStorage.getItem('prism-theme');
    return saved === 'light' || saved === 'dark' ? saved : 'system';
  });
  const [mobileNavOpen, setMobileNavOpen] = useState<MobileNavGroupId | null>(
    null,
  );

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      document.documentElement.dataset.theme =
        theme === 'system' ? (media.matches ? 'dark' : 'light') : theme;
      document.documentElement.style.colorScheme =
        document.documentElement.dataset.theme;
    };
    apply();
    media.addEventListener('change', apply);
    localStorage.setItem('prism-theme', theme);
    return () => media.removeEventListener('change', apply);
  }, [theme]);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    window.dispatchEvent(new CustomEvent('prism:hide-secrets'));
  }, [activeView]);

  const vaultReady = vault.status === 'unlocked';
  const navigationOrder = [{ id: 'overview' as const, label: '开始与总览' }, ...orderedModuleGuide];
  const navigationIndex = navigationOrder.findIndex(entry => entry.id === activeView);
  const firstActionLabel = vaultReady
    ? '保险库已解锁 · 整理提示词'
    : vault.status === 'uninitialized'
      ? '第一步 · 创建本地保险库'
      : '第一步 · 解锁本地保险库';
  const activeMobileGroup = mobileNavGroups.find((group) =>
    group.items.some((item) => item.id === activeView),
  );
  const openedMobileGroup = mobileNavGroups.find(
    (group) => group.id === mobileNavOpen,
  );

  return (
    <TooltipProvider>
      <ImageDownloadDialog />
      <SiteTools previous={navigationOrder[navigationIndex - 1]?.label} next={navigationOrder[navigationIndex + 1]?.label} onPrevious={() => { const entry = navigationOrder[navigationIndex - 1]; if (entry) setActiveView(entry.id); }} onNext={() => { const entry = navigationOrder[navigationIndex + 1]; if (entry) setActiveView(entry.id); }} />
      <main
        className={`app-shell ${collapsed ? 'sidebar-collapsed' : ''} ${activeView === 'watermark' || activeView === 'collage' ? 'editor-active' : ''}`}
      >
        <aside className="sidebar">
          <div className="brand-row">
            <div className="brand-mark">
              <CircleDot />
            </div>
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
              <TooltipContent side="right">
                {collapsed ? '展开索引' : '收起索引'}
              </TooltipContent>
            </Tooltip>
          </div>

          <nav aria-label="资产索引">
            {!collapsed && <p className="nav-label">COLLECTIONS</p>}
            <div className="nav-stack">
              {primaryNav.map((item) => (
                <NavItem
                  active={activeView === item.id}
                  collapsed={collapsed}
                  item={item}
                  key={item.label}
                  onSelect={setActiveView}
                />
              ))}
            </div>
            {!collapsed && <p className="nav-label pipeline-label">PIPELINE</p>}
            <div className="nav-stack">
              {pipelineNav.map((item) => (
                <NavItem
                  active={activeView === item.id}
                  collapsed={collapsed}
                  item={item}
                  key={item.label}
                  onSelect={setActiveView}
                />
              ))}
            </div>
          </nav>

          <div className="sidebar-footer">
            <label className="theme-switch">
              <SunMoon aria-hidden="true" />
              <span className="sr-only">外观模式</span>
              <select
                aria-label="外观模式"
                value={theme}
                onChange={(event) =>
                  setTheme(event.target.value as typeof theme)
                }
              >
                <option value="system">跟随系统</option>
                <option value="light">日间</option>
                <option value="dark">夜间</option>
              </select>
            </label>
            <div className="vault-status">
              <ShieldCheck />
              {!collapsed && (
                <div>
                  <strong>本地保险库</strong>
                  <span>
                    AES-256 ·{' '}
                    {vault.status === 'unlocked'
                      ? '本次会话已解锁'
                      : vault.status === 'uninitialized'
                        ? '等待初始化'
                        : '已锁定'}
                  </span>
                </div>
              )}
            </div>
            <button
              className={`nav-item ${activeView === 'security' ? 'is-active' : ''}`}
              onClick={() => setActiveView('security')}
              type="button"
            >
              <Settings2 />
              {!collapsed && <span>安全与备份</span>}
            </button>
          </div>
        </aside>

        <section className="workspace">
          {(activeView === 'watermark' || activeView === 'collage') && (
            <div className="mobile-editor-header mobile-workspace-only">
              <button type="button" onClick={() => setActiveView('overview')}>
                <ChevronLeft /> 返回
              </button>
              <strong>
                {activeView === 'watermark' ? '水印工坊' : '拼图工坊'}
              </strong>
              <span>本机编辑</span>
            </div>
          )}

          <div className="content-frame" hidden={activeView !== 'overview'}>
            <section className="editorial-head">
              <div>
                <p className="eyebrow">
                  ASSET INDEX <span>/ 01</span>
                </p>
                <h1>资产总览</h1>
                <p className="intro">
                  把灵感、密钥与成片收进同一套私人视觉系统。
                </p>
              </div>
              <div className="issue-note">
                <span>WXJJ / PRISM</span>
                <strong>LOCAL</strong>
                <small>PRIVATE WORKSPACE</small>
              </div>
            </section>

            <section className="start-here" aria-labelledby="start-here-title">
              <div className="start-here-copy">
                <div className="start-kicker">
                  <span>START HERE</span>
                  <i />{' '}
                  <small>{vaultReady ? 'VAULT READY' : 'FIRST VISIT'}</small>
                </div>
                <h2 id="start-here-title">
                  从资产整理到售图交付，
                  <br />
                  每一步都有明确入口。
                </h2>
                <p>
                  PRISM 没有 GPT
                  登录、公共账号或云端资料库。你的提示词、短码、长码、例图、水印与成品会在当前浏览器里加密保存；朋友打开同一个网址时，只会建立并看到他们自己的本地数据。
                </p>
                <div className="start-actions">
                  <Button
                    onClick={() =>
                      setActiveView(vaultReady ? 'prompts' : 'security')
                    }
                  >
                    <ShieldCheck /> {firstActionLabel}
                  </Button>
                  <button
                    onClick={() =>
                      document
                        .getElementById('workflow-guide')
                        ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                    }
                    type="button"
                  >
                    先看完整流程 <ArrowDown />
                  </button>
                </div>
                <div className="start-warning">
                  <LockKeyhole />
                  <span>
                    <strong>先设密码与恢复密钥，再定期完整备份。</strong>
                    换设备或换网址请用原备份密码导入；恢复密钥能在忘记密码时保留数据重设密码。
                  </span>
                </div>
              </div>
              <div className="start-here-map" aria-label="PRISM 三层工作结构">
                <p className="eyebrow">SYSTEM MAP / 00</p>
                <div>
                  <span>01</span>
                  <p>
                    <strong>FOUNDATION</strong>
                    <small>安全与备份 · 本地加密入口</small>
                  </p>
                </div>
                <ArrowDown />
                <div>
                  <span>02</span>
                  <p>
                    <strong>KNOWLEDGE</strong>
                    <small>四类资产库 · 自由配方</small>
                  </p>
                </div>
                <ArrowDown />
                <div>
                  <span>03</span>
                  <p>
                    <strong>PRODUCTION</strong>
                    <small>收纳 · 清洗 · 水印 · 拼图 · 核对 · 记账</small>
                  </p>
                </div>
              </div>
            </section>

            <section className="workflow-guide" id="workflow-guide">
              <div className="guide-heading">
                <div>
                  <p className="eyebrow">THE COMPLETE FLOW / 01—09</p>
                  <h2>从第一次打开，到交付一批成片</h2>
                </div>
                <p>
                  下面每一步都可以直接点击进入对应板块。初次使用建议按编号走一遍；熟悉之后可以从任意节点开始。
                </p>
              </div>
              <div className="workflow-track" onPointerDown={event => { if (event.pointerType === 'mouse') flowDrag.current = { startX: event.clientX, left: event.currentTarget.scrollLeft, down: true, moved: false }; }} onPointerMove={event => { const drag = flowDrag.current; if (!drag.down || event.pointerType !== 'mouse') return; const distance = event.clientX - drag.startX; if (Math.abs(distance) > 6) drag.moved = true; if (drag.moved) { event.currentTarget.scrollLeft = drag.left - distance; event.preventDefault(); } }} onPointerUp={() => { flowDrag.current.down = false; }} onPointerLeave={() => { flowDrag.current.down = false; }} onClickCapture={event => { if (flowDrag.current.moved) { event.preventDefault(); event.stopPropagation(); flowDrag.current.moved = false; } }}>
                {workflowSteps.map((step) => (
                  <button
                    key={step.number}
                    onClick={() => setActiveView(step.id)}
                    type="button"
                  >
                    <span>{step.number}</span>
                    <strong>{step.title}</strong>
                    <p>{step.detail}</p>
                    <small>
                      打开板块 <ArrowRight />
                    </small>
                  </button>
                ))}
              </div>
            </section>

            <section className="module-guide" id="module-guide">
              <div className="guide-heading">
                <div>
                  <p className="eyebrow">MODULE DIRECTORY / 00—11</p>
                  <h2>每一个板块负责什么</h2>
                </div>
                <p>
                  资料库负责“整理与复用”，工坊负责“批量生产”，安全与备份负责守住你的本地数据边界。
                </p>
              </div>
              <div className="module-guide-grid">
                {orderedModuleGuide.map((module) => {
                  const Icon = module.icon;
                  return (
                    <button
                      className="module-guide-card"
                      key={module.number}
                      onClick={() => setActiveView(module.id)}
                      type="button"
                    >
                      <span className="module-guide-number">
                        {module.number}
                      </span>
                      <Icon />
                      <h3>{module.label}</h3>
                      <p>{module.responsibility}</p>
                      <dl>
                        <div>
                          <dt>进入后的第一步</dt>
                          <dd>{module.firstAction}</dd>
                        </div>
                        <div>
                          <dt>得到什么</dt>
                          <dd>{module.result}</dd>
                        </div>
                      </dl>
                      <span className="module-guide-open">
                        进入 {module.label} <ArrowRight />
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          </div>
          {vaultReady ? (
            <div key={vault.session} className={vault.busy ? 'vault-busy' : ''}>
              <div
                className="content-frame studio-frame"
                hidden={activeView !== 'accounting'}
              >
                <AccountingPanel />
              </div>
              <div
                className="content-frame studio-frame"
                hidden={activeView !== 'png-cleaner'}
              >
                <PngCleanerPanel onOpen={setActiveView} />
              </div>
              <div
                className="content-frame studio-frame"
                hidden={activeView !== 'prompts'}
              >
                {visitedLibraries.current.has('prompts') && <LibraryPanel globalQuery={globalQuery} kind="prompt" />}
              </div>
              <div
                className="content-frame studio-frame"
                hidden={activeView !== 'profiles'}
              >
                {visitedLibraries.current.has('profiles') && <LibraryPanel globalQuery={globalQuery} kind="profile" />}
              </div>
              <div
                className="content-frame studio-frame"
                hidden={activeView !== 'moodboards'}
              >
                {visitedLibraries.current.has('moodboards') && <LibraryPanel globalQuery={globalQuery} kind="moodboard" />}
              </div>
              <div
                className="content-frame studio-frame"
                hidden={activeView !== 'watermarks'}
              >
                {visitedLibraries.current.has('watermarks') && <WatermarkLibraryPanel globalQuery={globalQuery} />}
              </div>
              <div
                className="content-frame studio-frame"
                hidden={activeView !== 'recipes'}
              >
                {visitedLibraries.current.has('recipes') && <RecipePanel globalQuery={globalQuery} />}
              </div>
              <div
                className="content-frame studio-frame"
                hidden={activeView !== 'gallery'}
              >
                {visitedLibraries.current.has('gallery') && <GalleryPanel onOpenCollage={() => setActiveView('collage')} />}
              </div>
              <div className="content-frame studio-frame" hidden={activeView !== 'enhancement'}>{visitedLibraries.current.has('enhancement') && <ImageEnhancementPanel />}</div>
              <div
                className="content-frame studio-frame"
                hidden={activeView !== 'watermark'}
              >
                <WatermarkPanel
                  onOpenCollage={() => setActiveView('collage')}
                />
              </div>
              <div
                className="content-frame studio-frame"
                hidden={activeView !== 'collage'}
              >
                <CollagePanel onOpenSales={() => setActiveView('sales')} />
              </div>
              <div
                className="content-frame studio-frame"
                hidden={activeView !== 'sales'}
              >
                <SalesPanel onOpenCollage={() => setActiveView('collage')} />
              </div>
            </div>
          ) : (
            activeView !== 'overview' &&
            activeView !== 'security' && (
              <div className="content-frame">
                <section className="empty-state locked-workspace">
                  <LockKeyhole />
                  <h2>本地保险库已锁定</h2>
                  <p>解锁前无法查看或修改记录、例图、原文件和工坊队列。</p>
                  <Button onClick={() => setActiveView('security')}>
                    前往解锁 / 完整导入
                  </Button>
                </section>
              </div>
            )
          )}
          <div
            className="content-frame studio-frame"
            hidden={activeView !== 'security'}
          >
            <SecurityPanel />
          </div>
        </section>
        <nav
          className="mobile-primary-nav mobile-workspace-only"
          aria-label="手机主导航"
        >
          <button
            aria-current={activeView === 'overview' ? 'page' : undefined}
            className={activeView === 'overview' ? 'is-active' : ''}
            onClick={() => setActiveView('overview')}
            type="button"
          >
            <Aperture aria-hidden="true" />
            <span>首页</span>
          </button>
          {mobileNavGroups.map((group) => {
            const Icon = group.icon;
            const active = activeMobileGroup?.id === group.id;
            return (
              <button
                aria-current={active ? 'page' : undefined}
                className={active ? 'is-active' : ''}
                key={group.id}
                onClick={() =>
                  group.id === 'library'
                    ? setActiveView('accounting')
                    : setMobileNavOpen(group.id)
                }
                type="button"
              >
                <Icon aria-hidden="true" />
                <span>{group.label}</span>
              </button>
            );
          })}
        </nav>
        <MobileWorkspaceSheet
          description="选择要打开的模块。未来新增工具会归入分组，不再扩张一级导航。"
          onOpenChange={(open) => {
            if (!open) setMobileNavOpen(null);
          }}
          open={mobileNavOpen !== null}
          title={openedMobileGroup?.label || '选择模块'}
        >
          <label className="theme-switch mobile-theme-switch">
            <SunMoon />
            <select
              aria-label="外观模式"
              value={theme}
              onChange={(event) => setTheme(event.target.value as typeof theme)}
            >
              <option value="system">跟随系统</option>
              <option value="light">日间</option>
              <option value="dark">夜间</option>
            </select>
          </label>
          <div className="mobile-module-list">
            {openedMobileGroup?.items.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  className={activeView === item.id ? 'is-active' : ''}
                  key={item.id}
                  onClick={() => {
                    setActiveView(item.id);
                    setMobileNavOpen(null);
                  }}
                  type="button"
                >
                  <Icon aria-hidden="true" />
                  <span>
                    <strong>{item.label}</strong>
                    <small>
                      {activeView === item.id ? '当前模块' : '点击进入'}
                    </small>
                  </span>
                  <ArrowRight aria-hidden="true" />
                </button>
              );
            })}
          </div>
        </MobileWorkspaceSheet>
      </main>
    </TooltipProvider>
  );
}
