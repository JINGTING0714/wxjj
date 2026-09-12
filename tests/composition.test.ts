import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  compositionSize,
  compositionStack,
  defaultComposition,
  resolveComposition,
  fitCompositionToContent,
  sourceCoversCanvas,
  layerGeometry,
  layerBounds,
} from '../lib/watermark-composition';
import {
  stretchLayer,
  alignLayerToSource,
  fitLayerToSource,
} from '../lib/watermark-interaction';
import { drawWatermarkComposition } from '../lib/image-processing';
import { formatProfileCode, longShortCodes } from '../lib/short-codes';

const near = (actual: number, expected: number) =>
  assert.ok(
    Math.abs(actual - expected) < 1e-7,
    `${actual} should equal ${expected}`,
  );
const scene = { width: 1000, height: 600, referenceWidth: 1000 };
const sourceDimensions = { width: 1000, height: 600 };

test('edge stretching changes only that axis and anchors the opposite edge after rotation', () => {
  for (const rotation of [0, 45, 90, -30]) {
    for (const edge of ['left', 'right', 'top', 'bottom'] as const) {
      const layer = {
        ...defaultComposition().source,
        scale: 0.2,
        scaleX: 1.2,
        scaleY: 0.8,
        rotation,
        crop: { left: 0.25, right: 0, top: 0, bottom: 0 },
      };
      const dimensions = { width: 400, height: 200 };
      const g = layerGeometry(layer, 400, 200, 1000);
      const angle = (rotation * Math.PI) / 180;
      const horizontal = edge === 'left' || edge === 'right';
      const sign = edge === 'left' || edge === 'top' ? -1 : 1;
      const axis = horizontal
        ? { x: Math.cos(angle), y: Math.sin(angle) }
        : { x: -Math.sin(angle), y: Math.cos(angle) };
      const next = stretchLayer(layer, dimensions, scene, edge, {
        x: 40 * sign * axis.x,
        y: 40 * sign * axis.y,
      });
      const ng = layerGeometry(next, 400, 200, 1000);
      const oldSize = horizontal ? g.width : g.height;
      const newSize = horizontal ? ng.width : ng.height;
      near(newSize, oldSize + 40);
      near(horizontal ? ng.height : ng.width, horizontal ? g.height : g.width);
      near(
        next.x * 1000 - (sign * axis.x * newSize) / 2,
        layer.x * 1000 - (sign * axis.x * oldSize) / 2,
      );
      near(
        next.y * 600 - (sign * axis.y * newSize) / 2,
        layer.y * 600 - (sign * axis.y * oldSize) / 2,
      );
      assert.equal(next.rotation, rotation);
      assert.deepEqual(next.crop, layer.crop);
      assert.equal(next.locked, layer.locked);
    }
  }
});

test('legacy stretch defaults preserve dimensions and dragging past the opposite edge never flips', () => {
  const layer = { ...defaultComposition().source, scale: 0.2 };
  assert.deepEqual(
    layerGeometry(
      { ...layer, scaleX: undefined, scaleY: undefined },
      200,
      100,
      1000,
    ),
    layerGeometry(layer, 200, 100, 1000),
  );
  const next = stretchLayer(
    layer,
    { width: 200, height: 100 },
    scene,
    'right',
    { x: -10000, y: 0 },
  );
  const g = layerGeometry(next, 200, 100, 1000);
  assert.equal(next.scaleX, 0.01);
  assert.equal(g.width, 2);
  near(next.x * 1000 - g.width / 2, 400);
});

test('magnetic edges allow sliding along the image and free movement beyond it', () => {
  const source = defaultComposition().source;
  const dimensions = { width: 200, height: 100 };
  for (const y of [0.2, 0.4]) {
    const layer = { ...source, x: 0.104, y, scale: 0.2 };
    const result = alignLayerToSource(
      layer,
      dimensions,
      source,
      sourceDimensions,
      scene,
      7,
    );
    near(result.layer.x, 0.1);
    near(result.layer.y, y);
    assert.equal(result.guides.lines[0].label, '原图左边缘');
    const unsnapped = alignLayerToSource(
      layer,
      dimensions,
      source,
      sourceDimensions,
      scene,
      7,
      false,
    );
    assert.deepEqual(unsnapped.layer, layer);
    assert.deepEqual(unsnapped.guides, result.guides);
  }
  const outside = { ...source, x: -0.02, y: 0.2, scale: 0.2 };
  const crossed = alignLayerToSource(
    outside,
    dimensions,
    source,
    sourceDimensions,
    scene,
    7,
  );
  assert.deepEqual(crossed.layer, outside);
  assert.equal(crossed.guides.lines.length, 0);
  const centered = alignLayerToSource(
    { ...outside, x: 0.503, y: 0.499 },
    dimensions,
    source,
    sourceDimensions,
    scene,
    7,
  );
  near(centered.layer.x, 0.5);
  near(centered.layer.y, 0.5);
  assert.deepEqual(
    centered.guides.lines.map((line) => line.label),
    ['原图垂直中线', '原图水平中线'],
  );
});

test('alignment follows visible PNG edges and the rotated original frame', () => {
  const source = defaultComposition().source;
  const layer = { ...source, scale: 0.2, x: 0.053, y: 0.2 };
  const padded = alignLayerToSource(
    layer,
    {
      width: 200,
      height: 100,
      bounds: { left: 0.25, right: 0.75, top: 0, bottom: 1 },
    },
    source,
    sourceDimensions,
    scene,
    7,
  );
  near(padded.layer.x, 0.05);
  const rotatedSource = { ...source, scale: 0.6, rotation: 90 };
  const rotated = alignLayerToSource(
    { ...layer, rotation: 90, x: 0.42, y: 104 / 600 },
    { width: 200, height: 100 },
    rotatedSource,
    sourceDimensions,
    scene,
    7,
  );
  near(rotated.layer.x, 0.42);
  near(rotated.layer.y, 100 / 600);
  near(rotated.guides.lines[0].from.x, 680);
  near(rotated.guides.lines[0].from.y, 0);
  near(rotated.guides.lines[0].to.x, 320);
  near(rotated.guides.lines[0].to.y, 0);
});

test('watermark fitting fills the cropped and stretched source frame despite asymmetric transparent padding', () => {
  const source = {
    ...defaultComposition().source,
    scale: 0.7,
    scaleX: 1.3,
    scaleY: 0.8,
    rotation: -20,
    x: 0.6,
    y: 0.4,
    crop: { left: 0.1, right: 0.2, top: 0.2, bottom: 0.1 },
  };
  const layer = {
    ...defaultComposition().source,
    opacity: 0.7,
    crop: { left: 0.25, right: 0.05, top: 0.1, bottom: 0.05 },
  };
  const dimensions = {
    width: 800,
    height: 600,
    bounds: { left: 0.1, right: 0.9, top: 0.2, bottom: 0.9 },
  };
  const fitted = fitLayerToSource(
    layer,
    dimensions,
    source,
    sourceDimensions,
    scene,
  );
  const actual = layerBounds(fitted, dimensions, 1000, 1000, 600)!;
  const expected = layerBounds(source, sourceDimensions, 1000, 1000, 600)!;
  for (const key of ['left', 'right', 'top', 'bottom'] as const)
    near(actual[key], expected[key]);
  assert.equal(fitted.opacity, 0.7);
  assert.equal(fitted.locked, layer.locked);
  assert.deepEqual(fitted.crop, layer.crop);
  assert.throws(
    () =>
      fitLayerToSource(
        layer,
        { ...dimensions, bounds: null },
        source,
        sourceDimensions,
        scene,
      ),
    /没有可见内容/,
  );
});

test('canvas fitting includes nonuniformly stretched layers without changing their shape', () => {
  const layer = {
    ...defaultComposition().source,
    scale: 0.5,
    scaleX: 3,
    scaleY: 3,
  };
  const fit = fitCompositionToContent(1000, 600, [layer], [sourceDimensions]);
  assert.deepEqual(compositionSize(1000, 600, fit.composition), {
    width: 1500,
    height: 900,
  });
  assert.equal(fit.layers[0].scaleX, 3);
  assert.equal(fit.layers[0].scaleY, 3);
  assert.deepEqual(
    fitCompositionToContent(
      1000,
      600,
      fit.layers,
      [sourceDimensions],
      fit.composition,
    ),
    fit,
  );
});

test('Profile copy preserves case, variable length and adds exactly one MJ prefix', () => {
  assert.equal(formatProfileCode(' aBc123456789 '), '--profile aBc123456789');
  assert.equal(formatProfileCode('--profile AbC'), '--profile AbC');
  assert.equal(formatProfileCode('x'), '--profile x');
  assert.deepEqual(longShortCodes(['a', '1234567', 'ABc123456789']), [
    'ABc123456789',
  ]);
});

test('fit includes off-canvas watermarks without resizing, unlocking or reordering layers', () => {
  const c = defaultComposition();
  const layer = {
    ...defaultComposition().source,
    id: 'outside',
    x: 1.1,
    y: 0.5,
    scale: 0.4,
    locked: true,
  };
  const dimensions = [{ width: 100, height: 100 }];
  const fit = fitCompositionToContent(1000, 500, [layer], dimensions, c);
  assert.deepEqual(compositionSize(1000, 500, fit.composition), {
    width: 1300,
    height: 500,
  });
  assert.equal(fit.layers[0].scale, layer.scale);
  assert.equal(fit.layers[0].locked, true);
  assert.equal(fit.layers[0].id, 'outside');
  assert.equal(fit.composition.sourceIndex, c.sourceIndex);
  assert.equal(fit.composition.source.locked, true);
  assert.equal(fit.layers[0].x * 1300 - fit.composition.source.x * 1300, 600);
  const twice = fitCompositionToContent(
    1000,
    500,
    fit.layers,
    dimensions,
    fit.composition,
  );
  assert.deepEqual(twice, fit);
});

test('fit trims transparent padding, ignores invisible layers and preserves rotated/cropped content', () => {
  const c = defaultComposition();
  c.canvasWidth = c.canvasHeight = 2;
  c.source.opacity = 0;
  const layer = {
    ...defaultComposition().source,
    scale: 0.5,
    rotation: 90,
    crop: { left: 0.25, right: 0, top: 0, bottom: 0 },
  };
  const invisible = { ...layer, x: -50, opacity: 0 };
  const fit = fitCompositionToContent(
    800,
    600,
    [layer, invisible],
    [
      {
        width: 400,
        height: 200,
        bounds: { left: 0.25, right: 0.75, top: 0.25, bottom: 0.75 },
      },
      { width: 400, height: 200 },
    ],
    c,
  );
  assert.deepEqual(compositionSize(800, 600, fit.composition), {
    width: 134,
    height: 267,
  });
  assert.equal(fit.layers[0].rotation, 90);
  assert.deepEqual(fit.layers[0].crop, layer.crop);
  assert.throws(
    () =>
      fitCompositionToContent(
        800,
        600,
        [invisible],
        [{ width: 400, height: 200 }],
        c,
      ),
    /没有可见内容/,
  );
});

test('fit re-evaluates each batch aspect ratio and rejects excessive extents', () => {
  const layer = { ...defaultComposition().source, scale: 1.2 };
  const dims = [{ width: 1000, height: 500 }];
  const portrait = fitCompositionToContent(1000, 1500, [layer], dims);
  const landscape = fitCompositionToContent(
    1000,
    500,
    portrait.layers,
    dims,
    portrait.composition,
  );
  assert.deepEqual(compositionSize(1000, 1500, portrait.composition), {
    width: 1200,
    height: 1500,
  });
  assert.deepEqual(compositionSize(1000, 500, landscape.composition), {
    width: 1200,
    height: 600,
  });
  assert.throws(
    () => fitCompositionToContent(1000, 500, [{ ...layer, x: 100 }], dims),
    /安全处理范围/,
  );
  assert.throws(
    () => fitCompositionToContent(1000, 500, [layer], []),
    /加载完成/,
  );
});

test('background relevance follows source opacity, crop, coverage and rotation', () => {
  const c = defaultComposition();
  assert.equal(sourceCoversCanvas(1920, 1080, c), true);
  c.canvasWidth = 1.1;
  assert.equal(sourceCoversCanvas(1920, 1080, c), false);
  c.canvasWidth = 1;
  c.source.rotation = 45;
  assert.equal(sourceCoversCanvas(1920, 1080, c), false);
  c.source.scale = 4;
  assert.equal(sourceCoversCanvas(1920, 1080, c), true);
  c.source.opacity = 0.5;
  assert.equal(sourceCoversCanvas(1920, 1080, c), false);
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

test('source crop, independent width/height and opacity reach the image renderer', () => {
  const c = defaultComposition();
  c.source.crop.left = 0.25;
  c.source.scale = 0.5;
  c.source.scaleX = 1.5;
  c.source.scaleY = 0.5;
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
  assert.equal(args[7], 300);
  assert.equal(args[8], 100);
  assert.equal(ctx.globalAlpha, 0.3);
});
