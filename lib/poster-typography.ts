import type { PosterText } from './poster';
export type PosterArtPreset = {
  id: string;
  name: string;
  sample: string;
  values: Partial<PosterText>;
};
export const posterFontOptions = [
  { value: 'Noto Sans SC', label: '思源黑体 · 简洁' },
  { value: 'Noto Serif SC', label: '思源宋体 · 编辑感' },
  { value: 'Ma Shan Zheng', label: '马善政 · 中文书法' },
  { value: 'Caveat', label: 'Caveat · 手写英文' },
  { value: 'Bebas Neue', label: 'Bebas Neue · 窄体标题' },
  { value: 'Geist Variable', label: 'Geist · 现代无衬线' },
  { value: 'Geist Mono Variable', label: 'Geist Mono · 等宽' },
  { value: 'Arial', label: 'Arial · 系统字体' },
  { value: 'Georgia', label: 'Georgia · 系统衬线' },
  { value: 'Times New Roman', label: 'Times · 古典英文' },
  { value: 'Impact', label: 'Impact · 粗体标题' },
  { value: 'Microsoft YaHei', label: '微软雅黑 · 系统字体' },
  { value: 'KaiTi', label: '楷体 · 系统字体' },
  { value: 'SimSun', label: '宋体 · 系统字体' },
];
export const posterArtPresets: PosterArtPreset[] = [
  {
    id: 'pink-pop',
    name: '莓粉立体',
    sample: '词包 / Pink',
    values: {
      style: 'extrude',
      font: 'Noto Sans SC',
      weight: 900,
      italic: true,
      color: '#ee248b',
      color2: '#fff5fb',
      stroke: '#8e1d58',
      strokeWidth: 0.035,
      depth: 0.065,
      spacing: 0,
    },
  },
  {
    id: 'rose-outline',
    name: '玫瑰双描边',
    sample: 'Sweet words',
    values: {
      style: 'double-outline',
      font: 'Noto Sans SC',
      weight: 900,
      italic: true,
      color: '#f254a4',
      color2: '#fff9fd',
      stroke: '#8f2864',
      strokeWidth: 0.045,
      spacing: 0,
    },
  },
  {
    id: 'violet',
    name: '紫色糖衣',
    sample: 'Dream / 梦',
    values: {
      style: 'double-outline',
      weight: 900,
      italic: true,
      color: '#8754cc',
      color2: '#f3dcff',
      stroke: '#573481',
      strokeWidth: 0.04,
    },
  },
  {
    id: 'silver',
    name: '银色铬光',
    sample: 'CHROME',
    values: {
      style: 'chrome',
      font: 'Bebas Neue',
      weight: 700,
      italic: true,
      color: '#9dabc6',
      color2: '#ffffff',
      stroke: '#2b3446',
      strokeWidth: 0.025,
    },
  },
  {
    id: 'gold',
    name: '鎏金标题',
    sample: 'Golden',
    values: {
      style: 'chrome',
      font: 'Noto Serif SC',
      weight: 700,
      italic: false,
      color: '#c89225',
      color2: '#fff1ba',
      stroke: '#6d4117',
      strokeWidth: 0.022,
    },
  },
  {
    id: 'ice',
    name: '冰蓝玻璃',
    sample: 'Blue / 清透',
    values: {
      style: 'double-outline',
      weight: 900,
      italic: false,
      color: '#65a7dd',
      color2: '#f1fcff',
      stroke: '#286eaa',
      strokeWidth: 0.025,
    },
  },
  {
    id: 'neon',
    name: '霓虹紫光',
    sample: 'NEON',
    values: {
      style: 'glow',
      font: 'Bebas Neue',
      weight: 700,
      italic: false,
      color: '#d19fff',
      color2: '#ffffff',
      stroke: '#7435b2',
      shadowBlur: 0.3,
      spacing: 2,
    },
  },
  {
    id: 'pink-neon',
    name: '柔粉发光',
    sample: 'Soft / 温柔',
    values: {
      style: 'soft-glow',
      font: 'Caveat',
      weight: 700,
      italic: false,
      color: '#fff1f7',
      color2: '#f7b2d3',
      stroke: '#e864a7',
      shadowBlur: 0.28,
    },
  },
  {
    id: 'outline',
    name: '纯白描边',
    sample: 'OUTLINE',
    values: {
      style: 'hollow',
      font: 'Bebas Neue',
      weight: 700,
      italic: false,
      color: '#ffffff',
      stroke: '#ffffff',
      strokeWidth: 0.03,
      spacing: 2,
    },
  },
  {
    id: 'bold-shadow',
    name: '黑白冲击',
    sample: 'NEW DROP',
    values: {
      style: 'shadow',
      font: 'Noto Sans SC',
      weight: 900,
      italic: true,
      color: '#ffffff',
      stroke: '#17151d',
      shadowX: 0.06,
      shadowY: 0.06,
      shadowBlur: 0,
      spacing: 0,
    },
  },
  {
    id: 'ink',
    name: '编辑部黑体',
    sample: 'THE EDIT',
    values: {
      style: 'plain',
      font: 'Bebas Neue',
      weight: 700,
      italic: false,
      color: '#27222b',
      spacing: 3,
    },
  },
  {
    id: 'serif',
    name: '法式衬线',
    sample: 'Édition',
    values: {
      style: 'plain',
      font: 'Noto Serif SC',
      weight: 400,
      italic: true,
      color: '#4b3545',
      spacing: 0,
    },
  },
  {
    id: 'hand',
    name: '手写签名',
    sample: 'Beyond cute',
    values: {
      style: 'plain',
      font: 'Caveat',
      weight: 700,
      italic: false,
      color: '#9d3769',
      spacing: 0,
    },
  },
  {
    id: 'brush',
    name: '书法题字',
    sample: '花间 · 词会',
    values: {
      style: 'plain',
      font: 'Ma Shan Zheng',
      weight: 400,
      italic: false,
      color: '#42343d',
      spacing: 2,
    },
  },
  {
    id: 'stamp',
    name: '红色印记',
    sample: 'LIMITED',
    values: {
      style: 'outline',
      font: 'Geist Mono Variable',
      weight: 700,
      italic: false,
      color: '#b3374b',
      stroke: '#7a1528',
      strokeWidth: 0.015,
      spacing: 1,
    },
  },
  {
    id: 'sunset',
    name: '日落渐变',
    sample: 'Sunset',
    values: {
      style: 'gradient',
      font: 'Noto Sans SC',
      weight: 900,
      italic: true,
      color: '#e96279',
      color2: '#ffd499',
      stroke: '#804546',
      spacing: 0,
    },
  },
  {
    id: 'mint',
    name: '薄荷清新',
    sample: 'Fresh / 新作',
    values: {
      style: 'gradient',
      weight: 700,
      italic: false,
      color: '#3b9e8d',
      color2: '#e2fff7',
      stroke: '#1c675d',
      spacing: 1,
    },
  },
  {
    id: 'sport',
    name: '动感黄绿',
    sample: 'MOVE',
    values: {
      style: 'extrude',
      font: 'Bebas Neue',
      weight: 700,
      italic: true,
      color: '#a6df35',
      color2: '#f6ffd4',
      stroke: '#426328',
      depth: 0.04,
      spacing: 2,
    },
  },
  {
    id: 'soft',
    name: '雾粉衬线',
    sample: 'Quiet moments',
    values: {
      style: 'plain',
      font: 'Noto Serif SC',
      weight: 400,
      italic: false,
      color: '#bf7c94',
      spacing: 1,
    },
  },
  {
    id: 'underline',
    name: '杂志下划线',
    sample: 'SPECIAL EDIT',
    values: {
      style: 'plain',
      font: 'Noto Sans SC',
      weight: 700,
      italic: true,
      underline: true,
      color: '#7c3860',
      spacing: 0,
    },
  },
];
export function posterFontCss(text: PosterText, size = text.size) {
  return `${text.italic ? 'italic ' : ''}${text.weight} ${size}px "${text.font}","Noto Sans SC",sans-serif`;
}
export function posterTextStops(text: PosterText) {
  return text.style === 'chrome'
    ? [
        { offset: 0, color: text.color2 },
        { offset: 0.3, color: text.color },
        { offset: 0.48, color: text.color2 },
        { offset: 0.52, color: text.stroke },
        { offset: 0.64, color: text.color2 },
        { offset: 1, color: text.color },
      ]
    : [
        { offset: 0, color: text.color2 },
        { offset: 1, color: text.color },
      ];
}
export function posterTextCss(
  text: PosterText,
  ratio = 1,
): Record<string, string | number | undefined> {
  const size = text.size * ratio,
    width = size * (text.strokeWidth ?? 0.04),
    outline = [
      'outline',
      'double-outline',
      'hollow',
      'chrome',
      'extrude',
    ].includes(text.style),
    gradient = ['gradient', 'double-outline', 'chrome', 'extrude'].includes(
      text.style,
    ),
    shadows: string[] = [];
  if (text.style === 'double-outline') {
    for (const [x, y] of [
      [-1, 0],
      [1, 0],
      [0, -1],
      [0, 1],
      [-0.7, -0.7],
      [0.7, -0.7],
      [-0.7, 0.7],
      [0.7, 0.7],
    ])
      shadows.push(`${x * width * 2}px ${y * width * 2}px 0 ${text.stroke}`);
  }
  if (text.style === 'extrude')
    for (
      let n = 1;
      n <= Math.max(1, Math.ceil(size * (text.depth ?? 0.06)));
      n++
    )
      shadows.push(`${n}px ${n}px 0 ${text.stroke}`);
  if (['shadow', 'glow', 'soft-glow'].includes(text.style))
    shadows.push(
      `${size * (text.shadowX ?? 0)}px ${size * (text.shadowY ?? 0)}px ${size * (text.shadowBlur ?? 0.22)}px ${text.style === 'shadow' ? text.stroke : text.color}`,
    );
  return {
    fontFamily: `"${text.font}","Noto Sans SC",sans-serif`,
    fontSize: size,
    fontWeight: text.weight,
    fontStyle: text.italic ? 'italic' : 'normal',
    textAlign: text.align,
    lineHeight: text.lineHeight ?? 1.25,
    letterSpacing: (text.spacing || 0) * ratio,
    textDecorationLine:
      [text.underline ? 'underline' : '', text.strike ? 'line-through' : '']
        .filter(Boolean)
        .join(' ') || 'none',
    textDecorationThickness: Math.max(1, size * 0.035),
    color: text.style === 'hollow' ? 'transparent' : text.color,
    ...(gradient
      ? {
          backgroundImage: `linear-gradient(${text.gradientAngle ?? 180}deg,${posterTextStops(
            text,
          )
            .map((stop) => `${stop.color} ${stop.offset * 100}%`)
            .join(',')})`,
          backgroundClip: 'text',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundSize: `100% ${size * (text.lineHeight ?? 1.25)}px`,
          backgroundRepeat: 'repeat-y',
        }
      : {}),
    WebkitTextStroke: outline
      ? `${text.style === 'double-outline' ? width : width}px ${text.style === 'double-outline' ? text.color2 : text.stroke}`
      : undefined,
    paintOrder: 'stroke fill',
    textShadow: shadows.join(',') || undefined,
  };
}
