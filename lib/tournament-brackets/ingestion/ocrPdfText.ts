import { renderPdfPagesToPng } from "@/lib/tournament-brackets/ingestion/renderPdfPagesToPng";

let workerPromise: Promise<import("tesseract.js").Worker> | null = null;

async function getOcrWorker(): Promise<import("tesseract.js").Worker> {
  if (!workerPromise) {
    workerPromise = (async () => {
      const { createWorker } = await import("tesseract.js");
      const worker = await createWorker("eng");
      return worker;
    })();
  }
  return workerPromise;
}

/** OCR PNG page images into plain text (Tesseract.js, no cloud API). */
export async function ocrPdfPageImages(pages: Buffer[]): Promise<string> {
  if (pages.length === 0) return "";
  const worker = await getOcrWorker();
  const chunks: string[] = [];
  for (const page of pages) {
    const result = await worker.recognize(page);
    const text = result.data.text?.trim();
    if (text) chunks.push(text);
  }
  return chunks.join("\n");
}

/** Render a PDF buffer and run local OCR. */
export async function ocrPdfBuffer(buffer: ArrayBuffer): Promise<string> {
  const pages = await renderPdfPagesToPng(buffer);
  return ocrPdfPageImages(pages);
}

/** Release the shared Tesseract worker (tests / graceful shutdown). */
export async function terminatePdfOcrWorker(): Promise<void> {
  if (!workerPromise) return;
  const worker = await workerPromise;
  await worker.terminate();
  workerPromise = null;
}
