'use client';
import { useEffect, useRef } from 'react';
import type { PosterFontFile } from './poster-type-controls';
export function usePosterFonts(
  fonts: PosterFontFile[],
  onError: (message: string) => void,
) {
  const faces = useRef(new Map<string, FontFace>());
  useEffect(() => {
    let cancelled = false;
    const ids = new Set(fonts.map((font) => font.id));
    for (const [id, face] of faces.current)
      if (!ids.has(id)) {
        document.fonts.delete(face);
        faces.current.delete(id);
      }
    void (async () => {
      for (const font of fonts) {
        if (faces.current.has(font.id)) continue;
        const face = new FontFace(font.id, await font.file.arrayBuffer());
        await face.load();
        if (cancelled) return;
        document.fonts.add(face);
        faces.current.set(font.id, face);
      }
    })().catch((error) =>
      onError(
        error instanceof Error
          ? `字体未能载入：${error.message}`
          : '字体载入失败，请选择有效的字体文件。',
      ),
    );
    return () => {
      cancelled = true;
    };
  }, [fonts]);
  useEffect(
    () => () => {
      for (const face of faces.current.values()) document.fonts.delete(face);
      faces.current.clear();
    },
    [],
  );
}
