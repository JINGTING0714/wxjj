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
void test('two action variants in one chat message produce separate draft cards', () => {
  const text = '版本一：电影光线肖像，抬手整理银色项链，暖色背景 --ar 3:4 --niji 7\n版本二：电影光线肖像，抬手扶眼镜，暖色背景 --ar 3:4 --niji 7';
  const rows = draftsFromOcr([{ text, blocks: [] }]);
  assert.equal(rows.length, 2); assert.match(rows[0].chinese, /项链/); assert.match(rows[1].chinese, /眼镜/); assert.ok(!rows[0].chinese.includes('眼镜'));
});

void test('unlabeled screenshot variants with different actions each retain their own complete parameters', () => {
  const text = '测试作者 2026年8月20日 12:33\n森林中的双人肖像，身穿绿色外套，人物抬手整理项链\n--chaos 25 --ar 9:16 --profile AbC123 --stylize 650 --niji 7\n森林中的双人肖像，身穿绿色外套，人物撑伞回头微笑\n--chaos 25 --ar 9:16 --profile XyZ789 --stylize 750 --niji 7';
  const rows = draftsFromOcr([{ text, blocks: [] }]);
  assert.equal(rows.length, 2);
  assert.match(rows[0].chinese, /项链.*--profile AbC123/);
  assert.match(rows[1].chinese, /撑伞.*--profile XyZ789/);
  assert.ok(!rows[0].chinese.includes('撑伞') && !rows[1].chinese.includes('项链'));
});

void test('two bilingual screenshot variants align by version without copying both commands together', () => {
  const text = '版本一：A cinematic portrait, lifting a silver necklace --ar 3:4\n中文：电影光线的肖像，抬手整理银色项链 --ar 3:4\n版本二：A cinematic portrait, adjusting round glasses --ar 3:4\n中文：电影光线的肖像，抬手扶圆框眼镜 --ar 3:4';
  const rows = draftsFromOcr([{ text, blocks: [] }]);
  assert.equal(rows.length, 2);
  assert.match(rows[0].english, /necklace/); assert.match(rows[0].chinese, /项链/);
  assert.match(rows[1].english, /glasses/); assert.match(rows[1].chinese, /眼镜/);
});
