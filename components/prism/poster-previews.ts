'use client';
import { useEffect, useRef, useState } from 'react';
import type { PosterImage } from '@/lib/poster';
export function usePosterPreviews(images: PosterImage[]) {
  const cache = useRef(new Map<File, string>()),
    [, refresh] = useState(0);
  const stable = useRef(images);
  if (images.length !== stable.current.length || images.some((item,index)=>item.file!==stable.current[index]?.file)) stable.current=images;
  const files=stable.current;
  useEffect(() => {
    let cancelled = false;
    const keep = new Set(images.map((image) => image.file));
    for (const [file, url] of cache.current)
      if (!keep.has(file)) {
        URL.revokeObjectURL(url);
        cache.current.delete(file);
      }
    void (async () => {
      let pending = 0;
      for (const image of images) {
        if (cancelled) return;
        if (cache.current.has(image.file)) continue;
        try {
          const bitmap = await createImageBitmap(image.file),
            canvas = document.createElement('canvas'),
            maximum = images.length > 50 ? 160 : 640,
            scale = Math.min(
              1,
              maximum / Math.max(bitmap.width, bitmap.height),
            );
          canvas.width = Math.round(bitmap.width * scale);
          canvas.height = Math.round(bitmap.height * scale);
          canvas
            .getContext('2d')!
            .drawImage(bitmap, 0, 0, canvas.width, canvas.height);
          const blob = await new Promise<Blob | null>((resolve) =>
            canvas.toBlob(
              resolve,
              image.file.type === 'image/jpeg' ? 'image/jpeg' : 'image/png',
              0.88,
            ),
          );
          bitmap.close();
          canvas.width = canvas.height = 0;
          if (cancelled) return;
          if (blob) {
            cache.current.set(image.file, URL.createObjectURL(blob));
            if (++pending % 8 === 0) refresh((value) => value + 1);
          }
          await new Promise((resolve) => setTimeout(resolve, 0));
        } catch {
          cache.current.set(image.file, '');
          if (++pending % 8 === 0) refresh((value) => value + 1);
        }
      }
      if (!cancelled && pending % 8) refresh((value) => value + 1);
    })().catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [files]);
  useEffect(
    () => () => {
      for (const url of cache.current.values()) URL.revokeObjectURL(url);
      cache.current.clear();
    },
    [],
  );
  return {
    urls: images.map((image) => cache.current.get(image.file) || ''),
    pending: images.filter((image) => !cache.current.has(image.file)).length,
    failed: images.filter(
      (image) =>
        cache.current.has(image.file) && !cache.current.get(image.file),
    ).length,
  };
}
