'use client';
import { useEffect, useRef, useState } from 'react';
import { useVault } from './vault-provider';
import { ExampleImage, type Picture } from './example-image';
import {
  writingVersion,
  writingLanguages,
  type WrittenPrompt,
} from '@/lib/writing-model';
export function WrittenRecordImage({ doc }: { doc: WrittenPrompt }) {
  const vault = useVault(),
    [thumbnail, setThumbnail] = useState(''),
    [error, setError] = useState(''),
    urls = useRef<string[]>([]),
    version = writingVersion(doc),
    media = version.media.filter((item) => item.role === 'example');
  useEffect(() => {
    let cancelled = false,
      url = '';
    setThumbnail('');
    if (media[0])
      void vault
        .loadBlobs(doc.mediaScope, [media[0].id])
        .then((blobs) => {
          if (cancelled || !blobs[0]) return;
          url = URL.createObjectURL(blobs[0].blob);
          setThumbnail(url);
        })
        .catch((error) => setError(String(error)));
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
      for (const value of urls.current) URL.revokeObjectURL(value);
      urls.current = [];
    };
  }, [doc.id, version.id, vault.session]);
  if (!thumbnail)
    return (
      <div className="written-empty-thumb">
        <span>{error ? '例图待重新读取' : '例图'}</span>
      </div>
    );
  return (
    <div className="written-record-image">
      <ExampleImage
        src={thumbnail}
        alt={`${doc.title} 例图`}
        beforeOpen={async () => {
          const blobs = await vault.loadBlobs(
            doc.mediaScope,
            media.map((item) => item.id),
          );
          return media.flatMap((item) => {
            const blob = blobs.find((value) => value.id === item.id);
            if (!blob) return [];
            const url = URL.createObjectURL(blob.blob);
            urls.current.push(url);
            return [
              {
                url,
                name: item.name,
                assetId: doc.id,
                title: doc.title,
                copies: writingLanguages
                  .filter((lang) => version.languages[lang.id])
                  .map((lang) => ({
                    label:
                      lang.id === 'zh'
                        ? '复制中文原稿'
                        : `复制${lang.name}译文`,
                    value: version.languages[lang.id],
                  })),
              } satisfies Picture,
            ];
          });
        }}
        afterClose={() => {
          for (const url of urls.current) URL.revokeObjectURL(url);
          urls.current = [];
        }}
      />
      {media.length > 1 && <small>{media.length} 张</small>}
    </div>
  );
}
