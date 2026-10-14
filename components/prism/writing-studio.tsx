'use client';
import { useEffect, useRef, useState } from 'react';
import {
  ImagePlus,
  Plus,
  ChevronLeft,
  ChevronRight,
  Trash2,
  BookOpen,
  Quote,
  ArrowUpRight,
  Sparkles,
  Copy,
  Highlighter,
  X,
  Settings2,
} from 'lucide-react';
import { YanWindow } from './yan-window';
import {
  translateLocally,
  clearLocalTranslation,
  prepareLocalTranslation,
} from '@/lib/local-translation';
import { autoWritingTitle, cleanAiText, imageDataFile } from '@/lib/ai-content';
import { protectedParameters, applyTranslation, type ApiSettings } from '@/lib/writing-model';
import { translateWriting } from '@/lib/writing-api';
import type { YanProfile } from '@/lib/yan';
import { WritingWordLibrary } from './writing-word-library';
import { copyText } from '@/lib/clipboard';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogFooter,
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
  emptyWritingText,
  emptySensitive,
  writingLanguages,
  insertWritingText,
  writingInsertionRange,
  writingVersion,
  type WritingLanguage,
  type WrittenPrompt,
} from '@/lib/writing-model';
const languageName = (id: WritingLanguage) =>
  ({ zh: '中文', en: '英语', fr: '法语', es: '西语', ja: '日语', ko: '韩语' })[
    id
  ];
type WritingResult = {
  text: string;
  target: WritingLanguage;
  source: string;
  back: string;
  warnings: string[];
};
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
    [activeImage, setActiveImage] = useState(0),
    [message, setMessage] = useState(''),
    [saving, setSaving] = useState(false),
    [loadingSeed, setLoadingSeed] = useState(false);
  const [apiOpen, setApiOpen] = useState(false),
    [aiBusy,setAiBusy]=useState(false),
    [translationMode, setTranslationMode] = useState<'local' | 'ai'>('local'),
    [targetLang, setTargetLang] = useState<WritingLanguage>('en'),
    [verify, setVerify] = useState(false),
    [glossary, setGlossary] = useState(''),
    [result, setResult] = useState<{
      text: string;
      target: WritingLanguage;
      back: string;
      warnings: string[];
      source: string;
    } | null>(null),
    [resultOpen, setResultOpen] = useState(false);
  const [wordLibrary, setWordLibrary] = useState<
      'reference' | 'snippet' | null
    >(null),
    [assistOpen, setAssistOpen] = useState(false),
    [translationOptions, setTranslationOptions] = useState(false),
    [pendingTranslations, setPendingTranslations] = useState<WritingResult[]>(
      [],
    );
  const translatedText = useRef<HTMLTextAreaElement>(null);
  const text = useRef<HTMLTextAreaElement>(null),
    controller = useRef<AbortController | null>(null),
    loaded = useRef(''),
    urls = useFileUrls(state.references.map((item) => item.file));
  const refresh = () =>
    vault
      .loadRecords<{ id: string; name: string }>('writing-collections')
      .then(setCollections);
  useEffect(() => {
    void refresh().catch((error) => setMessage(String(error)));
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
      original = state.languages.zh,
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
        zh: insertWritingText(current.languages.zh, addition, start, end),
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
    if (saving) return;
    const title = state.title.trim() || autoWritingTitle(state.languages.zh);
    setState((current) => ({ ...current, title }));
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
          title: title + (count > 1 ? ` · 版本 ${i + 1}` : ''),
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
      window.dispatchEvent(new CustomEvent('prism:writing-changed'));
      setMessage(`已保存到自写词库：${title}；同一条写词的旧版本保留。`);
      try {
        await workspace.flush();
      } catch {
        setMessage('写词已入库；草稿同步未完成，稍后会重试。');
      }
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : '保存失败，草稿保留。',
      );
    } finally {
      setSaving(false);
    }
  };
  const request = async (action: 'translate' | 'translate-all') => {
    if (aiBusy) return;
    const control = new AbortController();
    controller.current = control;
    setAiBusy(true);
    const tracked = startTask(
      'writing-translation',
      translationMode === 'local' ? '本机翻译' : 'AI 翻译',
      'writer',
      { stop: () => control.abort() },
    );
    const translated: WritingResult[] = [];
    setPendingTranslations([]);
    try {
      const targets =
        action === 'translate-all'
          ? writingLanguages
              .filter((lang) => lang.id !== 'zh')
              .map((lang) => lang.id)
          : [targetLang];
      let aiSettings: ApiSettings | undefined;
      if (translationMode === 'ai') {
        const [profiles, bindings, legacy] = await Promise.all([
          vault.loadRecords<YanProfile>('yan-api-profiles'),
          vault.loadRecords<{ write?: string }>('yan-api-bindings'),
          vault.loadRecords<ApiSettings>('writing-api-settings'),
        ]);
        let available = profiles;
        let writeBinding = bindings[0]?.write || '';
        if (!available.length && legacy[0]) {
          const migrated: YanProfile = {
            ...legacy[0],
            id: 'yan-migrated-main',
            name: '主 API',
          };
          available = [migrated];
          writeBinding = migrated.id;
          await vault.writeBatch({
            records: [
              { scope: 'yan-api-profiles', value: migrated },
              {
                scope: 'yan-api-bindings',
                value: {
                  id: 'yan-bindings',
                  write: migrated.id,
                  image: '',
                  vision: '',
                },
              },
            ],
          });
        }
        const profile = available.find((item) => item.id === writeBinding);
        if (!profile?.key.trim() || !profile.model.trim()) {
          setApiOpen(true);
          setMessage(
            '请先在晏的 API 设置中配置并绑定“写词晏”主接口，再试 AI 翻译。',
          );
          tracked.fail(new Error('尚未配置写词晏主 API。'));
          return;
        }
        aiSettings = { ...profile, id: 'writing-api' };
      }
      for (const language of targets) {
        const output =
          translationMode === 'local'
            ? await translateLocally(
                state.languages.zh,
                'zh',
                language,
                control.signal,
                (message) => {
                  tracked.indeterminate(message);
                  setMessage(message);
                },
                verify,
              )
            : await translateWriting(
                aiSettings!,
                state.languages.zh,
                'zh',
                language,
                control.signal,
                verify,
                glossary,
              );
        translated.push({
          text: output.translation,
          target: language,
          source: state.languages.zh,
          back: output.backTranslation,
          warnings: [
            ...output.warnings,
            ...(translationMode === 'local' && glossary.trim()
              ? ['术语备忘（请对照译文核对）：' + glossary]
              : []),
          ],
        });
      }
      setPendingTranslations(translated);
      setResult(translated[0]);
      setResultOpen(true);
      setMessage(
        translationMode === 'local'
          ? '本机翻译完成，未调用 API。'
          : 'AI 翻译完成，请逐项核对语义和细节。',
      );
      tracked.done();
    } catch (error) {
      if (translated.length) {
        setPendingTranslations(translated);
        setResult(translated[0]);
        setResultOpen(true);
      }
      if (control.signal.aborted) tracked.pause();
      else tracked.fail(error);
      setMessage(
        error instanceof Error
          ? error.message
          : translationMode === 'local'
            ? '本机翻译失败。'
            : 'AI 翻译失败。',
      );
    } finally {
      controller.current = null;
      setAiBusy(false);
    }
  };
  useEffect(() => {
    if (!workspace.ready) return;
    const encoded = Object.values(state.languages).find((value) =>
      value.includes('data:image/'),
    );
    if (!encoded) return;
    const uri = encoded.match(
      /data:image\/(?:png|jpeg|webp|gif);base64,[A-Za-z0-9+/=\s]+/i,
    )?.[0];
    let file: File | undefined;
    try {
      if (uri) file = imageDataFile(uri, 'AI返回参考图.png');
    } catch {}
    setState((current) => ({
      ...current,
      languages: Object.fromEntries(
        Object.entries(current.languages).map(([id, value]) => [
          id,
          value.includes('data:image/')
            ? cleanAiText(value)
                .replace(/!\[[^\]]*\]\s*\(\s*\)/g, '')
                .trim()
            : value,
        ]),
      ) as typeof current.languages,
      references: file
        ? [
            ...current.references,
            { id: crypto.randomUUID(), file, role: 'reference' },
          ]
        : current.references,
    }));
    setMessage('AI 返回的图片编码已从正文分离，恢复为参考图。');
  }, [workspace.ready]);
  useEffect(() => {
    const stop = () => clearLocalTranslation();
    window.addEventListener('prism:stop-processing', stop);
    return () => window.removeEventListener('prism:stop-processing', stop);
  }, []);
  const variants = Math.max(
    1,
    ...writingLanguages.map(
      (lang) => splitPromptVariants(state.languages[lang.id]).length,
    ),
  );
  return (
    <div
      className="studio-page writing-page writing-redesign"
      data-assistant-open={assistOpen || apiOpen}
    >
      <SectionHead
        eyebrow="WRITING STUDIO"
        number="15"
        title="写词"
        description="从中文原稿开始，边看参考图边写，再翻译、核对和保存自己的版本。"
        actions={
          <>
            <Button variant="outline" onClick={onOpenLibrary}>
              自写词库
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
          <div className="writing-pane-heading">
            <div>
              <small>REFERENCE</small>
              <h2>参考与例图</h2>
            </div>
            <span>{state.references.length} 张</span>
          </div>
          <div className="writing-image-imports">
            <label className="writing-file-control">
              <ImagePlus />
              添加参考
              <input
                id="writing-reference-images"
                type="file"
                accept="image/*"
                multiple
                onChange={(event) => {
                  addImages(Array.from(event.target.files || []), 'reference');
                  event.target.value = '';
                }}
              />
            </label>
            <label className="writing-file-control">
              <Plus />
              添加例图
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
          </div>
          {urls[activeImage] ? (
            <ExampleImage
              src={urls[activeImage]}
              alt="写词参考图"
              index={activeImage}
              images={urls.map((url, index) => ({
                url,
                name: state.references[index].file.name,
              }))}
            />
          ) : (
            <div className="writing-reference-empty">
              <ImagePlus />
              <strong>把参考图放在这里</strong>
              <p>支持多张图片、拖拽和粘贴</p>
            </div>
          )}
          <div className="writing-image-nav">
            <button
              aria-label="上一张写词参考"
              disabled={!activeImage}
              onClick={() => setActiveImage((value) => value - 1)}
            >
              <ChevronLeft />
            </button>
            <IndexJump
              label="写词参考图序号"
              index={activeImage}
              count={urls.length}
              onChange={setActiveImage}
            />
            <button
              aria-label="下一张写词参考"
              disabled={activeImage >= urls.length - 1}
              onClick={() => setActiveImage((value) => value + 1)}
            >
              <ChevronRight />
            </button>
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
                <option value="reference">参考图</option>
                <option value="example">本版例图</option>
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
                    <option value="">选择版本</option>
                    <option value="shared">全部版本共同适用</option>
                    {Array.from({ length: variants }, (_, i) => (
                      <option key={i} value={i}>
                        版本 {i + 1}
                      </option>
                    ))}
                  </select>
                )}
              <button
                className="writing-remove-image"
                aria-label="移除当前参考图"
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
                <Trash2 />
              </button>
            </div>
          )}
          <div className="writing-word-entry">
            <button onClick={() => setWordLibrary('reference')}>
              <BookOpen />
              <span>
                <strong>参考词库</strong>
                <small>风格 · 光影 · 质感 · 构图</small>
              </span>
              <ArrowUpRight />
            </button>
            <button onClick={() => setWordLibrary('snippet')}>
              <Quote />
              <span>
                <strong>常用词语录</strong>
                <small>收纳你自己的词句和片段</small>
              </span>
              <ArrowUpRight />
            </button>
          </div>
        </aside>
        <section className="writing-editor">
          <div className="writing-document-heading">
            <input
              aria-label="写词名称"
              placeholder="给这条写词起个名字"
              value={state.title}
              onChange={(event) =>
                setState((current) => ({
                  ...current,
                  title: event.target.value,
                }))
              }
            />
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
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
            <button
              className="writing-quiet-action"
              aria-label="新建写词分类"
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
              <Plus />
            </button>
          </div>
          <div className="writing-original-heading">
            <div>
              <small>ORIGINAL</small>
              <h2>中文原稿</h2>
            </div>
            <button
              className="writing-ai-entry"
              onClick={() => setAssistOpen(true)}
            >
              <Sparkles />
              晏 · AI 助手
            </button>
          </div>
          <textarea
            ref={text}
            className="writing-main-text"
            aria-label="写词文本"
            value={state.languages.zh}
            onChange={(event) =>
              setState((current) => ({
                ...current,
                languages: { ...current.languages, zh: event.target.value },
              }))
            }
            placeholder="写下人物、动作、配饰、光影、质感与构图…"
          />
          <div className="writing-editor-actions">
            <button onClick={() => void copyText(state.languages.zh)}>
              <Copy />
              复制中文
            </button>
            <button
              onClick={() => {
                const node = text.current,
                  value = state.languages.zh
                    .slice(node?.selectionStart || 0, node?.selectionEnd || 0)
                    .trim();
                if (!value) {
                  setMessage('先选中需要标紫的词，再点击标记。');
                  return;
                }
                setState((current) => ({
                  ...current,
                  sensitive: {
                    ...current.sensitive,
                    zh: [...new Set([...current.sensitive.zh, value])],
                  },
                }));
              }}
            >
              <Highlighter />
              标记敏感词
            </button>
            <span>{state.languages.zh.length} 字</span>
          </div>
          <div className="writing-sensitive">
            {state.sensitive.zh.map((term) => (
              <button
                key={term}
                onClick={() =>
                  setState((current) => ({
                    ...current,
                    sensitive: {
                      ...current.sensitive,
                      zh: current.sensitive.zh.filter(
                        (value) => value !== term,
                      ),
                    },
                  }))
                }
              >
                {term}
                <X />
              </button>
            ))}
          </div>
          <TextReview after={state.languages.zh} />
          {variants > 1 && (
            <p className="import-warning">
              检测到 {variants} 个版本。保存时分别收纳，请先为例图选择归属。
            </p>
          )}
          <section className="writing-translation-card">
            <div className="writing-translation-heading">
              <div>
                <small>TRANSLATION</small>
                <h2>中文翻译</h2>
              </div>
              <div className="writing-translation-selects">
                <label>
                  翻译方式
                  <select
                    aria-label="翻译方式"
                    value={translationMode}
                    onChange={(event) =>
                      setTranslationMode(event.target.value as 'local' | 'ai')
                    }
                  >
                    <option value="local">本机（默认）</option>
                    <option value="ai">AI（主 API）</option>
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
                    {writingLanguages
                      .filter((lang) => lang.id !== 'zh')
                      .map((lang) => (
                        <option key={lang.id} value={lang.id}>
                          {languageName(lang.id)}
                        </option>
                      ))}
                  </select>
                </label>
              </div>
            </div>
            <p>
              {translationMode === 'local'
                ? '本机翻译不调用 API。首次准备约 670 MB 语言包，之后可离线使用；翻译结果请核对后采用。'
                : 'AI 翻译调用晏绑定的“写词晏”主 API，只发送中文原稿和术语备忘，可能产生服务费用；请核对后采用。'}
            </p>
            {translationMode === 'local' ? (
              <Button
                variant="outline"
                disabled={aiBusy}
                onClick={async () => {
                  const control = new AbortController();
                  controller.current = control;
                  setAiBusy(true);
                  try {
                    await prepareLocalTranslation(control.signal, setMessage);
                    setMessage('本地语言包已就绪。');
                  } catch (error) {
                    setMessage(String(error));
                  } finally {
                    setAiBusy(false);
                    controller.current = null;
                  }
                }}
              >
                准备本地语言包（约 670 MB）
              </Button>
            ) : (
              <Button
                variant="outline"
                disabled={aiBusy}
                onClick={() => setApiOpen(true)}
              >
                管理晏的 API 设置
              </Button>
            )}
            <div className="writing-translation-actions">
              <Button
                disabled={aiBusy || !state.languages.zh.trim()}
                onClick={() => void request('translate')}
              >
                {aiBusy
                  ? '处理中…'
                  : `${translationMode === 'local' ? '本机' : 'AI'} 翻译为${languageName(targetLang)}`}
              </Button>
              <Button
                variant="outline"
                disabled={aiBusy || !state.languages.zh.trim()}
                onClick={() => void request('translate-all')}
              >
                {translationMode === 'local' ? '本机' : 'AI'} 翻译全部五种语言
              </Button>
              <button
                className="writing-quiet-action"
                onClick={() => setTranslationOptions((value) => !value)}
              >
                <Settings2 />
                核对设置
              </button>
            </div>
            {translationOptions && (
              <div className="writing-translation-options">
                <label className="check-line">
                  <input
                    type="checkbox"
                    checked={verify}
                    onChange={(event) => setVerify(event.target.checked)}
                  />
                  {translationMode === 'local'
                    ? '本机反译核对（增加本机计算量）'
                    : 'AI 反译核对（会额外调用一次 API）'}
                </label>
                <label>
                  术语复核备忘
                  <textarea
                    value={glossary}
                    onChange={(event) => setGlossary(event.target.value)}
                    placeholder="例如：厚涂 = impasto painting"
                  />
                </label>
              </div>
            )}
            {state.languages[targetLang] && (
              <div className="writing-adopted-translation">
                <label>
                  {languageName(targetLang)}译文
                  <textarea
                    ref={translatedText}
                    aria-label="已采用译文"
                    value={state.languages[targetLang]}
                    onChange={(event) =>
                      setState((current) => ({
                        ...current,
                        languages: {
                          ...current.languages,
                          [targetLang]: event.target.value,
                        },
                      }))
                    }
                  />
                </label>
                <div className="record-secret-actions">
                  <button
                    onClick={() => void copyText(state.languages[targetLang])}
                  >
                    <Copy />
                    复制译文
                  </button>
                  <button
                    onClick={() => {
                      const node = translatedText.current,
                        value = state.languages[targetLang]
                          .slice(
                            node?.selectionStart || 0,
                            node?.selectionEnd || 0,
                          )
                          .trim();
                      if (!value) {
                        setMessage('先选中译文中需要标紫的词，再点击标记。');
                        return;
                      }
                      setState((current) => ({
                        ...current,
                        sensitive: {
                          ...current.sensitive,
                          [targetLang]: [
                            ...new Set([
                              ...current.sensitive[targetLang],
                              value,
                            ]),
                          ],
                        },
                      }));
                    }}
                  >
                    <Highlighter />
                    标记译文词
                  </button>
                  <button
                    onClick={() =>
                      setState((current) => ({
                        ...current,
                        languages: { ...current.languages, [targetLang]: '' },
                      }))
                    }
                  >
                    <Trash2 />
                    删除译文
                  </button>
                </div>
                <div className="writing-sensitive">
                  {state.sensitive[targetLang].map((term) => (
                    <button
                      key={term}
                      onClick={() =>
                        setState((current) => ({
                          ...current,
                          sensitive: {
                            ...current.sensitive,
                            [targetLang]: current.sensitive[targetLang].filter(
                              (value) => value !== term,
                            ),
                          },
                        }))
                      }
                    >
                      {term}
                      <X />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </section>
          <details className="writing-meta-extra">
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
                版本名称
                <input
                  aria-label="写词版本名称"
                  placeholder="留空自动编号"
                  value={state.versionLabel}
                  onChange={(event) =>
                    setState((current) => ({
                      ...current,
                      versionLabel: event.target.value,
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
                本次修改记录
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
            <Button disabled={saving} onClick={() => void save()}>
              {saving ? '保存中…' : '保存为新版本'}
            </Button>
            <button
              className="writing-quiet-action"
              onClick={() => {
                if (window.confirm('清空当前草稿？已入库的版本会保留。')) {
                  setState(blank());
                  loaded.current = '';
                }
              }}
            >
              清空草稿
            </button>
          </div>
        </section>
      </fieldset>
      <WritingWordLibrary
        kind="reference"
        open={wordLibrary === 'reference'}
        onOpenChange={(value) => {
          if (!value) setWordLibrary(null);
        }}
        onInsert={insert}
      />
      <WritingWordLibrary
        kind="snippet"
        open={wordLibrary === 'snippet'}
        onOpenChange={(value) => {
          if (!value) setWordLibrary(null);
        }}
        onInsert={insert}
      />
      <YanWindow
        open={assistOpen || apiOpen}
        openSettings={apiOpen}
        onClose={() => {
          setAssistOpen(false);
          setApiOpen(false);
        }}
        draft={state.languages.zh}
        currentImage={state.references[activeImage]?.file}
        onUseText={(value) => {
          const source = state.languages.zh;
          setState((current) => ({
            ...current,
            languages: {
              ...current.languages,
              zh: protectedParameters(source).parameters
                ? applyTranslation(source, protectedParameters(value).body)
                : cleanAiText(value),
            },
          }));
        }}
        onUseImage={(file) => addImages([file], 'reference')}
      />
      <Dialog open={resultOpen} onOpenChange={setResultOpen}>
        <DialogContent className="writing-result-dialog">
          <DialogTitle>
            {result?.target === 'zh' ? '对照 AI 建议' : '核对译文'}
          </DialogTitle>
          <DialogDescription>
            检查人物、动作、配饰、否定词与风格，确认后采用。
          </DialogDescription>
          {result && (
            <>
              {pendingTranslations.length > 1 && (
                <div className="writing-result-languages">
                  {pendingTranslations.map((item) => (
                    <button
                      key={item.target}
                      aria-pressed={item.target === result.target}
                      onClick={() => {
                        setPendingTranslations((current) =>
                          current.map((value) =>
                            value.target === result.target ? result : value,
                          ),
                        );
                        setResult(item);
                      }}
                    >
                      {languageName(item.target)}
                    </button>
                  ))}
                </div>
              )}
              <div className="writing-result-comparison">
                <label>
                  中文原稿
                  <textarea readOnly value={result.source} />
                </label>
                <label>
                  {result.target === 'zh'
                    ? 'AI 建议'
                    : `${languageName(result.target)}译文`}
                  <textarea
                    aria-label="写词 AI 结果"
                    value={result.text}
                    onChange={(event) =>
                      setResult({ ...result, text: event.target.value })
                    }
                  />
                </label>
              </div>
              {result.back && (
                <details className="writing-back-translation" open>
                  <summary>中文反译核对</summary>
                  <textarea readOnly value={result.back} />
                  <TextReview
                    before={result.source.replace(/--[\s\S]*/, '').trim()}
                    after={result.back}
                  />
                </details>
              )}
              {result.target === 'zh' && (
                <TextReview before={result.source} after={result.text} />
              )}
              <div className="writing-result-notes">
                {result.warnings.map((value) => (
                  <p key={value}>{value}</p>
                ))}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setResultOpen(false)}>
                  继续核对
                </Button>
                {pendingTranslations.length > 1 && (
                  <Button
                    variant="outline"
                    onClick={() => {
                      const values = pendingTranslations.map((value) =>
                        value.target === result.target ? result : value,
                      );
                      setState((current) => ({
                        ...current,
                        language: 'zh',
                        languages: {
                          ...current.languages,
                          ...Object.fromEntries(
                            values.map((value) => [value.target, value.text]),
                          ),
                        },
                      }));
                      setResultOpen(false);
                    }}
                  >
                    采用全部已核对译文
                  </Button>
                )}
                <Button
                  onClick={() => {
                    setState((current) => ({
                      ...current,
                      language: 'zh',
                      languages: {
                        ...current.languages,
                        [result.target]: result.text,
                      },
                    }));
                    if (result.target !== 'zh') setTargetLang(result.target);
                    setResultOpen(false);
                  }}
                >
                  采用
                  {result.target === 'zh'
                    ? '中文建议'
                    : languageName(result.target) + '译文'}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
