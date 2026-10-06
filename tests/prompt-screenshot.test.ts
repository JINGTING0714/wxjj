import { test } from 'node:test';
import assert from 'node:assert/strict';
import { draftsFromOcr } from '../lib/prompt-screenshot';

void test('a mixed OCR chat bubble produces separate English and Chinese fields', () => {
  const text = 'A dreamy mountain landscape, soft cinematic light --ar 16:9\n中文：梦幻山景，柔和的电影光线';
  const rows = draftsFromOcr([{ text, blocks: [{ text, confidence: 87, top: 10, bottom: 100 }] }]);
  assert.equal(rows.length, 1);
  assert.match(rows[0].english, /mountain landscape/);
  assert.match(rows[0].chinese, /梦幻山景/);
  assert.equal(rows[0].include, false);
});

void test('chat headers, thumbnails and wrapped parameters produce one candidate per Chinese message', () => {
  const text = '云卷云舒 2026年8月20日 09:19\n日韩厚涂半身人像，柔和光影与丰富细节，最高画质\n--chaos 20 --ar 9:16 --profile abc123 --niji 7\n云卷云舒 2026年8月20日 09:20\n| x ie\n云卷云舒 2026年8月20日 09:20\n校园双人插画，樱花背景，阳光与柔和色彩\n--ar 9:16 --stylize 850 --niji 7';
  const rows = draftsFromOcr([{ text, blocks: [] }]);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].english, '');
  assert.match(rows[0].chinese, /--profile abc123/);
  assert.match(rows[1].chinese, /--stylize 850/);
  assert.ok(rows.every(row => !row.chinese.includes('云卷云舒')));
});
