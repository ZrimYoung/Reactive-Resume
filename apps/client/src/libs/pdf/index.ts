import { t } from "@lingui/macro";
import workerUrl from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url";

export type PdfLine = {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
};
export type ExtractedPdf = {
  pages: { pageNumber: number; width: number; height: number; lines: PdfLine[] }[];
  text: string;
  pageCount: number;
  warnings: string[];
};

export const MAX_PDF_BYTES = 20 * 1024 * 1024;
export const MAX_PDF_PAGES = 30;

/** Loaded on demand. Every PDF.js asset is shipped with the app; no CDN is used. */
export async function extractPdf(
  file: Blob,
  options: { signal?: AbortSignal } = {},
): Promise<ExtractedPdf> {
  options.signal?.throwIfAborted();
  if (file.size > MAX_PDF_BYTES) throw new Error(t`PDF files must be smaller than 20 MB.`);
  const controller = new AbortController();
  const forwardAbort = () => {
    controller.abort(options.signal?.reason);
  };
  options.signal?.addEventListener("abort", forwardAbort, { once: true });
  const timeout = setTimeout(() => {
    controller.abort(new Error(t`PDF reading timed out. Try a smaller file.`));
  }, 45_000);
  let rejectAbort: (() => void) | undefined;
  const aborted = new Promise<never>((_resolve, reject) => {
    rejectAbort = () => {
      const reason: unknown = controller.signal.reason;
      // eslint-disable-next-line lingui/no-unlocalized-strings -- Standard DOM cancellation contract.
      reject(reason instanceof Error ? reason : new DOMException("Aborted", "AbortError"));
    };
    controller.signal.addEventListener("abort", rejectAbort, { once: true });
  });
  try {
    return await Promise.race([readPdf(file, controller.signal), aborted]);
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener("abort", forwardAbort);
    if (rejectAbort) controller.signal.removeEventListener("abort", rejectAbort);
  }
}

async function readPdf(file: Blob, signal: AbortSignal): Promise<ExtractedPdf> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  signal.throwIfAborted();
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  const bytes = new Uint8Array(await file.arrayBuffer());
  signal.throwIfAborted();
  const task = pdfjs.getDocument({
    data: bytes,
    cMapUrl: `${import.meta.env.BASE_URL}pdfjs/cmaps/`,
    cMapPacked: true,
    standardFontDataUrl: `${import.meta.env.BASE_URL}pdfjs/standard_fonts/`,
    wasmUrl: `${import.meta.env.BASE_URL}pdfjs/wasm/`,
    useSystemFonts: true,
    stopAtErrors: true,
    maxImageSize: 0,
  });
  const cleanup = () =>
    task.destroy().catch(() => {
      // Cleanup must not replace the parsing or cancellation error already reported to the caller.
    });
  const abort = () => void cleanup();
  signal.addEventListener("abort", abort, { once: true });
  try {
    const document = await task.promise;
    if (document.numPages > MAX_PDF_PAGES)
      throw new Error(t`Split PDFs longer than 30 pages into smaller files before importing.`);
    const result: ExtractedPdf = {
      pages: [],
      text: "",
      pageCount: document.numPages,
      warnings: [],
    };
    const pageTexts: string[] = [];
    for (let number = 1; number <= document.numPages; number++) {
      signal.throwIfAborted();
      const page = await document.getPage(number);
      const viewport = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();
      const lines: PdfLine[] = [];
      let text = "";
      let previous: PdfLine | undefined;
      for (const item of content.items) {
        if (!("str" in item)) continue;
        const transform = pdfjs.Util.transform(viewport.transform, item.transform);
        const line = {
          text: item.str,
          x: transform[4],
          y: transform[5],
          width: item.width,
          height: item.height || Math.hypot(transform[2], transform[3]),
        };
        // Preserve content-stream order for the PDF reading-order report.
        if (previous && Math.abs(previous.y - line.y) > Math.max(2, line.height / 2)) text += "\n";
        else if (
          previous &&
          !/\s$/u.test(text) &&
          line.x - (previous.x + previous.width) > Math.max(2, line.height / 4) &&
          !/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]$/u.test(text) &&
          !/^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(item.str)
        )
          text += " ";
        text += item.str;
        if (item.hasEOL) text += "\n";
        if (item.str.trim()) {
          lines.push(line);
          previous = line;
        }
      }
      result.pages.push({
        pageNumber: number,
        width: viewport.width,
        height: viewport.height,
        lines,
      });
      pageTexts.push(text.trim());
      if (!text.trim()) result.warnings.push(t`Page ${number} has no readable text layer.`);
      page.cleanup();
    }
    result.text = pageTexts.join("\n\n");
    signal.throwIfAborted();
    return result;
  } catch (error) {
    signal.throwIfAborted();
    throw error;
  } finally {
    signal.removeEventListener("abort", abort);
    await cleanup();
  }
}
