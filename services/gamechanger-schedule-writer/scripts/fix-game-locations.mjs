/**
 * Set location/field on existing GC games via edit form.
 * Usage: node scripts/fix-game-locations.mjs
 */
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const GC_BASE = "https://web.gc.com";
const BRACKET_TIME_ZONE = "America/Chicago";
const STORAGE = process.env.GC_WRITER_STORAGE_DIR?.trim() || "/data/gamechanger-writer";
const STORAGE_STATE_PATH = path.join(STORAGE, "storage-state.json");

/** [orgId, eventId, fieldLabel] */
const FIXES = [
  ["3tin28my5pSV", "2b83aa9b-0aa1-4a36-bd79-f4898035c546", "F3"],
  ["3tin28my5pSV", "31ad8cbb-3e03-4457-8d5c-d4138b3625f3", "F3"],
  ["3tin28my5pSV", "7d597f9e-c9cc-451e-a0af-d26e2903ed7e", "F3"],
  ["nyKveVgqszKT", "912f6ac6-0e9b-473f-b34c-8b959289d2a2", "F1"],
  ["nyKveVgqszKT", "4a65edf9-537c-4395-9c6d-37afca31b941", "F4"],
  ["nyKveVgqszKT", "b0b2aac7-0d14-4222-bfb2-b856e585fb64", "F1"],
  ["RYUlLn3NnJmW", "c11405c5-9a08-4767-9fc2-ceb98bb134b7", "F4"],
  ["Gbw8FIYw5JhE", "ef5a14bb-15ae-4a87-8aa2-371ff694e46c", "F1"],
  ["Gbw8FIYw5JhE", "ec020b27-1fee-47e5-8c9b-01d8792b08c1", "F1"],
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

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function selectLocationField(page, locationLabel) {
  const location = page.locator("#location-field");
  await location.waitFor({ state: "visible", timeout: 15_000 });
  await location.click();
  await location.fill("");
  await location.fill(locationLabel);
  await page.waitForTimeout(800);

  const addOption = page
    .locator(".TypeaheadSelect__option")
    .filter({ hasText: new RegExp(`Add.*${escapeRegExp(locationLabel)}`, "i") });
  if (await addOption.first().isVisible().catch(() => false)) {
    await addOption.first().click();
  } else {
    const exactOption = page
      .locator(".TypeaheadSelect__option")
      .filter({ hasText: new RegExp(`^${escapeRegExp(locationLabel)}`, "i") });
    if (await exactOption.first().isVisible().catch(() => false)) {
      await exactOption.first().click();
    } else {
      throw new Error(`No location typeahead match for "${locationLabel}"`);
    }
  }

  await page.keyboard.press("Tab").catch(() => undefined);
}

async function fixLocation(page, orgId, eventId, fieldLabel) {
  const editUrl = `${GC_BASE}/organizations/${orgId}/schedule/${eventId}/edit`;
  await page.goto(editUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.getByRole("button", { name: /^edit$/i }).click();
  await selectLocationField(page, fieldLabel);
  await page.getByRole("button", { name: /^save$/i }).click();
  await page.waitForTimeout(3_000);
  console.log(JSON.stringify({ orgId, eventId, fieldLabel, ok: true }));
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

  for (const [orgId, eventId, fieldLabel] of FIXES) {
    await fixLocation(page, orgId, eventId, fieldLabel);
  }

  await context.storageState({ path: STORAGE_STATE_PATH });
  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
