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
