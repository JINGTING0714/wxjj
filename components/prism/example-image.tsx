'use client';
import { useEffect, useRef, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Minus,
  Plus,
  RotateCcw,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

type Picture = { url: string; name?: string };

/** Local Blob URLs stay inside the vault page, including while zooming. */
export function ExampleImage({
  src,
  alt,
  images,
  index = 0,
}: {
  src: string;
  alt: string;
  images?: Picture[];
  index?: number;
}) {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState(index);
  const [zoom, setZoom] = useState(1);
  const viewport = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const el = viewport.current;
      if (el)
        el.scrollTo(
          (el.scrollWidth - el.clientWidth) / 2,
          (el.scrollHeight - el.clientHeight) / 2,
        );
    });
    return () => cancelAnimationFrame(frame);
  }, [zoom, current, open]);
  const pictures = images?.length ? images : [{ url: src, name: alt }];
  const picture = pictures[Math.min(current, pictures.length - 1)];
  useEffect(() => {
    const hide = () => setOpen(false);
    window.addEventListener('prism:hide-secrets', hide);
    return () => window.removeEventListener('prism:hide-secrets', hide);
  }, []);
  function step(delta: number) {
    setCurrent((value) => (value + delta + pictures.length) % pictures.length);
    setZoom(1);
  }
  return (
    <>
      <button
        type="button"
        className="example-preview-trigger"
        aria-label={`放大查看：${alt}`}
        onClick={(event) => {
          event.stopPropagation();
          setCurrent(index);
          setZoom(1);
          setOpen(true);
        }}
      >
        <img src={src} alt={alt} loading="lazy" />
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="example-lightbox"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            if (e.key === 'ArrowLeft') step(-1);
            if (e.key === 'ArrowRight') step(1);
          }}
        >
          <DialogTitle>{picture.name || alt}</DialogTitle>
          <DialogDescription>
            本地原图预览 · 放大后可滚动查看细节，按 Esc 关闭。
          </DialogDescription>
          <div className="example-lightbox-tools">
            <Button
              type="button"
              variant="outline"
              aria-label="上一张例图"
              disabled={pictures.length < 2}
              onClick={() => step(-1)}
            >
              <ChevronLeft />
            </Button>
            <span>
              {current + 1} / {pictures.length}
            </span>
            <Button
              type="button"
              variant="outline"
              aria-label="下一张例图"
              disabled={pictures.length < 2}
              onClick={() => step(1)}
            >
              <ChevronRight />
            </Button>
            <Button
              type="button"
              variant="outline"
              aria-label="缩小例图"
              disabled={zoom <= 1}
              onClick={() => setZoom((v) => Math.max(1, v - 0.5))}
            >
              <Minus />
            </Button>
            <output>{Math.round(zoom * 100)}%</output>
            <Button
              type="button"
              variant="outline"
              aria-label="放大例图"
              disabled={zoom >= 4}
              onClick={() => setZoom((v) => Math.min(4, v + 0.5))}
            >
              <Plus />
            </Button>
            <Button type="button" variant="outline" onClick={() => setZoom(1)}>
              <RotateCcw />
              适应窗口
            </Button>
          </div>
          <div className="example-lightbox-scroll" ref={viewport}>
            <div
              className="example-lightbox-canvas"
              style={{ width: `${zoom * 100}%`, height: `${zoom * 100}%` }}
            >
              <img
                src={picture.url}
                alt={picture.name || alt}
                draggable={false}
              />
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
