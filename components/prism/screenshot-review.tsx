/* oxlint-disable next/no-img-element */
'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ExampleImage } from './example-image';

export function ScreenshotReview({ url, title }: { url: string; title: string }) {
  const [zoom, setZoom] = useState(1);
  return <section className="screenshot-review-viewer"><div className="screenshot-review-tools"><strong>{title}</strong><Button size="sm" variant="outline" disabled={zoom <= 1} onClick={() => setZoom(value => Math.max(1, value - .5))}>缩小</Button><Button size="sm" variant="outline" disabled={zoom >= 4} onClick={() => setZoom(value => Math.min(4, value + .5))}>放大</Button><Button size="sm" variant="outline" onClick={() => setZoom(1)}>适应宽度</Button></div><div className="screenshot-review-scroll"><div style={{ width: `${zoom * 100}%` }}><ExampleImage src={url} alt={title} /></div></div><small>左侧原图与右侧结果可分别滚动。点击原图可全屏放大。</small></section>;
}
