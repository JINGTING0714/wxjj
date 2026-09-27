import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculatorInitial, calculatorKey } from '../lib/calculator';
import {
  classifyPrompt,
  promptLanguages,
  importedPromptLanguages,
} from '../lib/prompt-language';
import {
  recipeOrder,
  recipeCommand,
  moveRecipeChoice,
} from '../lib/recipe-order';
import { parseAssetFile } from '../lib/asset-import';
import { profileNature, profileCodes } from '../lib/profile-model';
import { copyText } from '../lib/clipboard';
void test('explicit clipboard writes report success and denied access without reading or clearing', async () => {
  const navigatorDescriptor = Object.getOwnPropertyDescriptor(
    globalThis,
    'navigator',
  );
  const originalWindow = globalThis.window,
    originalEvent = globalThis.CustomEvent;
  const events: { message: string; error: boolean }[] = [];
  const writes: string[] = [];
  const target = new EventTarget();
  target.addEventListener('prism:copy-feedback', (event) =>
    events.push((event as CustomEvent).detail),
  );
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: {
      clipboard: {
        writeText: async (text: string) => {
          writes.push(text);
        },
      },
    },
  });
  Object.assign(globalThis, {
    window: target,
    CustomEvent: class extends Event {
      detail: unknown;
      constructor(name: string, options: { detail: unknown }) {
        super(name);
        this.detail = options.detail;
      }
    },
  });
  try {
    assert.equal(await copyText('--profile ABC'), true);
    assert.equal(events[0].message, '已复制');
    assert.deepEqual(writes, ['--profile ABC']);
    assert.equal(await copyText(''), false);
    assert.ok(events[1].message.includes('没有可复制'));
    navigator.clipboard.writeText = async () => {
      throw new DOMException('denied', 'NotAllowedError');
    };
    assert.equal(await copyText('English prompt'), false);
    assert.ok(events[2].message.includes('权限'));
    assert.equal(events[2].error, true);
    assert.deepEqual(writes, ['--profile ABC']);
  } finally {
    if (navigatorDescriptor)
      Object.defineProperty(globalThis, 'navigator', navigatorDescriptor);
    else Reflect.deleteProperty(globalThis, 'navigator');
    Object.assign(globalThis, {
      window: originalWindow,
      CustomEvent: originalEvent,
    });
  }
});
import type { StoredLibraryAsset } from '../lib/prism-types';
const asset = (
  id: string,
  kind: 'profile' | 'moodboard',
  secret: string,
): StoredLibraryAsset => ({
  id,
  kind,
  secret,
  title: id,
  author: '',
  origin: '',
  acquisition: '',
  note: 'legacy note',
  tags: [],
  collection: 'unfiled',
});
void test('mixed recipe copies honor global order and relative filtered orders, excluding manual text', () => {
  const assets = new Map(
    [
      asset('p1', 'profile', 'P1'),
      asset('p2', 'profile', '--profile P2'),
      asset('m1', 'moodboard', 'M1'),
    ].map((a) => [a.id, a]),
  );
  const recipe = {
    profileIds: ['p1', 'p2'],
    moodboardIds: ['m1'],
    selectionOrder: [
      { kind: 'moodboard' as const, id: 'm1' },
      { kind: 'profile' as const, id: 'p2' },
      { kind: 'profile' as const, id: 'p1' },
    ],
    manualEntries: [{ secret: 'do not copy' }],
  };
  assert.equal(recipeCommand(recipe, assets), '--profile M1 P2 P1');
  assert.equal(recipeCommand(recipe, assets, 'profile'), '--profile P2 P1');
  assert.equal(recipeCommand(recipe, assets, 'moodboard'), '--profile M1');
  assert.deepEqual(
    moveRecipeChoice(recipe.selectionOrder, 0, 2).map((x) => x.id),
    ['p2', 'p1', 'm1'],
  );
  assets.delete('p1');
  assert.throws(() => recipeCommand(recipe, assets), /缺失引用/);
});
void test('legacy recipe and profile order is a read-only view and no references silently disappear', () => {
  const recipe = { profileIds: ['p2', 'p1'], moodboardIds: ['m1'] };
  const before = JSON.stringify(recipe);
  assert.deepEqual(
    recipeOrder(recipe).map((x) => x.id),
    ['p2', 'p1', 'm1'],
  );
  assert.equal(JSON.stringify(recipe), before);
  const folder = {
    ...asset('folder', 'profile', ''),
    profileCodes: [
      {
        id: '2',
        label: 'second',
        secret: 'B',
        nature: 'unconfirmed' as const,
        note: '',
        customFields: [],
      },
      {
        id: '1',
        label: 'first',
        secret: 'A',
        nature: 'unconfirmed' as const,
        note: '',
        customFields: [],
      },
    ],
  };
  assert.deepEqual(
    profileCodes(folder).map((x) => x.id),
    ['2', '1'],
  );
  assert.equal(profileNature('情绪 P').nature, 'emotion');
});
void test('legacy prompt languages preserve original text and notes, ambiguous content is unconfirmed', () => {
  for (const text of ['English 中文', '12345', '日本語のテキスト', '']) {
    const value = classifyPrompt(text);
    assert.equal(value.unconfirmed, text);
  }
  assert.equal(
    classifyPrompt('cinematic portrait --ar 3:4').english,
    'cinematic portrait --ar 3:4',
  );
  assert.equal(
    classifyPrompt('电影光影，人物肖像').chinese,
    '电影光影，人物肖像',
  );
  const original = {
    ...asset('a', 'profile', 'English 中文'),
    customFields: [{ id: 'x', label: '旧补充', value: '保留' }],
  };
  const before = JSON.stringify(original);
  assert.equal(promptLanguages(original).unconfirmed, original.secret);
  assert.equal(JSON.stringify(original), before);
  assert.deepEqual(
    promptLanguages({
      ...original,
      promptEnglish: 'English',
      promptChinese: '中文',
      promptUnconfirmed: '',
    }),
    { english: 'English', chinese: '中文', unconfirmed: '' },
  );
  assert.equal(
    importedPromptLanguages({
      ...original,
      promptEnglish: 'English',
      promptChinese: '中文',
    }).unconfirmed,
    original.secret,
  );
});
void test('bilingual CSV imports languages separately and keeps unrelated custom fields', async () => {
  const result = await parseAssetFile(
    new File(
      [
        '名称,英文提示词,中文提示词,备注,版权\n一,cinematic portrait,电影肖像,旧备注,本人',
      ],
      'bilingual.csv',
    ),
    'prompt',
  );
  assert.equal(result.rows.length, 1);
  const row = result.rows[0];
  assert.equal(row.promptEnglish, 'cinematic portrait');
  assert.equal(row.promptChinese, '电影肖像');
  assert.equal(row.note, '旧备注');
  assert.equal(row.customFields.find((x) => x.label === '版权')?.value, '本人');
  assert.deepEqual(importedPromptLanguages(row), {
    english: 'cinematic portrait',
    chinese: '电影肖像',
    unconfirmed: '',
  });
});
const calculate = (keys: string[]) =>
  keys.reduce(calculatorKey, calculatorInitial());
void test('calculator handles all operations, decimals, repeat equals, sign, clear and backspace', () => {
  assert.equal(
    calculate(['0', '.', '1', '+', '0', '.', '2', '=']).display,
    '0.3',
  );
  assert.equal(calculate(['8', '−', '3', '=', '=']).display, '2');
  assert.equal(calculate(['7', '×', '6', '=']).display, '42');
  assert.equal(calculate(['8', '÷', '4', '=']).display, '2');
  assert.equal(calculate(['1', '2', '3', '⌫', '±']).display, '-12');
  assert.equal(calculate(['9', 'AC']).display, '0');
  assert.equal(calculate(['8', '÷', '0', '=']).error, true);
  assert.equal(calculate(['8', '÷', '0', '=', '2']).display, '2');
});
