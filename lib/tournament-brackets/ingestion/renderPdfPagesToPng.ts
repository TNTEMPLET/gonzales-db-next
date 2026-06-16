/** Render PDF pages to PNG buffers for OCR / vision (Node server only). */
export async function renderPdfPagesToPng(
  buffer: ArrayBuffer,
  opts?: { maxPages?: number; scale?: number },
): Promise<Buffer[]> {
  const maxPages = opts?.maxPages ?? 2;
  const scale = opts?.scale ?? 2;
  const { pdf } = await import("pdf-to-img");
  const doc = await pdf(Buffer.from(buffer), { scale });
  const pages: Buffer[] = [];
  for await (const page of doc) {
    pages.push(Buffer.from(page));
    if (pages.length >= maxPages) break;
  }
  return pages;
}
