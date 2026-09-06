'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  Copy,
  Eye,
  EyeOff,
  FolderPlus,
  Image as ImageIcon,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  CustomFieldList,
  CustomFieldsEditor,
  SectionHead,
} from './studio-shared';
import { FileImportDialog } from './file-import-dialog';
import { useVault } from './vault-provider';
import { useFileUrls } from './use-workspace-state';
import {
  natureLabel,
  profileCodes,
  profileImageScope,
  resolveLegacyProfileIds,
} from '@/lib/profile-model';
import {
  normalizeCustomFields,
  secretPreview,
  type AssetImage,
  type CollectionRecord,
  type CustomField,
  type ProfileShortCode,
  type StoredLibraryAsset,
  type StoredRecipe,
} from '@/lib/prism-types';
import type { VaultWrite } from '@/lib/local-vault';

type HydratedCode = ProfileShortCode & { images: AssetImage[]; added: File[] };
type Folder = StoredLibraryAsset & { codes: HydratedCode[] };
const newCode = (): HydratedCode => ({
  id: crypto.randomUUID(),
  label: '',
  secret: '',
  nature: 'unconfirmed',
  note: '',
  customFields: [],
  images: [],
  added: [],
});
function Secret({ value, long = false }: { value: string; long?: boolean }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const hide = () => setShow(false);
    window.addEventListener('prism:hide-secrets', hide);
    return () => window.removeEventListener('prism:hide-secrets', hide);
  }, []);
  return (
    <div className="profile-secret">
      <code>
        {show ? value || '未记录' : long ? '长码已隐藏' : secretPreview(value)}
      </code>
      <button
        aria-label={show ? '隐藏此码' : '显示此码'}
        onClick={() => setShow(!show)}
        type="button"
      >
        {show ? <EyeOff /> : <Eye />}
      </button>
      <button
        aria-label="复制此码"
        disabled={!show || !value}
        onClick={() => navigator.clipboard?.writeText(value)}
        type="button"
      >
        <Copy />
      </button>
    </div>
  );
}
function CodeEditor({
  code,
  index,
  onChange,
  onRemove,
}: {
  code: HydratedCode;
  index: number;
  onChange: (patch: Partial<HydratedCode>) => void;
  onRemove: () => void;
}) {
  const urls = useFileUrls(code.added);
  const [show, setShow] = useState(false);
  useEffect(() => {
    const hide = () => setShow(false);
    window.addEventListener('prism:hide-secrets', hide);
    return () => window.removeEventListener('prism:hide-secrets', hide);
  }, []);
  return (
    <section className="profile-code-editor">
      <div className="profile-code-heading">
        <h3>短码 {index + 1}</h3>
        <Button onClick={onRemove} type="button" variant="ghost">
          <Trash2 />
          移除此短码
        </Button>
      </div>
      <div className="profile-code-fields">
        <label>
          短码名称
          <Input
            onChange={(e) => onChange({ label: e.target.value })}
            placeholder="例如：第 3 轮测试 / 最终成品"
            value={code.label}
          />
        </label>
        <label>
          性质
          <select
            onChange={(e) =>
              onChange({ nature: e.target.value as ProfileShortCode['nature'] })
            }
            value={code.nature}
          >
            <option value="unconfirmed">待确认（不猜测）</option>
            <option value="stage">阶段 P</option>
            <option value="final">成品 P</option>
            <option value="other">其他 · 自行填写</option>
          </select>
        </label>
        <label>
          7 位短码
          <div className="code-input">
            <Input
              autoComplete="off"
              maxLength={7}
              onChange={(e) => onChange({ secret: e.target.value })}
              required
              type={show ? 'text' : 'password'}
              value={code.secret}
            />
            <button
              aria-label={show ? '隐藏填写的短码' : '显示填写的短码'}
              onClick={() => setShow(!show)}
              type="button"
            >
              {show ? <EyeOff /> : <Eye />}
            </button>
          </div>
        </label>
        {code.nature === 'other' && (
          <label>
            其他性质
            <Input
              onChange={(e) => onChange({ natureOther: e.target.value })}
              required
              value={code.natureOther || ''}
            />
          </label>
        )}
      </div>
      <label>
        这个短码的备注
        <textarea
          onChange={(e) => onChange({ note: e.target.value })}
          placeholder="测试轮次、与成品的差别、获得方式、复现条件……"
          value={code.note}
        />
      </label>
      <div className="profile-code-examples">
        {code.images.map((image) => (
          <figure key={image.id}>
            <img alt={image.name} src={image.url} />
            <button
              aria-label={`移除 ${image.name}`}
              onClick={() =>
                onChange({
                  images: code.images.filter((i) => i.id !== image.id),
                })
              }
              type="button"
            >
              <X />
            </button>
          </figure>
        ))}
        {urls.map((url, i) => (
          <figure key={url}>
            <img alt={code.added[i].name} src={url} />
            <button
              aria-label={`移除新例图 ${i + 1}`}
              onClick={() =>
                onChange({ added: code.added.filter((_, j) => i !== j) })
              }
              type="button"
            >
              <X />
            </button>
          </figure>
        ))}
        <label className="profile-example-upload">
          <ImageIcon />
          <span>给此短码导入例图</span>
          <input
            accept="image/*"
            multiple
            onChange={(e) => {
              onChange({
                added: [...code.added, ...Array.from(e.target.files || [])],
              });
              e.target.value = '';
            }}
            type="file"
          />
        </label>
      </div>
      <CustomFieldsEditor
        fields={code.customFields || []}
        onChange={(customFields) => onChange({ customFields })}
      />
    </section>
  );
}

export function ProfileLibraryPanel({ globalQuery }: { globalQuery: string }) {
  const vault = useVault();
  const [folders, setFolders] = useState<Folder[]>([]);
  const [collections, setCollections] = useState<CollectionRecord[]>([]);
  const [active, setActive] = useState('all');
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [editor, setEditor] = useState(false);
  const [editing, setEditing] = useState<Folder | null>(null);
  const [codes, setCodes] = useState<HydratedCode[]>([]);
  const [fields, setFields] = useState<CustomField[]>([]);
  const [showLong, setShowLong] = useState(false);
  const [acquisition, setAcquisition] = useState('其他');
  const [busy, setBusy] = useState(false);
  const [collectionEditor, setCollectionEditor] =
    useState<CollectionRecord | null>(null);
  const urls = useRef(new Set<string>());
  const live = useRef(true);
  const refresh = async () => {
    const [records, libs] = await Promise.all([
      vault.loadRecords<StoredLibraryAsset>('assets:profile'),
      vault.loadRecords<CollectionRecord>('collections:profile'),
    ]);
    const hydrated = await Promise.all(
      records.map(async (r) => ({
        ...r,
        codes: await Promise.all(
          profileCodes(r).map(async (code) => ({
            ...code,
            added: [],
            images: (await vault.loadBlobs(profileImageScope(r.id, code))).map(
              (b) => {
                const url = URL.createObjectURL(b.blob);
                urls.current.add(url);
                return { id: b.id, name: b.name, url };
              },
            ),
          })),
        ),
      })),
    );
    if (live.current) {
      setFolders(hydrated);
      setCollections(libs);
    }
  };
  useEffect(() => {
    live.current = true;
    void refresh().catch((e) => setError(String(e)));
    const hide = () => setShowLong(false);
    window.addEventListener('prism:hide-secrets', hide);
    return () => {
      live.current = false;
      window.removeEventListener('prism:hide-secrets', hide);
      for (const url of urls.current) URL.revokeObjectURL(url);
      urls.current.clear();
    };
  }, [vault.session]);
  const run = async (action: () => Promise<void>) => {
    setError('');
    setBusy(true);
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : '操作失败');
    } finally {
      setBusy(false);
    }
  };
  const open = (folder?: Folder) => {
    setEditing(folder || null);
    setCodes(
      folder ? folder.codes.map((c) => ({ ...c, added: [] })) : [newCode()],
    );
    setFields(folder?.customFields || []);
    setAcquisition(folder?.acquisition || '其他');
    setShowLong(false);
    setError('');
    setEditor(true);
  };
  const save = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    void run(async () => {
      if (
        !codes.length ||
        codes.some((c) => !/^[a-z\d]{7}$/i.test(c.secret.trim()))
      )
        throw new Error(
          '每个 Profile 至少保留一个短码；所有短码都应为 7 位字母或数字。',
        );
      if (new Set(codes.map((c) => c.secret.trim())).size !== codes.length)
        throw new Error('同一 Profile 内有重复短码，请核对。');
      const id = editing?.id || crypto.randomUUID();
      const now = new Date().toISOString();
      const storedCodes: ProfileShortCode[] = codes.map(
        ({ images: _images, added: _added, ...c }, i) => ({
          ...c,
          label: c.label.trim() || `短码 ${i + 1}`,
          secret: c.secret.trim(),
          customFields: normalizeCustomFields(c.customFields || []),
        }),
      );
      const record: StoredLibraryAsset = {
        ...editing,
        id,
        kind: 'profile',
        title: String(data.get('title') || '').trim(),
        longCode: String(data.get('longCode') || '').trim(),
        secret: storedCodes[0].secret,
        profileCodes: storedCodes,
        author: String(data.get('author') || '').trim() || '未记录',
        origin: String(data.get('origin') || '').trim() || '未记录',
        sourceUrl: String(data.get('sourceUrl') || '').trim(),
        acquisition,
        acquisitionOther:
          acquisition === '其他'
            ? String(data.get('acquisitionOther') || '').trim()
            : undefined,
        collection: String(data.get('collection') || 'unfiled'),
        note: String(data.get('note') || ''),
        tags: String(data.get('tags') || '')
          .split(/[,，]/)
          .map((t) => t.trim())
          .filter(Boolean),
        customFields: normalizeCustomFields(fields),
        createdAt: editing?.createdAt || now,
        updatedAt: now,
      };
      // Never serialize display-only URLs or File objects into a text record.
      delete (record as StoredLibraryAsset & { codes?: HydratedCode[] }).codes;
      const kept = new Set(codes.flatMap((c) => c.images.map((i) => i.id)));
      const batch: VaultWrite = {
        records: [{ scope: 'assets:profile', value: record }],
        blobs: [],
        deleteBlobs: (editing?.codes || [])
          .flatMap((c) => c.images.map((i) => i.id))
          .filter((id) => !kept.has(id)),
      };
      for (const code of codes)
        for (const file of code.added)
          batch.blobs!.push({
            id: crypto.randomUUID(),
            scope: profileImageScope(id, code),
            blob: file,
            name: file.name,
          });
      // Pin old parent-only recipes to the original short code before modifying it.
      if (editing)
        for (const recipe of await vault.loadRecords<StoredRecipe>('recipes'))
          if (recipe.profileIds?.includes(editing.id))
            batch.records!.push({
              scope: 'recipes',
              value: {
                ...recipe,
                profileIds: resolveLegacyProfileIds(recipe.profileIds, [
                  editing,
                ]),
              },
            });
      await vault.writeBatch(batch);
      await refresh();
      setEditor(false);
      window.dispatchEvent(new CustomEvent('prism:assets-changed'));
    });
  };
  const append = (folder: Folder, code: HydratedCode, files: File[]) =>
    run(async () => {
      await vault.writeBatch({
        blobs: files.map((file) => ({
          id: crypto.randomUUID(),
          scope: profileImageScope(folder.id, code),
          blob: file,
          name: file.name,
        })),
      });
      await refresh();
    });
  const deleteFolder = (folder: Folder) => {
    if (
      !confirm(
        `删除 Profile“${folder.title}”、其 ${folder.codes.length} 个短码及各自例图？引用它的配方会提示条目缺失，不会自动换成其他码。`,
      )
    )
      return;
    void run(async () => {
      await vault.writeBatch({
        deleteRecords: [folder.id],
        deleteBlobs: folder.codes.flatMap((c) => c.images.map((i) => i.id)),
      });
      await refresh();
      window.dispatchEvent(new CustomEvent('prism:assets-changed'));
    });
  };
  const deleteCollection = (collection: CollectionRecord) => {
    if (
      !confirm(
        `只删除分类“${collection.name}”？Profile 与所有短码、例图会保留并移到未分类。`,
      )
    )
      return;
    void run(async () => {
      const records =
        await vault.loadRecords<StoredLibraryAsset>('assets:profile');
      await vault.writeBatch({
        deleteRecords: [collection.id],
        records: records
          .filter((r) => r.collection === collection.id)
          .map((r) => ({
            scope: 'assets:profile',
            value: { ...r, collection: 'unfiled' },
          })),
      });
      setActive('all');
      await refresh();
    });
  };
  const search = `${globalQuery} ${query}`.trim().toLowerCase();
  const visible = folders.filter(
    (f) =>
      (active === 'all' || f.collection === active) &&
      (!search ||
        [
          f.title,
          f.author,
          f.origin,
          f.note,
          ...f.tags,
          ...(f.customFields || []).flatMap((x) => [x.label, x.value]),
          ...f.codes.flatMap((c) => [
            c.label,
            natureLabel(c),
            c.note,
            ...(c.customFields || []).flatMap((x) => [x.label, x.value]),
          ]),
        ]
          .join(' ')
          .toLowerCase()
          .includes(search)),
  );
  return (
    <div className="studio-page profile-page">
      <FileImportDialog
        kind="profile"
        onImported={() => {
          void refresh().catch((e) => setError(String(e)));
        }}
      />
      <SectionHead
        eyebrow="PROFILE FOLDERS"
        number="03"
        title="Profile 库"
        description="一个 Profile 文件夹对应一个长码；阶段 P、成品 P 在文件夹内分别记录短码、性质、例图与备注。"
        actions={
          <>
            <Button
              onClick={() => setCollectionEditor({ id: '', name: '' })}
              variant="outline"
            >
              <FolderPlus />
              新建库
            </Button>
            <Button onClick={() => open()}>
              <Plus />
              添加 Profile 文件夹
            </Button>
          </>
        }
      />
      <p className="profile-model-note">
        长码用来核对文件夹身份，不能证明某个短码就是成品。阶段 P
        同样可以跑图；请根据作者信息标明性质，配方会引用你选定的具体短码。
      </p>
      <div className="profile-collections">
        <Button
          onClick={() => setActive('all')}
          variant={active === 'all' ? 'default' : 'outline'}
        >
          全部 Profile · {folders.length}
        </Button>
        <Button
          onClick={() => setActive('unfiled')}
          variant={active === 'unfiled' ? 'default' : 'outline'}
        >
          未分类
        </Button>
        {collections.map((c) => (
          <div key={c.id}>
            <Button
              onClick={() => setActive(c.id)}
              variant={active === c.id ? 'default' : 'outline'}
            >
              {c.name}
            </Button>
            <button
              aria-label={`重命名 ${c.name}`}
              onClick={() => setCollectionEditor(c)}
              type="button"
            >
              <Pencil />
            </button>
            <button
              aria-label={`删除库 ${c.name}`}
              onClick={() => deleteCollection(c)}
              type="button"
            >
              <Trash2 />
            </button>
          </div>
        ))}
      </div>
      {error && !editor && (
        <p className="error-banner" role="alert">
          {error}
        </p>
      )}
      <div className="inner-search">
        <Search />
        <Input
          aria-label="搜索 Profile 文件夹与短码信息"
          onChange={(e) => setQuery(e.target.value)}
          placeholder="搜索名称、作者、性质、备注或标签"
          value={query}
        />
      </div>
      <div className="profile-folders">
        {visible.map((folder) => (
          <article className="profile-folder" key={folder.id}>
            <header>
              <div>
                <p>PROFILE FOLDER · {folder.codes.length} 个短码</p>
                <h2>{folder.title}</h2>
                <span>
                  {folder.author} · {folder.origin} ·{' '}
                  {folder.acquisition === '其他'
                    ? folder.acquisitionOther || '取得方式未记录'
                    : folder.acquisition}
                </span>
              </div>
              <div className="profile-folder-actions">
                <Button
                  aria-label={`编辑 ${folder.title}`}
                  onClick={() => open(folder)}
                  variant="outline"
                >
                  <Pencil />
                  编辑文件夹
                </Button>
                <Button
                  aria-label={`删除 ${folder.title}`}
                  onClick={() => deleteFolder(folder)}
                  variant="ghost"
                >
                  <Trash2 />
                  删除
                </Button>
              </div>
            </header>
            <div className="profile-folder-details">
              <div>
                <span>文件夹长码</span>
                <Secret long value={folder.longCode || ''} />
              </div>
              <div>
                <p>{folder.note || '暂无文件夹备注'}</p>
                <CustomFieldList fields={folder.customFields} />
              </div>
            </div>
            <div className="profile-variant-head">
              <span>此短码的例图</span>
              <span>名称 / 性质 / 短码</span>
              <span>此短码的备注</span>
            </div>
            {folder.codes.map((code) => (
              <section className="profile-variant" key={code.id}>
                <div className="profile-variant-images">
                  {code.images.map((image) => (
                    <a
                      href={image.url}
                      key={image.id}
                      rel="noreferrer"
                      target="_blank"
                    >
                      <img alt={`${code.label} 例图`} src={image.url} />
                    </a>
                  ))}
                  <label className="profile-example-upload">
                    <ImageIcon />
                    <span>添加例图</span>
                    <input
                      accept="image/*"
                      multiple
                      onChange={(e) => {
                        const files = Array.from(e.target.files || []);
                        e.target.value = '';
                        void append(folder, code, files);
                      }}
                      type="file"
                    />
                  </label>
                </div>
                <div>
                  <h3>{code.label}</h3>
                  <span className={`nature-label nature-${code.nature}`}>
                    {natureLabel(code)}
                  </span>
                  <Secret value={code.secret} />
                </div>
                <div>
                  <p>{code.note || '暂无此短码备注'}</p>
                  <CustomFieldList fields={code.customFields} />
                </div>
              </section>
            ))}
          </article>
        ))}
      </div>
      {!visible.length && (
        <div className="empty-state">
          <FolderPlus />
          <h3>先创建一个 Profile 文件夹</h3>
          <p>填写文件夹长码，再按测试轮次添加阶段短码和最终成品短码。</p>
        </div>
      )}
      <Dialog
        onOpenChange={(v) => {
          if (!busy) setEditor(v);
        }}
        open={editor}
      >
        <DialogContent className="asset-dialog profile-dialog">
          <DialogHeader>
            <DialogTitle>
              {editing ? '编辑' : '新建'} Profile 文件夹
            </DialogTitle>
            <DialogDescription>
              共用一个长码；每个短码独立标明性质，例图不会混在其他阶段下。未确认的性质可以留待确认。
            </DialogDescription>
          </DialogHeader>
          <form
            className="editor-form"
            id="profile-folder-form"
            key={editing?.id || 'new'}
            onSubmit={save}
          >
            <label>
              Profile 文件夹名称
              <Input
                autoFocus
                defaultValue={editing?.title}
                name="title"
                required
              />
            </label>
            <label>
              归属库
              <select
                defaultValue={
                  editing?.collection || (active === 'all' ? 'unfiled' : active)
                }
                name="collection"
              >
                <option value="unfiled">未分类</option>
                {collections.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="wide-field">
              文件夹长码
              <div className="code-input">
                <Input
                  autoComplete="off"
                  defaultValue={editing?.longCode}
                  name="longCode"
                  type={showLong ? 'text' : 'password'}
                />
                <button
                  aria-label={showLong ? '隐藏长码输入' : '显示长码输入'}
                  onClick={() => setShowLong(!showLong)}
                  type="button"
                >
                  {showLong ? <EyeOff /> : <Eye />}
                </button>
              </div>
            </label>
            <label>
              作者
              <Input defaultValue={editing?.author} name="author" />
            </label>
            <label>
              来源
              <Input defaultValue={editing?.origin} name="origin" />
            </label>
            <label>
              来源链接
              <Input
                defaultValue={editing?.sourceUrl}
                name="sourceUrl"
                type="url"
              />
            </label>
            <label>
              取得方式
              <select
                onChange={(e) => setAcquisition(e.target.value)}
                value={acquisition}
              >
                {[
                  '自创',
                  '免费分享',
                  '福利获得',
                  '公开发布',
                  '朋友赠送',
                  '付费购入',
                  '合作授权',
                  '其他',
                ].map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </label>
            {acquisition === '其他' && (
              <label className="wide-field">
                其他取得方式
                <Input
                  defaultValue={editing?.acquisitionOther}
                  name="acquisitionOther"
                />
              </label>
            )}
            <label className="wide-field">
              标签
              <Input defaultValue={editing?.tags.join('，')} name="tags" />
            </label>
            <label className="wide-field">
              文件夹备注
              <textarea defaultValue={editing?.note} name="note" />
            </label>
            <CustomFieldsEditor fields={fields} onChange={setFields} />
            <div className="wide-field profile-code-editors">
              {codes.map((code, i) => (
                <CodeEditor
                  code={code}
                  index={i}
                  key={code.id}
                  onChange={(patch) =>
                    setCodes((items) =>
                      items.map((c) =>
                        c.id === code.id ? { ...c, ...patch } : c,
                      ),
                    )
                  }
                  onRemove={() => {
                    if (
                      !code.images.length ||
                      confirm('移除此短码及其例图？点击保存文件夹后才会生效。')
                    )
                      setCodes((items) =>
                        items.filter((c) => c.id !== code.id),
                      );
                  }}
                />
              ))}
              <Button
                onClick={() => setCodes((items) => [...items, newCode()])}
                type="button"
                variant="outline"
              >
                <Plus />
                添加另一个阶段 / 成品短码
              </Button>
            </div>
          </form>
          {error && (
            <p className="dialog-error" role="alert">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button
              disabled={busy}
              onClick={() => setEditor(false)}
              variant="ghost"
            >
              取消
            </Button>
            <Button disabled={busy} form="profile-folder-form" type="submit">
              {busy ? '正在完整保存…' : '加密保存文件夹与全部短码'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        onOpenChange={(v) => {
          if (!v) setCollectionEditor(null);
        }}
        open={Boolean(collectionEditor)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {collectionEditor?.id ? '重命名' : '新建'} Profile 库
            </DialogTitle>
            <DialogDescription>
              删除库不删除 Profile 文件夹及短码。
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const name = String(
                new FormData(e.currentTarget).get('name') || '',
              ).trim();
              if (name)
                void run(async () => {
                  await vault.saveRecord('collections:profile', {
                    id: collectionEditor?.id || crypto.randomUUID(),
                    name,
                  });
                  await refresh();
                  setCollectionEditor(null);
                });
            }}
          >
            <Input
              aria-label="库名称"
              defaultValue={collectionEditor?.name}
              name="name"
              required
            />
            <Button disabled={busy} type="submit">
              保存分类
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
