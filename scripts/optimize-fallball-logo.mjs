/**
 * Resize Fall Ball logo for web (header + hero watermark).
 * Keeps a one-time .original.png backup of the huge source.
 *
 * Usage (dev-box / local with deps):
 *   pnpm exec node scripts/optimize-fallball-logo.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createCanvas, loadImage } from "@napi-rs/canvas";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const outPng = path.join(root, "public/images/fallball-ap-baseball-logo.png");
const outWebp = path.join(root, "public/images/fallball-ap-baseball-logo.webp");
const original = path.join(
  root,
  "public/images/fallball-ap-baseball-logo.original.png",
);

/** Display ~160–320px; 640px covers 2× retina. */
const TARGET_WIDTH = 640;

async function main() {
  if (!fs.existsSync(outPng) && !fs.existsSync(original)) {
    throw new Error(`Missing logo at ${outPng}`);
  }

  if (!fs.existsSync(original) && fs.existsSync(outPng)) {
    const size = fs.statSync(outPng).size;
    // Only treat as original backup if still huge (pre-optimize).
    if (size > 1_000_000) {
      fs.copyFileSync(outPng, original);
      console.log("Backed up original:", original, size, "bytes");
    }
  }

  const srcPath = fs.existsSync(original) ? original : outPng;
  const source = await loadImage(srcPath);
  console.log("Source:", source.width, "x", source.height, "from", srcPath);

  const targetW = TARGET_WIDTH;
  const targetH = Math.round((source.height / source.width) * targetW);
  const canvas = createCanvas(targetW, targetH);
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, targetW, targetH);
  ctx.drawImage(source, 0, 0, targetW, targetH);

  const png = canvas.toBuffer("image/png");
  fs.writeFileSync(outPng, png);
  console.log("Wrote", outPng, png.length, "bytes", `${targetW}x${targetH}`);

  try {
    const webp = canvas.toBuffer("image/webp", 90);
    fs.writeFileSync(outWebp, webp);
    console.log("Wrote", outWebp, webp.length, "bytes");
  } catch (err) {
    console.warn("WebP skip:", err instanceof Error ? err.message : err);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
