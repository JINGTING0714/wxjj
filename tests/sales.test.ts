import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reconcileSales, type SaleMessage } from '../lib/sales-reconciliation';
import { messagesFromOcr } from '../lib/sales-screenshot';

const start = '2026-09-18T22:15:00';
const message = (id: string, order: number, buyer: string, time: string, text: string): SaleMessage =>
  ({ id, screenshot: 0, order, buyer, time, text });

void test('all on-time messages participate, but each number is allocated once', () => {
  const result = reconcileSales([
    message('a', 0, '甲', start, '01'),
    message('b', 1, '乙', start, '1、2'),
    message('c', 2, '乙', '2026-09-18T22:15:01', '3'),
  ], [1, 2, 3], start, 'exclude');
  assert.deepEqual(result.assignments.map(({ number, buyer }) => [number, buyer]), [[1, '甲'], [2, '乙'], [3, '乙']]);
});

void test('minute precision at the formal start is on time', () => {
  const result = reconcileSales([message('a', 0, '甲', '2026-09-18T22:15', '1')], [1], start, 'exclude');
  assert.equal(result.assignments[0]?.buyer, '甲');
});

void test('fractional seconds preserve the screenshot order boundary', () => {
  const result = reconcileSales([
    message('early', 0, '甲', '2026-09-18T22:14:59.999', '1'),
    message('start', 1, '乙', '2026-09-18T22:15:00', '2'),
    message('later', 2, '丙', '2026-09-18T22:15:00.001', '3'),
  ], [1, 2, 3], '2026-09-18T22:15:00.000', 'exclude');
  assert.deepEqual(result.assignments.map(entry => entry.buyer), ['乙', '丙']);
});

void test('rush messages use remaining numbers after on-time messages in the chosen order', () => {
  const messages = [
    message('a', 0, 'A', '2026-09-18T22:14:57', '2'),
    message('b', 1, 'B', '2026-09-18T22:14:58', '2'),
    message('c', 2, 'C', '2026-09-18T22:14:59', '2'),
    message('d', 3, 'D', start, '1'),
    message('e', 4, 'A', '2026-09-18T22:15:01', '3'),
  ];
  const original = reconcileSales(messages, [1, 2, 3], start, 'original');
  const nearest = reconcileSales(messages, [1, 2, 3], start, 'nearest');
  assert.equal(original.assignments.find((entry) => entry.number === 2)?.buyer, 'A');
  assert.equal(nearest.assignments.find((entry) => entry.number === 2)?.buyer, 'C');
  assert.equal(nearest.assignments.find((entry) => entry.number === 3)?.buyer, 'A');
});

void test('overlap exclusions and unknown numbers remain visible as issues', () => {
  const result = reconcileSales([
    { ...message('same', 0, '甲', start, '1'), ignored: true },
    message('real', 1, '甲', start, '1, 77'),
  ], [1], start, 'exclude');
  assert.equal(result.assignments[0]?.messageId, 'real');
  assert.ok(result.issues.some((issue) => issue.number === 77 && issue.reason === '本轮号码不存在'));
});

void test('OCR only proposes number messages and leaves unknown dates for correction', () => {
  const blocks = ['甲 2026-09-18 22:15:00', '1、2', '乙 22:15:01', '3', '聊天记录'];
  const messages = messagesFromOcr([{ text: blocks.join('\n'), blocks: blocks.map((text, index) => ({ text, confidence: 90, top: index * 40, bottom: index * 40 + 30 })) }]);
  assert.equal(messages.length, 2);
  assert.equal(messages[0].buyer, '甲');
  assert.equal(messages[0].time, start);
  assert.equal(messages[1].buyer, '乙');
  assert.equal(messages[1].time, '');
});
