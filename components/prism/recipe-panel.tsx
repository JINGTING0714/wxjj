'use client';
import {
  CollectionRail,
  CollectionDialog,
  LibraryToolbar,
  RecordHead,
  RecordExamples,
  SecretField,
} from './library-shared';
import { useConfirmation } from './use-confirmation';
import type { CollectionRecord, ManualRecipeEntry } from '@/lib/prism-types';
import { ExampleImage } from './example-image';
import { BulkActions, SelectItem, useSelection } from './bulk-selection';

import {
  CircleAlert,
  FolderPlus,
  Eye,
  EyeOff,
  LockKeyhole,
  Pencil,
  Plus,
  Search,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { FormEvent, useEffect, useMemo, useState } from 'react';

import {
  CustomFieldList,
  CustomFieldsEditor,
  SectionHead,
} from '@/components/prism/studio-shared';
import { useVault } from '@/components/prism/vault-provider';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import type {
  AssetImage,
  CustomField,
  Recipe,
  StoredLibraryAsset,
  StoredRecipe,
} from '@/lib/prism-types';
import {
  normalizeCustomFields,
  prismId,
  secretPreview,
} from '@/lib/prism-types';
import { profileChoices, resolveLegacyProfileIds } from '@/lib/profile-model';

const demoProfiles: StoredLibraryAsset[] = [
  {
    id: 'demo-profile-1',
    kind: 'profile',
    title: 'Verdant Signal',
    secret: 'QVRN7PX',
    longCode: 'PROFILE-FOLDER-2049',
    stageType: '测试阶段 P',
    author: 'Neo Atelier',
    origin: '创作者商店',
    acquisition: '付费购入',
    note: '',
    tags: ['荧光'],
    collection: 'unfiled',
  },
  {
    id: 'demo-profile-2',
    kind: 'profile',
    title: 'Carbon Skin',
    secret: 'CX9M2RA',
    longCode: 'PROFILE-FOLDER-1188',
    stageType: '公开 P',
    author: 'Mori',
    origin: 'Discord',
    acquisition: '免费分享',
    note: '',
    tags: ['暗调'],
    collection: 'unfiled',
  },
];
const demoMoodboards: StoredLibraryAsset[] = [
  {
    id: 'demo-moodboard-1',
    kind: 'moodboard',
    title: 'Soft Brutalist',
    secret: 'MBX4L2A',
    author: 'Rin',
    origin: '私人交流',
    acquisition: '朋友赠送',
    note: '',
    tags: ['材质'],
    collection: 'unfiled',
  },
  {
    id: 'demo-moodboard-2',
    kind: 'moodboard',
    title: 'Acid Archive',
    secret: 'A7C3D9Q',
    author: 'Archive 09',
    origin: '独立商店',
    acquisition: '付费购入',
    note: '',
    tags: ['酸性'],
    collection: 'unfiled',
  },
];
const demoRecipes: Recipe[] = [
  {
    id: 'demo-recipe',
    title: 'Acid Monolith',
    profileIds: ['demo-profile-1', 'demo-profile-2'],
    moodboardIds: ['demo-moodboard-1', 'demo-moodboard-2'],
    ratio: '3:4',
    note: '演示配方：真实配方可以自由选择任意数量的 Profile 和 Moodboard。',
    tags: ['产品', '酸性'],
    customFields: [],
    images: [],
  },
];

function asStored(recipe: Recipe): StoredRecipe {
  const { images: _images, ...stored } = recipe;
  return stored;
}

function SelectionList({
  title,
  items,
  selected,
  query,
  onQuery,
  onToggle,
}: {
  title: string;
  items: StoredLibraryAsset[];
  selected: Set<string>;
  query: string;
  onQuery: (value: string) => void;
  onToggle: (id: string) => void;
}) {
  const filtered = items.filter(
    (item) =>
      !query.trim() ||
      [
        item.title,
        item.author,
        item.secret,
        item.longCode,
        item.stageType,
        ...item.tags,
      ]
        .join(' ')
        .toLocaleLowerCase()
        .includes(query.trim().toLocaleLowerCase()),
  );
  return (
    <fieldset className="asset-picker">
      <div className="picker-head">
        <div>
          <strong>{title}</strong>
          <span>已选 {selected.size} 个 · 不限制数量</span>
        </div>
        <div>
          <Search />
          <Input
            onChange={(event) => onQuery(event.target.value)}
            placeholder="搜索名称、作者或短码"
            value={query}
          />
        </div>
      </div>
      <div className="picker-list">
        {filtered.map((item) => {
          const checked = selected.has(item.id);
          return (
            <label className={checked ? 'is-selected' : ''} key={item.id}>
              <Checkbox
                checked={checked}
                onCheckedChange={() => onToggle(item.id)}
              />
              <span>
                <strong>{item.title}</strong>
                <small>
                  {item.author} ·{' '}
                  {item.kind === 'profile'
                    ? `${item.stageType || '阶段 P'} · `
                    : ''}
                  {secretPreview(item.secret)}
                </small>
              </span>
            </label>
          );
        })}
        {!filtered.length && (
          <p>没有匹配的资产。请先去管理库录入，或换一个关键词。</p>
        )}
      </div>
    </fieldset>
  );
}

export function RecipePanel({ globalQuery }: { globalQuery: string }) {
  const vault = useVault();
  const confirmation = useConfirmation();
  const [collections, setCollections] = useState<CollectionRecord[]>([]);
  const [active, setActive] = useState('all');
  const [localQuery, setLocalQuery] = useState('');
  const [collectionEditor, setCollectionEditor] = useState<{
    id?: string;
    name: string;
  } | null>(null);
  const [manualEntries, setManualEntries] = useState<ManualRecipeEntry[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>(demoRecipes);
  const [profiles, setProfiles] = useState<StoredLibraryAsset[]>(demoProfiles);
  const [moodboards, setMoodboards] =
    useState<StoredLibraryAsset[]>(demoMoodboards);
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const [dialog, setDialog] = useState(false);
  const [editing, setEditing] = useState<Recipe | null>(null);
  const [selectedProfiles, setSelectedProfiles] = useState<Set<string>>(
    new Set(),
  );
  const [selectedMoodboards, setSelectedMoodboards] = useState<Set<string>>(
    new Set(),
  );
  const [profileQuery, setProfileQuery] = useState('');
  const [moodboardQuery, setMoodboardQuery] = useState('');
  const [customFields, setCustomFields] = useState<CustomField[]>([]);
  const [existingImages, setExistingImages] = useState<AssetImage[]>([]);
  const [newImages, setNewImages] = useState<File[]>([]);
  const [removedImageIds, setRemovedImageIds] = useState<string[]>([]);
  const [formError, setFormError] = useState('');
  const [refreshTick, setRefreshTick] = useState(0);

  const loadAll = async () => {
    if (vault.status !== 'unlocked') {
      setProfiles(demoProfiles);
      setMoodboards(demoMoodboards);
      setRecipes(demoRecipes);
      return;
    }
    const [profileRecords, moodboardRecords, storedRecipes] = await Promise.all(
      [
        vault.loadRecords<StoredLibraryAsset>('assets:profile'),
        vault.loadRecords<StoredLibraryAsset>('assets:moodboard'),
        vault.loadRecords<
          StoredRecipe & { profile?: string; moodboard?: string }
        >('recipes'),
      ],
    );
    setCollections(
      await vault.loadRecords<CollectionRecord>('collections:recipe'),
    );
    const normalizedRecipes = await Promise.all(
      storedRecipes.map(async (record) => {
        const profileIds = resolveLegacyProfileIds(
          record.profileIds ||
            profileChoices(profileRecords)
              .filter((profile) => profile.secret === record.profile)
              .map((profile) => profile.id),
          profileRecords,
        );
        const moodboardIds =
          record.moodboardIds ||
          moodboardRecords
            .filter((moodboard) => moodboard.secret === record.moodboard)
            .map((moodboard) => moodboard.id);
        const blobs = await vault.loadBlobs(`recipe-image:${record.id}`);
        return {
          ...record,
          profileIds,
          moodboardIds,
          tags: record.tags || [],
          customFields: record.customFields || [],
          images: blobs.map((entry) => ({
            id: entry.id,
            name: entry.name,
            url: URL.createObjectURL(entry.blob),
          })),
        } satisfies Recipe;
      }),
    );
    setProfiles(profileChoices(profileRecords));
    setMoodboards(moodboardRecords);
    setRecipes(
      normalizedRecipes.sort((a, b) =>
        (b.updatedAt || '').localeCompare(a.updatedAt || ''),
      ),
    );
  };

  useEffect(() => {
    loadAll().catch((reason) =>
      setFormError(reason instanceof Error ? reason.message : '配方读取失败'),
    );
  }, [vault.status, refreshTick]);

  useEffect(() => {
    const hide = () => setRevealed(new Set());
    const refresh = () => setRefreshTick((value) => value + 1);
    window.addEventListener('prism:hide-secrets', hide);
    window.addEventListener('prism:assets-changed', refresh);
    return () => {
      window.removeEventListener('prism:hide-secrets', hide);
      window.removeEventListener('prism:assets-changed', refresh);
    };
  }, []);

  const assetById = useMemo(
    () =>
      new Map([...profiles, ...moodboards].map((asset) => [asset.id, asset])),
    [profiles, moodboards],
  );
  const query = `${globalQuery} ${localQuery}`.trim().toLocaleLowerCase();
  const visible = recipes.filter((recipe) => {
    if (active !== 'all' && (recipe.collection || 'unfiled') !== active)
      return false;
    const selectedText = [...recipe.profileIds, ...recipe.moodboardIds]
      .map((id) => {
        const item = assetById.get(id);
        return item ? `${item.title} ${item.author} ${item.secret}` : '';
      })
      .join(' ');
    return (
      !query ||
      [
        recipe.title,
        ...(recipe.manualEntries || []).flatMap((e) => [
          e.label,
          e.author,
          e.note,
        ]),
        recipe.note,
        ...recipe.tags,
        selectedText,
        ...(recipe.customFields || []).flatMap((field) => [
          field.label,
          field.value,
        ]),
      ]
        .join(' ')
        .toLocaleLowerCase()
        .includes(query)
    );
  });

  const openCreate = () => {
    setEditing(null);
    setManualEntries([]);
    setSelectedProfiles(new Set());
    setSelectedMoodboards(new Set());
    setProfileQuery('');
    setMoodboardQuery('');
    setCustomFields([]);
    setExistingImages([]);
    setNewImages([]);
    setRemovedImageIds([]);
    setFormError('');
    setDialog(true);
  };

  const openEdit = (recipe: Recipe) => {
    if (recipe.id.startsWith('demo-')) {
      setFormError('这是锁定状态下的演示配方。解锁后即可建立自己的无限组合。');
      return;
    }
    setEditing(recipe);
    setManualEntries(recipe.manualEntries || []);
    setSelectedProfiles(new Set(recipe.profileIds));
    setSelectedMoodboards(new Set(recipe.moodboardIds));
    setCustomFields(recipe.customFields || []);
    setExistingImages(recipe.images);
    setNewImages([]);
    setRemovedImageIds([]);
    setProfileQuery('');
    setMoodboardQuery('');
    setFormError('');
    setDialog(true);
  };

  const toggle = (
    setter: React.Dispatch<React.SetStateAction<Set<string>>>,
    id: string,
  ) =>
    setter((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const saveRecipe = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError('');
    if (vault.status !== 'unlocked') {
      setFormError('请先解锁本机保险库，再保存配方。');
      return;
    }
    if (
      !selectedProfiles.size &&
      !selectedMoodboards.size &&
      !manualEntries.some((e) => e.secret.trim())
    ) {
      setFormError(
        '至少从库选择或手动填写一个 Profile / Moodboard；数量不限。',
      );
      return;
    }
    const data = new FormData(event.currentTarget);
    if (
      !(await confirmation.confirmShortCodes(
        manualEntries.map((e) => e.secret),
      ))
    )
      return;
    const now = new Date().toISOString();
    const id = editing?.id || prismId('recipe');
    const record: StoredRecipe = {
      id,
      title: String(data.get('title') || '').trim(),
      collection: String(data.get('collection') || 'unfiled'),
      manualEntries: manualEntries
        .map((e) => ({ ...e, secret: e.secret.trim() }))
        .filter((e) => e.secret),
      profileIds: [...selectedProfiles],
      moodboardIds: [...selectedMoodboards],
      ratio: String(data.get('ratio') || '').trim() || '自由画幅',
      note: String(data.get('note') || '').trim(),
      tags: String(data.get('tags') || '')
        .split(/[,，]/)
        .map((tag) => tag.trim())
        .filter(Boolean),
      customFields: normalizeCustomFields(customFields),
      createdAt: editing?.createdAt || now,
      updatedAt: now,
    };
    try {
      const added = newImages.map((file) => ({
        id: crypto.randomUUID(),
        name: file.name,
        url: URL.createObjectURL(file),
        file,
      }));
      await vault.writeBatch({
        records: [{ scope: 'recipes', value: record }],
        deleteBlobs: removedImageIds,
        blobs: added.map((image) => ({
          id: image.id,
          scope: `recipe-image:${id}`,
          blob: image.file,
          name: image.name,
        })),
      });
      const hydrated = { ...record, images: [...existingImages, ...added] };
      setRecipes((current) =>
        editing
          ? current.map((recipe) => (recipe.id === id ? hydrated : recipe))
          : [hydrated, ...current],
      );
      setDialog(false);
    } catch (reason) {
      setFormError(reason instanceof Error ? reason.message : '配方保存失败');
    }
  };

  const deleteRecipe = async (recipe: Recipe) => {
    if (
      recipe.id.startsWith('demo-') ||
      !window.confirm(`确定删除配方“${recipe.title}”及其例图吗？`)
    )
      return;
    await vault.writeBatch({
      deleteRecords: [recipe.id],
      deleteBlobs: recipe.images.map((i) => i.id),
    });
    setRecipes((current) => current.filter((item) => item.id !== recipe.id));
  };

  const selection = useSelection(
    visible.filter((r) => !r.id.startsWith('demo-')).map((r) => r.id),
  );
  return (
    <div className="studio-page recipe-page">
      {confirmation.dialog}
      <SectionHead
        eyebrow="FORMULA LAB"
        number="05"
        title="搭配配方"
        description="从库中选取或自行录入 Profile、Moodboard，自由分类并记录组合效果。"
        actions={
          <>
            <Button
              variant="outline"
              onClick={() => setCollectionEditor({ name: '' })}
            >
              <FolderPlus />
              新建库
            </Button>
            <Button className="add-button" onClick={openCreate}>
              <Plus /> 新建配方
            </Button>
          </>
        }
      />
      {vault.status !== 'unlocked' && (
        <div className="vault-gate">
          <LockKeyhole />
          <p>
            <strong>当前展示的是安全演示配方</strong>
            <span>
              解锁后，配方选择器会直接读取你的 Profile 和 Moodboard 管理库。
            </span>
          </p>
        </div>
      )}
      {formError && (
        <p className="error-banner">
          <CircleAlert /> {formError}
        </p>
      )}
      <CollectionRail
        noun="配方"
        collections={collections}
        records={recipes}
        active={active}
        onSelect={setActive}
        onEdit={setCollectionEditor}
        onDelete={async (id) => {
          if (
            !(await confirmation.ask(
              '只删除此分类？配方和例图会保留在未分类中。',
              '删除配方库',
            ))
          )
            return;
          await vault.writeBatch({
            deleteRecords: [id],
            records: recipes
              .filter((r) => r.collection === id)
              .map((r) => ({
                scope: 'recipes',
                value: { ...asStored(r), collection: 'unfiled' },
              })),
          });
          setActive('all');
          await loadAll();
        }}
      />
      <LibraryToolbar
        noun="配方"
        query={localQuery}
        onQuery={setLocalQuery}
        count={visible.length}
      />
      <RecordHead middle="搭配 / Profile 与 Moodboard" />
      <BulkActions
        selection={selection}
        noun="条配方"
        onDelete={async (ids) => {
          await vault.writeBatch({
            deleteRecords: ids,
            deleteBlobs: recipes
              .filter((r) => ids.includes(r.id))
              .flatMap((r) => r.images.map((i) => i.id)),
          });
          setRecipes((current) => current.filter((r) => !ids.includes(r.id)));
        }}
      />
      <div className="record-list recipe-records">
        {visible.map((recipe) => {
          const open = revealed.has(recipe.id);
          const entries = [...recipe.profileIds, ...recipe.moodboardIds]
            .map((id) => assetById.get(id))
            .filter(Boolean)
            .map((a) => ({
              id: a!.id,
              kind: a!.kind,
              label: a!.title,
              author: a!.author,
              secret: a!.secret,
            }));
          return (
            <article className="record-row" key={recipe.id}>
              <div className="record-identity">
                <SelectItem
                  selection={selection}
                  id={recipe.id}
                  name={recipe.title}
                />
                <RecordExamples images={recipe.images} title={recipe.title} />
                <div>
                  <Badge variant="outline">配方 · {recipe.ratio}</Badge>
                  <h3>{recipe.title}</h3>
                  <p>{recipe.tags.join(' / ') || '未添加标签'}</p>
                </div>
              </div>
              <div className="record-secret">
                <div className="record-secret-value recipe-entry-list">
                  {[...entries, ...(recipe.manualEntries || [])].map((e) => (
                    <div key={e.id}>
                      <span>
                        {e.kind === 'profile' ? 'Profile' : 'Moodboard'} ·{' '}
                        {e.label || '自行录入'}
                        {e.author ? ` · ${e.author}` : ''}
                      </span>
                      <code>{open ? e.secret : secretPreview(e.secret)}</code>
                    </div>
                  ))}
                </div>
                <div className="record-secret-actions">
                  <button
                    type="button"
                    aria-label={open ? '隐藏配方短码' : '显示配方短码'}
                    onClick={() =>
                      setRevealed((current) => {
                        const n = new Set(current);
                        if (open) n.delete(recipe.id);
                        else n.add(recipe.id);
                        return n;
                      })
                    }
                  >
                    {open ? <EyeOff /> : <Eye />}
                    {open ? '隐藏' : '显示'}
                  </button>
                </div>
                {[...recipe.profileIds, ...recipe.moodboardIds].some(
                  (id) => !assetById.has(id),
                ) && (
                  <p className="import-warning">
                    有引用已被删除，请编辑重新选择；不会自动替换短码。
                  </p>
                )}
              </div>
              <div className="record-note">
                <p>{recipe.note || '暂无私人备注。'}</p>
                {(recipe.manualEntries || [])
                  .filter((e) => e.note)
                  .map((e) => (
                    <p key={e.id}>
                      {e.label ||
                        (e.kind === 'profile' ? 'Profile' : 'Moodboard')}
                      ：{e.note}
                    </p>
                  ))}
                <CustomFieldList fields={recipe.customFields} />
              </div>
              <div className="row-actions">
                <button
                  type="button"
                  aria-label={`编辑配方 ${recipe.title}`}
                  title="编辑配方"
                  onClick={() => openEdit(recipe)}
                >
                  <Pencil />
                </button>
                <button
                  type="button"
                  aria-label={`删除配方 ${recipe.title}`}
                  title="删除配方"
                  onClick={() => deleteRecipe(recipe)}
                >
                  <Trash2 />
                </button>
              </div>
            </article>
          );
        })}
        {!visible.length && (
          <div className="empty-state">
            <Search />
            <h3>还没有匹配的配方</h3>
            <p>可从管理库选择，也可手动填写自己的组合。</p>
          </div>
        )}
      </div>
      <CollectionDialog
        noun="配方"
        editing={collectionEditor}
        onClose={() => setCollectionEditor(null)}
        onSave={async (e) => {
          e.preventDefault();
          const name = String(
            new FormData(e.currentTarget).get('name') || '',
          ).trim();
          if (!name) return;
          try {
            const id = collectionEditor?.id || prismId('recipe-collection');
            await vault.saveRecord('collections:recipe', { id, name });
            await loadAll();
            setActive(id);
            setCollectionEditor(null);
          } catch (e) {
            setFormError(String(e));
          }
        }}
      />

      <Dialog onOpenChange={setDialog} open={dialog}>
        <DialogContent className="asset-dialog recipe-dialog">
          <DialogHeader>
            <DialogTitle>{editing ? '编辑' : '新建'}搭配配方</DialogTitle>
            <DialogDescription>
              可从库中多选阶段 P、成品 P 与
              Moodboard，也可手动填写；两种方式可以混合使用，数量不限。
            </DialogDescription>
          </DialogHeader>
          <form
            className="editor-form"
            id="recipe-form"
            key={editing?.id || 'new'}
            onSubmit={saveRecipe}
          >
            <label>
              <span>配方名称</span>
              <Input defaultValue={editing?.title} name="title" required />
            </label>
            <label>
              <span>归属库</span>
              <select
                name="collection"
                defaultValue={
                  editing?.collection || (active === 'all' ? 'unfiled' : active)
                }
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
              <span>画幅 / 版本</span>
              <Input
                defaultValue={editing?.ratio || '3:4'}
                name="ratio"
                placeholder="3:4、9:16 或任何自定义说明"
              />
            </label>
            <div className="wide-field picker-columns">
              <SelectionList
                items={profiles}
                onQuery={setProfileQuery}
                onToggle={(id) => toggle(setSelectedProfiles, id)}
                query={profileQuery}
                selected={selectedProfiles}
                title="选择 Profile"
              />
              <SelectionList
                items={moodboards}
                onQuery={setMoodboardQuery}
                onToggle={(id) => toggle(setSelectedMoodboards, id)}
                query={moodboardQuery}
                selected={selectedMoodboards}
                title="选择 Moodboard"
              />
            </div>
            <fieldset className="manual-recipe-editor wide-field">
              <div className="custom-fields-title">
                <div>
                  <strong>自行录入</strong>
                  <span>与库中选项可混合使用；不会自动加入基础资产库。</span>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() =>
                    setManualEntries((items) => [
                      ...items,
                      {
                        id: prismId('manual'),
                        kind: 'profile',
                        secret: '',
                        label: '',
                        author: '',
                        note: '',
                      },
                    ])
                  }
                >
                  <Plus />
                  添加一项
                </Button>
              </div>
              {manualEntries.map((entry, index) => (
                <div className="manual-recipe-entry" key={entry.id}>
                  <label>
                    <span>类型</span>
                    <select
                      value={entry.kind}
                      onChange={(e) =>
                        setManualEntries((items) =>
                          items.map((x) =>
                            x.id === entry.id
                              ? {
                                  ...x,
                                  kind: e.target.value as
                                    | 'profile'
                                    | 'moodboard',
                                }
                              : x,
                          ),
                        )
                      }
                    >
                      <option value="profile">Profile</option>
                      <option value="moodboard">Moodboard</option>
                    </select>
                  </label>
                  <label>
                    <span>名称（可选）</span>
                    <Input
                      value={entry.label}
                      onChange={(e) =>
                        setManualEntries((items) =>
                          items.map((x) =>
                            x.id === entry.id
                              ? { ...x, label: e.target.value }
                              : x,
                          ),
                        )
                      }
                    />
                  </label>
                  <label className="wide-field">
                    <span>短码 {index + 1}</span>
                    <SecretField
                      label={`手动短码 ${index + 1}`}
                      value={entry.secret}
                      required
                      onChange={(value) =>
                        setManualEntries((items) =>
                          items.map((x) =>
                            x.id === entry.id ? { ...x, secret: value } : x,
                          ),
                        )
                      }
                    />
                  </label>
                  <label>
                    <span>作者（可选）</span>
                    <Input
                      value={entry.author}
                      onChange={(e) =>
                        setManualEntries((items) =>
                          items.map((x) =>
                            x.id === entry.id
                              ? { ...x, author: e.target.value }
                              : x,
                          ),
                        )
                      }
                    />
                  </label>
                  <label>
                    <span>补充说明（可选）</span>
                    <Input
                      value={entry.note}
                      onChange={(e) =>
                        setManualEntries((items) =>
                          items.map((x) =>
                            x.id === entry.id
                              ? { ...x, note: e.target.value }
                              : x,
                          ),
                        )
                      }
                    />
                  </label>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() =>
                      setManualEntries((items) =>
                        items.filter((x) => x.id !== entry.id),
                      )
                    }
                  >
                    <Trash2 />
                    移除此项
                  </Button>
                </div>
              ))}
            </fieldset>
            <label className="wide-field">
              <span>标签</span>
              <Input
                defaultValue={editing?.tags.join('，')}
                name="tags"
                placeholder="人像，产品，测试完成"
              />
            </label>
            <label className="wide-field">
              <span>私人备注</span>
              <textarea
                defaultValue={editing?.note}
                name="note"
                placeholder="记录权重、顺序、化学反应和复现条件……"
              />
            </label>
            <CustomFieldsEditor
              fields={customFields}
              onChange={setCustomFields}
            />
            <div className="wide-field existing-image-editor">
              <span>现有例图</span>
              {existingImages.length ? (
                <div>
                  {existingImages.map((image) => (
                    <figure key={image.id}>
                      <ExampleImage alt={image.name} src={image.url} />
                      <figcaption>{image.name}</figcaption>
                      <button
                        aria-label={`删除例图 ${image.name}`}
                        onClick={() => {
                          setExistingImages((current) =>
                            current.filter((item) => item.id !== image.id),
                          );
                          setRemovedImageIds((current) => [
                            ...current,
                            image.id,
                          ]);
                        }}
                        type="button"
                      >
                        <X />
                      </button>
                    </figure>
                  ))}
                </div>
              ) : (
                <p>暂无例图</p>
              )}
            </div>
            <label className="wide-field upload-field">
              <span>追加配方例图（可多选）</span>
              <input
                accept="image/*"
                multiple
                onChange={(event) =>
                  setNewImages(Array.from(event.target.files || []))
                }
                type="file"
              />
              <div>
                <Upload />
                <strong>
                  {newImages.length
                    ? `已选择 ${newImages.length} 张`
                    : '选择配方效果图'}
                </strong>
                <small>可在以后继续追加或删除</small>
              </div>
            </label>
          </form>
          {formError && (
            <p className="dialog-error">
              <CircleAlert /> {formError}
            </p>
          )}
          <DialogFooter>
            <Button onClick={() => setDialog(false)} variant="ghost">
              取消
            </Button>
            <Button form="recipe-form" type="submit">
              加密保存配方
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
