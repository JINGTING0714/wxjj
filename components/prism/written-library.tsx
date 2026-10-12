'use client';
import { useEffect, useMemo, useState } from 'react';
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
import { TextReview } from './text-review';
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
  const refresh = () =>
    Promise.all([
      vault.loadRecords<WrittenPrompt>('writing-prompts').then(setDocs),
      vault
        .loadRecords<{ id: string; name: string }>('writing-collections')
        .then(setCollections),
    ]);
  useEffect(() => {
    void refresh().catch((error) => setMessage(String(error)));
    const changed = () => void refresh();
    const hide = () => setShow(false);
    window.addEventListener('prism:writing-changed', changed);
    window.addEventListener('prism:hide-secrets', hide);
    return () => {
      window.removeEventListener('prism:writing-changed', changed);
      window.removeEventListener('prism:hide-secrets', hide);
    };
  }, [vault.session]);
  const categoryDocs = docs.filter(
      (doc) => category === 'all' || doc.category === category,
    ),
    filtered = useMemo(
      () =>
        categoryDocs.filter((doc) =>
          [doc.title, doc.author, ...doc.tags]
            .join(' ')
            .toLowerCase()
            .includes(query.toLowerCase()),
        ),
      [docs, category, query],
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
    if (doc && version)
      void loadImages(doc, version)
        .then((items) => {
          if (!cancelled) setFiles(items);
        })
        .catch((error) => setMessage(String(error)));
    return () => {
      cancelled = true;
    };
  }, [doc, version]);
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
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : '导出失败，原记录保留。',
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="studio-page written-library-page">
      <SectionHead
        eyebrow="MY PROMPT LIBRARY"
        number="16"
        title="自己的写词库"
        description="按分类收纳自己的提示词、六种语言、例图与历次版本。"
        actions={
          <Button
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
            开始新写词
          </Button>
        }
      />
      <div className="written-library-toolbar">
        <label>
          分类
          <select
            aria-label="自己的写词库分类"
            value={category}
            onChange={(event) => setCategory(event.target.value)}
          >
            <option value="all">全部写词</option>
            <option value="unfiled">未分类</option>
            {collections.map((item) => (
              <option value={item.id} key={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <input
          aria-label="搜索自己的写词"
          placeholder="搜索名称、作者、标签"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <Button
          variant="outline"
          onClick={async () => {
            const name = window.prompt('新分类名称');
            if (name?.trim()) {
              await vault.saveRecord('writing-collections', {
                id: crypto.randomUUID(),
                name: name.trim(),
              });
              await refresh();
              window.dispatchEvent(new CustomEvent('prism:writing-changed'));
            }
          }}
        >
          新建分类
        </Button>
        {category !== 'all' && category !== 'unfiled' && (
          <>
            <Button
              variant="outline"
              onClick={async () => {
                const old = collections.find((item) => item.id === category),
                  name = window.prompt('分类名称', old?.name);
                if (name?.trim()) {
                  await vault.saveRecord('writing-collections', {
                    id: category,
                    name: name.trim(),
                  });
                  await refresh();
                  window.dispatchEvent(
                    new CustomEvent('prism:writing-changed'),
                  );
                }
              }}
            >
              重命名分类
            </Button>
            <Button
              variant="outline"
              onClick={async () => {
                if (window.confirm('删除分类？写词会移入未分类。')) {
                  await vault.writeBatch({
                    deleteRecords: [category],
                    records: categoryDocs.map((doc) => ({
                      scope: 'writing-prompts',
                      value: { ...doc, category: 'unfiled' },
                    })),
                  });
                  setCategory('all');
                  await refresh();
                  window.dispatchEvent(
                    new CustomEvent('prism:writing-changed'),
                  );
                }
              }}
            >
              删除分类
            </Button>
          </>
        )}
        <label>
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
            <option value={0}>原尺寸例图 · 文件较大</option>
          </select>
        </label>
        <Button
          disabled={busy || !categoryDocs.length}
          onClick={() => void exportPack()}
        >
          {busy
            ? '导出中…'
            : marked.size
              ? `导出所选 ${marked.size} 条 XLSX`
              : '导出当前分类 XLSX'}
        </Button>
      </div>
      {message && <p role="status">{message}</p>}
      <div className="written-library-layout">
        <div className="written-library-list">
          {filtered.slice(page * 40, (page + 1) * 40).map((item) => (
            <article
              key={item.id}
              className={selected === item.id ? 'is-selected' : ''}
            >
              <label>
                <input
                  type="checkbox"
                  aria-label={`选择写词 ${item.title}`}
                  checked={marked.has(item.id)}
                  onChange={(event) =>
                    setMarked((current) => {
                      const next = new Set(current);
                      event.target.checked
                        ? next.add(item.id)
                        : next.delete(item.id);
                      return next;
                    })
                  }
                />
                <strong>{item.title}</strong>
              </label>
              <p>
                {collections.find((value) => value.id === item.category)
                  ?.name || '未分类'}{' '}
                · {item.versions.length} 个版本 · {item.author}
              </p>
              <p>{item.tags.join(' / ')}</p>
              <div>
                <Button
                  variant="outline"
                  onClick={() => {
                    setSelected(item.id);
                    setVersionId(item.activeVersion);
                    setShow(false);
                  }}
                >
                  查看 / 版本
                </Button>
                <Button variant="outline" onClick={() => onEdit(item)}>
                  继续写词
                </Button>
                <Button variant="ghost" onClick={() => void remove(item)}>
                  删除
                </Button>
              </div>
            </article>
          ))}
          {!filtered.length && (
            <p className="empty-state">
              还没有符合条件的写词。到写词练习区写好后保存为新版本。
            </p>
          )}
          <div className="library-pagination">
            <Button
              variant="outline"
              disabled={!page}
              onClick={() => setPage((value) => value - 1)}
            >
              上一页
            </Button>
            <span>
              {page + 1} / {Math.max(1, Math.ceil(filtered.length / 40))}
            </span>
            <Button
              variant="outline"
              disabled={(page + 1) * 40 >= filtered.length}
              onClick={() => setPage((value) => value + 1)}
            >
              下一页
            </Button>
          </div>
        </div>
        <section className="written-version-detail">
          {doc && version ? (
            <>
              <h2>{doc.title}</h2>
              <label>
                查看版本
                <select
                  aria-label="自己的写词版本"
                  value={version.id}
                  onChange={(event) => {
                    setVersionId(event.target.value);
                    setShow(false);
                  }}
                >
                  {doc.versions.map((item) => (
                    <option value={item.id} key={item.id}>
                      {item.label} · {new Date(item.createdAt).toLocaleString()}
                    </option>
                  ))}
                </select>
              </label>
              <p>{version.note}</p>
              <div className="writing-language-tabs">
                {writingLanguages.map((lang) => (
                  <Button
                    key={lang.id}
                    variant={language === lang.id ? 'default' : 'outline'}
                    onClick={() => setLanguage(lang.id)}
                  >
                    {lang.name}
                  </Button>
                ))}
              </div>
              <pre className="written-prompt-text">
                {show
                  ? version.languages[language] || '此版本暂未填写该语言'
                  : '提示词已隐藏，点击显示或直接复制。'}
              </pre>
              <div className="record-secret-actions">
                <Button
                  variant="outline"
                  onClick={() => setShow((value) => !value)}
                >
                  {show ? '隐藏正文' : '显示正文'}
                </Button>
                <Button
                  onClick={() =>
                    void copyText(version.languages[language] || '')
                  }
                  disabled={!version.languages[language]}
                >
                  复制当前语言
                </Button>
                <Button
                  variant="outline"
                  onClick={() => onEdit({ ...doc, activeVersion: version.id })}
                >
                  从这个版本继续修改
                </Button>
                <Button
                  variant="outline"
                  onClick={async () => {
                    await vault.saveRecord('writing-prompts', {
                      ...doc,
                      activeVersion: version.id,
                    });
                    await refresh();
                  }}
                >
                  设为当前使用版本
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => void remove(doc, version.id)}
                >
                  删除此版本
                </Button>
              </div>
              {urls.length > 0 && (
                <>
                  <ExampleImage
                    src={urls[0]}
                    alt={`${doc.title} 例图`}
                    images={urls.map((url, index) => ({
                      url,
                      name: files[index].file.name,
                      assetId: doc.id,
                      title: `${doc.title} / ${version.label}`,
                      english: version.languages.en,
                      chinese: version.languages.zh,
                      copies: writingLanguages
                        .filter((lang) => version.languages[lang.id])
                        .map((lang) => ({
                          label: `复制 ${lang.name}`,
                          value: version.languages[lang.id],
                        })),
                    }))}
                  />
                  <Button
                    variant="outline"
                    disabled={busy}
                    onClick={async () => {
                      setBusy(true);
                      try {
                        await onWatermark(files, doc.title);
                        setMessage(
                          '例图已送到水印工坊，检查打水印后可继续送海报。',
                        );
                      } catch (error) {
                        setMessage(String(error));
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    本版例图送往水印工坊
                  </Button>
                </>
              )}
              {show && <TextReview after={version.languages[language] || ''} />}
              <p>
                原文、旧版本和例图都在本机加密保存；API 密钥不包含在词包表格中。
              </p>
            </>
          ) : (
            <p className="empty-state">
              选择一条写词查看语言版本、例图和历史修改。
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
