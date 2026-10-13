'use client';
import { useState, useEffect } from 'react';
import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Type,
  Upload,
} from 'lucide-react';
import { posterArtPresets, posterFontOptions } from '@/lib/poster-typography';
import { PosterLettering } from './poster-lettering';
import type { PosterText } from '@/lib/poster';
export type PosterFontFile = { id: string; name: string; file: File };
function TypeNumber({
  label,
  value,
  min,
  max,
  change,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  change: (value: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const commit = () => {
    const number = Number(draft);
    if (draft.trim() && Number.isFinite(number))
      change(Math.max(min, Math.min(max, number)));
    else setDraft(String(value));
  };
  return (
    <input
      aria-label={label}
      type="text"
      inputMode="decimal"
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur();
      }}
    />
  );
}
export function PosterTypeControls({
  value,
  onChange,
  fonts,
  onImportFont,
  onRemoveFont,
}: {
  value: PosterText;
  onChange: (update: Partial<PosterText>) => void;
  fonts: PosterFontFile[];
  onImportFont: (file: File) => void;
  onRemoveFont: (id: string) => void;
}) {
  return (
    <div className="poster-type-controls">
      <div className="poster-type-heading">
        <Type />
        <strong>文字与艺术字</strong>
      </div>
      <textarea
        aria-label="海报文字"
        value={value.text}
        maxLength={8000}
        onChange={(event) => onChange({ text: event.target.value })}
        placeholder="输入标题、说明或宣传语"
      />
      <div className="poster-type-row">
        <label>
          字体
          <select
            aria-label="海报字体"
            value={value.font}
            onChange={(event) => onChange({ font: event.target.value })}
          >
            {posterFontOptions.map((font) => (
              <option key={font.value} value={font.value}>
                {font.label}
              </option>
            ))}
            {fonts.map((font) => (
              <option key={font.id} value={font.id}>
                {font.name}
              </option>
            ))}
          </select>
        </label>
        <label
          className="poster-font-upload"
          title="导入自己的 TTF、OTF、WOFF 字体"
        >
          <Upload />
          <span>导入字体</span>
          <input
            type="file"
            accept=".ttf,.otf,.woff,.woff2"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) onImportFont(file);
              event.target.value = '';
            }}
          />
        </label>
      </div>
      <div
        className="poster-type-format"
        role="group"
        aria-label="海报文字格式"
      >
        <button
          aria-label="加粗"
          aria-pressed={value.weight >= 700}
          onClick={() => onChange({ weight: value.weight >= 700 ? 400 : 900 })}
        >
          <Bold />
        </button>
        <button
          aria-label="斜体"
          aria-pressed={!!value.italic}
          onClick={() => onChange({ italic: !value.italic })}
        >
          <Italic />
        </button>
        <button
          aria-label="下划线"
          aria-pressed={!!value.underline}
          onClick={() => onChange({ underline: !value.underline })}
        >
          <Underline />
        </button>
        <button
          aria-label="删除线"
          aria-pressed={!!value.strike}
          onClick={() => onChange({ strike: !value.strike })}
        >
          <Strikethrough />
        </button>
        <i />
        {(['left', 'center', 'right'] as const).map((align, i) => {
          const Icon = [AlignLeft, AlignCenter, AlignRight][i];
          return (
            <button
              key={align}
              aria-label={['左对齐', '居中', '右对齐'][i]}
              aria-pressed={value.align === align}
              onClick={() => onChange({ align })}
            >
              <Icon />
            </button>
          );
        })}
      </div>
      <div className="poster-type-numbers">
        <label>
          字号
          <TypeNumber
            label="海报字号 px"
            value={value.size}
            min={8}
            max={1000}
            change={(value) => onChange({ size: value })}
          />
        </label>
        <label>
          字间距
          <TypeNumber
            label="海报字间距"
            value={value.spacing || 0}
            min={-10}
            max={100}
            change={(value) => onChange({ spacing: value })}
          />
        </label>
        <label>
          行高
          <TypeNumber
            label="海报文字行高"
            value={value.lineHeight || 1.25}
            min={0.8}
            max={3}
            change={(value) => onChange({ lineHeight: value })}
          />
        </label>
      </div>
      <div className="poster-art-gallery">
        <div>
          <strong>艺术字样式</strong>
          <small>点选后仍可自由调色与修改</small>
        </div>
        <div className="poster-art-grid">
          {posterArtPresets.map((preset) => {
            const preview = { ...value, ...preset.values, size: 23 };
            return (
              <button
                type="button"
                key={preset.id}
                aria-label={`使用艺术字 ${preset.name}`}
                onClick={() =>
                  onChange({
                    italic: false,
                    underline: false,
                    strike: false,
                    spacing: 0,
                    lineHeight: 1.25,
                    strokeWidth: 0.035,
                    depth: 0.06,
                    shadowBlur: 0.2,
                    shadowX: 0,
                    shadowY: 0,
                    gradientAngle: 180,
                    font: 'Noto Sans SC',
                    weight: 700,
                    ...preset.values,
                  })
                }
              >
                <span
                  className={
                    ['outline', 'neon', 'pink-neon', 'bold-shadow'].includes(
                      preset.id,
                    )
                      ? 'art-sample-dark'
                      : 'art-sample-light'
                  }
                >
                  <PosterLettering text={preview} sample={preset.sample} />
                </span>
                <small>{preset.name}</small>
              </button>
            );
          })}
        </div>
      </div>
      <details className="poster-type-details">
        <summary>自定义效果与颜色</summary>
        <label>
          效果
          <select
            aria-label="海报艺术字效果"
            value={value.style}
            onChange={(event) =>
              onChange({ style: event.target.value as PosterText['style'] })
            }
          >
            {[
              ['plain', '普通'],
              ['outline', '描边'],
              ['double-outline', '双重描边'],
              ['extrude', '立体渐变'],
              ['chrome', '金属铬光'],
              ['glow', '霓虹发光'],
              ['soft-glow', '柔光'],
              ['gradient', '渐变'],
              ['hollow', '空心'],
              ['shadow', '投影'],
            ].map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <div className="poster-color-controls">
          {(['color', 'color2', 'stroke'] as const).map((key, i) => (
            <label key={key}>
              {['主色', '渐变色', '描边 / 阴影'][i]}
              <input
                type="color"
                aria-label={['艺术字主色', '艺术字渐变色', '艺术字描边色'][i]}
                value={value[key]}
                onChange={(event) => onChange({ [key]: event.target.value })}
              />
            </label>
          ))}
        </div>
        <label>
          描边粗细
          <input
            aria-label="海报描边粗细"
            type="range"
            min={0}
            max={0.15}
            step={0.005}
            value={value.strokeWidth ?? 0.04}
            onChange={(event) =>
              onChange({ strokeWidth: Number(event.target.value) })
            }
          />
        </label>
        <label>
          渐变方向
          <input
            aria-label="海报渐变方向"
            type="range"
            min={0}
            max={360}
            step={1}
            value={value.gradientAngle ?? 180}
            onChange={(event) =>
              onChange({ gradientAngle: Number(event.target.value) })
            }
          />
        </label>
        {(['shadowX', 'shadowY', 'shadowBlur'] as const).map((key, i) => (
          <label key={key}>
            {['阴影横向', '阴影纵向', '发光 / 阴影柔度'][i]}
            <input
              type="range"
              min={key === 'shadowBlur' ? 0 : -0.2}
              max={key === 'shadowBlur' ? 0.5 : 0.2}
              step={0.01}
              value={value[key] ?? (key === 'shadowBlur' ? 0.2 : 0)}
              onChange={(event) =>
                onChange({ [key]: Number(event.target.value) })
              }
            />
          </label>
        ))}
        <label>
          立体厚度
          <input
            aria-label="海报立体厚度"
            type="range"
            min={0}
            max={0.15}
            step={0.005}
            value={value.depth ?? 0.06}
            onChange={(event) =>
              onChange({ depth: Number(event.target.value) })
            }
          />
        </label>
      </details>
      {fonts.length > 0 && (
        <details>
          <summary>我的字体 · {fonts.length}</summary>
          {fonts.map((font) => (
            <div key={font.id} className="poster-own-font">
              <span>{font.name}</span>
              <button onClick={() => onRemoveFont(font.id)}>删除</button>
            </div>
          ))}
        </details>
      )}
    </div>
  );
}
