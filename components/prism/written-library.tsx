'use client';
import { useEffect, useMemo, useState } from 'react';
import {
  FolderPlus,
  Plus,
  Search,
  Download,
  Eye,
  Copy,
  Languages,
  ChevronDown,
  History,
  Pencil,
  Trash2,
  BookOpen,
  Check,
} from 'lucide-react';
import { CollectionRail } from './library-shared';
import { BulkActions } from './bulk-selection';
import { Badge } from '@/components/ui/badge';
import { IndexJump } from './index-jump';
import { WrittenRecordImage } from './written-record-image';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { useVault } from './vault-provider';
import { SectionHead } from './studio-shared';
import { useFileUrls } from './use-workspace-state';
import { ExampleImage } from './example-image';
import { copyText } from '@/lib/clipboard';
import { downloadBlob } from '@/lib/download';
import { exportWritingXlsx } from '@/lib/writing-export';
import {
  writingLanguages,
  writingVersion,
  type WrittenPrompt,
  type WritingVersion,
  type WritingLanguage,
} from '@/lib/writing-model';
const writtenLanguageName = (id: WritingLanguage) =>
  ({ zh: '中文', en: '英语', fr: '法语', es: '西语', ja: '日语', ko: '韩语' })[
    id
  ];
export function WrittenLibrary({
  onEdit,
  onWatermark,
}: {
  onEdit: (doc: WrittenPrompt) => void;
  onWatermark: (
    files: { id: string; file: File }[],
    title: string,
  ) => Promise<void>;
}) {
  const vault = useVault(),
    [docs, setDocs] = useState<WrittenPrompt[]>([]),
    [collections, setCollections] = useState<{ id: string; name: string }[]>(
      [],
    ),
    [category, setCategory] = useState('all'),
    [query, setQuery] = useState(''),
    [selected, setSelected] = useState(''),
    [versionId, setVersionId] = useState(''),
    [language, setLanguage] = useState<WritingLanguage>('zh'),
    [files, setFiles] = useState<{ id: string; file: File }[]>([]),
    [marked, setMarked] = useState<Set<string>>(new Set()),
    [show, setShow] = useState(false),
    [history, setHistory] = useState(false),
    [imageMaximum, setImageMaximum] = useState(1280),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(''),
    [page, setPage] = useState(0);
  const [detailOpen, setDetailOpen] = useState(false),
    [exportOpen, setExportOpen] = useState(false),
    [collectionEditor, setCollectionEditor] = useState<{
      id: string;
      name: string;
      fresh: boolean;
    } | null>(null);
  const refresh = () =>
    Promise.all([
      vault.loadRecords<WrittenPrompt>('writing-prompts').then(setDocs),
      vault
        .loadRecords<{ id: string; name: string }>('writing-collections')
        .then(setCollections),
    ]);
  useEffect(() => {
    void refresh().catch((error) => setMessage(String(error)));
    const changed = () =>
      void refresh().catch((error) => setMessage(String(error)));
    const hide = () => setShow(false);
    window.addEventListener('prism:writing-changed', changed);
    window.addEventListener('prism:hide-secrets', hide);
    return () => {
      window.removeEventListener('prism:writing-changed', changed);
      window.removeEventListener('prism:hide-secrets', hide);
    };
  }, [vault.session]);
  const categoryDocs = useMemo(
      () =>
        docs.filter((doc) => category === 'all' || doc.category === category),
      [docs, category],
    ),
    filtered = useMemo(
      () =>
        categoryDocs.filter((doc) =>
          [doc.title, doc.author, ...doc.tags]
            .join(' ')
            .toLowerCase()
            .includes(query.toLowerCase()),
        ),
      [categoryDocs, query],
    ),
    doc = docs.find((item) => item.id === selected),
    version =
      doc?.versions.find((item) => item.id === versionId) ||
      (doc ? writingVersion(doc) : undefined),
    urls = useFileUrls(files.map((item) => item.file));
  const loadImages = async (item: WrittenPrompt, value: WritingVersion) => {
    const blobs = await vault.loadBlobs(
        item.mediaScope,
        value.media
          .filter((media) => media.role === 'example')
          .map((media) => media.id),
      ),
      byId = new Map(blobs.map((blob) => [blob.id, blob]));
    return value.media
      .filter((media) => media.role === 'example')
      .flatMap((media) => {
        const found = byId.get(media.id);
        return found
          ? [
              {
                id: media.id,
                file: new File([found.blob], media.name, { type: media.type }),
              },
            ]
          : [];
      });
  };
  useEffect(() => {
    let cancelled = false;
    setFiles([]);
    if (detailOpen && doc && version)
      void loadImages(doc, version)
        .then((items) => {
          if (!cancelled) setFiles(items);
        })
        .catch((error) => setMessage(String(error)));
    return () => {
      cancelled = true;
    };
  }, [doc, version, detailOpen]);
  useEffect(() => {
    setPage(0);
    setShow(false);
  }, [category, query]);
  const remove = async (item: WrittenPrompt, which?: string) => {
    if (
      !window.confirm(
        which ? '删除这个版本？其他版本保留。' : '删除这条写词及全部版本？',
      )
    )
      return;
    const next = which
      ? item.versions.filter((version) => version.id !== which)
      : [];
    if (next.length) {
      const updated = {
        ...item,
        versions: next,
        activeVersion: next.some((version) => version.id === item.activeVersion)
          ? item.activeVersion
          : next.at(-1)!.id,
        updatedAt: new Date().toISOString(),
      };
      await vault.saveRecord('writing-prompts', updated);
      setVersionId(updated.activeVersion);
    } else {
      await vault.deleteRecord(item.id);
      setSelected('');
    }
    const remaining = docs
        .map((value) =>
          value.id === item.id ? { ...value, versions: next } : value,
        )
        .filter((value) => value.versions.length),
      used = new Set(
        remaining
          .filter((value) => value.mediaScope === item.mediaScope)
          .flatMap((value) =>
            value.versions.flatMap((version) =>
              version.media.map((media) => media.id),
            ),
          ),
      ),
      old = new Set(
        item.versions.flatMap((version) =>
          version.media.map((media) => media.id),
        ),
      );
    await vault.writeBatch({
      deleteBlobs: [...old].filter((id) => !used.has(id)),
    });
    await refresh();
    setMarked(
      (current) =>
        new Set(
          [...current].filter((id) => remaining.some((doc) => doc.id === id)),
        ),
    );
    window.dispatchEvent(new CustomEvent('prism:writing-changed'));
  };
  const exportPack = async () => {
    const list = marked.size
      ? docs.filter((doc) => marked.has(doc.id))
      : categoryDocs;
    if (!list.length) return;
    setBusy(true);
    try {
      await downloadBlob(
        await exportWritingXlsx(
          list,
          collections,
          loadImages,
          history,
          setMessage,
          imageMaximum,
        ),
        `PRISM-${category === 'all' ? '我的写词' : collections.find((item) => item.id === category)?.name || '未分类'}-词包.xlsx`,
      );
      setMessage(
        `已导出 ${list.length} 条写词，六种语言按页整理，例图已嵌入，标记词使用紫色字体。`,
      );
      setExportOpen(false);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : '导出失败，原记录保留。',
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="studio-page written-library-page written-redesign">
      <SectionHead
        eyebrow="MY PROMPT LIBRARY"
        number="16"
        title="自己的写词库"
        description="收纳中文原稿、各语言译文、例图与修改版本。分类、词条和旧版本都可以自由整理。"
        actions={
          <>
            <Button
              variant="outline"
              onClick={() =>
                setCollectionEditor({
                  id: crypto.randomUUID(),
                  name: '',
                  fresh: true,
                })
              }
            >
              <FolderPlus />
              新建分类
            </Button>
            <Button
              onClick={() =>
                onEdit({
                  id: '',
                  title: '',
                  category: category === 'all' ? 'unfiled' : category,
                  author: '自创',
                  origin: '自行写词',
                  tags: [],
                  note: '',
                  mediaScope: '',
                  versions: [],
                  activeVersion: '',
                  createdAt: '',
                  updatedAt: '',
                })
              }
            >
              <Plus />
              开始新写词
            </Button>
          </>
        }
      />
      <CollectionRail
        noun="写词"
        collections={collections}
        records={docs.map((item) => ({ ...item, collection: item.category }))}
        active={category}
        onSelect={setCategory}
        onEdit={(item) => setCollectionEditor({ ...item, fresh: false })}
        onDelete={async (id) => {
          if (!window.confirm('删除这个分类？写词会移入未分类。')) return;
          await vault.writeBatch({
            deleteRecords: [id],
            records: docs
              .filter((item) => item.category === id)
              .map((item) => ({
                scope: 'writing-prompts',
                value: { ...item, category: 'unfiled' },
              })),
          });
          setCategory('all');
          await refresh();
          window.dispatchEvent(new CustomEvent('prism:writing-changed'));
        }}
      />
      <div className="library-toolbar">
        <label className="library-search">
          <Search />
          <input
            aria-label="搜索自己的写词"
            placeholder="搜索名称、作者、标签…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <span className="written-count">{filtered.length} 条写词</span>
        <Button
          variant="outline"
          disabled={!categoryDocs.length}
          onClick={() => setExportOpen(true)}
        >
          <Download />
          导出词包
        </Button>
      </div>
      <BulkActions
        selection={{
          selected: marked,
          total: filtered.length,
          toggle: (id) =>
            setMarked((current) => {
              const next = new Set(current);
              if (next.has(id)) next.delete(id);
              else next.add(id);
              return next;
            }),
          clear: () => setMarked(new Set()),
          all: () =>
            setMarked(
              new Set(
                filtered.every((item) => marked.has(item.id))
                  ? []
                  : filtered.map((item) => item.id),
              ),
            ),
        }}
        noun="条写词"
        disabled={busy}
        onDelete={async (ids) => {
          if (!window.confirm(`删除所选 ${ids.length} 条写词及其版本？`))
            return;
          const target = new Set(ids),
            keep = new Set(
              docs
                .filter((item) => !target.has(item.id))
                .flatMap((item) =>
                  item.versions.flatMap((version) =>
                    version.media.map((media) => media.id),
                  ),
                ),
            ),
            blobs = [
              ...new Set(
                docs
                  .filter((item) => target.has(item.id))
                  .flatMap((item) =>
                    item.versions.flatMap((version) =>
                      version.media.map((media) => media.id),
                    ),
                  ),
              ),
            ].filter((id) => !keep.has(id));
          await vault.writeBatch({ deleteRecords: ids, deleteBlobs: blobs });
          setMarked(new Set());
          if (target.has(selected)) {
            setSelected('');
            setDetailOpen(false);
          }
          await refresh();
          window.dispatchEvent(new CustomEvent('prism:writing-changed'));
        }}
      />
      {message && (
        <p className="writing-message" role="status">
          {message}
        </p>
      )}
      <div className="record-list-head written-list-head">
        <span>例图 / 写词</span>
        <span>中文原稿 / 译文</span>
        <span>版本 / 操作</span>
      </div>
      <div className="record-list written-record-list">
        {filtered.slice(page * 20, (page + 1) * 20).map((item) => {
          const current = writingVersion(item);
          return (
            <article className="record-row written-record-row" key={item.id}>
              <div className="record-identity">
                <input
                  type="checkbox"
                  aria-label={`选择写词 ${item.title}`}
                  checked={marked.has(item.id)}
                  onChange={(event) =>
                    setMarked((current) => {
                      const next = new Set(current);
                      if (event.target.checked) next.add(item.id);
                      else next.delete(item.id);
                      return next;
                    })
                  }
                />
                <WrittenRecordImage doc={item} />
                <div>
                  <Badge variant="outline">自创写词</Badge>
                  <h3>{item.title}</h3>
                  <p>{item.tags.join(' / ') || '未添加标签'}</p>
                  <p className="written-row-meta">
                    <strong>{item.author}</strong> ·{' '}
                    {collections.find((value) => value.id === item.category)
                      ?.name || '未分类'}
                  </p>
                </div>
              </div>
              <div className="record-secret">
                <p className="prompt-hidden-label">中文原稿与译文已收纳</p>
                <div className="record-secret-actions">
                  <button
                    onClick={() => {
                      setSelected(item.id);
                      setVersionId(item.activeVersion);
                      setLanguage('zh');
                      setShow(true);
                      setDetailOpen(true);
                    }}
                  >
                    <Eye />
                    查看正文
                  </button>
                  {current.languages.zh && (
                    <button onClick={() => void copyText(current.languages.zh)}>
                      <Copy />
                      中文
                    </button>
                  )}
                  {current.languages.en && (
                    <button onClick={() => void copyText(current.languages.en)}>
                      <Copy />
                      英文
                    </button>
                  )}
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      className="written-copy-more"
                      aria-label={`更多译文 ${item.title}`}
                    >
                      <Languages />
                      更多译文
                      <ChevronDown />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className="copy-format-menu">
                      {writingLanguages
                        .filter(
                          (lang) =>
                            lang.id !== 'zh' && current.languages[lang.id],
                        )
                        .map((lang) => (
                          <DropdownMenuItem
                            key={lang.id}
                            onClick={() =>
                              void copyText(current.languages[lang.id])
                            }
                          >
                            <Copy />
                            {writtenLanguageName(lang.id)}
                          </DropdownMenuItem>
                        ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                <p className="written-row-description">
                  {item.note || item.origin}
                </p>
              </div>
              <div className="written-row-actions">
                <small>
                  {current.label} · {item.versions.length} 个版本
                </small>
                <button
                  onClick={() => {
                    setSelected(item.id);
                    setVersionId(item.activeVersion);
                    setShow(false);
                    setDetailOpen(true);
                  }}
                >
                  <History />
                  查看版本
                </button>
                <button onClick={() => onEdit(item)}>
                  <Pencil />
                  继续写词
                </button>
                <button
                  aria-label={`删除写词 ${item.title}`}
                  onClick={() => void remove(item)}
                >
                  <Trash2 />
                </button>
              </div>
            </article>
          );
        })}
        {!filtered.length && (
          <div className="empty-state">
            <BookOpen />
            <h3>收进你的第一条写词</h3>
            <p>中文原稿、译文和例图会与每次修改一起保留。</p>
            <Button
              variant="outline"
              onClick={() =>
                onEdit({
                  id: '',
                  title: '',
                  category: 'unfiled',
                  author: '自创',
                  origin: '自行写词',
                  tags: [],
                  note: '',
                  mediaScope: '',
                  versions: [],
                  activeVersion: '',
                  createdAt: '',
                  updatedAt: '',
                })
              }
            >
              开始写词
            </Button>
          </div>
        )}
      </div>
      <div className="library-pagination">
        <Button
          variant="outline"
          disabled={!page}
          onClick={() => setPage((value) => value - 1)}
        >
          上一页
        </Button>
        <IndexJump
          label="写词库页码"
          count={Math.max(1, Math.ceil(filtered.length / 20))}
          index={page}
          onChange={setPage}
        />
        <Button
          variant="outline"
          disabled={(page + 1) * 20 >= filtered.length}
          onClick={() => setPage((value) => value + 1)}
        >
          下一页
        </Button>
      </div>
      <Dialog open={detailOpen && !!doc} onOpenChange={setDetailOpen}>
        <DialogContent className="written-version-dialog">
          <DialogTitle>{doc?.title}</DialogTitle>
          <DialogDescription>
            选择版本查看原稿、译文和例图，再继续修改或整理。
          </DialogDescription>
          {doc && version && (
            <>
              <div className="written-version-toolbar">
                <label>
                  版本
                  <select
                    aria-label="自己的写词版本"
                    value={version.id}
                    onChange={(event) => {
                      setVersionId(event.target.value);
                      setShow(false);
                    }}
                  >
                    {doc.versions.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.label} ·{' '}
                        {new Date(item.createdAt).toLocaleDateString()}
                      </option>
                    ))}
                  </select>
                </label>
                <span>{version.note || '此版本未填写修改记录'}</span>
              </div>
              <div className="written-version-languages">
                {writingLanguages
                  .filter(
                    (lang) => lang.id === 'zh' || version.languages[lang.id],
                  )
                  .map((lang) => (
                    <button
                      key={lang.id}
                      aria-pressed={language === lang.id}
                      onClick={() => setLanguage(lang.id)}
                    >
                      {lang.id === 'zh'
                        ? '中文原稿'
                        : writtenLanguageName(lang.id) + '译文'}
                    </button>
                  ))}
              </div>
              <pre className="written-prompt-text">
                {show
                  ? version.languages[language] || '此版本还没有该语言译文'
                  : '正文已隐藏，点击显示或直接复制。'}
              </pre>
              <div className="record-secret-actions">
                <button onClick={() => setShow((value) => !value)}>
                  <Eye />
                  {show ? '隐藏正文' : '显示正文'}
                </button>
                <button
                  disabled={!version.languages[language]}
                  onClick={() =>
                    void copyText(version.languages[language] || '')
                  }
                >
                  <Copy />
                  复制当前语言
                </button>
                <button
                  onClick={async () => {
                    await vault.saveRecord('writing-prompts', {
                      ...doc,
                      activeVersion: version.id,
                    });
                    await refresh();
                  }}
                >
                  <Check />
                  设为当前版本
                </button>
                <button onClick={() => void remove(doc, version.id)}>
                  <Trash2 />
                  删除此版本
                </button>
              </div>
              {urls.length > 0 && (
                <div className="written-version-images">
                  <ExampleImage
                    src={urls[0]}
                    alt={`${doc.title} 例图`}
                    images={urls.map((url, i) => ({
                      url,
                      name: files[i].file.name,
                      assetId: doc.id,
                      title: `${doc.title} / ${version.label}`,
                      copies: writingLanguages
                        .filter((lang) => version.languages[lang.id])
                        .map((lang) => ({
                          label:
                            lang.id === 'zh'
                              ? '复制中文原稿'
                              : `复制${writtenLanguageName(lang.id)}译文`,
                          value: version.languages[lang.id],
                        })),
                    }))}
                  />
                  <p>{files.length} 张例图 · 放大后可连续查看</p>
                </div>
              )}
              <DialogFooter>
                <Button
                  variant="outline"
                  disabled={busy || !files.length}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      setDetailOpen(false);
                      await onWatermark(files, doc.title);
                    } catch (error) {
                      setMessage(String(error));
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  本版例图送往水印工坊
                </Button>
                <Button
                  onClick={() => {
                    setDetailOpen(false);
                    onEdit({ ...doc, activeVersion: version.id });
                  }}
                >
                  从这个版本继续修改
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
      <Dialog open={exportOpen} onOpenChange={setExportOpen}>
        <DialogContent className="written-export-dialog">
          <DialogTitle>导出词包</DialogTitle>
          <DialogDescription>
            {marked.size
              ? `导出所选 ${marked.size} 条写词`
              : `导出当前分类的 ${categoryDocs.length} 条写词`}
            ，语言分工作表、例图嵌入表格，用户标记词使用紫色字体。
          </DialogDescription>
          <label className="check-line">
            <input
              type="checkbox"
              checked={history}
              onChange={(event) => setHistory(event.target.checked)}
            />
            导出包含旧版本
          </label>
          <label>
            例图质量
            <select
              aria-label="词包例图质量"
              value={imageMaximum}
              onChange={(event) => setImageMaximum(Number(event.target.value))}
            >
              <option value={1280}>清晰例图 · 长边 1280</option>
              <option value={640}>轻量例图 · 长边 640</option>
              <option value={0}>原尺寸例图</option>
            </select>
          </label>
          <DialogFooter>
            <Button variant="outline" onClick={() => setExportOpen(false)}>
              取消
            </Button>
            <Button
              disabled={busy}
              onClick={async () => {
                await exportPack();
              }}
            >
              导出 XLSX
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!collectionEditor}
        onOpenChange={(value) => {
          if (!value) setCollectionEditor(null);
        }}
      >
        <DialogContent className="written-collection-dialog">
          <DialogTitle>
            {collectionEditor?.fresh ? '新建写词分类' : '重命名分类'}
          </DialogTitle>
          <label>
            分类名称
            <input
              aria-label="写词分类名称"
              value={collectionEditor?.name || ''}
              onChange={(event) =>
                setCollectionEditor((current) =>
                  current ? { ...current, name: event.target.value } : null,
                )
              }
            />
          </label>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCollectionEditor(null)}>
              取消
            </Button>
            <Button
              disabled={!collectionEditor?.name.trim()}
              onClick={async () => {
                if (!collectionEditor) return;
                await vault.saveRecord('writing-collections', {
                  id: collectionEditor.id,
                  name: collectionEditor.name.trim(),
                });
                setCollectionEditor(null);
                await refresh();
                window.dispatchEvent(new CustomEvent('prism:writing-changed'));
              }}
            >
              保存分类
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
