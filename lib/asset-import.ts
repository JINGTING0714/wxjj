import JSZip from 'jszip';
import type { AssetKind, CustomField } from './prism-types';

export type ImportRow = {
  id: string;
  title: string;
  kind: AssetKind;
  secret: string;
  longCode: string;
  nature: string;
  author: string;
  origin: string;
  acquisition: string;
  note: string;
  tags: string[];
  customFields: CustomField[];
  images: File[];
  warnings: string[];
  sheet: string;
  row: number;
  include: boolean;
};
export type ImportDocument = {
  file: File;
  libraryName: string;
  rows: ImportRow[];
  warnings: string[];
  unmatchedImages: File[];
};
type CellRow = { cells: string[]; row: number; images: File[] };
const aliases: Record<string, string[]> = {
  secret: [
    'secret',
    'content',
    'prompt',
    'prompts',
    '提示词',
    '提示词内容',
    '完整提示词',
    '词',
    '词条',
    '咒语',
    '英文提示词',
    '正向提示词',
    '关键词',
    '短码',
    '阶段p',
    '阶段码',
    'profile',
    'profile短码',
    'moodboard',
    'moodboard短码',
  ],
  title: [
    '序号',
    '编号',
    '序',
    'no',
    'number',
    'id',
    '名称',
    '标题',
    'name',
    'title',
  ],
  author: [
    '作者',
    '写词老师',
    '写词人',
    '创作者',
    '老师',
    'author',
    'creator',
    'by',
  ],
  longCode: ['长码', 'profile长码', '文件夹长码', 'longcode'],
  nature: ['性质', '阶段性质', 'nature', 'stagetype', '短码性质'],
  note: ['备注', '说明', '补充', 'note', 'notes', '描述', 'description'],
  tags: ['标签', '风格', '分类', '类别', 'tags', 'category', 'style'],
  acquisition: [
    '获得方式',
    '获取方式',
    '取得方式',
    '授权方式',
    '费用',
    'acquisition',
  ],
  source: ['来源', 'source', 'origin', '来源链接', '链接', 'url'],
};
function normalized(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[\s_\-:：.（）()]/g, '');
}
function columnKey(value: string) {
  const clean = normalized(value);
  return Object.keys(aliases).find((key) =>
    aliases[key].some((alias) => normalized(alias) === clean),
  );
}
const id = () => crypto.randomUUID();
export function newImportRow(
  kind: AssetKind,
  origin: string,
  sheet = '',
  row = 0,
): ImportRow {
  return {
    id: id(),
    title: '',
    kind,
    secret: '',
    longCode: '',
    nature: '',
    author: '',
    origin,
    acquisition: '',
    note: '',
    tags: [],
    customFields: [],
    images: [],
    warnings: [],
    sheet,
    row,
    include: true,
  };
}
function genericSheet(name: string) {
  return /^(?:sheet|工作表|表格|table|第?\d+页)[\s\d]*$/i.test(name);
}
function looksLikePrompt(text: string) {
  return (
    text.length >= 18 &&
    !/^https?:\/\/\S+$/.test(text) &&
    (/--(?:ar|sref|p|v|stylize|s)\b/i.test(text) ||
      text.split(/[\s,，]+/).length >= 6 ||
      text.length >= 36)
  );
}
export function tableRows(
  input: CellRow[],
  kind: AssetKind,
  origin: string,
  sheet = '',
) {
  const rows: ImportRow[] = [];
  let headers: string[] = [];
  let headerLabels: string[] = [];
  let author = genericSheet(sheet) ? '' : sheet;
  for (const source of input) {
    const cells = source.cells.map((s) => s.trim());
    if (!cells.some(Boolean) && !source.images.length) continue;
    const detected = cells.map((s) => columnKey(s) || '');
    if (detected.includes('secret')) {
      headers = detected;
      headerLabels = cells;
      continue;
    }
    const joined = cells.filter(Boolean).join(' ');
    const authorLine = joined.match(
      /^(?:作者|写词老师|写词人|创作者|author|by)\s*[:：]\s*(.+)$/i,
    );
    if (authorLine) {
      author = authorLine[1].trim();
      continue;
    }
    const entry = newImportRow(kind, origin, sheet, source.row);
    entry.author = author;
    entry.images = source.images;
    if (headers.length) {
      cells.forEach((value, index) => {
        if (!value) return;
        const key = headers[index];
        if (
          key === 'secret' ||
          key === 'title' ||
          key === 'author' ||
          key === 'longCode' ||
          key === 'nature' ||
          key === 'note' ||
          key === 'acquisition'
        )
          entry[key] = value;
        else if (key === 'tags')
          entry.tags = value
            .split(/[,，;；、|]/)
            .map((v) => v.trim())
            .filter(Boolean);
        else if (key === 'source')
          entry.customFields.push({ id: id(), label: '文件内来源', value });
        else if (value && !/^=?_?xlfn\.(?:DISPIMG|IMAGE)/i.test(value))
          entry.customFields.push({
            id: id(),
            label: headerLabels[index] || `原文件第 ${index + 1} 列`,
            value,
          });
      });
      if (entry.author) author = entry.author;
    } else {
      const candidates = cells.filter((value) =>
        kind === 'prompt'
          ? looksLikePrompt(value)
          : /^[a-z\d]{7}$/i.test(value),
      );
      if (candidates.length) {
        entry.secret = [...candidates].sort((a, b) => b.length - a.length)[0];
        entry.title = cells.find((value) => /^\d{1,8}$/.test(value)) || '';
        entry.warnings.push('没有标准表头，已按内容识别，请核对提示词列。');
        cells
          .filter(
            (value) => value && value !== entry.secret && value !== entry.title,
          )
          .forEach((value, i) =>
            entry.customFields.push({
              id: id(),
              label: `原文件补充 ${i + 1}`,
              value,
            }),
          );
      }
    }
    if (!entry.secret) {
      if (entry.images.length) {
        entry.warnings.push('此行有图片但未识别到提示词，请补充或重新指定。');
        entry.include = false;
      } else continue;
    }
    entry.title ||= String(rows.length + 1);
    if (!entry.author) entry.warnings.push('未识别作者，请填写。');
    if (sheet) entry.tags = [...new Set([...entry.tags, sheet])];
    if (!entry.images.length)
      entry.warnings.push('原文件此条未找到可对应的嵌入例图。');
    rows.push(entry);
  }
  return rows;
}
export function parseDelimited(text: string, delimiter: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (quoted || !field) quoted = !quoted;
      else field += c;
    } else if (c === delimiter && !quoted) {
      row.push(field);
      field = '';
    } else if ((c === '\n' || c === '\r') && !quoted) {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  if (quoted) throw new Error('表格引号没有闭合，请检查原文件。');
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}
function xml(source: string) {
  const doc = new DOMParser().parseFromString(source, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length)
    throw new Error('文件中的 XML 格式有误');
  return doc;
}
function all(node: Document | Element, name: string) {
  return Array.from(node.getElementsByTagNameNS('*', name));
}
function attr(node: Element, name: string) {
  return (
    node.getAttribute(name) ||
    Array.from(node.attributes).find((a) => a.localName === name)?.value ||
    ''
  );
}
function textOf(node: Document | Element, tag = 't') {
  return all(node, tag)
    .map((n) => n.textContent || '')
    .join('');
}
function resolvePath(base: string, relative: string) {
  const parts = (
    relative.startsWith('/')
      ? relative.slice(1)
      : `${base.slice(0, base.lastIndexOf('/') + 1)}${relative}`
  ).split('/');
  const stack: string[] = [];
  for (const p of parts) {
    if (p === '..') stack.pop();
    else if (p && p !== '.') stack.push(p);
  }
  return stack.join('/');
}
async function zipXml(zip: JSZip, path: string) {
  const value = await zip.file(path)?.async('string');
  return value ? xml(value) : null;
}
async function relationships(zip: JSZip, path: string) {
  const slash = path.lastIndexOf('/');
  const rels = await zipXml(
    zip,
    `${path.slice(0, slash + 1)}_rels/${path.slice(slash + 1)}.rels`,
  );
  const result = new Map<string, string>();
  if (rels)
    for (const r of all(rels, 'Relationship'))
      if (attr(r, 'TargetMode') !== 'External')
        result.set(attr(r, 'Id'), resolvePath(path, attr(r, 'Target')));
  return result;
}
const mime: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  svg: 'image/svg+xml',
  avif: 'image/avif',
  bmp: 'image/bmp',
};
async function imageFile(zip: JSZip, path: string | undefined) {
  if (!path || !mime[path.split('.').pop()!.toLowerCase()]) return undefined;
  const bytes = await zip.file(path)?.async('arraybuffer');
  return bytes
    ? new File([bytes], path.split('/').pop()!, {
        type: mime[path.split('.').pop()!.toLowerCase()],
      })
    : undefined;
}
function columnIndex(ref: string) {
  let n = 0;
  for (const c of ref.replace(/\d/g, ''))
    n = n * 26 + c.toUpperCase().charCodeAt(0) - 64;
  return n - 1;
}
async function xlsx(file: File, kind: AssetKind): Promise<ImportDocument> {
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const workbook = await zipXml(zip, 'xl/workbook.xml');
  if (!workbook) throw new Error('未找到 Excel 工作簿，请另存为 .xlsx。');
  const rels = await relationships(zip, 'xl/workbook.xml');
  const sharedDoc = await zipXml(zip, 'xl/sharedStrings.xml');
  const shared = sharedDoc ? all(sharedDoc, 'si').map((s) => textOf(s)) : [];
  const result: ImportDocument = {
    file,
    libraryName: file.name.replace(/\.[^.]+$/, ''),
    rows: [],
    warnings: [],
    unmatchedImages: [],
  };
  const used = new Set<string>();
  const knownImages = new Map<string, File>();
  const getImage = async (path?: string) => {
    if (!path) return undefined;
    if (!knownImages.has(path)) {
      const f = await imageFile(zip, path);
      if (f) knownImages.set(path, f);
    }
    return knownImages.get(path);
  };
  const cellImages = new Map<string, string>();
  const cellDoc = await zipXml(zip, 'xl/cellimages.xml');
  const cellRels = await relationships(zip, 'xl/cellimages.xml');
  if (cellDoc)
    for (const pic of all(cellDoc, 'pic')) {
      const props = all(pic, 'cNvPr')[0];
      const blip = all(pic, 'blip')[0];
      if (props && blip) {
        const path = cellRels.get(attr(blip, 'embed'));
        if (path) {
          cellImages.set(attr(props, 'name'), path);
          cellImages.set(attr(props, 'descr'), path);
        }
      }
    }
  for (const sheet of all(workbook, 'sheet')) {
    const name = attr(sheet, 'name');
    const path = rels.get(attr(sheet, 'id'));
    if (!path) continue;
    const doc = await zipXml(zip, path);
    if (!doc) continue;
    const input: CellRow[] = [];
    const imagesByRow = new Map<number, File[]>();
    for (const source of all(doc, 'row')) {
      const index = Number(attr(source, 'r'));
      const cells: string[] = [];
      for (const cell of all(source, 'c')) {
        const type = attr(cell, 't');
        const value = all(cell, 'v')[0]?.textContent || '';
        const formula = all(cell, 'f')[0]?.textContent || '';
        cells[columnIndex(attr(cell, 'r'))] =
          type === 's'
            ? shared[Number(value)] || ''
            : type === 'inlineStr'
              ? textOf(cell)
              : value;
        const match = formula.match(/DISPIMG\s*\(\s*"([^"]+)"/i);
        if (match) {
          const imagePath = cellImages.get(match[1]);
          const f = await getImage(imagePath);
          if (f && imagePath) {
            imagesByRow.set(index, [...(imagesByRow.get(index) || []), f]);
            used.add(imagePath);
          }
        }
      }
      input.push({
        cells: Array.from({ length: cells.length }, (_, i) => cells[i] || ''),
        row: index,
        images: [],
      });
    }
    const sheetRels = await relationships(zip, path);
    for (const drawing of all(doc, 'drawing')) {
      const drawPath = sheetRels.get(attr(drawing, 'id'));
      if (!drawPath) continue;
      const drawDoc = await zipXml(zip, drawPath);
      if (!drawDoc) continue;
      const drawRels = await relationships(zip, drawPath);
      for (const anchor of [
        ...all(drawDoc, 'twoCellAnchor'),
        ...all(drawDoc, 'oneCellAnchor'),
      ]) {
        const from = all(anchor, 'from')[0];
        const row = Number(from && all(from, 'row')[0]?.textContent) + 1;
        for (const blip of all(anchor, 'blip')) {
          const imagePath = drawRels.get(attr(blip, 'embed'));
          const f = await getImage(imagePath);
          if (f && imagePath) {
            imagesByRow.set(row, [...(imagesByRow.get(row) || []), f]);
            used.add(imagePath);
          }
        }
      }
    }
    for (const r of input) r.images = imagesByRow.get(r.row) || [];
    const parsed = tableRows(input, kind, file.name, name);
    for (const [row, images] of imagesByRow)
      if (!parsed.some((p) => p.row === row)) {
        const nearby = [...parsed].sort(
          (a, b) => Math.abs(a.row - row) - Math.abs(b.row - row),
        )[0];
        if (nearby && Math.abs(nearby.row - row) <= 2) {
          nearby.images.push(...images);
          nearby.warnings.push(
            `例图锚点位于第 ${row} 行，已按邻近位置关联，请核对。`,
          );
        } else result.unmatchedImages.push(...images);
      }
    result.rows.push(...parsed);
    if (!genericSheet(name))
      result.warnings.push(
        `“${name}”中的空作者按工作表名填写，请核对是否确为老师名字。`,
      );
  }
  for (const path of Object.keys(zip.files))
    if (/^xl\/media\//.test(path) && !used.has(path)) {
      const f = await getImage(path);
      if (f) result.unmatchedImages.push(f);
    }
  if (result.unmatchedImages.length)
    result.warnings.push(
      '部分内嵌图片未能确定所属条目，请在预览中指定。原文件也会保留，未识别内容不会被丢弃。',
    );
  return result;
}
async function decodeText(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const encoding =
    bytes[0] === 255 && bytes[1] === 254
      ? 'utf-16le'
      : bytes[0] === 254 && bytes[1] === 255
        ? 'utf-16be'
        : 'utf-8';
  let text = new TextDecoder(encoding).decode(bytes);
  if (encoding === 'utf-8' && text.includes('\ufffd'))
    text = new TextDecoder('gb18030').decode(bytes);
  return text.replace(/^\ufeff/, '');
}
export function parseTextBlocks(
  text: string,
  kind: AssetKind,
  origin: string,
  sheet = '',
) {
  const result: ImportRow[] = [];
  let author = genericSheet(sheet) ? '' : sheet;
  let entry = newImportRow(kind, origin, sheet);
  let lines: string[] = [];
  const flush = () => {
    const secret = lines.join('\n').trim();
    if (secret) {
      entry.secret = secret;
      entry.author ||= author;
      entry.title ||= String(result.length + 1);
      if (!entry.author) entry.warnings.push('未识别作者');
      if (!entry.images.length) entry.warnings.push('未识别例图');
      result.push(entry);
    }
    entry = newImportRow(kind, origin, sheet);
    lines = [];
  };
  for (const raw of text.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trim();
    const authorMatch = line.match(
      /^(?:#{1,6}\s*)?(?:作者|写词老师|创作者|写词人|author|by)\s*[:：]\s*(.+)$/i,
    );
    if (authorMatch) {
      flush();
      author = authorMatch[1];
      continue;
    }
    const numbered = line.match(
      /^(?:#{1,6}\s*)?(?:序号\s*[:：]?\s*)?(\d{1,6})[.、)）:：\s]+(.+)?$/,
    );
    if (numbered) {
      flush();
      entry.title = numbered[1];
      if (numbered[2])
        lines.push(numbered[2].replace(/^(?:prompt|提示词)\s*[:：]\s*/i, ''));
      continue;
    }
    if (!line) {
      if (lines.length) flush();
      continue;
    }
    const metadata = line.match(
      /^(备注|来源|获取方式|获得方式|标签|note|tags)\s*[:：]\s*(.*)$/i,
    );
    if (metadata) {
      const key = metadata[1].toLowerCase();
      if (key === '备注' || key === 'note') entry.note = metadata[2];
      else if (key === '标签' || key === 'tags')
        entry.tags = metadata[2].split(/[,，;；]/);
      else
        entry.customFields.push({
          id: id(),
          label: metadata[1],
          value: metadata[2],
        });
      continue;
    }
    if (/^#{1,6}\s/.test(line) && !looksLikePrompt(line)) {
      flush();
      author = line.replace(/^#+\s*/, '');
      continue;
    }
    lines.push(line.replace(/^(?:prompt|提示词)\s*[:：]\s*/i, ''));
  }
  flush();
  return result;
}
async function docx(file: File, kind: AssetKind) {
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const path = 'word/document.xml';
  const doc = await zipXml(zip, path);
  if (!doc) throw new Error('未找到 Word 文档内容');
  const rels = await relationships(zip, path);
  const body = all(doc, 'body')[0];
  const rows: ImportRow[] = [];
  const warnings: string[] = [];
  const unmatchedImages: File[] = [];
  let author = '';
  const pictures = async (node: Element) => {
    const files: File[] = [];
    for (const blip of all(node, 'blip')) {
      const f = await imageFile(zip, rels.get(attr(blip, 'embed')));
      if (f) files.push(f);
    }
    return files;
  };
  for (const child of Array.from(body.childNodes)) {
    if (child.nodeType !== 1) continue;
    const node = child as Element;
    if (node.localName === 'tbl') {
      const input: CellRow[] = [];
      for (const [i, tr] of all(node, 'tr').entries())
        input.push({
          cells: all(tr, 'tc').map((tc) =>
            all(tc, 'p')
              .map((p) => textOf(p))
              .join('\n'),
          ),
          row: i + 1,
          images: await pictures(tr),
        });
      rows.push(...tableRows(input, kind, file.name, author));
    } else if (node.localName === 'p') {
      const text = textOf(node);
      const match = text.match(/^(?:作者|写词老师|by|author)\s*[:：]\s*(.+)$/i);
      const images = await pictures(node);
      if (match) author = match[1];
      else if (text.trim()) {
        const parsed = parseTextBlocks(text, kind, file.name, author);
        if (parsed.length) {
          parsed[0].images.push(...images);
          rows.push(...parsed);
        } else unmatchedImages.push(...images);
      } else if (images.length && rows.length) {
        rows[rows.length - 1].images.push(...images);
        rows[rows.length - 1].warnings.push(
          '按 Word 邻近段落关联例图，请核对。',
        );
      } else unmatchedImages.push(...images);
    }
  }
  warnings.push(
    'Word 表格按行解析；正文按段落/序号拆分。复杂多栏排版请先核对条目边界与图片。',
  );
  return {
    file,
    libraryName: file.name.replace(/\.[^.]+$/, ''),
    rows,
    warnings,
    unmatchedImages,
  };
}
export async function parseAssetFile(
  file: File,
  kind: AssetKind,
  progress?: (message: string) => void,
): Promise<ImportDocument> {
  progress?.(`正在本地解析 ${file.name}`);
  const extension = file.name.split('.').pop()?.toLowerCase();
  if (extension === 'xlsx' || extension === 'xlsm') return xlsx(file, kind);
  if (extension === 'docx') return docx(file, kind);
  if (extension === 'pdf')
    return (await import('./pdf-import')).parsePdf(file, kind, progress);
  if (extension === 'xls' || extension === 'doc')
    throw new Error(
      '旧版二进制 Office 文件请先另存为 .xlsx 或 .docx；不会猜测或漏导。',
    );
  if (extension === 'zip') {
    const zip = await JSZip.loadAsync(await file.arrayBuffer());
    const result: ImportDocument = {
      file,
      libraryName: file.name.replace(/\.zip$/i, ''),
      rows: [],
      warnings: [],
      unmatchedImages: [],
    };
    for (const [path, entry] of Object.entries(zip.files))
      if (
        !entry.dir &&
        !path.startsWith('__MACOSX/') &&
        /\.(xlsx|xlsm|docx|csv|tsv|txt|md|json|html?)$/i.test(path)
      ) {
        const parsed = await parseAssetFile(
          new File([await entry.async('arraybuffer')], path.split('/').pop()!),
          kind,
          progress,
        );
        result.rows.push(
          ...parsed.rows.map((row) => ({ ...row, origin: file.name })),
        );
        result.warnings.push(...parsed.warnings);
        result.unmatchedImages.push(...parsed.unmatchedImages);
      }
    for (const path of Object.keys(zip.files)) {
      const image = await imageFile(zip, path);
      if (!image) continue;
      const stem = image.name.replace(/\.[^.]+$/, '');
      const candidates = result.rows.filter(
        (r) =>
          r.title === stem ||
          r.customFields.some((f) => f.value.includes(image.name)),
      );
      if (candidates.length === 1) candidates[0].images.push(image);
      else result.unmatchedImages.push(image);
    }
    return result;
  }
  const text = await decodeText(file);
  let rows: ImportRow[] = [];
  const warnings: string[] = [];
  const unmatchedImages: File[] = [];
  if (extension === 'csv' || extension === 'tsv')
    rows = tableRows(
      parseDelimited(text, extension === 'tsv' ? '\t' : ',').map(
        (cells, i) => ({ cells, row: i + 1, images: [] }),
      ),
      kind,
      file.name,
    );
  else if (extension === 'json') {
    const value = JSON.parse(text);
    const array = Array.isArray(value)
      ? value
      : value.rows || value.prompts || value.assets || value.items;
    if (!Array.isArray(array))
      throw new Error(
        'JSON 需要条目数组，或 rows / prompts / assets / items 数组。',
      );
    if (array.every((item) => typeof item === 'string'))
      rows = array.map((prompt, i) => ({
        ...newImportRow(kind, file.name),
        title: String(i + 1),
        secret: prompt,
      }));
    else {
      const keys = [...new Set(array.flatMap((item) => Object.keys(item)))];
      rows = tableRows(
        [
          { cells: keys, row: 0, images: [] },
          ...array.map((item, i) => ({
            cells: keys.map((key) =>
              typeof item[key] === 'string'
                ? item[key]
                : item[key] === undefined
                  ? ''
                  : JSON.stringify(item[key]),
            ),
            row: i + 1,
            images: [],
          })),
        ],
        kind,
        file.name,
      );
    }
  } else if (extension === 'html' || extension === 'htm') {
    // Detached parser; never execute uploaded markup or fetch linked image URLs.
    const doc = new DOMParser().parseFromString(
      text.replace(/\s(?:src|srcset|href)\s*=/gi, ' data-import-src='),
      'text/html',
    );
    const input: CellRow[] = [];
    for (const [i, tr] of Array.from(doc.querySelectorAll('tr')).entries()) {
      const images: File[] = [];
      for (const img of Array.from(tr.querySelectorAll('img'))) {
        const src = img.getAttribute('data-import-src') || '';
        const match = src.match(
          /^data:(image\/(?:png|jpeg|webp|gif));base64,([\s\S]+)$/,
        );
        if (match)
          images.push(
            new File(
              [Uint8Array.from(atob(match[2]), (c) => c.charCodeAt(0))],
              `example-${i + 1}.png`,
              { type: match[1] },
            ),
          );
      }
      input.push({
        cells: Array.from(tr.querySelectorAll('th,td')).map(
          (c) => c.textContent || '',
        ),
        row: i + 1,
        images,
      });
    }
    rows = input.length
      ? tableRows(input, kind, file.name)
      : parseTextBlocks(doc.body.textContent || '', kind, file.name);
    warnings.push(
      '为保护隐私，不请求 HTML 的外链图片；请将图片与表格打包为 ZIP 或直接补图。',
    );
  } else if (extension === 'md' && /\|.*(?:提示词|prompt).*\|/i.test(text)) {
    const table = text
      .split(/\r?\n/)
      .filter(
        (line) => line.trim().startsWith('|') && !/^\s*\|?[\s:|-]+$/.test(line),
      );
    rows = tableRows(
      table.map((line, i) => ({
        cells: line
          .trim()
          .replace(/^\||\|$/g, '')
          .split('|')
          .map((s) => s.trim()),
        row: i + 1,
        images: [],
      })),
      kind,
      file.name,
    );
  } else if (['txt', 'md', 'text'].includes(extension || ''))
    rows = parseTextBlocks(text, kind, file.name);
  else
    throw new Error(
      '当前支持 XLSX / XLSM、DOCX、CSV / TSV、TXT / Markdown、JSON、HTML、PDF 与 ZIP。',
    );
  if (!rows.length)
    warnings.push('没有识别到可导入条目，请检查表头或提供一个脱敏样本。');
  return {
    file,
    libraryName: file.name.replace(/\.[^.]+$/, ''),
    rows,
    warnings,
    unmatchedImages,
  };
}
