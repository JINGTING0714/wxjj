import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  compositionSize,
  compositionStack,
  defaultComposition,
  resolveComposition,
} from '../lib/watermark-composition';
import { drawWatermarkComposition } from '../lib/image-processing';
import { formatProfileCode, longShortCodes } from '../lib/short-codes';

test('Profile copy preserves case, variable length and adds exactly one MJ prefix', () => {
  assert.equal(formatProfileCode(' aBc123456789 '), '--profile aBc123456789');
  assert.equal(formatProfileCode('--profile AbC'), '--profile AbC');
  assert.equal(formatProfileCode('x'), '--profile x');
  assert.deepEqual(longShortCodes(['a', '1234567', 'ABc123456789']), [
    'ABc123456789',
  ]);
});

test('legacy workspaces default to the original locked source below all watermarks', () => {
  const c = resolveComposition();
  assert.equal(c.source.locked, true);
  assert.deepEqual(compositionSize(384, 512), { width: 384, height: 512 });
  assert.deepEqual(compositionStack(['w1', 'w2'], 'source', c.sourceIndex), [
    'source',
    'w1',
    'w2',
  ]);
  assert.deepEqual(compositionStack(['w1', 'w2'], 'source', 1), [
    'w1',
    'source',
    'w2',
  ]);
  assert.deepEqual(compositionStack(['w1', 'w2'], 'source', 2), [
    'w1',
    'w2',
    'source',
  ]);
  const a = defaultComposition(),
    b = defaultComposition();
  a.source.crop.left = 0.2;
  assert.equal(b.source.crop.left, 0);
});

test('canvas expansions do not stretch original pixels; source can be above a frame', () => {
  const composition = defaultComposition();
  composition.canvasWidth = 1.5;
  composition.canvasHeight = 1.25;
  composition.sourceIndex = 1;
  composition.source.x = 0.6;
  composition.source.rotation = 30;
  const events: { kind: string; args: unknown[] }[] = [];
  const context = Object.fromEntries(
    [
      'save',
      'restore',
      'clearRect',
      'fillRect',
      'translate',
      'rotate',
      'drawImage',
    ].map((kind) => [
      kind,
      (...args: unknown[]) => events.push({ kind, args }),
    ]),
  ) as unknown as CanvasRenderingContext2D;
  const image = { naturalWidth: 300, naturalHeight: 200 } as HTMLImageElement;
  const original = {} as CanvasImageSource;
  const layer = {
    ...defaultComposition().source,
    locked: false,
    scale: 1.4,
    file: new File([], 'frame.png'),
  };
  const size = compositionSize(400, 300, composition);
  assert.deepEqual(size, { width: 600, height: 375 });
  drawWatermarkComposition(
    context,
    size.width,
    size.height,
    original,
    400,
    300,
    [layer],
    [image],
    composition,
  );
  const drawings = events.filter((e) => e.kind === 'drawImage');
  assert.equal(drawings[0].args[0], image);
  assert.equal(drawings[0].args[7], 560); // Frame wider than source; not clipped at the old source edge.
  assert.equal(drawings[1].args[0], original);
  assert.equal(drawings[1].args[7], 400); // Source retains its width inside the 600px canvas.
  assert.deepEqual(
    events.filter((e) => e.kind === 'translate')[1].args,
    [360, 187.5],
  );
  assert.throws(() => compositionSize(10000, 10000), /安全处理范围/);
});

test('source crop, scale and opacity are rendered by the same transform as watermarks', () => {
  const c = defaultComposition();
  c.source.crop.left = 0.25;
  c.source.scale = 0.5;
  c.source.opacity = 0.3;
  let args: unknown[] = [];
  const ctx = {
    save() {},
    restore() {},
    clearRect() {},
    translate() {},
    rotate() {},
    drawImage(...values: unknown[]) {
      args = values;
    },
    globalAlpha: 1,
  } as unknown as CanvasRenderingContext2D;
  drawWatermarkComposition(
    ctx,
    400,
    300,
    {} as CanvasImageSource,
    400,
    300,
    [],
    [],
    c,
  );
  assert.equal(args[1], 100);
  assert.equal(args[3], 300);
  assert.equal(args[7], 200);
  assert.equal(args[8], 200);
  assert.equal(ctx.globalAlpha, 0.3);
});
