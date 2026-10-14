import { test } from 'node:test';
import assert from 'node:assert/strict';
import { enhancePixels, enhancementPresets } from '../lib/image-enhancement';
import { enhancementSize,resolutionTiles } from '../lib/super-resolution';
import { imageAdvice } from '../lib/image-quality';
import { mergeFlowSources,mergePendingIds } from '../lib/pipeline';
import {touchPair,pinchView,pinchLayer} from '../lib/editor-gestures';
import {textChanges,reviewIssues} from '../lib/text-review';
import {imageRegion} from '../lib/ocr-region';
import {startTask,taskSnapshot,clearTasks,restoreTask} from '../lib/task-center';
import {apiBase,translateWriting,writingApiModels,assistWriting} from '../lib/writing-api';
import {protectedParameters,applyTranslation,insertWritingText,emptyWritingText,emptySensitive,splitWritingVariants,type WrittenPrompt} from '../lib/writing-model';
import {richWritingRuns,writingTextChunks,exportWritingXlsx} from '../lib/writing-export';
import {posterTemplate,posterTitle} from '../lib/poster';
import { posterLayoutOptions } from '../lib/poster';
import { posterArtPresets, posterFontOptions, posterFontCss, posterTextStops } from '../lib/poster-typography';
import { writingCompletion } from '../lib/writing-api';
import { readFileSync } from 'node:fs';

test('production CSP permits chosen HTTPS APIs while scripts stay restricted to this website', () => {
  const html = readFileSync(new URL('../static/index.html', import.meta.url), 'utf8');
  const policy = html.match(/content="(default-src[^\"]+)"/)![1];
  assert.match(policy, /connect-src 'self' https:/);
  assert.match(policy, /script-src 'self' 'wasm-unsafe-eval';/);
  assert.ok(!/script-src[^;]*(?:https:|'unsafe-eval')/.test(policy));
});

test('API compatibility stays on the chosen service and never adds a built-in relay dependency', async () => {
  const original = globalThis.fetch, calls: { url: string; headers: Record<string, string> }[] = [];
  const settings = { id: 'writing-api' as const, url: 'https://api.example/v1', key: 'Bearer SYNTHETIC_SECRET', model: 'test' };
  try {
    globalThis.fetch = (async (url, options) => {
      const headers = options!.headers as Record<string, string>;
      calls.push({ url: String(url), headers });
      if (headers.Authorization) throw new TypeError('CORS blocked Authorization');
      return Response.json({ data: [{ id: 'compatible' }] });
    }) as typeof fetch;
    assert.deepEqual(await writingApiModels(settings, new AbortController().signal), ['compatible']);
    assert.equal(calls.length, 2);
    assert.ok(calls.every(call => call.url === 'https://api.example/v1/models'));
    assert.equal(calls[1].headers['X-Api-Key'], 'SYNTHETIC_SECRET');
    globalThis.fetch = (async () => Response.json({ error: { message: 'invalid SYNTHETIC_SECRET' } }, { status: 401 })) as typeof fetch;
    await assert.rejects(() => writingApiModels(settings, new AbortController().signal), error => error instanceof Error && !error.message.includes('SYNTHETIC_SECRET'));
    const abort = new AbortController(); abort.abort();
    globalThis.fetch = (async () => { assert.fail('cancelled job must not send a request'); }) as typeof fetch;
    await assert.rejects(() => writingApiModels(settings, abort.signal), { name: 'AbortError' });
  } finally { globalThis.fetch = original; }
});

test('explicit relay preserves the AIRP request contract and common completion response formats', async () => {
  const original = globalThis.fetch, settings = { id: 'writing-api' as const, url: 'https://chosen.example/v1', key: 'SYNTHETIC_SECRET', model: 'test', transport: 'relay' as const, relayUrl: 'https://trusted.example/api/relay' };
  try {
    globalThis.fetch = (async (url, options) => {
      assert.equal(String(url), settings.relayUrl);
      const request = JSON.parse(String(options!.body));
      assert.equal(request.baseUrl, settings.url);
      assert.equal(request.apiKey, settings.key);
      assert.equal(request.path, 'models');
      assert.equal(options!.credentials, 'omit');
      return Response.json({ data: ['model'] });
    }) as typeof fetch;
    assert.deepEqual(await writingApiModels(settings, new AbortController().signal), ['model']);
    for (const data of [{ choices: [{ text: 'Result' }] }, { output_text: 'Result' }, { response: 'Result' }, { choices: [{ message: { content: [{ type: 'text', text: 'Result' }] } }] }]) {
      globalThis.fetch = (async () => Response.json(data)) as typeof fetch;
      assert.equal(await writingCompletion({ ...settings, transport: 'direct' }, '', 'source', new AbortController().signal), 'Result');
    }
  } finally { globalThis.fetch = original; }
});

test('every poster layout retains dense batches with positive frames inside the canvas even at large gaps', () => {
  const files = Array.from({ length: 500 }, (_, i) => ({ id: String(i), file: new File(['x'], `${i}.png`, { type: 'image/png' }) }));
  for (const option of posterLayoutOptions) for (const count of [1, 7, 9, 11, 500]) {
    const layers = posterTemplate(files.slice(0, count), { width: 1080, height: 1920 }, option.id, 100);
    assert.equal(layers.length, count);
    assert.equal(new Set(layers.map(layer => layer.sourceId)).size, count);
    for (const layer of layers) {
      assert.ok(layer.width > 0 && layer.height > 0, option.id);
      assert.ok(layer.x >= 0 && layer.y >= 0 && layer.x + layer.width <= 1080.001 && layer.y + layer.height <= 1920.001, option.id);
    }
  }
});

test('poster typography includes real font choices and distinct outlined, metallic and italic treatments', () => {
  assert.ok(posterFontOptions.length >= 14);
  assert.ok(posterArtPresets.length >= 20);
  assert.equal(new Set(posterArtPresets.map(preset => preset.id)).size, posterArtPresets.length);
  const text = { ...posterTitle({ width: 1080, height: 1920 }), italic: true, underline: true, style: 'chrome' as const };
  assert.match(posterFontCss(text), /^italic 900 /);
  assert.equal(posterTextStops(text).length, 6);
  assert.ok(posterTextStops(text).every((stop, index, stops) => index === 0 || stop.offset > stops[index - 1].offset));
});

test('writing keeps MJ parameter tails and cursor insertion intact, and rejects unexpected translated flags',()=>{
 const source='柔和侧光，2个人 --ar 9:16 --profile 2g9wdey --stylize 650';assert.equal(protectedParameters(source).body,'柔和侧光，2个人');assert.equal(applyTranslation(source,'Soft side lighting, 2 people'),'Soft side lighting, 2 people --ar 9:16 --profile 2g9wdey --stylize 650');assert.throws(()=>applyTranslation(source,'Portrait --ar 1:1'),/额外参数/);assert.equal(insertWritingText('第一段 旧词 末段','新词',4,6),'第一段 新词 末段');
 assert.equal(apiBase('https://relay.example/'),'https://relay.example/v1');assert.throws(()=>apiBase('http://relay.example/v1'),/HTTPS/);assert.throws(()=>apiBase('https://user:key@relay.example/v1'),/纯地址/);assert.throws(()=>apiBase('https://relay.example/v1?key=secret'),/纯地址/);
 assert.equal(insertWritingText('portrait --ar 9:16 --profile ABC','soft light'),'portrait soft light --ar 9:16 --profile ABC');assert.equal(insertWritingText('举手 --ar 9:16\n挥手 --ar 9:16 --profile XYZ','侧光'),'举手 --ar 9:16\n挥手 侧光 --ar 9:16 --profile XYZ');assert.equal(protectedParameters('portrait\n--ar 9:16').parameters,'--ar 9:16');
});
test('relay models, independently translated variants and redacted service errors follow the explicit API contract',async()=>{
 const original=globalThis.fetch,calls:any[]=[];const settings={id:'writing-api' as const,url:'https://relay.example/v1',key:' TEST_PRIVATE_KEY ',model:'test-model'};try{globalThis.fetch=(async(url:any,options:any)=>{calls.push({url,options});if(String(url).endsWith('/models'))return Response.json({data:[{id:'model-a'},{id:'model-a'},{id:'model-b'}]});const body=JSON.parse(options.body);const text=body.messages[1].content;return Response.json({choices:[{message:{content:text.includes('挥手')?'Waving hand, 2 people':'Raised hand, 2 people'}}]});}) as typeof fetch;assert.deepEqual(await writingApiModels(settings,new AbortController().signal),['model-a','model-b']);const value=await translateWriting(settings,'举手，2个人 --ar 9:16 --profile codeA\n挥手，2个人 --ar 9:16 --profile codeB','zh','en',new AbortController().signal,false);assert.match(value.translation,/Raised hand.*--profile codeA/);assert.match(value.translation,/Waving hand.*--profile codeB/);assert.equal(calls.filter(call=>call.url.endsWith('/chat/completions')).length,2);assert.ok(calls.every(call=>call.options.headers.Authorization==='Bearer TEST_PRIVATE_KEY'&&!call.url.includes('TEST_PRIVATE_KEY')));globalThis.fetch=(async()=>Response.json({error:{message:'invalid TEST_PRIVATE_KEY'}},{status:401})) as typeof fetch;await assert.rejects(()=>writingApiModels(settings,new AbortController().signal),error=>error instanceof Error&&!error.message.includes('TEST_PRIVATE_KEY'));}finally{globalThis.fetch=original;}
});
test('word packs preserve Unicode across row boundaries and embed purple spans as literal text, never formulas',async()=>{
 const text='a'.repeat(899)+'✨敏感词 --profile abc123';assert.equal(writingTextChunks(text).join(''),text);assert.ok(writingTextChunks(text).every(value=>!/[\uD800-\uDBFF]$/.test(value)));const runs=richWritingRuns('普通 敏感词 普通',['敏感词']);assert.equal(runs.filter(run=>run.purple).map(run=>run.text).join(''),'敏感词');const languages=emptyWritingText();languages.zh='敏感词';languages.en='=HYPERLINK("https://example.test","literal")';const sensitive=emptySensitive();sensitive.zh=['敏感词'];const doc:WrittenPrompt={id:'book-test',title:'测试词包',category:'unfiled',author:'测试',origin:'自创',tags:[],note:'',mediaScope:'none',versions:[{id:'v1',label:'V1',createdAt:'2026-10-12',languages,sensitive,note:'',media:[]}],activeVersion:'v1',createdAt:'2026-10-12',updatedAt:'2026-10-12'};const blob=await exportWritingXlsx([doc],[],async()=>[]);const {default:JSZip}=await import('jszip');const zip=await JSZip.loadAsync(await blob.arrayBuffer());const xml=await zip.file('xl/worksheets/sheet2.xml')!.async('text');assert.match(xml,/FF7C32C7/);const english=await zip.file('xl/worksheets/sheet3.xml')!.async('text');assert.ok(english.includes('HYPERLINK')&&!english.includes('<f>'));assert.ok((await zip.file('xl/workbook.xml')!.async('text')).includes('English'));
});
test('AI assistance keeps each variant parameter tail local and sends an example only to its assigned variant',async()=>{
 const original=globalThis.fetch,calls:{messages:{content:unknown}[]}[]=[];try{globalThis.fetch=(async(_url,options)=>{calls.push(JSON.parse(String(options?.body)));return Response.json({choices:[{message:{content:'A clear descriptive proposal'}}]});}) as typeof fetch;const settings={id:'writing-api' as const,url:'https://relay.example',key:'SYNTHETIC_KEY',model:'test'};const result=await assistWriting(settings,'举手 --ar 9:16 --profile PRIVATE_A\n挥手 --ar 9:16 --profile PRIVATE_B','zh','保留动作',new AbortController().signal,{data:'data:image/jpeg;base64,QA',variant:0});assert.match(result,/PRIVATE_A/);assert.match(result,/PRIVATE_B/);assert.equal(calls.length,2);assert.ok(Array.isArray(calls[0].messages[1].content));assert.equal(typeof calls[1].messages[1].content,'string');assert.ok(!JSON.stringify(calls).includes('PRIVATE_'));globalThis.fetch=(async()=>Response.json({choices:[{message:{content:'changed --profile FOREIGN'}}]})) as typeof fetch;await assert.rejects(()=>assistWriting(settings,'描述 --profile PRIVATE_A','zh','',new AbortController().signal),/额外参数/);}finally{globalThis.fetch=original;}
});
test('poster templates distinguish canvas size from varied image frames and keep all images for larger batches',()=>{
 const files=Array.from({length:11},(_,i)=>({id:String(i),file:new File(['x'],`${i}.png`,{type:'image/png'})}));const layers=posterTemplate(files,{width:1080,height:1920},'4-3-4');assert.equal(layers.length,11);assert.equal(layers[0].width,270);assert.equal(layers[4].width,360);assert.ok(layers[4].height>layers[0].height);assert.equal(layers[10].y+layers[10].height,1920);assert.equal(posterTemplate([...files,...files],{width:1080,height:1920},'4-3-4').length,22);assert.equal(posterTitle({width:1080,height:1920}).kind,'text');
});
test('wrapped parameter values stay with their prompt and invalid Unicode chunk sizes fail promptly',()=>{
 const text='粉发，柔和侧光 --ar 9:16 --profile\nlong-profile-code\n--no\ntext, extra hands, blurry image';assert.deepEqual(splitWritingVariants(text),[text]);assert.equal(splitWritingVariants(text+'\n蓝发，正面光 --ar 9:16 --profile other-code').length,2);assert.throws(()=>writingTextChunks('😀',0),RangeError);assert.throws(()=>writingTextChunks('😀',1),RangeError);assert.deepEqual(writingTextChunks('😀😀',2),['😀','😀']);
});

test('text comparison preserves both originals and new text including Chinese, parameters and long inputs',()=>{
 for(const [before,after] of [['柔和T净 --ar 9:16','柔和干净 --ar 3:4'],['a profile ABC --stylize 650','a profile ABD --stylize 850'],['长'.repeat(3000),'文'.repeat(3000)],['','新词'],['原词','']]){const parts=textChanges(before,after);assert.equal(parts.filter(p=>p.kind!=='added').map(p=>p.text).join(''),before);assert.equal(parts.filter(p=>p.kind!=='removed').map(p=>p.text).join(''),after);}
 assert.equal(reviewIssues('柔和T净 --ar 9:16').length,1);
 assert.ok(reviewIssues('--ar 9;16 --stylize O50').length>=2);
 assert.equal(reviewIssues('精致BJD五官，2.5D插画 --ar 9:16 --stylize 650 --profile 2g9wdey').length,0);
});
test('crop rectangles clamp to original pixels and work in either drag direction',()=>{
 assert.deepEqual(imageRegion({x:80,y:90},{x:-20,y:30},100,100),{x:0,y:30,width:80,height:60});
 assert.deepEqual(imageRegion({x:10,y:20},{x:200,y:130},100,100),{x:10,y:20,width:90,height:80});
});
test('task registry protects restarted jobs, keeps running items and clears private session state',()=>{
 clearTasks(true);const old=startTask('a','识别','prompts'),next=startTask('a','识别','prompts',{retry:()=>{}});old.done();assert.equal(taskSnapshot()[0].status,'running');next.progress(.4);assert.equal(taskSnapshot()[0].progress,.4);next.fail(new Error('重试'));restoreTask('a','识别','prompts',()=>{});assert.equal(taskSnapshot()[0].status,'failed');startTask('b','水印','watermark');clearTasks();assert.equal(taskSnapshot().length,2);next.done();assert.equal(taskSnapshot().find(task=>task.id==='a')?.retry,undefined);clearTasks();assert.deepEqual(taskSnapshot().map(task=>task.id),['b']);clearTasks(true);assert.equal(taskSnapshot().length,0);
});

test('pinch keeps the viewed image point under the fingers, clamps zoom, and changes layers uniformly',()=>{
  const first=touchPair({x:140,y:100},{x:180,y:100}),now=touchPair({x:140,y:130},{x:220,y:130});
  const next=pinchView({zoom:1,x:20,y:-10},first,now,{x:100,y:80});
  assert.deepEqual(next,{zoom:2,x:0,y:-10});
  assert.equal(100+next.x+40*next.zoom,now.x);assert.equal(80+next.y+30*next.zoom,now.y);
  assert.equal(pinchView({zoom:6,x:0,y:0},first,now,{x:100,y:80}).zoom,6);
  const layer=pinchLayer({x:.5,y:.5,scale:.4,rotation:37},first,now,{width:200,height:400});
  assert.equal(layer.scale,.8);assert.equal(layer.rotation,37);assert.equal(layer.x,.6);assert.equal(layer.y,.575);
  assert.ok(!('scaleX' in layer)&&!('scaleY' in layer));
  const wrapped=pinchLayer({x:0,y:0,scale:1,rotation:179},{...first,angle:179*Math.PI/180},{...first,angle:-179*Math.PI/180},{width:1,height:1});
  assert.ok(Math.abs(wrapped.rotation-181)<.0001);
});

test('neural super-resolution sizes are bounded and overlap tiles cover each output pixel exactly once',()=>{
  assert.deepEqual(enhancementSize(816,1456,'sr2'),{width:1632,height:2912,scale:2});
  assert.deepEqual(enhancementSize(816,1456,'sr4'),{width:3264,height:5824,scale:4});
  assert.throws(()=>enhancementSize(2400,3200,'sr4'),/2000 万/);
  const width=193,height=201,covered=new Uint8Array(width*height);
  for(const tile of resolutionTiles(width,height)){
    assert.ok(tile.inputWidth<=136&&tile.inputHeight<=136);
    assert.ok(tile.left<=tile.x&&tile.top<=tile.y&&tile.left+tile.inputWidth>=tile.x+tile.width);
    for(let y=tile.y;y<tile.y+tile.height;y++)for(let x=tile.x;x<tile.x+tile.width;x++)covered[y*width+x]++;
  }
  assert.ok(covered.every(value=>value===1));
});

test('quality suggestions identify low resolution but leave detailed high resolution, blank and transparent images alone',()=>{
  const sample=new Uint8ClampedArray(32*32*4);
  for(let y=0;y<32;y++)for(let x=0;x<32;x++){const i=(y*32+x)*4;sample[i]=sample[i+1]=sample[i+2]=(x+y)%2?200:20;sample[i+3]=255;}
  assert.equal(imageAdvice(360,640,sample,32,32).recommended,true);
  assert.equal(imageAdvice(2160,3840,sample,32,32).recommended,false);
  assert.equal(imageAdvice(360,640,new Uint8ClampedArray(32*32*4),32,32).recommended,false);
  const white=new Uint8ClampedArray(32*32*4).fill(255);assert.equal(imageAdvice(360,640,white,32,32).recommended,false);
});

test('late enhanced images replace their own sources and reunite in original order without duplicates',()=>{
  const file=(name:string)=>new File([name],name);
  const direct={id:'b',file:file('b.png'),sequence:1},first={id:'a',file:file('a-enhanced.png'),sequence:0},last={id:'c',file:file('c-enhanced.png'),sequence:2};
  let sources=mergeFlowSources([direct],[last]);sources=mergeFlowSources(sources,[first]);
  assert.deepEqual(sources.map(source=>source.id),['a','b','c']);
  const replacement={...first,file:file('a-new-enhanced.png')};sources=mergeFlowSources(sources,[replacement]);
  assert.equal(sources.length,3);assert.equal(sources[0].file.name,'a-new-enhanced.png');
  assert.deepEqual(mergePendingIds(['a','c'],['c'],['a']),['c']);
  assert.deepEqual(mergePendingIds(['c'],[],['c']),[]);
});

test('local clarity retains dimensions, alpha, transparent pixels and zero-strength data', () => {
  const pixels = new Uint8ClampedArray([110,140,150,255,255,255,255,255,10,20,30,0,190,170,180,128]);
  assert.deepEqual(enhancePixels(pixels,2,2,{dehaze:0,clarity:0,sharpen:0}),pixels);
  const output = enhancePixels(pixels,2,2,enhancementPresets.clear);
  assert.equal(output.length,pixels.length);
  for(let i=3;i<pixels.length;i+=4) assert.equal(output[i],pixels[i]);
  assert.deepEqual(output.slice(8,12),pixels.slice(8,12));
  assert.deepEqual(output.slice(4,8),pixels.slice(4,8));
  assert.throws(()=>enhancePixels(pixels,0,2,enhancementPresets.clear),/尺寸/);
});
import { calculatorExpression, calculatorInitial, calculatorKey } from '../lib/calculator';
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
void test('unlabeled bilingual cells stay in language fields and suspect notes require review', async () => {
  const plain = await parseAssetFile(new File([
    '1,cinematic portrait with violet light and detailed composition --ar 2:3,电影感紫色光影肖像，细节丰富的画面构图',
  ], 'plain.csv'), 'prompt');
  assert.match(plain.rows[0].promptEnglish || '', /cinematic portrait/);
  assert.match(plain.rows[0].promptChinese || '', /电影感/);
  assert.equal(plain.rows[0].customFields.some((field) => /电影感/.test(field.value)), false);
  const suspect = await parseAssetFile(new File([
    '名称,提示词,备注\n一,cinematic portrait --ar 2:3,电影感紫色光影肖像与柔和的自然光线，画面构图富有层次和景深效果，请完整保留这段中文译文',
  ], 'suspect.csv'), 'prompt');
  assert.equal(suspect.rows[0].note, '');
  assert.equal(suspect.rows[0].include, false);
  assert.match(suspect.rows[0].promptUnconfirmed || '', /电影感/);
});
const calculate = (keys: string[]) =>
  keys.reduce(calculatorKey, calculatorInitial());
void test('typed arithmetic handles operator precedence, parentheses, signs and invalid pasted text safely', () => {
  assert.equal(calculatorExpression('15*3+4').display, '49');
  assert.equal(calculatorExpression('(15 + 3) × 4').display, '72');
  assert.equal(calculatorExpression('-2.5 + .3').display, '-2.2');
  assert.equal(calculatorExpression('1÷0').error, true);
  assert.equal(calculatorExpression('2 +').error, true);
  assert.equal(calculatorExpression('alert(1)').error, true);
  assert.equal(calculatorExpression('1; globalThis.secret').error, true);
});
void test('calculator handles all operations, decimals, repeat equals, sign, clear and backspace', () => {
  assert.equal(calculate(['3','×','1','3','+','1','0','×','3','=']).display, '69');
  assert.equal(calculate(['2','+','3','×','4','−','8','÷','2','=']).display, '10');
  assert.equal(calculate(['2','+','×','3','=']).display, '6');
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
import {cleanAiText,autoWritingTitle} from '../lib/ai-content';
import {translateLocally} from '../lib/local-translation';
import {snapPosterRect,savePosterLayout,applyPosterLayout,posterTracking} from '../lib/poster-editor';
import {yanChat,yanGenerate,yanIdentity} from '../lib/yan';
test('encoded images cannot enter prompt text or inflate editor work',()=>{
 const media='data:image/png;base64,'+'A'.repeat(3359000);
 assert.equal(cleanAiText('前文 ![image]('+media+') 后文'),'前文  后文');
 assert.equal(cleanAiText('![image]\n('+media+')').replace(/!\[[^\]]*\]\s*\(\s*\)/g,'').trim(),'');
 assert.throws(()=>cleanAiText('文'.repeat(40001)),/文字过长/);
 assert.equal(autoWritingTitle('柔和侧光 --ar 9:16'),'柔和侧光');
});
test('six-language short translation runs locally, costs no API, and preserves private MJ flags',async()=>{
 const original=globalThis.fetch;globalThis.fetch=async()=>{assert.fail('local phrase must never fetch');};
 try {for(const language of ['en','fr','es','ja','ko'] as const){const value=await translateLocally('你好 --ar 9:16 --profile PRIVATE','zh',language,new AbortController().signal,()=>{},true);assert.ok(value.translation.endsWith('--ar 9:16 --profile PRIVATE'));assert.equal(value.backTranslation,'你好');}}
 finally{globalThis.fetch=original;}
});
test('poster snapping aligns both canvas and neighboring image edges without changing dimensions',()=>{
 const doc={width:1000,height:1600},file=new File(['x'],'x.png');const image=posterTemplate([{file}],doc,'grid')[0];
 const canvas=snapPosterRect({x:5,y:5,width:100,height:200},doc,[],8);assert.equal(canvas.x,0);assert.equal(canvas.y,0);
 const peer={...image,x:200,y:400,width:100,height:200};const result=snapPosterRect({x:307,y:403,width:100,height:200},doc,[peer],8);assert.equal(result.x,300);assert.equal(result.y,400);
 const free=snapPosterRect({x:320,y:420,width:100,height:200},doc,[peer],8);assert.equal(free.x,320);assert.equal(free.y,420);
});
test('custom layouts scale frame placement while preserving identity, crop and original pixels',()=>{
 const file=new File(['original pixels'],'one.png'),doc={width:1000,height:1600,background:'#fff',layers:[]};const images=posterTemplate([{file},{file}],doc,'duo');assert.ok(images.every(image=>image.fit==='contain'));
 const changed={...images[0],fit:'cover' as const,zoom:2,offsetX:.25,rotation:12};const layout=savePosterLayout({...doc,layers:[changed,images[1]]},'我的版式');const result=applyPosterLayout([changed,images[1]],layout,{width:2000,height:3200});assert.equal(result[0].id,changed.id);assert.equal(result[0].file,file);assert.equal(result[0].zoom,2);assert.equal(result[0].offsetX,.25);assert.equal(result[0].width,changed.width*2);assert.equal(result[0].rotation,12);
 const text={...posterTitle(doc),spacing:-10,strokeWidth:.06,style:'double-outline' as const};assert.ok(posterTracking(text)>0);assert.equal(posterTracking({...text,autoSpacing:false}),-10);
});
test('Yan keeps persona and history, sends images as structured input, and rejects unsupported vision',async()=>{
 const original=globalThis.fetch,profile={id:'test',name:'test',url:'https://chosen.example/v1',key:'SYNTHETIC',model:'chat',vision:true},messages=[{id:'m1',role:'user' as const,text:'聊一聊灵感',createdAt:''}];let calls=0;
 try{globalThis.fetch=async(_url,options)=>{calls++;const body=JSON.parse(String(options?.body));assert.equal(body.messages[0].content,yanIdentity);assert.equal(body.messages[1].content[1].type,'image_url');return Response.json({choices:[{message:{content:'柔和的侧光，明确的主体'}}]});};assert.equal(await yanChat(profile,messages,new AbortController().signal,'data:image/png;base64,AAAA'),'柔和的侧光，明确的主体');await assert.rejects(()=>yanChat({...profile,vision:false},messages,new AbortController().signal,'data:image/png;base64,AAAA'),/支持图像输入/);assert.equal(calls,1);
 globalThis.fetch=async()=>Response.json({choices:[{message:{content:'![image](data:image/png;base64,AAAA)'}}]});await assert.rejects(()=>yanChat(profile,messages,new AbortController().signal),/可用文字/);
 globalThis.fetch=async(url,options)=>{assert.match(String(url),/images\/generations$/);assert.ok(!String(options?.body).includes('response_format'));return Response.json({data:[{b64_json:'AAAA'}]});};const files=await yanGenerate(profile,'一个星星',new AbortController().signal,'1024x1024');assert.equal(files.length,1);assert.match(files[0].name,/年\d+月\d+日生图/);
 }finally{globalThis.fetch=original;}
});
