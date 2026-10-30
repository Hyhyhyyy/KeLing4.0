import { createHash } from 'node:crypto';
import { Worker } from 'node:worker_threads';
import path from 'node:path';
import { z } from 'zod';

export class LearningError extends Error {
  constructor(public code: string, message: string, public status = 400) { super(message); }
}
export const sha256 = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');
export const materialInput = z.object({
  title: z.string().trim().min(1).max(120), sourceName: z.string().trim().max(180).default('手动输入'),
  format: z.enum(['TEXT', 'MARKDOWN', 'PDF']), text: z.string().max(100_000).optional(),
  pdfBase64: z.string().max(700_000).optional(),
}).strict();
export interface ParsedSpan { ordinal: number; startUtf16: number; endUtf16: number; page: number | null; paragraphIndex: number; heading: string; textHash: string }
export interface ParsedMaterial { title: string; sourceName: string; format: 'TEXT' | 'MARKDOWN' | 'PDF'; content: string; contentHash: string; parserVersion: string; parseStatus: 'READY'; spans: ParsedSpan[]; warnings: string[] }
const normalize = (s: string) => s.replace(/\r\n?/g, '\n').replace(/\u0000/g, '');

export function indexPages(pages: string[], format: ParsedMaterial['format']) {
  const normalized = pages.map(normalize);
  const content = normalized.join('\n\n');
  if (!content.trim()) throw new LearningError('NO_TEXT', '未读取到文字。扫描 PDF 请先转为文字版或粘贴原文；不会推测图片内容。');
  if (content.length > 100_000) throw new LearningError('CONTENT_TOO_LARGE', '解析后的文字超过 10 万字元，请按章节拆分。');
  const spans: ParsedSpan[] = [];
  let offset = 0, paragraphIndex = 0, heading = '';
  for (const [pageIndex, page] of normalized.entries()) {
    // Stable UTF-16 offsets refer to the immutable normalized content, including emoji.
    for (const paragraph of page.matchAll(/[^\n]+(?:\n(?!\s*\n)[^\n]+)*/g)) {
      const raw = paragraph[0];
      const match = /^#{1,6}\s+(.+?)(?:\n|$)/.exec(raw);
      if (format === 'MARKDOWN' && match) heading = match[1].slice(0, 120);
      let local = 0;
      while (local < raw.length) {
        let length = Math.min(1600, raw.length - local);
        const last = raw.charCodeAt(local + length - 1);
        if (last >= 0xd800 && last <= 0xdbff && local + length < raw.length) length--;
        const startUtf16 = offset + paragraph.index! + local;
        const text = raw.slice(local, local + length);
        if (text.trim()) spans.push({ ordinal: spans.length, startUtf16, endUtf16: startUtf16 + length,
          page: format === 'PDF' ? pageIndex + 1 : null, paragraphIndex, heading, textHash: sha256(text) });
        local += length;
      }
      paragraphIndex++;
    }
    offset += page.length + 2;
  }
  return { content, contentHash: sha256(content), spans };
}

function readPdf(bytes: Uint8Array): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(path.join(__dirname, 'pdfWorker.js'), { workerData: bytes,
      resourceLimits: { maxOldGenerationSizeMb: 128, stackSizeMb: 4 } });
    let done = false;
    const finish = (error?: Error, pages?: string[]) => {
      if (done) return; done = true; clearTimeout(timer); void worker.terminate();
      if (error) reject(error); else resolve(pages!);
    };
    const timer = setTimeout(() => finish(new LearningError('PDF_TIMEOUT', 'PDF 解析超时，请缩小文件或粘贴文字。')), 20_000);
    worker.once('message', result => result.error
      ? finish(new LearningError('PDF_PARSE_FAILED', result.error)) : finish(undefined, result.pages));
    worker.once('error', () => finish(new LearningError('PDF_PARSE_FAILED', 'PDF 无法解析，请使用未加密的文字 PDF。')));
    worker.once('exit', () => { if (!done) finish(new LearningError('PDF_PARSE_FAILED', 'PDF 解析中止，请缩小文件。')); });
  });
}

export async function parseMaterial(raw: unknown): Promise<ParsedMaterial> {
  const input = materialInput.parse(raw);
  let pages: string[];
  if (input.format === 'PDF') {
    if (!input.pdfBase64 || input.text !== undefined || !/^[A-Za-z0-9+/]+={0,2}$/.test(input.pdfBase64))
      throw new LearningError('INVALID_PDF', '请提供 PDF 文件。');
    const bytes = Buffer.from(input.pdfBase64, 'base64');
    if (bytes.length > 512 * 1024 || bytes.subarray(0, 5).toString() !== '%PDF-')
      throw new LearningError('INVALID_PDF', '仅支持 512 KiB 以内的文字 PDF。');
    pages = await readPdf(new Uint8Array(bytes));
  } else {
    if (!input.text || input.pdfBase64 !== undefined) throw new LearningError('NO_TEXT', '请粘贴文字或导入 TXT / Markdown。');
    pages = [input.text];
  }
  const indexed = indexPages(pages, input.format);
  return { title: input.title, sourceName: input.sourceName, format: input.format, ...indexed,
    parserVersion: input.format === 'PDF' ? 'unpdf-1.4.0/text-v1' : 'keling-text-v1', parseStatus: 'READY',
    warnings: input.format === 'PDF' ? ['PDF 只提取文字层；公式、表格和多栏阅读顺序可能有误，请先核对预览。',
      ...(pages.some(p => !p.trim()) ? ['存在未提取到文字的页；这些页没有生成引用或知识点。'] : [])] : [] };
}

export function searchSpans(materials: Array<{ id: string; title: string; content: string; contentHash: string; spans: Array<ParsedSpan & { id: string }> }>, query: string, limit = 8) {
  const normalized = query.toLocaleLowerCase();
  const tokens = [...new Set(normalized.match(/[a-z0-9]{2,}|[\u3400-\u9fff]{1,2}/g) || [])].slice(0, 40);
  return materials.flatMap(m => m.spans.map(s => {
    const text = m.content.slice(s.startUtf16, s.endUtf16);
    const lower = text.toLocaleLowerCase();
    const score = tokens.reduce((n, t) => n + (lower.includes(t) ? 1 : 0), 0);
    return { materialVersionId: m.id, spanId: s.id, title: m.title, text, contentHash: m.contentHash,
      startUtf16: s.startUtf16, endUtf16: s.endUtf16, page: s.page, paragraphIndex: s.paragraphIndex,
      heading: s.heading, score };
  })).filter(s => !tokens.length || s.score > 0).sort((a, b) => b.score - a.score || a.spanId.localeCompare(b.spanId)).slice(0, limit);
}
