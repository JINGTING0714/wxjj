'use client';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Minus,
  Plus,
  Copy,
  Send,
  Trash2,
  Settings2,
  ImagePlus,
} from 'lucide-react';
import { useVault } from './vault-provider';
import { useFileUrls } from './use-workspace-state';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { copyText } from '@/lib/clipboard';
import { writingApiModels } from '@/lib/writing-api';
import {
  yanChat,
  yanGenerate,
  yanImageInput,
  yanNames,
  type YanRole,
  type YanProfile,
  type YanConversation,
} from '@/lib/yan';
import type { ApiSettings } from '@/lib/writing-model';
type Binding = {
  id: 'yan-bindings';
  write: string;
  image: string;
  vision: string;
};
const emptyBinding: Binding = {
  id: 'yan-bindings',
  write: '',
  image: '',
  vision: '',
};
export function YanWindow({
  open,
  onClose,
  draft,
  currentImage,
  onUseText,
  onUseImage,
  initialRole = 'write',
  openSettings = false,
}: {
  open: boolean;
  onClose: () => void;
  draft: string;
  currentImage?: File;
  onUseText: (text: string) => void;
  onUseImage: (file: File) => void;
  initialRole?: YanRole;
  openSettings?: boolean;
}) {
  const vault = useVault(),
    [profiles, setProfiles] = useState<YanProfile[]>([]),
    [binding, setBinding] = useState<Binding>(emptyBinding),
    [threads, setThreads] = useState<YanConversation[]>([]),
    [selected, setSelected] = useState(''),
    [kind, setKind] = useState<YanRole>(initialRole),
    [input, setInput] = useState(''),
    [busy, setBusy] = useState(false),
    [status, setStatus] = useState(''),
    [minimized, setMinimized] = useState(false),
    [settingsOpen, setSettingsOpen] = useState(false),
    [editing, setEditing] = useState<YanProfile | null>(null),
    [models, setModels] = useState<string[]>([]),
    [photo, setPhoto] = useState<File>(),
    [attach, setAttach] = useState(false),
    [size, setSize] = useState('1024x1024'),
    [generated, setGenerated] = useState<File[]>([]),
    [galleryPictures, setGalleryPictures] = useState<
      { id: string; file: File }[]
    >([]),
    [historyOpen, setHistoryOpen] = useState(false);
  const abort = useRef<AbortController | null>(null),
    chatRef = useRef<HTMLDivElement>(null),
    profile = profiles.find((item) => item.id === binding[kind]),
    thread = threads.find((item) => item.id === selected),
    image = photo || currentImage,
    urls = useFileUrls(generated),
    historyUrls = useFileUrls(galleryPictures.map((item) => item.file));
  useEffect(() => {
    if (!open) return;
    setKind(initialRole);
    setMinimized(false);
    setSettingsOpen(openSettings);
    void (async () => {
      let stored = await vault.loadRecords<YanProfile>('yan-api-profiles');
      let bindings =
        (await vault.loadRecords<Binding>('yan-api-bindings'))[0] ||
        emptyBinding;
      if (!stored.length) {
        const old = (
          await vault.loadRecords<ApiSettings>('writing-api-settings')
        )[0];
        if (old) {
          const migrated = { ...old, id: 'yan-migrated-main', name: '主 API' };
          stored = [migrated];
          bindings = { ...emptyBinding, write: migrated.id };
          await vault.writeBatch({
            records: [
              { scope: 'yan-api-profiles', value: migrated },
              { scope: 'yan-api-bindings', value: bindings },
            ],
          });
        }
      }
      setProfiles(stored);
      setBinding(bindings);
      const records =
        await vault.loadRecords<YanConversation>('yan-conversations');
      setThreads(records);
      setSelected(records.find((item) => item.kind === initialRole)?.id || '');
    })().catch((error) => setStatus(String(error)));
  }, [open, vault.session]);
  useEffect(() => {
    if (openSettings) setSettingsOpen(true);
  }, [openSettings]);
  useEffect(() => {
    const stop = () => {
      abort.current?.abort();
      onClose();
    };
    window.addEventListener('prism:stop-processing', stop);
    return () => window.removeEventListener('prism:stop-processing', stop);
  }, []);
  useEffect(() => {
    chatRef.current?.scrollTo({
      top: chatRef.current.scrollHeight,
      behavior: 'auto',
    });
  }, [thread?.messages.length, busy]);
  useEffect(() => {
    let cancelled = false;
    setGalleryPictures([]);
    const ids =
      thread?.messages.flatMap(
        (message) => message.media?.map((item) => item.id) || [],
      ) || [];
    if (ids.length)
      void vault
        .loadBlobs('gallery:yan-generated', ids)
        .then((blobs) => {
          if (!cancelled)
            setGalleryPictures(
              blobs.map((blob) => ({
                id: blob.id,
                file: new File([blob.blob], blob.name, {
                  type: blob.blob.type,
                }),
              })),
            );
        })
        .catch((error) => setStatus(String(error)));
    return () => {
      cancelled = true;
    };
  }, [selected, thread?.messages.length]);
  const record = async (next: YanConversation) => {
    await vault.saveRecord('yan-conversations', next);
    setThreads((items) => [
      next,
      ...items.filter((item) => item.id !== next.id),
    ]);
    setSelected(next.id);
  };
  const fresh = async () => {
    const now = new Date().toISOString(),
      next: YanConversation = {
        id: crypto.randomUUID(),
        title: '新对话',
        kind,
        messages: [],
        createdAt: now,
        updatedAt: now,
      };
    await record(next);
    setInput('');
    setStatus('');
    setGenerated([]);
  };
  const send = async () => {
    if (busy) return;
    const requestProfile =
      kind !== 'image' && attach && image
        ? profiles.find((item) => item.id === binding.vision)
        : profile;
    if (!requestProfile?.key.trim() || !requestProfile.model.trim()) {
      setStatus(
        '先为' +
          (attach && image && kind !== 'image' ? '识图晏' : yanNames[kind]) +
          '选择接口和模型。',
      );
      setSettingsOpen(true);
      return;
    }
    const body =
      input.trim() ||
      (kind === 'vision' && attach && image
        ? '请准确描述这张图的主体、动作、配饰、光影、构图与材质。'
        : '');
    if (!body) {
      setStatus('可以聊灵感、提问题或描述画面，不需要先在写词框填写内容。');
      return;
    }
    if (body.length > 12000) {
      setStatus('单次消息请控制在 12000 字以内。');
      return;
    }
    const control = new AbortController();
    abort.current = control;
    setBusy(true);
    setStatus('');
    const now = new Date().toISOString(),
      base: YanConversation =
        thread && thread.kind === kind
          ? thread
          : {
              id: crypto.randomUUID(),
              title: body.slice(0, 18),
              kind,
              messages: [],
              createdAt: now,
              updatedAt: now,
            };
    const next: YanConversation = {
      ...base,
      title: base.messages.length ? base.title : body.slice(0, 18),
      updatedAt: now,
      messages: [
        ...base.messages,
        { id: crypto.randomUUID(), role: 'user', text: body, createdAt: now },
      ],
    };
    try {
      await record(next);
      setInput('');
      if (kind === 'image') {
        setStatus('生图晏正在生成…');
        const files = await yanGenerate(
          requestProfile,
          body,
          control.signal,
          size,
        );
        const created = new Date().toISOString(),
          media = files.map((file) => ({
            id: crypto.randomUUID(),
            name: file.name,
          })),
          result: YanConversation = {
            ...next,
            messages: [
              ...next.messages,
              {
                id: crypto.randomUUID(),
                role: 'assistant',
                text: '图片已生成并自动收纳到图库的“晏生图”。',
                createdAt: created,
                media,
              },
            ],
            updatedAt: created,
          };
        await vault.writeBatch({
          records: [
            { scope: 'yan-conversations', value: result },
            {
              scope: 'gallery-collections',
              value: { id: 'yan-generated', name: '晏生图' },
            },
            ...files.map((file, i) => ({
              scope: 'gallery-image-meta',
              value: {
                id: media[i].id,
                name: file.name,
                collection: 'yan-generated',
                note: body,
                tags: ['晏生图', requestProfile.model],
                createdAt: created,
                updatedAt: created,
              },
            })),
          ],
          blobs: files.map((file, i) => ({
            id: media[i].id,
            scope: 'gallery:yan-generated',
            blob: file,
            name: file.name,
          })),
        });
        setGenerated(files);
        setThreads((items) => [
          result,
          ...items.filter((item) => item.id !== result.id),
        ]);
        window.dispatchEvent(new CustomEvent('prism:gallery-refresh'));
        setStatus('已自动保存到图库。');
      } else {
        setStatus(
          attach && image ? '正在发送所选参考图，等待模型回复…' : '晏正在思考…',
        );
        const reply = await yanChat(
          requestProfile,
          next.messages,
          control.signal,
          attach && image ? await yanImageInput(image) : undefined,
        );
        await record({
          ...next,
          updatedAt: new Date().toISOString(),
          messages: [
            ...next.messages,
            {
              id: crypto.randomUUID(),
              role: 'assistant',
              text: reply,
              createdAt: new Date().toISOString(),
            },
          ],
        });
        setStatus('');
      }
    } catch (error) {
      setStatus(
        control.signal.aborted
          ? '已停止，历史对话保留。'
          : error instanceof Error
            ? error.message
            : '请求失败。',
      );
    } finally {
      setBusy(false);
      abort.current = null;
    }
  };
  const switchKind = (value: YanRole) => {
    if (busy) return;
    setKind(value);
    setSelected(threads.find((item) => item.kind === value)?.id || '');
    setGenerated([]);
    setAttach(false);
    setStatus('');
  };
  if (!open) return null;
  return (
    <>
      {createPortal(
        minimized ? (
          <button className="yan-minimized" onClick={() => setMinimized(false)}>
            打开{yanNames[kind]}
          </button>
        ) : (
          <section className="yan-window" aria-label={yanNames[kind]}>
            <header>
              <div>
                <strong>{yanNames[kind]}</strong>
                <small>提示词工程师 · 私人创作助手</small>
              </div>
              <button
                aria-label="晏接口设置"
                onClick={() => setSettingsOpen(true)}
              >
                <Settings2 />
              </button>
              <button
                aria-label="收起晏窗口"
                onClick={() => setMinimized(true)}
              >
                <Minus />
              </button>
              <button
                aria-label="关闭晏窗口"
                onClick={() => {
                  abort.current?.abort();
                  onClose();
                }}
              >
                <X />
              </button>
            </header>
            <nav aria-label="晏工作模式">
              {(['write', 'image', 'vision'] as const).map((role) => (
                <button
                  key={role}
                  disabled={busy}
                  aria-pressed={role === kind}
                  onClick={() => switchKind(role)}
                >
                  {yanNames[role]}
                </button>
              ))}
            </nav>
            <div className="yan-toolbar">
              <select
                aria-label="晏当前接口"
                value={binding[kind]}
                onChange={async (e) => {
                  const next = { ...binding, [kind]: e.target.value };
                  await vault.saveRecord('yan-api-bindings', next);
                  setBinding(next);
                }}
              >
                <option value="">选择接口</option>
                {profiles.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} · {item.model || '待选模型'}
                  </option>
                ))}
              </select>
              <button onClick={() => setHistoryOpen((value) => !value)}>
                历史
              </button>
              <button
                aria-label="创建晏新对话"
                disabled={busy}
                onClick={() =>
                  void fresh().catch((error) => setStatus(String(error)))
                }
              >
                <Plus />
                新对话
              </button>
            </div>
            {historyOpen && (
              <div className="yan-history">
                {threads
                  .filter((item) => item.kind === kind)
                  .map((item) => (
                    <div key={item.id}>
                      <button
                        disabled={busy}
                        onClick={() => {
                          setSelected(item.id);
                          setHistoryOpen(false);
                        }}
                      >
                        {item.title}
                      </button>
                      <button
                        aria-label={'删除晏对话 ' + item.title}
                        disabled={busy}
                        onClick={async () => {
                          if (
                            !window.confirm(
                              '删除这段对话？已生成并收纳到图库的图片保留。',
                            )
                          )
                            return;
                          await vault.deleteRecord(item.id);
                          setThreads((items) =>
                            items.filter((value) => value.id !== item.id),
                          );
                          if (selected === item.id) setSelected('');
                        }}
                      >
                        <Trash2 />
                      </button>
                    </div>
                  ))}
              </div>
            )}
            <div className="yan-chat" ref={chatRef}>
              {!thread?.messages.length && (
                <div className="yan-welcome">
                  <strong>你好，我是晏。</strong>
                  <p>
                    {kind === 'image'
                      ? '描述你想生成的画面。支持的生图模型会在这里生成参考图，并自动保存到图库。'
                      : '可以一起聊灵感、审美与用词，也可以精修提示词。写词框留空也能交流。'}
                  </p>
                  {kind === 'write' && draft.trim() && (
                    <button
                      onClick={() =>
                        setInput(
                          '请帮我检查这条提示词，重点保留动作和细节：\n' +
                            draft,
                        )
                      }
                    >
                      把当前原稿带入对话
                    </button>
                  )}
                </div>
              )}
              {thread?.messages.map((message) => (
                <article
                  key={message.id}
                  className={'yan-message ' + message.role}
                >
                  <small>
                    {message.role === 'assistant' ? yanNames[kind] : '我'}
                  </small>
                  <p>{message.text}</p>
                  {message.role === 'assistant' && (
                    <div>
                      <button onClick={() => void copyText(message.text)}>
                        <Copy />
                        复制
                      </button>
                      {kind !== 'image' && (
                        <button onClick={() => onUseText(message.text)}>
                          采用到中文原稿
                        </button>
                      )}
                    </div>
                  )}
                  {message.media?.map((media) => {
                    const index = galleryPictures.findIndex(
                      (item) => item.id === media.id,
                    );
                    return index >= 0 ? (
                      <div className="yan-generated" key={media.id}>
                        <img src={historyUrls[index]} alt={media.name} />
                        <button
                          onClick={() =>
                            onUseImage(galleryPictures[index].file)
                          }
                        >
                          作为写词参考
                        </button>
                      </div>
                    ) : null;
                  })}
                </article>
              ))}
            </div>
            {status && <output className="yan-status">{status}</output>}
            <div className="yan-compose">
              {kind === 'image' ? (
                <select
                  aria-label="晏生图尺寸"
                  value={size}
                  onChange={(e) => setSize(e.target.value)}
                >
                  <option>1024x1024</option>
                  <option>1024x1536</option>
                  <option>1536x1024</option>
                  <option>1792x1024</option>
                  <option>1024x1792</option>
                </select>
              ) : (
                <div className="yan-attachment">
                  <label>
                    <ImagePlus />
                    选择参考图
                    <input
                      aria-label="晏参考图"
                      type="file"
                      accept="image/*"
                      onChange={(e) => {
                        setPhoto(e.target.files?.[0]);
                        setAttach(true);
                      }}
                    />
                  </label>
                  {image && (
                    <label>
                      <input
                        type="checkbox"
                        checked={attach}
                        onChange={(e) => setAttach(e.target.checked)}
                      />
                      发送 {image.name}
                    </label>
                  )}
                </div>
              )}
              <textarea
                aria-label="与晏交流"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={
                  kind === 'image'
                    ? '描述要生成的画面…'
                    : '聊一聊灵感，或者向晏提问…'
                }
                onKeyDown={(e) => {
                  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                    e.preventDefault();
                    void send();
                  }
                }}
              />
              <div>
                <small>
                  {attach && image
                    ? '参考图由识图晏接口处理，发送前请确认服务支持图片输入。'
                    : '对话在本机加密保存，点击发送才调用所选 API。'}
                </small>
                {busy ? (
                  <Button
                    variant="outline"
                    onClick={() => abort.current?.abort()}
                  >
                    停止
                  </Button>
                ) : (
                  <Button onClick={() => void send()}>
                    <Send />
                    {kind === 'image' ? '生成图片' : '发送'}
                  </Button>
                )}
              </div>
            </div>
          </section>
        ),
        document.body,
      )}
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="yan-api-dialog">
          <DialogTitle>晏的接口与模型</DialogTitle>
          <DialogDescription>
            保存多个中转站，分别指定主接口（写词）、副接口（生图）与识图接口。密钥只在本机保险库加密保存。
          </DialogDescription>
          <div className="yan-api-roles">
            {(['write', 'image', 'vision'] as const).map((role) => (
              <label key={role}>
                {yanNames[role]}
                <select
                  aria-label={yanNames[role] + '接口绑定'}
                  value={binding[role]}
                  onChange={async (e) => {
                    const next = { ...binding, [role]: e.target.value };
                    await vault.saveRecord('yan-api-bindings', next);
                    setBinding(next);
                  }}
                >
                  <option value="">尚未选择</option>
                  {profiles.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          <div className="yan-api-list">
            {profiles.map((item) => (
              <div key={item.id}>
                <button
                  onClick={() => {
                    setEditing({ ...item });
                    setModels([]);
                  }}
                >
                  {item.name} · {item.model}
                </button>
                <button
                  aria-label={'删除接口 ' + item.name}
                  onClick={async () => {
                    await vault.deleteRecord(item.id);
                    setProfiles((items) =>
                      items.filter((profile) => profile.id !== item.id),
                    );
                    const next = { ...binding };
                    for (const role of ['write', 'image', 'vision'] as const)
                      if (next[role] === item.id) next[role] = '';
                    await vault.saveRecord('yan-api-bindings', next);
                    setBinding(next);
                  }}
                >
                  <Trash2 />
                </button>
              </div>
            ))}
          </div>
          <Button
            variant="outline"
            onClick={() => {
              setEditing({
                id: crypto.randomUUID(),
                name: '新接口',
                url: '',
                key: '',
                model: '',
                transport: 'direct',
              });
              setModels([]);
            }}
          >
            <Plus />
            添加接口
          </Button>
          {editing && (
            <div className="yan-api-editor">
              <label>
                名称
                <input
                  aria-label="晏接口名称"
                  value={editing.name}
                  onChange={(e) =>
                    setEditing({ ...editing, name: e.target.value })
                  }
                />
              </label>
              <label>
                接口地址
                <input
                  aria-label="晏 API 地址"
                  value={editing.url}
                  onChange={(e) =>
                    setEditing({ ...editing, url: e.target.value })
                  }
                  placeholder="https://你的服务/v1"
                />
              </label>
              <label>
                API Key
                <input
                  aria-label="晏 API 密钥"
                  type="password"
                  autoComplete="new-password"
                  value={editing.key}
                  onChange={(e) =>
                    setEditing({ ...editing, key: e.target.value })
                  }
                />
              </label>
              <Button
                disabled={busy}
                variant="outline"
                onClick={async () => {
                  setBusy(true);
                  const control = new AbortController();
                  abort.current = control;
                  try {
                    const list = await writingApiModels(
                      { ...editing, id: 'writing-api' },
                      control.signal,
                    );
                    setModels(list);
                    setStatus('已读取 ' + list.length + ' 个模型。');
                  } catch (error) {
                    setStatus(String(error));
                  } finally {
                    setBusy(false);
                    abort.current = null;
                  }
                }}
              >
                读取模型列表
              </Button>
              <label>
                模型
                <input
                  aria-label="晏模型名称"
                  list="yan-models"
                  value={editing.model}
                  onChange={(e) =>
                    setEditing({ ...editing, model: e.target.value })
                  }
                />
                <datalist id="yan-models">
                  {models.map((model) => (
                    <option key={model}>{model}</option>
                  ))}
                </datalist>
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={!!editing.vision}
                  onChange={(e) =>
                    setEditing({ ...editing, vision: e.target.checked })
                  }
                />
                该模型支持图像输入（由服务提供）
              </label>
              <label>
                生图接口
                <select
                  aria-label="晏生图接口类型"
                  value={editing.imageEndpoint || 'images'}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      imageEndpoint: e.target.value as 'images' | 'chat',
                    })
                  }
                >
                  <option value="images">Images / generations</option>
                  <option value="chat">Chat / completions 图像模型</option>
                </select>
              </label>
              <Button
                onClick={async () => {
                  if (
                    !editing.name.trim() ||
                    !editing.url.trim() ||
                    !editing.key.trim()
                  ) {
                    setStatus('请填写名称、接口地址与密钥。');
                    return;
                  }
                  await vault.saveRecord('yan-api-profiles', editing);
                  setProfiles((items) => [
                    editing,
                    ...items.filter((item) => item.id !== editing.id),
                  ]);
                  setEditing(null);
                  setStatus('接口已加密保存。');
                }}
              >
                保存接口
              </Button>
            </div>
          )}
          {status && <output>{status}</output>}
        </DialogContent>
      </Dialog>
    </>
  );
}
