'use client';

import {
  CircleAlert,
  Eye,
  EyeOff,
  Image as ImageIcon,
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
  const query = globalQuery.trim().toLocaleLowerCase();
  const visible = recipes.filter((recipe) => {
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
    if (vault.status !== 'unlocked') {
      setFormError('请先解锁本机保险库，再保存配方。');
      return;
    }
    if (!selectedProfiles.size && !selectedMoodboards.size) {
      setFormError(
        '至少选择一个具体的 Profile 短码或 Moodboard；数量和两类比例不限。',
      );
      return;
    }
    const data = new FormData(event.currentTarget);
    const now = new Date().toISOString();
    const id = editing?.id || prismId('recipe');
    const record: StoredRecipe = {
      id,
      title: String(data.get('title') || '').trim(),
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
    await vault.deleteRecord(recipe.id);
    for (const image of recipe.images) await vault.deleteBlob(image.id);
    setRecipes((current) => current.filter((item) => item.id !== recipe.id));
  };

  const appendRecipeImages = async (recipe: Recipe, files: FileList | null) => {
    if (
      !files ||
      !files.length ||
      vault.status !== 'unlocked' ||
      recipe.id.startsWith('demo-')
    )
      return;
    try {
      const added: AssetImage[] = [];
      for (const file of Array.from(files)) {
        const imageId = await vault.saveBlob(
          `recipe-image:${recipe.id}`,
          file,
          file.name,
        );
        added.push({
          id: imageId,
          name: file.name,
          url: URL.createObjectURL(file),
        });
      }
      setRecipes((current) =>
        current.map((item) =>
          item.id === recipe.id
            ? { ...item, images: [...item.images, ...added] }
            : item,
        ),
      );
    } catch (reason) {
      setFormError(
        reason instanceof Error ? reason.message : '配方例图保存失败',
      );
    }
  };

  return (
    <div className="studio-page recipe-page">
      <SectionHead
        eyebrow="FORMULA LAB"
        number="05"
        title="搭配配方"
        description="直接从管理库选择具体的阶段 P、成品 P 和 Moodboard；同一 Profile 的不同短码也可独立参与组合。"
        actions={
          <Button className="add-button" onClick={openCreate}>
            <Plus /> 新建配方
          </Button>
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
      <div className="recipe-summary">
        <div>
          <span>配方数量</span>
          <strong>{recipes.length}</strong>
        </div>
        <div>
          <span>可选资产</span>
          <strong>{profiles.length + moodboards.length}</strong>
        </div>
        <p>
          每个配方可组合 <b>任意数量</b> 的 Profile 与 Moodboard。
        </p>
      </div>
      <div className="recipe-grid">
        {visible.map((recipe, index) => {
          const open = revealed.has(recipe.id);
          const selectedProfileAssets = recipe.profileIds
            .map((id) => assetById.get(id))
            .filter(Boolean) as StoredLibraryAsset[];
          const selectedMoodboardAssets = recipe.moodboardIds
            .map((id) => assetById.get(id))
            .filter(Boolean) as StoredLibraryAsset[];
          return (
            <article
              className="recipe-card is-interactive"
              key={recipe.id}
              onClick={() => openEdit(recipe)}
              onKeyDown={(event) => {
                if (
                  event.target === event.currentTarget &&
                  (event.key === 'Enter' || event.key === ' ')
                ) {
                  event.preventDefault();
                  openEdit(recipe);
                }
              }}
              role="button"
              tabIndex={0}
            >
              <label
                className="recipe-collage-upload"
                onClick={(event) => event.stopPropagation()}
                title={
                  recipe.id.startsWith('demo-')
                    ? '解锁后可添加例图'
                    : '点击直接追加配方例图'
                }
              >
                <div className={`recipe-collage recipe-${(index % 3) + 1}`}>
                  {recipe.images[0] ? (
                    <img
                      alt={`${recipe.title} 例图`}
                      src={recipe.images[0].url}
                    />
                  ) : (
                    <>
                      <span>{String(index + 1).padStart(2, '0')}</span>
                      <i />
                      <i />
                      <i />
                      <i />
                    </>
                  )}
                  <small>
                    <ImageIcon /> {recipe.images.length}
                    <b>点击添加</b>
                  </small>
                </div>
                <input
                  accept="image/*"
                  disabled={
                    vault.status !== 'unlocked' || recipe.id.startsWith('demo-')
                  }
                  multiple
                  onChange={(event) => {
                    appendRecipeImages(recipe, event.target.files);
                    event.currentTarget.value = '';
                  }}
                  type="file"
                />
              </label>
              <div className="recipe-body">
                <div className="recipe-title">
                  <div>
                    <p className="eyebrow">FORMULA / {recipe.ratio}</p>
                    <h2>{recipe.title}</h2>
                  </div>
                  <button
                    aria-label={open ? '隐藏配方短码' : '显示配方短码'}
                    onClick={(event) => {
                      event.stopPropagation();
                      setRevealed((current) => {
                        const next = new Set(current);
                        if (open) next.delete(recipe.id);
                        else next.add(recipe.id);
                        return next;
                      });
                    }}
                    type="button"
                  >
                    {open ? <EyeOff /> : <Eye />}
                  </button>
                </div>
                <div className="formula-groups">
                  <div>
                    <span>PROFILE 短码 · {selectedProfileAssets.length}</span>
                    <div>
                      {selectedProfileAssets.map((asset) => (
                        <code key={asset.id}>
                          {asset.title} · {asset.author} · {asset.stageType} ·{' '}
                          {open ? asset.secret : secretPreview(asset.secret)}
                        </code>
                      ))}
                    </div>
                  </div>
                  <b>×</b>
                  <div>
                    <span>MOODBOARDS · {selectedMoodboardAssets.length}</span>
                    <div>
                      {selectedMoodboardAssets.map((asset) => (
                        <code key={asset.id}>
                          {asset.author} ·{' '}
                          {open ? asset.secret : secretPreview(asset.secret)}
                        </code>
                      ))}
                    </div>
                  </div>
                </div>
                {[...recipe.profileIds, ...recipe.moodboardIds].some(
                  (id) => !assetById.has(id),
                ) && (
                  <p className="import-warning">
                    有引用的短码 /
                    资产已被删除，请编辑配方重新选择；没有自动换成其他阶段或成品。
                  </p>
                )}
                <p className="recipe-note">{recipe.note || '暂无备注。'}</p>
                <CustomFieldList fields={recipe.customFields} />
                <div className="recipe-actions">
                  <button
                    onClick={(event) => {
                      event.stopPropagation();
                      openEdit(recipe);
                    }}
                    type="button"
                  >
                    <Pencil /> 编辑配方
                  </button>
                  <button
                    onClick={(event) => {
                      event.stopPropagation();
                      deleteRecipe(recipe);
                    }}
                    type="button"
                  >
                    <Trash2 /> 删除
                  </button>
                </div>
              </div>
            </article>
          );
        })}
        {!visible.length && (
          <div className="empty-state recipe-empty">
            <Search />
            <h3>还没有配方</h3>
            <p>先整理 Profile 和 Moodboard 管理库，再创建第一个自由组合。</p>
          </div>
        )}
      </div>

      <Dialog onOpenChange={setDialog} open={dialog}>
        <DialogContent className="asset-dialog recipe-dialog">
          <DialogHeader>
            <DialogTitle>{editing ? '编辑' : '新建'}搭配配方</DialogTitle>
            <DialogDescription>
              Profile 按“文件夹 / 短码名称 /
              性质”展开。阶段与成品均可选，可选同一文件夹的多个短码，也可只使用其中一类资产。
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
                      <img alt={image.name} src={image.url} />
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
