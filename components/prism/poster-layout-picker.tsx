'use client';
import { useMemo } from 'react';
import {
  posterLayoutOptions,
  posterTemplate,
  type PosterLayout,
} from '@/lib/poster';
export function PosterLayoutPicker({
  value,
  count,
  onSelect,
}: {
  value: PosterLayout;
  count: number;
  onSelect: (layout: PosterLayout) => void;
}) {
  const previews = useMemo(() => {
    const file = new File([], 'layout.png', { type: 'image/png' });
    return new Map(
      posterLayoutOptions.map((option) => [
        option.id,
        posterTemplate(
          Array.from(
            { length: option.count || Math.max(2, Math.min(count, 9)) },
            () => ({ file }),
          ),
          { width: 108, height: 160 },
          option.id,
          3,
        ),
      ]),
    );
  }, [count]);
  return (
    <div className="poster-layout-picker">
      <div>
        <strong>图片版式</strong>
        <small>点选后可以继续手动调整每一张图</small>
      </div>
      <div className="poster-layout-grid">
        {posterLayoutOptions.map((option) => (
          <button
            key={option.id}
            aria-label={`使用海报版式 ${option.name}`}
            aria-pressed={value === option.id}
            onClick={() => onSelect(option.id)}
          >
            <svg viewBox="0 0 108 160" aria-hidden="true">
              {previews.get(option.id)?.map((layer, i) => (
                <rect
                  key={i}
                  x={layer.x}
                  y={layer.y}
                  width={Math.max(1, layer.width)}
                  height={Math.max(1, layer.height)}
                  rx={1.5}
                  fill={['#cab4dd', '#dac6dd', '#b89acd', '#e0d5e8'][i % 4]}
                />
              ))}
            </svg>
            <strong>{option.name}</strong>
            <small>{option.note}</small>
          </button>
        ))}
      </div>
    </div>
  );
}
