export const posterDecorations = [
  {
    id: 'shooting-star',
    name: '流星星芒',
    paths: [
      'M65 8 L70 26 L90 30 L72 36 L66 56 L60 37 L40 31 L60 26 Z',
      'M64 31 C34 37 18 63 3 83 C30 67 44 43 64 31',
    ],
  },
  {
    id: 'sparkles',
    name: '闪耀星群',
    paths: [
      'M50 12 L59 40 L88 49 L59 58 L50 87 L41 58 L12 49 L41 40 Z',
      'M83 3 L86 14 L98 17 L86 20 L83 31 L80 20 L69 17 L80 14 Z',
      'M17 71 L20 81 L31 84 L20 88 L17 98 L14 88 L3 84 L14 81 Z',
    ],
  },
  {
    id: 'orbit',
    name: '星环',
    paths: [
      'M3 54 C10 12 97 4 97 47 C97 89 10 97 3 54 Z',
      'M50 8 L55 21 L69 25 L55 29 L50 43 L46 29 L31 25 L46 21 Z',
    ],
  },
  {
    id: 'heart',
    name: '心形',
    paths: [
      'M50 89 C42 75 4 55 4 29 C4 5 37 0 50 24 C63 0 96 5 96 29 C96 55 58 75 50 89 Z',
    ],
  },
  {
    id: 'ribbon',
    name: '飘带',
    paths: ['M2 28 L98 28 L85 50 L98 72 L2 72 L15 50 Z'],
  },
  {
    id: 'label',
    name: '圆角标签',
    paths: [
      'M12 20 H88 Q98 20 98 30 V70 Q98 80 88 80 H12 Q2 80 2 70 V30 Q2 20 12 20 Z',
    ],
  },
  { id: 'diamond', name: '菱形光', paths: ['M50 2 L92 50 L50 98 L8 50 Z'] },
  {
    id: 'moon',
    name: '新月',
    paths: ['M68 4 C-8 0 -8 100 68 96 C18 69 18 31 68 4 Z'],
  },
  {
    id: 'flower',
    name: '五瓣花',
    paths: [
      'M50 41 C2 -20 100 -20 50 41 C115 0 135 94 60 56 C124 114 29 143 46 67 C-17 127 -36 31 37 47 C-36 11 38 -30 50 41 Z',
    ],
  },
  {
    id: 'arrow',
    name: '手绘箭头',
    paths: ['M5 58 C35 14 59 78 94 32', 'M68 31 L94 32 L82 58'],
  },
  {
    id: 'wave',
    name: '波浪线',
    paths: ['M2 50 Q14 12 26 50 T50 50 T74 50 T98 50'],
  },
  {
    id: 'bracket',
    name: '装饰框',
    paths: ['M26 6 H6 V29', 'M74 6 H94 V29', 'M26 94 H6 V71', 'M74 94 H94 V71'],
  },
  {
    id: 'cross',
    name: '十字光',
    paths: ['M48 4 H52 V48 H96 V52 H52 V96 H48 V52 H4 V48 H48 Z'],
  },
  {
    id: 'starburst',
    name: '爆闪星',
    paths: [
      'M50 2 L56 36 L75 9 L64 41 L98 25 L68 47 L99 51 L68 55 L91 81 L61 63 L66 99 L52 68 L38 99 L42 65 L9 86 L32 57 L1 53 L33 46 L4 18 L40 36 L32 3 L48 35 Z',
    ],
  },
];
export function decoration(id: string) {
  return posterDecorations.find((item) => item.id === id);
}
