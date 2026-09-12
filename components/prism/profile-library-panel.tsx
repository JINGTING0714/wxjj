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
import { formatProfileCode } from '@/lib/short-codes';
import { useConfirmation } from './use-confirmation';
import {
  CollectionRail,
  CollectionDialog,
  LibraryToolbar,
  RecordHead,
  RecordExamples,
} from './library-shared';
import { ExampleImage } from './example-image';
import { BulkActions, SelectItem, useSelection } from './bulk-selection';

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
    <div className="record-code-block">
      <div className="record-secret-value">
        <code>
          {show
            ? value || '未记录'
            : long
              ? '长码已隐藏'
              : secretPreview(value)}
        </code>
      </div>
      <div className="record-secret-actions">
        <button
          aria-label={show ? '隐藏此码' : '显示此码'}
          onClick={() => setShow(!show)}
          type="button"
        >
          {show ? <EyeOff /> : <Eye />}
          {show ? '隐藏' : '显示'}
        </button>
        <button
          aria-label={long ? '复制长码' : '复制 Profile 参数'}
          title={long ? '复制长码' : '复制 --profile 参数'}
          disabled={!show || !value}
          onClick={() =>
            navigator.clipboard?.writeText(
              long ? value : formatProfileCode(value),
            )
          }
          type="button"
        >
          <Copy />
          {long ? '复制长码' : '复制 Profile 参数'}
        </button>
      </div>
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
          短码
          <div className="code-input">
            <Input
              autoComplete="off"
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
            <ExampleImage alt={image.name} src={image.url} />
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
            <ExampleImage alt={code.added[i].name} src={url} />
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
  const confirmation = useConfirmation();
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
      if (!codes.length || codes.some((c) => !c.secret.trim()))
        throw new Error('每个 Profile 至少保留一个短码，短码内容不能为空。');
      if (new Set(codes.map((c) => c.secret.trim())).size !== codes.length)
        throw new Error('同一 Profile 内有重复短码，请核对。');
      if (!(await confirmation.confirmShortCodes(codes.map((c) => c.secret))))
        return;
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
  const selection = useSelection(visible.map((f) => f.id));
  return (
    <div className="studio-page profile-page">
      {confirmation.dialog}
      <div className="library-import-entry">
        <FileImportDialog
          kind="profile"
          onImported={() => {
            void refresh().catch((e) => setError(String(e)));
          }}
        />
      </div>
      <SectionHead
        eyebrow="PROFILE FOLDERS"
        number="03"
        title="Profile 库"
        description="一个文件夹保存长码，阶段与成品短码分别记录例图、性质和备注。"
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
      <CollectionRail
        noun="Profile"
        collections={collections}
        records={folders}
        active={active}
        onSelect={setActive}
        onEdit={setCollectionEditor}
        onDelete={(id) => {
          const c = collections.find((c) => c.id === id);
          if (c) deleteCollection(c);
        }}
      />
      <details className="library-explainer">
        <summary>关于文件夹长码与短码性质</summary>
        <p>
          长码用于核对文件夹，不代表短码已是成品。阶段 P
          也能跑图；配方始终引用你选定的具体短码。
        </p>
      </details>
      {error && !editor && (
        <p className="error-banner" role="alert">
          {error}
        </p>
      )}
      <LibraryToolbar
        noun="Profile"
        query={query}
        onQuery={setQuery}
        count={visible.length}
      />
      <RecordHead middle="Profile / 来源" />
      <BulkActions
        selection={selection}
        disabled={busy}
        noun="个 Profile 文件夹（含所有短码）"
        onDelete={async (ids) => {
          await vault.writeBatch({
            deleteRecords: ids,
            deleteBlobs: folders
              .filter((f) => ids.includes(f.id))
              .flatMap((f) =>
                f.codes.flatMap((c) => c.images.map((i) => i.id)),
              ),
          });
          await refresh();
          window.dispatchEvent(new CustomEvent('prism:assets-changed'));
        }}
      />
      <div className="record-list profile-records">
        {visible.map((folder) => (
          <section className="profile-record-group" key={folder.id}>
            {folder.codes.map((code, index) => (
              <article className="record-row" key={code.id}>
                <div className="record-identity">
                  {index === 0 ? (
                    <SelectItem
                      selection={selection}
                      id={folder.id}
                      name={folder.title}
                    />
                  ) : (
                    <span className="selection-spacer" />
                  )}
                  <RecordExamples
                    images={code.images}
                    title={code.label || folder.title}
                  />
                  <div>
                    <span className={`record-type-label nature-${code.nature}`}>
                      {natureLabel(code)}
                    </span>
                    <h3>{folder.title}</h3>
                    <p>
                      {code.label || `短码 ${index + 1}`} · {index + 1} /{' '}
                      {folder.codes.length}
                    </p>
                    <p>{folder.tags.join(' / ') || '未添加标签'}</p>
                  </div>
                </div>
                <div className="record-secret">
                  <Secret value={code.secret} />
                  <p>
                    <strong>{folder.author || '未记录作者'}</strong> ·{' '}
                    {folder.origin || '未记录来源'} ·{' '}
                    {folder.acquisition === '其他'
                      ? folder.acquisitionOther || '其他'
                      : folder.acquisition}
                  </p>
                  {index === 0 && (
                    <div className="folder-code-summary">
                      <span>文件夹长码 · 共用</span>
                      <Secret long value={folder.longCode || ''} />
                    </div>
                  )}
                </div>
                <div className="record-note">
                  <p>{code.note || '暂无此短码备注。'}</p>
                  <CustomFieldList fields={code.customFields} />
                  {index === 0 &&
                  (folder.note || folder.customFields?.length) ? (
                    <div className="folder-note-summary">
                      <span>文件夹补充</span>
                      <p>{folder.note}</p>
                      <CustomFieldList fields={folder.customFields} />
                    </div>
                  ) : null}
                </div>
                <div className="row-actions">
                  <button
                    type="button"
                    aria-label={`编辑 ${folder.title}`}
                    title="编辑文件夹及短码"
                    onClick={() => open(folder)}
                  >
                    <Pencil />
                  </button>
                  {index === 0 && (
                    <button
                      type="button"
                      aria-label={`删除 ${folder.title}`}
                      onClick={() => deleteFolder(folder)}
                    >
                      <Trash2 />
                    </button>
                  )}
                </div>
              </article>
            ))}
          </section>
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
              同一文件夹共用长码；每个短码单独保存性质、例图和备注。
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
            <label className="wide-field">
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
              {busy ? '正在完整保存…' : '加密保存'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <CollectionDialog
        noun="Profile"
        editing={collectionEditor}
        onClose={() => setCollectionEditor(null)}
        busy={busy}
        onSave={(e) => {
          e.preventDefault();
          const name = String(
            new FormData(e.currentTarget).get('name') || '',
          ).trim();
          if (name)
            void run(async () => {
              const id = collectionEditor?.id || crypto.randomUUID();
              await vault.saveRecord('collections:profile', { id, name });
              await refresh();
              setActive(id);
              setCollectionEditor(null);
            });
        }}
      />
    </div>
  );
}
