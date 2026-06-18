/** Render PDF pages to PNG buffers for OCR / vision (Node server only). */
async function installPdfDomPolyfills(): Promise<void> {
  if (typeof globalThis.DOMMatrix !== "undefined") return;

  const { DOMMatrix, ImageData, Path2D } = await import("@napi-rs/canvas");
  const globals = globalThis as Record<string, unknown>;
  globals.DOMMatrix = DOMMatrix;
  globals.ImageData ??= ImageData;
  globals.Path2D ??= Path2D;
}

export async function renderPdfPagesToPng(
  buffer: ArrayBuffer,
  opts?: { maxPages?: number; scale?: number },
): Promise<Buffer[]> {
  const maxPages = opts?.maxPages ?? 2;
  const scale = opts?.scale ?? 2;
  await installPdfDomPolyfills();
  const { pdf } = await import("pdf-to-img");
  const doc = await pdf(Buffer.from(buffer), { scale });
  const pages: Buffer[] = [];
  for await (const page of doc) {
    pages.push(Buffer.from(page));
    if (pages.length >= maxPages) break;
  }
  return pages;
}
