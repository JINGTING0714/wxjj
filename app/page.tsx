'use client';

import {
  Aperture,
  ArrowDown,
  ArrowRight,
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
  { id: 'watermark' as const, label: '水印工坊', icon: Stamp },
  { id: 'collage' as const, label: '拼图工坊', icon: Grid3X3 },
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
    detail: '创建密码，让所有文字与图片在本机加密保存。',
  },
  {
    id: 'profiles',
    number: '02',
    title: '整理资产',
    detail: '建立提示词、Profile、Moodboard 与水印分类。',
  },
  {
    id: 'recipes',
    number: '03',
    title: '组合配方',
    detail: '从已整理的库里自由多选，记录化学反应。',
  },
  {
    id: 'gallery',
    number: '04',
    title: '收纳成片',
    detail: '把每日刷图按自己的图库与标签归档。',
  },
  {
    id: 'watermark',
    number: '05',
    title: '批量打水印',
    detail: '最多 5 批各自排版；视频另有首帧样本工区。',
  },
  {
    id: 'collage',
    number: '06',
    title: '批量拼图',
    detail: '设定画布、行列与序号，一次生成多板。',
  },
  {
    id: 'gallery',
    number: '07',
    title: '自动归档',
    detail: '成品进入当天拼图图库，再统一下载。',
  },
];

const moduleGuide: GuideEntry[] = [
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
    responsibility:
      '一个 Profile 文件夹一个长码，下面不限数量地细分阶段短码和最终成品短码，每个短码独有例图与说明。',
    firstAction:
      '建文件夹、填长码，再逐个添加短码并标注“性质”：阶段 P、成品 P、其他或待确认。',
    result:
      '配方按具体短码读取作者、性质和只露前三位的代码，不会把阶段误当成品。',
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
      '读取 Profile 与 Moodboard 库，允许三四个 Profile、五六个 Moodboard 或更多任意组合。',
    firstAction: '先整理两个基础库，再新建配方并多选条目。',
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
      '自由设置实际画布宽高、行列、格式与序号样式，最多处理 1000 张图片。',
    firstAction: '导入图片后选择比例或精确像素，再设行列与编号。',
    result: '未占满的末板自动忽略空格，成品自动按日期归档。',
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
  const [collapsed, setCollapsed] = useState(false);
  const [activeView, setActiveView] = useState<ViewId>('overview');
  const [globalQuery, setGlobalQuery] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (vault.status !== 'unlocked') setGlobalQuery('');
  }, [vault.status]);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    window.dispatchEvent(new CustomEvent('prism:hide-secrets'));
  }, [activeView]);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (
        (event.metaKey || event.ctrlKey) &&
        event.key.toLocaleLowerCase() === 'k'
      ) {
        event.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => {
      window.removeEventListener('keydown', handleKey);
    };
  }, []);

  const vaultReady = vault.status === 'unlocked';
  const firstActionLabel = vaultReady
    ? '保险库已解锁 · 开始整理 Profile'
    : vault.status === 'uninitialized'
      ? '第一步 · 创建本地保险库'
      : '第一步 · 解锁本地保险库';

  return (
    <TooltipProvider>
      <main className={`app-shell ${collapsed ? 'sidebar-collapsed' : ''}`}>
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
          <header className="topbar">
            <div className="search-wrap">
              <Search aria-hidden="true" />
              <Input
                aria-label="全局搜索"
                disabled={vault.status !== 'unlocked'}
                onChange={(event) => setGlobalQuery(event.target.value)}
                placeholder="搜索名称、标签、作者或备注…"
                ref={searchRef}
                value={globalQuery}
              />
              <kbd>⌘ K</kbd>
            </div>
            <div className="topbar-actions">
              <span className="privacy-pill">
                <LockKeyhole /> 数据从不离开此设备
              </span>
              <Button
                className="add-button"
                onClick={() =>
                  setActiveView(
                    vault.status === 'unlocked' ? 'prompts' : 'security',
                  )
                }
              >
                <Plus /> 新建资产
              </Button>
            </div>
          </header>

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
                  先建立本地保险库，
                  <br />
                  再让资产进入流水线。
                </h2>
                <p>
                  PRISM 没有 GPT
                  登录、公共账号或云端资料库。你的提示词、短码、长码、例图、水印与成品会在当前浏览器里加密保存；朋友打开同一个网址时，只会建立并看到他们自己的本地数据。
                </p>
                <div className="start-actions">
                  <Button
                    onClick={() =>
                      setActiveView(vaultReady ? 'profiles' : 'security')
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
                    <small>图片收纳 · 水印 · 拼图 · 归档</small>
                  </p>
                </div>
              </div>
            </section>

            <section className="workflow-guide" id="workflow-guide">
              <div className="guide-heading">
                <div>
                  <p className="eyebrow">THE COMPLETE FLOW / 01—07</p>
                  <h2>从第一次打开，到交付一批成片</h2>
                </div>
                <p>
                  下面每一步都可以直接点击进入对应板块。初次使用建议按编号走一遍；熟悉之后可以从任意节点开始。
                </p>
              </div>
              <div className="workflow-track">
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
                  <p className="eyebrow">MODULE DIRECTORY / 00—08</p>
                  <h2>每一个板块负责什么</h2>
                </div>
                <p>
                  资料库负责“整理与复用”，工坊负责“批量生产”，安全与备份负责守住你的本地数据边界。
                </p>
              </div>
              <div className="module-guide-grid">
                {moduleGuide.map((module) => {
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
                hidden={activeView !== 'prompts'}
              >
                <LibraryPanel globalQuery={globalQuery} kind="prompt" />
              </div>
              <div
                className="content-frame studio-frame"
                hidden={activeView !== 'profiles'}
              >
                <LibraryPanel globalQuery={globalQuery} kind="profile" />
              </div>
              <div
                className="content-frame studio-frame"
                hidden={activeView !== 'moodboards'}
              >
                <LibraryPanel globalQuery={globalQuery} kind="moodboard" />
              </div>
              <div
                className="content-frame studio-frame"
                hidden={activeView !== 'watermarks'}
              >
                <WatermarkLibraryPanel globalQuery={globalQuery} />
              </div>
              <div
                className="content-frame studio-frame"
                hidden={activeView !== 'recipes'}
              >
                <RecipePanel globalQuery={globalQuery} />
              </div>
              <div
                className="content-frame studio-frame"
                hidden={activeView !== 'gallery'}
              >
                <GalleryPanel onOpenCollage={() => setActiveView('collage')} />
              </div>
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
                <CollagePanel />
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
      </main>
    </TooltipProvider>
  );
}
