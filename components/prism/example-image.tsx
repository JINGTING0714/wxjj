'use client';
import { useEffect, useRef, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Minus,
  Plus,
  RotateCcw,
  X,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useVault } from './vault-provider';
import { CodeCopy } from './code-copy';
import { IndexJump } from './index-jump';
import { copyText } from '@/lib/clipboard';

export type Picture = {
  url: string;
  name?: string;
  assetId?: string;
  title?: string;
  english?: string;
  chinese?: string;
  unconfirmed?: string;
  copyValue?: string;
  copyLabel?: string;
  copies?: { label: string; value: string }[];
  copyCode?: string;
  copyFormat?: 'profile' | 'raw';
};

/** Local Blob URLs stay inside the vault page, including while zooming. */
export function ExampleImage({
  src,
  alt,
  images,
  index = 0,
  onEditAsset,
  beforeOpen,
  afterClose,
}: {
  src: string;
  alt: string;
  images?: Picture[];
  index?: number;
  onEditAsset?: (id: string) => void;
  beforeOpen?: () => Promise<Picture[]>;
  afterClose?: () => void;
}) {
  const vault = useVault();
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState(index);
  const [zoom, setZoom] = useState(1);
  const [prepared, setPrepared] = useState<Picture[] | null>(null),
    [opening, setOpening] = useState(false);
  const [openError, setOpenError] = useState('');
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
  const pictures = prepared?.length
    ? prepared
    : images?.length
      ? images
      : [{ url: src, name: alt }];
  const picture = pictures[Math.min(current, pictures.length - 1)];
  useEffect(() => {
    if (vault.status !== 'unlocked') setOpen(false);
  }, [vault.status, vault.session]);
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
        disabled={opening}
        title={openError || undefined}
        onClick={async (event) => {
          event.stopPropagation();
          if (beforeOpen) {
            setOpening(true);
            try {
              const pictures = await beforeOpen();
              if (!pictures.length) throw new Error('暂无可读取的例图。');
              setPrepared(pictures);
              setOpenError('');
            } catch (error) {
              setOpenError(
                error instanceof Error
                  ? error.message
                  : '例图未能读取，请重试。',
              );
              return;
            } finally {
              setOpening(false);
            }
          }
          setCurrent(index);
          setZoom(1);
          setOpen(true);
        }}
      >
        <img src={src} alt={alt} loading="lazy" />
      </button>
      <Dialog
        open={open}
        onOpenChange={(value) => {
          if (value) setOpen(true);
        }}
      >
        <DialogContent
          className="example-lightbox"
          showCloseButton={false}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            if (
              e.target instanceof HTMLElement &&
              e.target.closest('input,textarea,select')
            )
              return;
            if (e.key === 'ArrowLeft') step(-1);
            if (e.key === 'ArrowRight') step(1);
          }}
        >
          <button
            className="preview-close-icon"
            aria-label="关闭放大查看"
            title="关闭"
            onClick={() => {
              setOpen(false);
              afterClose?.();
              setPrepared(null);
            }}
          >
            <X />
          </button>
          <DialogTitle>{picture.title || picture.name || alt}</DialogTitle>
          <DialogDescription>输入序号跳转 · 放大查看细节</DialogDescription>
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
            <IndexJump
              index={current}
              count={pictures.length}
              onChange={(index) => {
                setCurrent(index);
                setZoom(1);
              }}
            />
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
          {picture.assetId && (
            <div className="example-prompt-actions">
              <Button
                variant="outline"
                onClick={() => {
                  let next = current;
                  for (let i = 0; i < pictures.length; i++) {
                    next = (next + 1) % pictures.length;
                    if (pictures[next].assetId !== picture.assetId) break;
                  }
                  setCurrent(next);
                  setZoom(1);
                }}
                disabled={
                  !pictures.some((item) => item.assetId !== picture.assetId)
                }
              >
                {picture.copyValue ? '下一条记录' : '下一个提示词'}
              </Button>
              {picture.copies?.map((item) => (
                <Button
                  key={item.label}
                  onClick={() => void copyText(item.value)}
                >
                  {item.label}
                </Button>
              ))}
              {!picture.copies && picture.english && (
                <Button onClick={() => void copyText(picture.english!)}>
                  复制英文提示词
                </Button>
              )}
              {!picture.copies && picture.chinese && (
                <Button onClick={() => void copyText(picture.chinese!)}>
                  复制中文提示词
                </Button>
              )}
              {picture.unconfirmed && (
                <Button onClick={() => void copyText(picture.unconfirmed!)}>
                  复制待核对原文
                </Button>
              )}
              {picture.copyCode && (
                <CodeCopy
                  value={picture.copyCode}
                  initial={picture.copyFormat || 'profile'}
                  label="查看页短码"
                />
              )}
              {!picture.copyCode && picture.copyValue && (
                <Button onClick={() => void copyText(picture.copyValue!)}>
                  {picture.copyLabel || '复制完整短码'}
                </Button>
              )}
              {onEditAsset && (
                <Button
                  variant="outline"
                  onClick={() => {
                    onEditAsset(picture.assetId!);
                  }}
                >
                  {picture.copyValue ? '编辑此条记录' : '编辑此提示词'}
                </Button>
              )}
            </div>
          )}
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
