import type { ProfileShortCode, StoredLibraryAsset } from './prism-types';

export function profileNature(
  value = '',
): Pick<ProfileShortCode, 'nature' | 'natureOther'> {
  if (/成品|最终|final|finished/i.test(value)) return { nature: 'final' };
  if (/阶段|测试|stage|test/i.test(value)) return { nature: 'stage' };
  return value.trim()
    ? { nature: 'other', natureOther: value.trim() }
    : { nature: 'unconfirmed' };
}
export function natureLabel(code: ProfileShortCode) {
  return code.nature === 'final'
    ? '成品 P'
    : code.nature === 'stage'
      ? '阶段 P'
      : code.nature === 'other'
        ? code.natureOther || '其他性质'
        : '性质待确认';
}
export function profileCodes(asset: StoredLibraryAsset): ProfileShortCode[] {
  if (asset.profileCodes) return asset.profileCodes;
  const original =
    asset.stageType === '其他' ? asset.stageTypeOther : asset.stageType;
  const nature = profileNature(original);
  return [
    {
      id: `legacy-${asset.id}`,
      label: '原有短码',
      secret: asset.secret || '',
      ...(nature.nature === 'other'
        ? { nature: 'unconfirmed' as const }
        : nature),
      note: asset.stageNote || '',
      imageScope: `asset-image:${asset.id}`,
      customFields:
        original && nature.nature === 'other'
          ? [
              {
                id: `legacy-nature-${asset.id}`,
                label: '旧版阶段性质（保留原文）',
                value: original,
              },
            ]
          : [],
    },
  ];
}
export function profileImageScope(assetId: string, code: ProfileShortCode) {
  return code.imageScope || `profile-code-image:${assetId}:${code.id}`;
}
export function profileChoiceId(assetId: string, codeId: string) {
  return `${assetId}::${codeId}`;
}
export function profileChoices(
  assets: StoredLibraryAsset[],
): StoredLibraryAsset[] {
  return assets.flatMap((asset) =>
    profileCodes(asset).map((code) => ({
      ...asset,
      id: profileChoiceId(asset.id, code.id),
      title: `${asset.title} / ${code.label}`,
      secret: code.secret,
      stageType: natureLabel(code),
      note: code.note,
    })),
  );
}
export function resolveLegacyProfileIds(
  ids: string[],
  assets: StoredLibraryAsset[],
): string[] {
  return ids.map((id) => {
    const parent = assets.find((a) => a.id === id);
    const first = parent && profileCodes(parent)[0];
    return parent && first ? profileChoiceId(parent.id, first.id) : id;
  });
}
