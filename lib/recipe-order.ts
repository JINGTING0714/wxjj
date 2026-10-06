import type { StoredRecipe, StoredLibraryAsset } from './prism-types';
import { formatProfileCode } from './short-codes';
import { profileVersion } from './profile-model';
export type RecipeChoice = { kind: 'profile' | 'moodboard'; id: string };
export function recipeOrder(
  recipe: Pick<StoredRecipe, 'profileIds' | 'moodboardIds' | 'selectionOrder'>,
): RecipeChoice[] {
  // Legacy recipes retain their original group and within-group ordering.
  const fallback: RecipeChoice[] = [
    ...recipe.profileIds.map((id) => ({ kind: 'profile' as const, id })),
    ...recipe.moodboardIds.map((id) => ({ kind: 'moodboard' as const, id })),
  ];
  if (!recipe.selectionOrder) return fallback;
  const chosen = new Set(fallback.map((item) => `${item.kind}:${item.id}`));
  const used = new Set<string>();
  return [...recipe.selectionOrder, ...fallback].filter((item) => {
    const key = `${item.kind}:${item.id}`;
    if (!chosen.has(key) || used.has(key)) return false;
    used.add(key);
    return true;
  });
}
export function recipeCommand(
  recipe: Pick<StoredRecipe, 'profileIds' | 'moodboardIds' | 'selectionOrder'>,
  assets: Map<string, StoredLibraryAsset>,
  kind?: RecipeChoice['kind'],
) {
  const selected = recipeOrder(recipe).filter(
    (item) => !kind || item.kind === kind,
  );
  if (!selected.length)
    throw new Error('配方没有可复制的库中条目。手填内容不参与一键复制。');
  const versions = new Set(selected.filter(item => item.kind === 'profile').map(item => assets.get(item.id)).filter((asset): asset is StoredLibraryAsset => !!asset && asset.stageType !== '情绪 P').map(profileVersion).filter(version => version !== 'unconfirmed'));
  if (versions.size > 1) throw new Error('N6P 和 N7P 不能一起使用，请分开选择后复制配方。');
  const values = selected.map((item) => {
    const asset = assets.get(item.id);
    if (!asset || !asset.secret.trim())
      throw new Error('配方存在缺失引用，请编辑确认后再复制。');
    return asset.secret.replace(/^--profile\s+/i, '').trim();
  });
  return formatProfileCode(values.join(' '));
}
export function moveRecipeChoice(
  order: RecipeChoice[],
  index: number,
  target: number,
) {
  if (
    index < 0 ||
    index >= order.length ||
    target < 0 ||
    target >= order.length
  )
    return order;
  const next = [...order];
  const [choice] = next.splice(index, 1);
  next.splice(target, 0, choice);
  return next;
}
