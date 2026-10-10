/* oxlint-disable next/no-img-element */
'use client';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { ExampleImage } from './example-image';

export function ScreenshotReview({
  url,
  title,
  focusTop,
  compact = false,
}: {
  url: string;
  title: string;
  focusTop?: number;
  compact?: boolean;
}) {
  const [zoom, setZoom] = useState(compact ? 3 : 1);
  const view = useRef<HTMLDivElement>(null);
  const align = () => {
    const image = view.current?.querySelector('img');
    if (view.current && image?.naturalHeight && focusTop !== undefined) {
      view.current.scrollTop = Math.max(
        0,
        (focusTop * image.getBoundingClientRect().height) /
          image.naturalHeight -
          24,
      );
      if (compact)
        view.current.scrollLeft = Math.max(
          0,
          image.getBoundingClientRect().width * 0.112 - 10,
        );
    }
  };
  useEffect(align, [focusTop, zoom, url]);
  return (
    <section className="screenshot-review-viewer">
      <div className="screenshot-review-tools">
        <strong>{title}</strong>
        <Button
          size="sm"
          variant="outline"
          disabled={zoom <= 1}
          onClick={() => setZoom((value) => Math.max(1, value - 0.5))}
        >
          缩小
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={zoom >= 4}
          onClick={() => setZoom((value) => Math.min(4, value + 0.5))}
        >
          放大
        </Button>
        <Button size="sm" variant="outline" onClick={() => setZoom(1)}>
          适应宽度
        </Button>
      </div>
      <div
        ref={view}
        onLoadCapture={align}
        className="screenshot-review-scroll"
      >
        <div style={{ width: `${zoom * 100}%` }}>
          <ExampleImage src={url} alt={title} />
        </div>
      </div>
      <small>原图与结果分别滚动，同时保持可见。点击原图可全屏放大。</small>
    </section>
  );
}
