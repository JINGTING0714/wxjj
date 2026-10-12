import { MOBILE_MEDIA } from './mobile-media';
import {
  writingLanguages,
  writingVersion,
  type WrittenPrompt,
  type WritingVersion,
} from './writing-model';
const xml = (value: string | number | null | undefined) =>
  String(value ?? '')
    // XML 1.0 cannot represent these control characters in spreadsheet cells.
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
const col = (index: number) => {
  let text = '';
  for (let n = index + 1; n; n = Math.floor((n - 1) / 26))
    text = String.fromCharCode(65 + ((n - 1) % 26)) + text;
  return text;
};
export function richWritingRuns(text: string, terms: string[]) {
  const positions: boolean[] = Array(text.length).fill(false);
  for (const term of terms.filter(Boolean)) {
    let start = 0;
    while ((start = text.indexOf(term, start)) >= 0) {
      for (let i = start; i < start + term.length; i++) positions[i] = true;
      start += term.length;
    }
  }
  const result: { text: string; purple: boolean }[] = [];
  for (let i = 0; i < text.length; i++) {
    const purple = positions[i];
    const last = result.at(-1);
    if (last?.purple === purple) last.text += text[i];
    else result.push({ text: text[i], purple });
  }
  return result;
}
export function writingTextChunks(text: string, size = 900) {
  if (!Number.isInteger(size) || size < 2)
    throw new RangeError('文本分段长度至少为 2。');
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(text.length, start + size);
    if (
      end < text.length &&
      /[\uD800-\uDBFF]/.test(text[end - 1]) &&
      /[\uDC00-\uDFFF]/.test(text[end])
    )
      end--;
    chunks.push(text.slice(start, end));
    start = end;
  }
  return chunks;
}
type Row = {
  cells: (string | number)[];
  height?: number;
  terms?: { column: number; values: string[] };
  imageId?: string;
  link?: number;
};
type Sheet = {
  name: string;
  widths: number[];
  rows: Row[];
  imageColumn?: number;
};
export async function exportWritingXlsx(
  docs: WrittenPrompt[],
  categories: { id: string; name: string }[],
  loadImages: (
    doc: WrittenPrompt,
    version: WritingVersion,
  ) => Promise<{ id: string; file: File }[]>,
  includeHistory = false,
  onProgress?: (message: string) => void,
  imageMaximum = 1280,
) {
  const { default: JSZip } = await import('jszip'),
    zip = new JSZip(),
    media = new Map<string, { data: Blob; width: number; height: number }>(),
    entries = docs.flatMap((doc) =>
      (includeHistory ? doc.versions : [writingVersion(doc)]).map(
        (version) => ({ doc, version }),
      ),
    ),
    category = (id: string) =>
      categories.find((item) => item.id === id)?.name || '未分类';
  const summary: Sheet = {
      name: '词包总览',
      widths: [8, 28, 22, 18, 20, 28, 50],
      rows: [
        {
          cells: ['序号', '名称', '分类', '版本', '变体', '作者', '备注'],
          height: 30,
        },
      ],
    },
    examples: Sheet = {
      name: '例图',
      widths: [8, 24, 22, 18, 12, 52],
      imageColumn: 5,
      rows: [
        {
          cells: ['序号', '名称', '分类', '版本', '例图序号', '图片'],
          height: 30,
        },
      ],
    },
    languageSheets = writingLanguages.map(
      (lang) =>
        ({
          name: lang.name,
          widths: [8, 28, 20, 18, 92, 34, 20],
          imageColumn: 5,
          rows: [
            {
              cells: [
                '序号',
                '名称',
                '分类',
                '版本',
                `${lang.name} 提示词（标紫为用户标记词）`,
                '例图',
                '查看全部例图',
              ],
              height: 34,
            },
          ],
        }) as Sheet,
    );
  for (let index = 0; index < entries.length; index++) {
    const { doc, version } = entries[index];
    onProgress?.(`整理词包 ${index + 1}/${entries.length}…`);
    summary.rows.push({
      cells: [
        index + 1,
        doc.title,
        category(doc.category),
        version.label,
        doc.variantLabel || '单版本',
        doc.author,
        [doc.note, version.note].filter(Boolean).join('\n'),
      ],
      height: 58,
    });
    const files = await loadImages(doc, version),
      firstExampleRow = examples.rows.length + 1;
    for (let i = 0; i < files.length; i++) {
      const item = files[i];
      if (!media.has(item.id)) {
        const bitmap = await createImageBitmap(item.file),
          canvas = document.createElement('canvas'),
          scale = imageMaximum
            ? Math.min(1, imageMaximum / Math.max(bitmap.width, bitmap.height))
            : 1;
        canvas.width = Math.max(1, Math.round(bitmap.width * scale));
        canvas.height = Math.max(1, Math.round(bitmap.height * scale));
        canvas
          .getContext('2d')!
          .drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        const blob = await new Promise<Blob>((resolve, reject) =>
          canvas.toBlob(
            (value) =>
              value ? resolve(value) : reject(new Error('例图编码失败')),
            'image/png',
          ),
        );
        const budget =
          typeof matchMedia === 'function' && matchMedia(MOBILE_MEDIA).matches
            ? 150_000_000
            : 500_000_000;
        if (
          [...media.values()].reduce((sum, image) => sum + image.data.size, 0) +
            blob.size >
          budget
        )
          throw new Error(
            '词包例图较大，请选择轻量例图，或按分类分批导出；原记录完整保留。',
          );
        media.set(item.id, {
          data: blob,
          width: canvas.width,
          height: canvas.height,
        });
        bitmap.close();
        canvas.width = canvas.height = 0;
      }
      examples.rows.push({
        cells: [
          index + 1,
          doc.title,
          category(doc.category),
          version.label,
          i + 1,
          '',
        ],
        height: 250,
        imageId: item.id,
      });
    }
    for (let language = 0; language < writingLanguages.length; language++) {
      const id = writingLanguages[language].id,
        text = version.languages[id] || '';
      if (!text) continue;
      const runs = richWritingRuns(text, version.sensitive[id] || []);
      let position = 0,
        cursor = 0;
      for (const [chunkIndex, chunk] of writingTextChunks(text).entries()) {
        const sliceTerms = runs.flatMap((run) => {
          const end = position + run.text.length;
          const begin = Math.max(cursor, position),
            finish = Math.min(cursor + chunk.length, end);
          position = end;
          return run.purple && finish > begin
            ? [text.slice(begin, finish)]
            : [];
        });
        position = 0;
        cursor += chunk.length;
        languageSheets[language].rows.push({
          cells: [
            index + 1,
            doc.title + (chunkIndex ? `（续 ${chunkIndex + 1}）` : ''),
            category(doc.category),
            version.label,
            chunk,
            '',
            files.length ? '查看全部例图' : '暂无例图',
          ],
          height: Math.min(
            390,
            Math.max(125, Math.ceil(chunk.length / 50) * 15 + 25),
          ),
          terms: { column: 4, values: sliceTerms },
          imageId: chunkIndex === 0 ? files[0]?.id : undefined,
          link: files.length ? firstExampleRow : undefined,
        });
      }
    }
  }
  const sheets = [
      summary,
      ...languageSheets.filter((sheet) => sheet.rows.length > 1),
      examples,
    ],
    ids = new Map([...media.keys()].map((id, index) => [id, index + 1]));
  zip.file(
    'xl/styles.xml',
    `<?xml version="1.0" encoding="UTF-8"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><color rgb="FF241C2B"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF7137EE"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`,
  );
  const contentTypes = [
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>',
    '<Default Extension="xml" ContentType="application/xml"/>',
    '<Default Extension="png" ContentType="image/png"/>',
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>',
    '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>',
  ];
  for (const [sheetIndex, sheet] of sheets.entries()) {
    const number = sheetIndex + 1,
      drawings: string[] = [],
      relations: string[] = [],
      links: string[] = [];
    const rows = sheet.rows
      .map((row, rowIndex) => {
        const line = rowIndex + 1;
        if (row.link)
          links.push(
            `<hyperlink ref="G${line}" location="&apos;例图&apos;!A${row.link}" display="查看全部例图"/>`,
          );
        if (
          row.imageId &&
          ids.has(row.imageId) &&
          sheet.imageColumn !== undefined
        ) {
          const item = media.get(row.imageId)!,
            imageNumber = ids.get(row.imageId)!,
            drawingId = drawings.length + 1,
            availableWidth = sheet.widths[sheet.imageColumn] * 7 - 12,
            availableHeight = ((row.height || 180) * 4) / 3 - 12,
            scale = Math.min(
              1,
              availableWidth / item.width,
              availableHeight / item.height,
            );
          relations.push(
            `<Relationship Id="rId${drawingId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image${imageNumber}.png"/>`,
          );
          drawings.push(
            `<xdr:oneCellAnchor><xdr:from><xdr:col>${sheet.imageColumn}</xdr:col><xdr:colOff>57150</xdr:colOff><xdr:row>${rowIndex}</xdr:row><xdr:rowOff>57150</xdr:rowOff></xdr:from><xdr:ext cx="${Math.round(item.width * scale * 9525)}" cy="${Math.round(item.height * scale * 9525)}"/><xdr:pic><xdr:nvPicPr><xdr:cNvPr id="${drawingId}" name="例图 ${drawingId}"/><xdr:cNvPicPr/></xdr:nvPicPr><xdr:blipFill><a:blip r:embed="rId${drawingId}"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill><xdr:spPr><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:pic><xdr:clientData/></xdr:oneCellAnchor>`,
          );
        }
        if (
          row.cells.some(
            (value) => typeof value === 'string' && value.length > 32767,
          )
        )
          throw new Error(
            '名称或备注超过 Excel 单格上限，请缩短后重试；提示词正文会自动分行保留。',
          );
        const cells = row.cells
          .map((value, column) => {
            const ref = col(column) + line;
            if (typeof value === 'number')
              return `<c r="${ref}" s="${rowIndex ? 0 : 1}"><v>${value}</v></c>`;
            const parts =
              row.terms?.column === column
                ? richWritingRuns(String(value), row.terms.values)
                : [{ text: String(value), purple: false }];
            return `<c r="${ref}" s="${rowIndex ? 0 : 1}" t="inlineStr"><is>${parts.map((part) => (part.purple ? `<r><rPr><color rgb="FF7C32C7"/><sz val="11"/><rFont val="Calibri"/></rPr><t xml:space="preserve">${xml(part.text)}</t></r>` : `<r>${rowIndex === 0 ? '<rPr><b/><color rgb="FFFFFFFF"/><sz val="11"/><rFont val="Calibri"/></rPr>' : ''}<t xml:space="preserve">${xml(part.text)}</t></r>`)).join('')}</is></c>`;
          })
          .join('');
        return `<row r="${line}" ht="${row.height || 50}" customHeight="1">${cells}</row>`;
      })
      .join('');
    zip.file(
      `xl/worksheets/sheet${number}.xml`,
      `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${sheet.widths.map((width, i) => `<col min="${i + 1}" max="${i + 1}" width="${width}" customWidth="1"/>`).join('')}</cols><sheetData>${rows}</sheetData><autoFilter ref="A1:${col(sheet.widths.length - 1)}${sheet.rows.length}"/>${links.length ? `<hyperlinks>${links.join('')}</hyperlinks>` : ''}<pageMargins left="0.3" right="0.3" top="0.5" bottom="0.5" header="0.2" footer="0.2"/>${drawings.length ? '<drawing r:id="rId1"/>' : ''}</worksheet>`,
    );
    contentTypes.push(
      `<Override PartName="/xl/worksheets/sheet${number}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
    );
    if (drawings.length) {
      zip.file(
        `xl/worksheets/_rels/sheet${number}.xml.rels`,
        `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing${number}.xml"/></Relationships>`,
      );
      zip.file(
        `xl/drawings/drawing${number}.xml`,
        `<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">${drawings.join('')}</xdr:wsDr>`,
      );
      zip.file(
        `xl/drawings/_rels/drawing${number}.xml.rels`,
        `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${relations.join('')}</Relationships>`,
      );
      contentTypes.push(
        `<Override PartName="/xl/drawings/drawing${number}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>`,
      );
    }
  }
  for (const [id, item] of media)
    zip.file(`xl/media/image${ids.get(id)}.png`, await item.data.arrayBuffer());
  zip.file(
    '[Content_Types].xml',
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">${contentTypes.join('')}</Types>`,
  );
  zip.file(
    '_rels/.rels',
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
  );
  zip.file(
    'xl/workbook.xml',
    `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((sheet, i) => `<sheet name="${xml(sheet.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`,
  );
  zip.file(
    'xl/_rels/workbook.xml.rels',
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
  );
  onProgress?.('正在生成 XLSX…');
  return zip.generateAsync(
    {
      type: 'blob',
      compression: 'DEFLATE',
      compressionOptions: { level: 3 },
      mimeType:
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    },
    (progress) => onProgress?.(`生成表格 ${Math.round(progress.percent)}%`),
  );
}
