/**
 * Fix GameChanger schedule times using bracket Central wall clock.
 * Writer browser uses timezoneId America/Chicago — type bracket times directly.
 */
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const GC_BASE = "https://web.gc.com";
const BRACKET_TIME_ZONE = "America/Chicago";
const STORAGE = process.env.GC_WRITER_STORAGE_DIR?.trim() || "/data/gamechanger-writer";
const STORAGE_STATE_PATH = path.join(STORAGE, "storage-state.json");

/** [orgId, eventId, gcFormTime] — Central bracket wall clock */
const FIXES = [
  ["3tin28my5pSV", "2b83aa9b-0aa1-4a36-bd79-f4898035c546", "12:00 PM"],
  ["3tin28my5pSV", "31ad8cbb-3e03-4457-8d5c-d4138b3625f3", "2:30 PM"],
  ["3tin28my5pSV", "7d597f9e-c9cc-451e-a0af-d26e2903ed7e", "5:00 PM"],
  ["nyKveVgqszKT", "912f6ac6-0e9b-473f-b34c-8b959289d2a2", "3:00 PM"],
  ["nyKveVgqszKT", "4a65edf9-537c-4395-9c6d-37afca31b941", "5:00 PM"],
  ["nyKveVgqszKT", "b0b2aac7-0d14-4222-bfb2-b856e585fb64", "5:30 PM"],
  ["RYUlLn3NnJmW", "c11405c5-9a08-4767-9fc2-ceb98bb134b7", "2:30 PM"],
  ["Gbw8FIYw5JhE", "ef5a14bb-15ae-4a87-8aa2-371ff694e46c", "10:00 AM"],
  ["Gbw8FIYw5JhE", "ec020b27-1fee-47e5-8c9b-01d8792b08c1", "12:30 PM"],
];

async function fileExists(filePath) {
  try {
    const { access } = await import("node:fs/promises");
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function fixGame(page, orgId, eventId, gcFormTime) {
  const editUrl = `${GC_BASE}/organizations/${orgId}/schedule/${eventId}/edit`;
  await page.goto(editUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.getByRole("button", { name: /^edit$/i }).click();
  const timeField = page.locator("#start-time-field-time");
  await timeField.waitFor({ state: "visible", timeout: 15_000 });
  await timeField.click();
  await timeField.fill(gcFormTime);
  await page.keyboard.press("Tab");
  await page.getByRole("button", { name: /^save$/i }).click();
  await page.waitForTimeout(4_000);
  console.log(JSON.stringify({ orgId, eventId, gcFormTime, ok: true }));
}

async function main() {
  await mkdir(STORAGE, { recursive: true });
  const browser = await chromium.launch({
    headless: process.env.GC_WRITER_HEADLESS !== "false",
  });
  const context = await browser.newContext({
    storageState: (await fileExists(STORAGE_STATE_PATH)) ? STORAGE_STATE_PATH : undefined,
    locale: "en-US",
    timezoneId: BRACKET_TIME_ZONE,
  });
  const page = await context.newPage();

  for (const [orgId, eventId, gcFormTime] of FIXES) {
    await fixGame(page, orgId, eventId, gcFormTime);
  }

  await context.storageState({ path: STORAGE_STATE_PATH });
  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
