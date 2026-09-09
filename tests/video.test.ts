import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { defaultComposition } from '../lib/watermark-composition';
import {
  videoExportPlan,
  defaultVideoExport,
  videoInputDecoder,
} from '../lib/video-export';
import { moveSource } from '../lib/pipeline';

test('collage movement changes the whole queue without replacing files or touching inputs', () => {
  const sources = Array.from({ length: 53 }, (_, i) => ({
    id: String(i),
    file: new File([String(i)], `${i}.png`),
  }));
  const reordered = moveSource(sources, '0', 52);
  assert.equal(reordered[52], sources[0]);
  assert.equal(reordered[0], sources[1]);
  assert.equal(sources[0].id, '0');
  assert.equal(new Set(reordered.map((x) => x.id)).size, 53);
  assert.equal(moveSource(sources, '0', NaN), sources);
  assert.equal(moveSource(sources, 'missing', 0), sources);
});

test('video format choices never silently flatten an alpha canvas', () => {
  assert.equal(
    videoExportPlan(1920, 1080, 3, undefined, defaultVideoExport, false)
      .extension,
    'mp4',
  );
  const alpha = videoExportPlan(
    1920,
    1080,
    3,
    undefined,
    defaultVideoExport,
    true,
  );
  assert.equal(alpha.extension, 'webm');
  assert.ok(alpha.args.includes('yuva420p'));
  assert.throws(
    () =>
      videoExportPlan(
        1920,
        1080,
        3,
        undefined,
        { format: 'mp4', quality: 'high' },
        true,
      ),
    /透明区域/,
  );
  assert.equal(
    videoExportPlan(3840, 2160, 3, undefined, defaultVideoExport, false).width,
    3840,
  );
});

test(
  'real codec exports MP4 plus WebM alpha with original frame timing and audio',
  { timeout: 90_000 },
  async () => {
    // Exercise the actual browser codec module, not a mocked encoder. Only its worker location is shimmed.
    Object.assign(globalThis, {
      self: { location: { href: 'file:///test/ffmpeg-core.js' } },
    });
    const require = createRequire(import.meta.url);
    const engine = await require('@ffmpeg/core')({
      wasmBinary: readFileSync(require.resolve('@ffmpeg/core/wasm')),
    });
    const logs: string[] = [];
    engine.setLogger(({ message }: { message: string }) => logs.push(message));
    const run = (...args: string[]) => {
      logs.length = 0;
      engine.exec(...args);
      assert.equal(engine.ret, 0, logs.slice(-12).join('\n'));
      engine.reset();
    };
    run(
      '-f',
      'lavfi',
      '-i',
      'color=c=red:s=64x48:r=12:d=0.5',
      '-f',
      'lavfi',
      '-i',
      'sine=frequency=440:duration=0.5',
      '-c:v',
      'libx264',
      '-pix_fmt',
      'yuv420p',
      '-c:a',
      'aac',
      '-t',
      '0.5',
      'input.mp4',
    );
    engine.FS.rename('input.mp4', 'input');
    run(
      '-f',
      'lavfi',
      '-i',
      'color=c=black@0:s=96x72,format=rgba',
      '-frames:v',
      '1',
      'under.png',
    );
    engine.FS.writeFile('over.png', engine.FS.readFile('under.png'));
    const c = defaultComposition();
    c.canvasWidth = 1.5;
    c.canvasHeight = 1.5;
    run(...videoExportPlan(64, 48, 0.5, c, defaultVideoExport, true).args);
    run(
      '-c:v',
      'libvpx',
      '-i',
      'output.webm',
      '-frames:v',
      '1',
      '-pix_fmt',
      'rgba',
      '-f',
      'rawvideo',
      'frame.rgba',
    );
    const alphaFrame = engine.FS.readFile('frame.rgba');
    assert.equal(
      alphaFrame[3],
      0,
      'transparent outer corner must survive export and decoding',
    );
    assert.equal(
      alphaFrame[(36 * 96 + 48) * 4 + 3],
      255,
      'source center remains opaque',
    );
    run('-i', 'output.webm', '-map', '0:a:0', '-f', 'null', '-');
    run(
      '-i',
      'output.webm',
      '-map',
      '0:v:0',
      '-pix_fmt',
      'rgba',
      '-f',
      'rawvideo',
      'frames.rgba',
    );
    assert.equal(
      engine.FS.readFile('frames.rgba').length / (96 * 72 * 4),
      6,
      '12 fps input must retain all 6 frames, not become a 30 fps recording',
    );
    c.background = '#fff';
    run(
      ...videoExportPlan(
        64,
        48,
        0.5,
        c,
        { format: 'mp4', quality: 'ultra' },
        false,
      ).args,
    );
    run('-i', 'output.mp4', '-map', '0:a:0', '-f', 'null', '-');
    run(
      '-i',
      'output.mp4',
      '-frames:v',
      '1',
      '-pix_fmt',
      'rgba',
      '-f',
      'rawvideo',
      'mp4.rgba',
    );
    assert.equal(engine.FS.readFile('mp4.rgba').length, 96 * 72 * 4);
    // A multi-frame, non-uniform image catches failures that tiny flat
    // six-frame fixtures miss in the WASM alpha encoder.
    run(
      '-y',
      '-f',
      'lavfi',
      '-i',
      'testsrc2=size=640x360:rate=30:duration=1.1',
      '-c:v',
      'libx264',
      '-f',
      'mp4',
      'input',
    );
    c.canvasWidth = c.canvasHeight = 1.2;
    c.background = 'transparent';
    run(
      '-y',
      ...videoExportPlan(640, 360, 1.1, c, defaultVideoExport, true).args,
    );
    run(
      '-c:v',
      'libvpx',
      '-i',
      'output.webm',
      '-ss',
      '1',
      '-frames:v',
      '1',
      '-pix_fmt',
      'rgba',
      '-f',
      'rawvideo',
      'last-alpha.rgba',
    );
    const lastFrame = engine.FS.readFile('last-alpha.rgba');
    assert.equal(lastFrame.length, 768 * 432 * 4);
    assert.equal(
      lastFrame[3],
      0,
      'alpha survives past the initial buffered frames',
    );
    assert.equal(lastFrame[(216 * 768 + 384) * 4 + 3], 255);
    engine.ffprobe(
      '-v',
      'error',
      '-select_streams',
      'v:0',
      '-show_entries',
      'stream=codec_name',
      '-of',
      'json',
      'output.webm',
      '-o',
      'probe.json',
    );
    assert.ok([0, -1].includes(engine.ret));
    engine.reset();
    const codec = JSON.parse(
      new TextDecoder().decode(engine.FS.readFile('probe.json')),
    ).streams[0].codec_name;
    assert.deepEqual(videoInputDecoder(codec), ['-c:v', 'libvpx']);
  },
);
