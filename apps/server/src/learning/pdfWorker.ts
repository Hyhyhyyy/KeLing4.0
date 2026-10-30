import { parentPort, workerData } from 'node:worker_threads';
import { getDocumentProxy } from 'unpdf';

async function run() {
  const pdf = await getDocumentProxy(new Uint8Array(workerData), {
    isEvalSupported: false, useSystemFonts: false, maxImageSize: 0,
    disableFontFace: true, useWorkerFetch: false,
  });
  try {
    if (pdf.numPages > 50) throw new Error('PDF 超过 50 页，请按章节拆分。');
    const pages: string[] = [];
    let count = 0;
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const text = content.items.map(item => 'str' in item ? item.str + (item.hasEOL ? '\n' : ' ') : '').join('');
      count += text.length;
      if (count > 100_000) throw new Error('解析后的文字超过 10 万字元，请按章节拆分。');
      pages.push(text); page.cleanup();
    }
    parentPort!.postMessage({ pages });
  } finally { await pdf.destroy(); }
}
void run().catch(error => parentPort!.postMessage({ error: error.message?.includes('超过') ? error.message : 'PDF 无法解析，请使用未加密的文字 PDF。' }));
