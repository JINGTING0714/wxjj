'use client';
import { useDeferredValue, useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, ArrowUpRight, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { useVault } from './vault-provider';
import { writingTerms, type WritingSnippet } from '@/lib/writing-model';
const extraTerms = [
  ['风格', '清透写实', 'clear realistic rendering'],
  ['风格', '复古胶片', 'vintage film aesthetic'],
  ['风格', '水彩晕染', 'watercolor washes'],
  ['风格', '油画笔触', 'visible oil paint brushstrokes'],
  ['风格', '梦幻氛围', 'dreamlike atmosphere'],
  ['光影', '柔和逆光', 'soft backlighting'],
  ['光影', '窗边自然光', 'natural window light'],
  ['光影', '电影感光影', 'cinematic lighting'],
  ['光影', '冷暖对比光', 'contrasting warm and cool lighting'],
  ['光影', '暮色余晖', 'warm dusk glow'],
  ['质感', '细腻发丝', 'finely rendered hair strands'],
  ['质感', '柔软针织', 'soft knit fabric'],
  ['质感', '金属反光', 'reflective metal'],
  ['质感', '透明玻璃', 'transparent glass'],
  ['质感', '细腻肌肤纹理', 'subtle skin texture'],
  ['构图', '半身肖像', 'half-body portrait'],
  ['构图', '近景特写', 'close-up'],
  ['构图', '留白构图', 'composition with negative space'],
  ['构图', '三分法构图', 'rule of thirds composition'],
  ['镜头', '微微俯视', 'slightly elevated camera angle'],
  ['镜头', '眼平视角', 'eye-level angle'],
  ['配色', '柔和粉蓝', 'soft pink and blue palette'],
  ['配色', '低饱和灰紫', 'muted grayish purple palette'],
  ['氛围', '安静而温柔', 'quiet and gentle atmosphere'],
];
type Term = WritingSnippet & { english?: string };
const presets = () => [
  ...writingTerms.map((item, index) => ({
    id: `reference-seed-${index}`,
    title: item.zh,
    text: item.zh,
    english: item.en,
    category: item.category,
    language: 'zh' as const,
  })),
  ...extraTerms.map(([category, text, english], index) => ({
    id: `reference-extra-${index}`,
    title: text,
    text,
    english,
    category,
    language: 'zh' as const,
  })),
];
export function WritingWordLibrary({
  kind,
  open,
  onOpenChange,
  onInsert,
}: {
  kind: 'reference' | 'snippet';
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onInsert: (text: string) => void;
}) {
  const vault = useVault(),
    scope =
      kind === 'reference' ? 'writing-reference-terms' : 'writing-snippets',
    title = kind === 'reference' ? '参考词库' : '常用词语录';
  const [items, setItems] = useState<Term[]>([]),
    [loading, setLoading] = useState(true),
    [query, setQuery] = useState(''),
    [category, setCategory] = useState('all'),
    [editing, setEditing] = useState<Term | null>(null),
    [saving, setSaving] = useState(false),
    [message, setMessage] = useState('');
  const search = useDeferredValue(query.trim().toLocaleLowerCase());
  useEffect(() => {
    if (!open) return;
    setLoading(true);
    let cancelled = false;
    void (async () => {
      let stored = await vault.loadRecords<Term>(scope);
      if (kind === 'reference') {
        const meta = await vault.loadRecords<{
          id: string;
          initialized: boolean;
        }>('writing-reference-settings');
        if (!meta.some((item) => item.initialized)) {
          const defaults = presets().filter(
            (item) => !stored.some((old) => old.id === item.id),
          );
          await vault.writeBatch({
            records: [
              ...defaults.map((value) => ({ scope, value })),
              {
                scope: 'writing-reference-settings',
                value: {
                  id: 'writing-reference-initialized',
                  initialized: true,
                },
              },
            ],
          });
          stored = [...stored, ...defaults];
        }
      }
      if (!cancelled) setItems(stored);
    })()
      .finally(() => {
        if (!cancelled) setLoading(false);
      })
      .catch((error) =>
        setMessage(error instanceof Error ? error.message : '词库读取失败。'),
      );
    return () => {
      cancelled = true;
    };
  }, [open, vault.session, scope]);
  const categories = [
      ...new Set(items.map((item) => item.category || '未分类')),
    ],
    filtered = items.filter(
      (item) =>
        (category === 'all' || (item.category || '未分类') === category) &&
        [item.title, item.text, item.english || '']
          .join(' ')
          .toLocaleLowerCase()
          .includes(search),
    );
  const blank = (): Term => ({
    id: crypto.randomUUID(),
    title: '',
    text: '',
    english: '',
    category:
      category === 'all'
        ? kind === 'reference'
          ? '我的参考词'
          : '我的常用词'
        : category,
    language: 'zh',
  });
  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="writing-word-dialog">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {kind === 'reference'
              ? '按风格、光影、质感和构图查找参考词，所有词条都可自由修改、添加或删除。'
              : '收纳你常用的表达与完整片段，点击采用后会插入中文原稿。'}
          </DialogDescription>
          <div className="word-library-toolbar">
            <label>
              <Search />
              <input
                aria-label={`搜索${title}`}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜索词条"
              />
            </label>
            <Button
              variant="outline"
              disabled={loading}
              onClick={() => setEditing(blank())}
            >
              <Plus />
              添加词条
            </Button>
          </div>
          <div className="word-library-categories">
            <button
              aria-pressed={category === 'all'}
              onClick={() => setCategory('all')}
            >
              全部 <small>{items.length}</small>
            </button>
            {categories.map((value) => (
              <button
                key={value}
                aria-pressed={category === value}
                onClick={() => setCategory(value)}
              >
                {value}
              </button>
            ))}
          </div>
          {message && <p role="status">{message}</p>}
          <div className="word-library-rows">
            {filtered.map((item) => (
              <article key={item.id}>
                <button
                  className="word-adopt"
                  onClick={() => {
                    onInsert(item.text);
                    onOpenChange(false);
                  }}
                >
                  <span>
                    <strong>{item.title || item.text}</strong>
                    <small>
                      {item.category}
                      {item.english ? ' · ' + item.english : ''}
                    </small>
                    {item.title && item.title !== item.text && (
                      <p>{item.text}</p>
                    )}
                  </span>
                  <ArrowUpRight />
                </button>
                <button
                  className="word-row-icon"
                  aria-label={`编辑词条 ${item.title}`}
                  onClick={() => setEditing({ ...item })}
                >
                  <Pencil />
                </button>
                <button
                  className="word-row-icon"
                  aria-label={`删除词条 ${item.title}`}
                  onClick={async () => {
                    try {
                      await vault.deleteRecord(item.id);
                      setItems((current) =>
                        current.filter((value) => value.id !== item.id),
                      );
                    } catch (error) {
                      setMessage(
                        error instanceof Error
                          ? error.message
                          : '删除失败，请重试。',
                      );
                    }
                  }}
                >
                  <Trash2 />
                </button>
              </article>
            ))}
            {loading && <p className="empty-state">正在整理词条…</p>}
            {!loading && !filtered.length && (
              <p className="empty-state">
                还没有词条。添加自己的表达，随时采用。
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!editing}
        onOpenChange={(value) => {
          if (!value) setEditing(null);
        }}
      >
        <DialogContent className="writing-word-edit-dialog">
          <DialogTitle>
            {items.some((item) => item.id === editing?.id)
              ? '编辑词条'
              : '添加词条'}
          </DialogTitle>
          {editing && (
            <>
              <label>
                名称
                <input
                  aria-label="词条名称"
                  value={editing.title}
                  onChange={(event) =>
                    setEditing({ ...editing, title: event.target.value })
                  }
                />
              </label>
              <label>
                分类
                <input
                  aria-label="词条分类"
                  list={`word-categories-${kind}`}
                  value={editing.category}
                  onChange={(event) =>
                    setEditing({ ...editing, category: event.target.value })
                  }
                />
                <datalist id={`word-categories-${kind}`}>
                  {categories.map((value) => (
                    <option key={value}>{value}</option>
                  ))}
                </datalist>
              </label>
              <label>
                中文表达
                <textarea
                  aria-label="词条内容"
                  value={editing.text}
                  onChange={(event) =>
                    setEditing({ ...editing, text: event.target.value })
                  }
                />
              </label>
              {kind === 'reference' && (
                <label>
                  英文译法参考（可留空）
                  <input
                    aria-label="词条英文参考"
                    value={editing.english || ''}
                    onChange={(event) =>
                      setEditing({ ...editing, english: event.target.value })
                    }
                  />
                </label>
              )}
              <DialogFooter>
                <Button variant="outline" onClick={() => setEditing(null)}>
                  取消
                </Button>
                <Button
                  disabled={saving || !editing.text.trim()}
                  onClick={async () => {
                    setSaving(true);
                    try {
                      const value = {
                        ...editing,
                        title:
                          editing.title.trim() ||
                          editing.text.trim().slice(0, 30),
                        text: editing.text.trim(),
                        category: editing.category.trim() || '未分类',
                      };
                      await vault.saveRecord(scope, value);
                      setItems((current) => [
                        ...current.filter((item) => item.id !== value.id),
                        value,
                      ]);
                      setEditing(null);
                    } catch (error) {
                      setMessage(String(error));
                    } finally {
                      setSaving(false);
                    }
                  }}
                >
                  保存词条
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
