'use client';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { useVault } from './vault-provider';
import { useWorkspaceState, useFileUrls } from './use-workspace-state';
import { ExampleImage } from './example-image';
import { IndexJump } from './index-jump';
import { TextReview } from './text-review';
import { SectionHead } from './studio-shared';
import { startTask } from '@/lib/task-center';
import { splitWritingVariants as splitPromptVariants } from '@/lib/writing-model';
import {
  apiBase,
  writingApiModels,
  assistWriting,
  translateWriting,
} from '@/lib/writing-api';
import {
  emptyWritingText,
  emptySensitive,
  writingLanguages,
  writingTerms,
  insertWritingText,
  writingInsertionRange,
  writingVersion,
  type WritingLanguage,
  type WrittenPrompt,
  type WritingSnippet,
  type ApiSettings,
  type WritingMedia,
} from '@/lib/writing-model';
type Reference = {
  id: string;
  file: File;
  blobId?: string;
  role: 'reference' | 'example';
  variant?: number | 'shared';
};
const blank = () => ({
  docId: '',
  title: '',
  category: 'unfiled',
  author: '自创',
  origin: '自行写词',
  note: '',
  tags: '',
  versionNote: '',
  versionLabel: '',
  language: 'zh' as WritingLanguage,
  languages: emptyWritingText(),
  sensitive: emptySensitive(),
  references: [] as Reference[],
});
export function WritingStudio({
  seed,
  seedRequest,
  onOpenLibrary,
}: {
  seed?: WrittenPrompt;
  seedRequest?: string;
  onOpenLibrary: () => void;
}) {
  const vault = useVault(),
    workspace = useWorkspaceState('writing-studio', blank()),
    { state, setState } = workspace;
  const [collections, setCollections] = useState<
      { id: string; name: string }[]
    >([]),
    [snippets, setSnippets] = useState<WritingSnippet[]>([]),
    [snippetDraft, setSnippetDraft] = useState({
      title: '',
      text: '',
      category: '常用词',
      language: 'any' as WritingLanguage | 'any',
    }),
    [snippetOpen, setSnippetOpen] = useState(false),
    [activeImage, setActiveImage] = useState(0),
    [message, setMessage] = useState(''),
    [saving, setSaving] = useState(false),
    [loadingSeed, setLoadingSeed] = useState(false);
  const [api, setApi] = useState<ApiSettings>({
      id: 'writing-api',
      url: '',
      key: '',
      model: '',
    }),
    [apiOpen, setApiOpen] = useState(false),
    [models, setModels] = useState<string[]>([]),
    [aiBusy, setAiBusy] = useState(false),
    [instruction, setInstruction] = useState(
      '帮助我检查提示词的主体、动作、配饰、光影和材质是否明确，给出不改变原意的改进版本。',
    ),
    [sendImage, setSendImage] = useState(false),
    [sourceLang, setSourceLang] = useState<WritingLanguage>('zh'),
    [targetLang, setTargetLang] = useState<WritingLanguage>('en'),
    [verify, setVerify] = useState(true),
    [glossary, setGlossary] = useState(''),
    [result, setResult] = useState<{
      text: string;
      target: WritingLanguage;
      back: string;
      warnings: string[];
      source: string;
    } | null>(null),
    [resultOpen, setResultOpen] = useState(false);
  const text = useRef<HTMLTextAreaElement>(null),
    apiEdited = useRef(false),
    controller = useRef<AbortController | null>(null),
    loaded = useRef(''),
    urls = useFileUrls(state.references.map((item) => item.file));
  const refresh = () =>
    Promise.all([
      vault
        .loadRecords<{ id: string; name: string }>('writing-collections')
        .then(setCollections),
      vault.loadRecords<WritingSnippet>('writing-snippets').then(setSnippets),
    ]);
  useEffect(() => {
    void refresh().catch((error) => setMessage(String(error)));
    void vault
      .loadRecords<ApiSettings>('writing-api-settings')
      .then((items) => {
        if (items[0] && !apiEdited.current) setApi(items[0]);
      })
      .catch((error) =>
        setMessage(
          error instanceof Error ? error.message : '接口设置读取失败，请重试。',
        ),
      );
    const stop = () => controller.current?.abort();
    const changed = () =>
      void refresh().catch((error) => setMessage(String(error)));
    window.addEventListener('prism:stop-processing', stop);
    window.addEventListener('prism:writing-changed', changed);
    return () => {
      stop();
      window.removeEventListener('prism:stop-processing', stop);
      window.removeEventListener('prism:writing-changed', changed);
    };
  }, [vault.session]);
  useEffect(() => {
    if (
      !workspace.ready ||
      !seed ||
      loaded.current === `${seedRequest}:${seed.id}:${seed.activeVersion}`
    )
      return;
    loaded.current = `${seedRequest}:${seed.id}:${seed.activeVersion}`;
    controller.current?.abort();
    setResultOpen(false);
    setResult(null);
    if (!seed.id) {
      setState(blank());
      setActiveImage(0);
      setLoadingSeed(false);
      return;
    }
    let cancelled = false;
    setLoadingSeed(true);
    setMessage('正在载入这个版本的写词和例图…');
    void (async () => {
      await workspace.flush();
      const version = writingVersion(seed),
        blobs = await vault.loadBlobs(
          seed.mediaScope,
          version.media.map((media) => media.id),
        ),
        byId = new Map(blobs.map((blob) => [blob.id, blob]));
      if (cancelled) return;
      setState({
        ...blank(),
        docId: seed.id,
        title: seed.title,
        category: seed.category,
        author: seed.author,
        origin: seed.origin,
        note: seed.note,
        tags: seed.tags.join('、'),
        languages: { ...emptyWritingText(), ...version.languages },
        sensitive: { ...emptySensitive(), ...version.sensitive },
        references: version.media.flatMap((media) => {
          const blob = byId.get(media.id);
          return blob
            ? [
                {
                  id: media.id,
                  blobId: media.id,
                  file: new File([blob.blob], media.name, { type: media.type }),
                  role: media.role,
                  variant: media.variant,
                },
              ]
            : [];
        }),
        versionNote: '',
        versionLabel: '',
      });
      setMessage(`已载入 ${seed.title} / ${version.label}；保存时会新增版本。`);
    })()
      .catch((error) => {
        if (!cancelled) {
          loaded.current = '';
          setMessage(String(error));
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingSeed(false);
      });
    return () => {
      cancelled = true;
    };
  }, [seed?.id, seed?.activeVersion, seedRequest, workspace.ready]);
  useEffect(
    () =>
      setActiveImage((value) =>
        Math.max(0, Math.min(value, state.references.length - 1)),
      ),
    [state.references.length],
  );
  const insert = (addition: string) => {
    const node = text.current,
      original = state.languages[state.language],
      point = node?.selectionStart ?? original.length,
      { start, end } = writingInsertionRange(
        original,
        addition,
        point,
        node?.selectionEnd ?? point,
      );
    setState((current) => ({
      ...current,
      languages: {
        ...current.languages,
        [current.language]: insertWritingText(
          current.languages[current.language],
          addition,
          start,
          end,
        ),
      },
    }));
    requestAnimationFrame(() => {
      text.current?.focus();
      text.current?.setSelectionRange(
        start +
          addition.length +
          (start && !/\s/.test(original[start - 1]) ? 1 : 0),
        start +
          addition.length +
          (start && !/\s/.test(original[start - 1]) ? 1 : 0),
      );
    });
  };
  const addImages = (files: File[], role: Reference['role']) => {
    if (files.length + state.references.length > 50) {
      setMessage('一个写词草稿最多保留 50 张参考图与例图，请分成多个草稿。');
      return;
    }
    setState((current) => ({
      ...current,
      references: [
        ...current.references,
        ...files.map((file) => ({ id: crypto.randomUUID(), file, role })),
      ],
    }));
  };
  const save = async () => {
    if (saving || !state.title.trim()) {
      setMessage('请填写写词名称。');
      return;
    }
    const parts = Object.fromEntries(
      writingLanguages.map((lang) => [
        lang.id,
        splitPromptVariants(state.languages[lang.id]),
      ]),
    ) as Record<WritingLanguage, string[]>;
    const count = Math.max(
      1,
      ...Object.values(parts).map((values) => values.length),
    );
    if (!Object.values(state.languages).some((value) => value.trim())) {
      setMessage('请先写一点提示词。');
      return;
    }
    if (
      count > 1 &&
      state.references.some(
        (item) => item.role === 'example' && item.variant === undefined,
      )
    ) {
      setMessage(
        '检测到双版本词，请先给每张例图选择版本归属，或明确选择共同适用。',
      );
      return;
    }
    setSaving(true);
    try {
      const records = await vault.loadRecords<WrittenPrompt>('writing-prompts'),
        old = records.find((record) => record.id === state.docId),
        rootId = old?.familyId || old?.id || crypto.randomUUID(),
        scope = old?.mediaScope || `writing-media:${rootId}`,
        now = new Date().toISOString(),
        media = state.references.map((item) => ({
          id: item.blobId || `writing-image:${rootId}:${item.id}`,
          name: item.file.name,
          type: item.file.type,
          role: item.role,
          variant: item.variant,
        }));
      const docs: WrittenPrompt[] = Array.from({ length: count }, (_, i) => {
        const id = i === 0 ? old?.id || rootId : `${rootId}:variant:${i + 1}`,
          previous = records.find((record) => record.id === id),
          version = {
            id: crypto.randomUUID(),
            label:
              state.versionLabel.trim() ||
              `V${(previous?.versions.length || 0) + 1}`,
            createdAt: now,
            languages: Object.fromEntries(
              writingLanguages.map((lang) => [
                lang.id,
                parts[lang.id][i] || '',
              ]),
            ) as typeof state.languages,
            sensitive: state.sensitive,
            note: state.versionNote,
            media: media.filter(
              (item) =>
                count === 1 ||
                item.role === 'reference' ||
                item.variant === 'shared' ||
                item.variant === i,
            ),
          };
        return {
          id,
          title: state.title.trim() + (count > 1 ? ` · 版本 ${i + 1}` : ''),
          category: state.category,
          author: state.author.trim() || '自创',
          origin: state.origin,
          note: state.note,
          tags: state.tags
            .split(/[,，、]/)
            .map((value) => value.trim())
            .filter(Boolean),
          familyId: rootId,
          variantLabel: count > 1 ? `版本 ${i + 1}` : previous?.variantLabel,
          mediaScope: scope,
          versions: [...(previous?.versions || []), version],
          activeVersion: version.id,
          createdAt: previous?.createdAt || now,
          updatedAt: now,
        };
      });
      await vault.writeBatch({
        records: docs.map((doc) => ({ scope: 'writing-prompts', value: doc })),
        blobs: state.references
          .filter((item) => !item.blobId)
          .map((item) => ({
            id: media[state.references.indexOf(item)].id,
            scope,
            blob: item.file,
            name: item.file.name,
          })),
      });
      setState((current) => ({
        ...current,
        docId: docs[0].id,
        references: current.references.map((item) => ({
          ...item,
          blobId:
            item.blobId ||
            media[state.references.findIndex((source) => source.id === item.id)]
              ?.id,
        })),
        versionLabel:
          current.versionLabel === state.versionLabel
            ? ''
            : current.versionLabel,
        versionNote:
          current.versionNote === state.versionNote ? '' : current.versionNote,
      }));
      await workspace.flush();
      setMessage(`已保存 ${count} 个独立写词版本到自己的写词库；旧版本保留。`);
      window.dispatchEvent(new CustomEvent('prism:writing-changed'));
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : '保存失败，草稿保留。',
      );
    } finally {
      setSaving(false);
    }
  };
  const request = async (action: 'models' | 'translate' | 'assist') => {
    if (aiBusy) return;
    const control = new AbortController();
    controller.current = control;
    setAiBusy(true);
    const tracked = startTask(
      'writing-ai',
      action === 'translate'
        ? '写词翻译与核对'
        : action === 'models'
          ? '读取模型列表'
          : 'AI 写词辅助',
      'writer',
      { stop: () => control.abort() },
    );
    try {
      tracked.indeterminate('正在请求你配置的服务…');
      if (action === 'models') {
        const list = await writingApiModels(api, control.signal);
        setModels(list);
        if (!api.model) setApi((current) => ({ ...current, model: list[0] }));
        setMessage(`已读取 ${list.length} 个模型。`);
      } else if (action === 'translate') {
        const output = await translateWriting(
          api,
          state.languages[sourceLang],
          sourceLang,
          targetLang,
          control.signal,
          verify,
          glossary,
        );
        setResult({
          text: output.translation,
          target: targetLang,
          source: state.languages[sourceLang],
          back: output.backTranslation,
          warnings: output.warnings,
        });
        setResultOpen(true);
      } else {
        let image: string | undefined;
        if (sendImage && state.references[activeImage]) {
          const bitmap = await createImageBitmap(
              state.references[activeImage].file,
            ),
            canvas = document.createElement('canvas');
          const scale = Math.min(
            1,
            1536 / Math.max(bitmap.width, bitmap.height),
          );
          canvas.width = Math.round(bitmap.width * scale);
          canvas.height = Math.round(bitmap.height * scale);
          canvas
            .getContext('2d')!
            .drawImage(bitmap, 0, 0, canvas.width, canvas.height);
          image = canvas.toDataURL('image/jpeg', 0.9);
          bitmap.close();
          canvas.width = canvas.height = 0;
        }
        const output = await assistWriting(
          api,
          state.languages[state.language],
          state.language,
          instruction,
          control.signal,
          image
            ? { data: image, variant: state.references[activeImage]?.variant }
            : undefined,
        );
        setResult({
          text: output,
          target: state.language,
          source: state.languages[state.language],
          back: '',
          warnings: ['AI 建议是草稿，请核对原意和 MJ 参数后采用。'],
        });
        setResultOpen(true);
      }
      tracked.done();
    } catch (error) {
      if (control.signal.aborted) tracked.pause();
      else tracked.fail(error);
      setMessage(
        control.signal.aborted
          ? '请求已取消，原草稿保留。'
          : error instanceof Error
            ? error.message
            : '请求失败。',
      );
    } finally {
      controller.current = null;
      setAiBusy(false);
    }
  };
  const variants = Math.max(
    1,
    ...writingLanguages.map(
      (lang) => splitPromptVariants(state.languages[lang.id]).length,
    ),
  );
  return (
    <div className="studio-page writing-page">
      <SectionHead
        eyebrow="WRITING STUDIO"
        number="15"
        title="写词练习"
        description="参考图、六种语言、常用词条和版本记录放在同一处。草稿自动在本机加密保存。"
        actions={
          <>
            <Button variant="outline" onClick={onOpenLibrary}>
              自己的写词库
            </Button>
            <Button variant="outline" onClick={() => setApiOpen(true)}>
              API 设置
            </Button>
          </>
        }
      />
      {(message || workspace.saveError) && (
        <p className="writing-message" role="status">
          {workspace.saveError || message}
        </p>
      )}
      <fieldset
        className="writing-layout"
        disabled={!workspace.ready || loadingSeed}
      >
        <aside
          className="writing-references"
          data-file-drop-target="writing-reference-images"
          tabIndex={0}
        >
          <header>
            <strong>参考图 / 本版例图</strong>
            <label className="mini-file">
              导入参考图
              <input
                id="writing-reference-images"
                type="file"
                accept="image/*"
                multiple
                disabled={!workspace.ready}
                onChange={(event) => {
                  addImages(Array.from(event.target.files || []), 'reference');
                  event.target.value = '';
                }}
              />
            </label>
            <label className="mini-file">
              导入例图
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={(event) => {
                  addImages(Array.from(event.target.files || []), 'example');
                  event.target.value = '';
                }}
              />
            </label>
          </header>
          {urls[activeImage] ? (
            <ExampleImage
              src={urls[activeImage]}
              alt="写词参考图"
              images={urls.map((url, index) => ({
                url,
                name: state.references[index].file.name,
              }))}
              index={activeImage}
            />
          ) : (
            <p className="empty-state">拖入参考图或粘贴图片，边看边写。</p>
          )}
          <div className="writing-image-nav">
            <Button
              variant="outline"
              disabled={activeImage <= 0}
              onClick={() => setActiveImage((value) => value - 1)}
            >
              上一张
            </Button>
            <IndexJump
              label="写词参考图序号"
              index={activeImage}
              count={urls.length}
              onChange={setActiveImage}
            />
            <Button
              variant="outline"
              disabled={activeImage >= urls.length - 1}
              onClick={() => setActiveImage((value) => value + 1)}
            >
              下一张
            </Button>
          </div>
          {state.references[activeImage] && (
            <div className="writing-image-settings">
              <select
                aria-label="当前图片用途"
                value={state.references[activeImage].role}
                onChange={(event) =>
                  setState((current) => ({
                    ...current,
                    references: current.references.map((item, i) =>
                      i === activeImage
                        ? {
                            ...item,
                            role: event.target.value as Reference['role'],
                          }
                        : item,
                    ),
                  }))
                }
              >
                <option value="reference">只作参考</option>
                <option value="example">作为此版例图</option>
              </select>
              {variants > 1 &&
                state.references[activeImage].role === 'example' && (
                  <select
                    aria-label="例图版本归属"
                    value={state.references[activeImage].variant ?? ''}
                    onChange={(event) =>
                      setState((current) => ({
                        ...current,
                        references: current.references.map((item, i) =>
                          i === activeImage
                            ? {
                                ...item,
                                variant:
                                  event.target.value === 'shared'
                                    ? 'shared'
                                    : event.target.value === ''
                                      ? undefined
                                      : Number(event.target.value),
                              }
                            : item,
                        ),
                      }))
                    }
                  >
                    <option value="">选择例图归属</option>
                    <option value="shared">共同适用全部版本</option>
                    {Array.from({ length: variants }, (_, i) => (
                      <option value={i} key={i}>
                        版本 {i + 1}
                      </option>
                    ))}
                  </select>
                )}
              <Button
                variant="outline"
                onClick={() => {
                  setState((current) => ({
                    ...current,
                    references: current.references.filter(
                      (_, i) => i !== activeImage,
                    ),
                  }));
                  setActiveImage((value) => Math.max(0, value - 1));
                }}
              >
                移除当前图
              </Button>
            </div>
          )}
        </aside>
        <section className="writing-editor">
          <div className="writing-metadata">
            <label>
              写词名称
              <input
                aria-label="写词名称"
                value={state.title}
                onChange={(event) =>
                  setState((current) => ({
                    ...current,
                    title: event.target.value,
                  }))
                }
              />
            </label>
            <label>
              分类
              <select
                aria-label="写词分类"
                value={state.category}
                onChange={(event) =>
                  setState((current) => ({
                    ...current,
                    category: event.target.value,
                  }))
                }
              >
                <option value="unfiled">未分类</option>
                {collections.map((item) => (
                  <option value={item.id} key={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            <Button
              variant="outline"
              onClick={async () => {
                const name = window.prompt('新分类名称');
                if (name?.trim()) {
                  const item = { id: crypto.randomUUID(), name: name.trim() };
                  await vault.saveRecord('writing-collections', item);
                  setCollections((current) => [...current, item]);
                  setState((current) => ({ ...current, category: item.id }));
                }
              }}
            >
              新建分类
            </Button>
          </div>
          <div
            className="writing-language-tabs"
            role="tablist"
            aria-label="写词语言"
          >
            {writingLanguages.map((lang) => (
              <button
                type="button"
                role="tab"
                aria-selected={state.language === lang.id}
                key={lang.id}
                onClick={() =>
                  setState((current) => ({ ...current, language: lang.id }))
                }
              >
                {lang.name}
                {state.languages[lang.id] ? ' ·' : ''}
              </button>
            ))}
          </div>
          <textarea
            ref={text}
            className="writing-main-text"
            aria-label="写词文本"
            value={state.languages[state.language]}
            onChange={(event) =>
              setState((current) => ({
                ...current,
                languages: {
                  ...current.languages,
                  [current.language]: event.target.value,
                },
              }))
            }
            placeholder="写下主体、动作、光影、质感与参数…"
          />
          <TextReview after={state.languages[state.language]} />
          {variants > 1 && (
            <p className="import-warning">
              检测到 {variants}{' '}
              个完整版本，保存时会拆成独立词条；请为例图选择归属。
            </p>
          )}
          <div className="writing-editor-actions">
            <Button
              variant="outline"
              onClick={() =>
                void import('@/lib/clipboard').then((module) =>
                  module.copyText(state.languages[state.language]),
                )
              }
            >
              复制当前语言
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                const node = text.current,
                  value = state.languages[state.language]
                    .slice(node?.selectionStart || 0, node?.selectionEnd || 0)
                    .trim();
                if (!value) {
                  setMessage('请先在写词框里选中需要标紫的词。');
                  return;
                }
                setState((current) => ({
                  ...current,
                  sensitive: {
                    ...current.sensitive,
                    [current.language]: [
                      ...new Set([
                        ...current.sensitive[current.language],
                        value,
                      ]),
                    ],
                  },
                }));
              }}
            >
              选中文字标记为敏感词
            </Button>
          </div>
          <div className="writing-sensitive">
            {state.sensitive[state.language].map((term) => (
              <button
                type="button"
                key={term}
                onClick={() =>
                  setState((current) => ({
                    ...current,
                    sensitive: {
                      ...current.sensitive,
                      [current.language]: current.sensitive[
                        current.language
                      ].filter((value) => value !== term),
                    },
                  }))
                }
              >
                {term} ×
              </button>
            ))}
          </div>
          <details className="writing-phrase-book" open>
            <summary>提示词参考 / 我的常用词条</summary>
            <div className="writing-term-list">
              {writingTerms.map((term) => (
                <button
                  type="button"
                  key={term.en}
                  onClick={() => insert(term[state.language])}
                >
                  <small>{term.category}</small>
                  {term[state.language]}
                </button>
              ))}
              {snippets
                .filter(
                  (item) =>
                    item.language === 'any' || item.language === state.language,
                )
                .map((item) => (
                  <span key={item.id}>
                    <button type="button" onClick={() => insert(item.text)}>
                      {item.title || item.text}
                    </button>
                    <button
                      type="button"
                      aria-label={`删除词条 ${item.title}`}
                      onClick={async () => {
                        await vault.deleteRecord(item.id);
                        setSnippets((current) =>
                          current.filter((value) => value.id !== item.id),
                        );
                      }}
                    >
                      ×
                    </button>
                  </span>
                ))}
            </div>
            <Button variant="outline" onClick={() => setSnippetOpen(true)}>
              添加我的常用词条
            </Button>
          </details>
          <details className="writing-ai">
            <summary>翻译与 AI 辅助</summary>
            <p className="muted-note">
              调用接口会把所选描述正文发送给你配置的服务。MJ
              参数在本机保留；参考图仅在下方勾选后发送。
            </p>
            <p>点击请求后，文字会发送到你配置的服务；图片由下面的开关控制。</p>
            <div className="writing-translation-fields">
              <label>
                源语言
                <select
                  aria-label="翻译源语言"
                  value={sourceLang}
                  onChange={(event) =>
                    setSourceLang(event.target.value as WritingLanguage)
                  }
                >
                  {writingLanguages.map((lang) => (
                    <option value={lang.id} key={lang.id}>
                      {lang.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                目标语言
                <select
                  aria-label="翻译目标语言"
                  value={targetLang}
                  onChange={(event) =>
                    setTargetLang(event.target.value as WritingLanguage)
                  }
                >
                  {writingLanguages.map((lang) => (
                    <option value={lang.id} key={lang.id}>
                      {lang.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label>
              <input
                type="checkbox"
                checked={verify}
                onChange={(event) => setVerify(event.target.checked)}
              />
              翻译后再反译核对一次（每个独立版本两次请求）
            </label>
            <label>
              术语译法偏好
              <textarea
                value={glossary}
                onChange={(event) => setGlossary(event.target.value)}
                placeholder="例如：厚涂 = impasto painting"
              />
            </label>
            <Button disabled={aiBusy} onClick={() => void request('translate')}>
              翻译并核对
            </Button>
            <label>
              AI 辅助要求
              <textarea
                aria-label="AI 辅助要求"
                value={instruction}
                onChange={(event) => setInstruction(event.target.value)}
              />
            </label>
            <label>
              <input
                type="checkbox"
                checked={sendImage}
                onChange={(event) => setSendImage(event.target.checked)}
              />
              把当前参考图发送给该服务作辅助
            </label>
            <Button disabled={aiBusy} onClick={() => void request('assist')}>
              请求 AI 建议
            </Button>
            {aiBusy && (
              <Button
                variant="outline"
                onClick={() => controller.current?.abort()}
              >
                取消请求
              </Button>
            )}
          </details>
          <details>
            <summary>作者、备注与版本信息</summary>
            <div className="writing-metadata">
              <label>
                作者
                <input
                  value={state.author}
                  onChange={(event) =>
                    setState((current) => ({
                      ...current,
                      author: event.target.value,
                    }))
                  }
                />
              </label>
              <label>
                来源
                <input
                  value={state.origin}
                  onChange={(event) =>
                    setState((current) => ({
                      ...current,
                      origin: event.target.value,
                    }))
                  }
                />
              </label>
              <label>
                标签
                <input
                  value={state.tags}
                  onChange={(event) =>
                    setState((current) => ({
                      ...current,
                      tags: event.target.value,
                    }))
                  }
                />
              </label>
              <label>
                备注
                <textarea
                  value={state.note}
                  onChange={(event) =>
                    setState((current) => ({
                      ...current,
                      note: event.target.value,
                    }))
                  }
                />
              </label>
              <label>
                版本名称
                <input
                  aria-label="写词版本名称"
                  value={state.versionLabel}
                  onChange={(event) =>
                    setState((current) => ({
                      ...current,
                      versionLabel: event.target.value,
                    }))
                  }
                  placeholder="留空自动编号"
                />
              </label>
              <label>
                本次修改说明
                <textarea
                  value={state.versionNote}
                  onChange={(event) =>
                    setState((current) => ({
                      ...current,
                      versionNote: event.target.value,
                    }))
                  }
                />
              </label>
            </div>
          </details>
          <div className="writing-save-actions">
            <Button
              disabled={saving || !workspace.ready}
              onClick={() => void save()}
            >
              {saving ? '保存中…' : '保存为新版本'}
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                if (
                  window.confirm('清空当前写词草稿？已入库的版本不会删除。')
                ) {
                  setState(blank());
                  loaded.current = '';
                }
              }}
            >
              清空草稿
            </Button>
          </div>
        </section>
      </fieldset>
      <Dialog open={apiOpen} onOpenChange={setApiOpen}>
        <DialogContent className="writing-api-dialog">
          <DialogTitle>AI 接口与密钥</DialogTitle>
          <DialogDescription>
            密钥与保险库一起加密保存在本机。请填写允许浏览器跨域调用的 OpenAI
            兼容接口根地址。
          </DialogDescription>
          <label>
            接口地址
            <input
              aria-label="写词 API 地址"
              value={api.url}
              onChange={(event) => {
                apiEdited.current = true;
                setApi((current) => ({ ...current, url: event.target.value }));
              }}
              placeholder="https://你的服务/v1"
            />
          </label>
          <label>
            API Key
            <input
              aria-label="写词 API 密钥"
              type="password"
              autoComplete="new-password"
              value={api.key}
              onChange={(event) => {
                apiEdited.current = true;
                setApi((current) => ({ ...current, key: event.target.value }));
              }}
            />
          </label>
          <Button disabled={aiBusy} onClick={() => void request('models')}>
            读取模型列表
          </Button>
          {message && <p role="status">{message}</p>}
          {models.length > 0 && (
            <label>
              选择服务模型
              <select
                aria-label="写词服务模型列表"
                value={api.model}
                onChange={(event) => {
                  apiEdited.current = true;
                  setApi((current) => ({
                    ...current,
                    model: event.target.value,
                  }));
                }}
              >
                {models.map((model) => (
                  <option value={model} key={model}>
                    {model}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label>
            模型名称
            <input
              aria-label="写词 API 模型"
              list="writing-model-list"
              value={api.model}
              onChange={(event) => {
                apiEdited.current = true;
                setApi((current) => ({
                  ...current,
                  model: event.target.value,
                }));
              }}
            />
            <datalist id="writing-model-list">
              {models.map((model) => (
                <option value={model} key={model} />
              ))}
            </datalist>
          </label>
          <Button
            onClick={async () => {
              try {
                const saved = { ...api, url: apiBase(api.url) };
                await vault.saveRecord('writing-api-settings', saved);
                setApi(saved);
                setApiOpen(false);
                setMessage('API 设置已加密保存。');
              } catch (error) {
                setMessage(String(error));
              }
            }}
          >
            加密保存 API 设置
          </Button>
          <Button
            variant="outline"
            onClick={async () => {
              await vault.deleteRecord('writing-api');
              setApi({ id: 'writing-api', url: '', key: '', model: '' });
              setModels([]);
              setApiOpen(false);
            }}
          >
            删除本机密钥与设置
          </Button>
        </DialogContent>
      </Dialog>
      <Dialog open={resultOpen} onOpenChange={setResultOpen}>
        <DialogContent className="writing-result-dialog">
          <DialogTitle>对照后采用</DialogTitle>
          <DialogDescription>
            检查原意、动作、配饰、风格、材质与参数，再采用目标语言版本。
          </DialogDescription>
          {result && (
            <>
              <TextReview
                before={state.languages[result.target]}
                after={result.text}
              />
              <label>
                原文
                <textarea readOnly value={result.source} />
              </label>
              <label>
                建议 / 译文
                <textarea
                  aria-label="写词 AI 结果"
                  value={result.text}
                  onChange={(event) =>
                    setResult({ ...result, text: event.target.value })
                  }
                />
              </label>
              {result.back && (
                <label>
                  反译核对
                  <textarea readOnly value={result.back} />
                </label>
              )}
              {result.warnings.map((value) => (
                <p key={value}>{value}</p>
              ))}
              <Button
                onClick={() => {
                  setState((current) => ({
                    ...current,
                    language: result.target,
                    languages: {
                      ...current.languages,
                      [result.target]: result.text,
                    },
                  }));
                  setResultOpen(false);
                }}
              >
                采用为{' '}
                {
                  writingLanguages.find((lang) => lang.id === result.target)!
                    .name
                }{' '}
                版本
              </Button>
            </>
          )}
        </DialogContent>
      </Dialog>
      <Dialog open={snippetOpen} onOpenChange={setSnippetOpen}>
        <DialogContent>
          <DialogTitle>添加常用词条</DialogTitle>
          <label>
            名称
            <input
              aria-label="常用词条名称"
              value={snippetDraft.title}
              onChange={(event) =>
                setSnippetDraft({ ...snippetDraft, title: event.target.value })
              }
            />
          </label>
          <label>
            词句
            <textarea
              aria-label="常用词条内容"
              value={snippetDraft.text}
              onChange={(event) =>
                setSnippetDraft({ ...snippetDraft, text: event.target.value })
              }
            />
          </label>
          <label>
            语言
            <select
              value={snippetDraft.language}
              onChange={(event) =>
                setSnippetDraft({
                  ...snippetDraft,
                  language: event.target.value as WritingSnippet['language'],
                })
              }
            >
              <option value="any">通用</option>
              {writingLanguages.map((lang) => (
                <option value={lang.id} key={lang.id}>
                  {lang.name}
                </option>
              ))}
            </select>
          </label>
          <Button
            disabled={!snippetDraft.text.trim()}
            onClick={async () => {
              const item = { ...snippetDraft, id: crypto.randomUUID() };
              await vault.saveRecord('writing-snippets', item);
              setSnippets((current) => [...current, item]);
              setSnippetOpen(false);
              setSnippetDraft({
                title: '',
                text: '',
                category: '常用词',
                language: 'any',
              });
            }}
          >
            保存常用词条
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
