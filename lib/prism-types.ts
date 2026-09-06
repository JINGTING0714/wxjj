export type AssetKind = 'prompt' | 'profile' | 'moodboard';

export type CustomField = {
  id: string;
  label: string;
  value: string;
};

export type ProfileShortCode = {
  id: string;
  label: string;
  secret: string;
  nature: 'stage' | 'final' | 'other' | 'unconfirmed';
  natureOther?: string;
  note: string;
  customFields?: CustomField[];
  // Legacy examples keep their original encrypted scope, so no image is lost.
  imageScope?: string;
};

export type StoredLibraryAsset = {
  id: string;
  kind: AssetKind;
  title: string;
  secret: string;
  longCode?: string;
  profileCodes?: ProfileShortCode[];
  stageType?: string;
  stageTypeOther?: string;
  stageNote?: string;
  author: string;
  origin: string;
  sourceUrl?: string;
  acquisition: string;
  acquisitionOther?: string;
  note: string;
  tags: string[];
  collection: string;
  customFields?: CustomField[];
  swatch?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type AssetImage = {
  id: string;
  name: string;
  url: string;
};

export type LibraryAsset = StoredLibraryAsset & {
  images: AssetImage[];
};

export type StoredRecipe = {
  id: string;
  title: string;
  profileIds: string[];
  moodboardIds: string[];
  ratio: string;
  note: string;
  tags: string[];
  customFields?: CustomField[];
  createdAt?: string;
  updatedAt?: string;
};

export type Recipe = StoredRecipe & {
  images: AssetImage[];
};

export type GalleryImageMeta = {
  id: string;
  name: string;
  collection: string;
  note: string;
  tags: string[];
  createdAt?: string;
  updatedAt?: string;
};

export type GalleryImage = GalleryImageMeta & {
  url: string;
  blob: Blob;
};

export type StoredWatermark = {
  id: string;
  title: string;
  collection: string;
  author: string;
  origin: string;
  sourceUrl?: string;
  acquisition: string;
  acquisitionOther?: string;
  note: string;
  tags: string[];
  customFields?: CustomField[];
  fileName: string;
  blobId?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type WatermarkAsset = StoredWatermark & {
  file: File;
  url: string;
};

export type CollectionRecord = {
  id: string;
  name: string;
};

export function prismId(prefix: string) {
  return `${prefix}-${Date.now()}-${crypto.randomUUID()}`;
}

export function normalizeCustomFields(fields: CustomField[]) {
  return fields
    .map((field) => ({
      ...field,
      label: field.label.trim(),
      value: field.value.trim(),
    }))
    .filter((field) => field.label || field.value);
}

export function secretPreview(value: string) {
  return `${value.slice(0, 3)}${'•'.repeat(Math.max(4, value.length - 3))}`;
}

export function safeSourceUrl(value?: string) {
  if (!value) return undefined;
  try {
    const parsed = new URL(value);
    return ['https:', 'http:'].includes(parsed.protocol)
      ? parsed.href
      : undefined;
  } catch {
    return undefined;
  }
}
