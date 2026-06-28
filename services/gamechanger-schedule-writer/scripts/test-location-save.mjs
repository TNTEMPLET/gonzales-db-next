/**
 * Test saving F3 on edit form — updates one game location.
 */
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const GC_BASE = "https://web.gc.com";
const BRACKET_TIME_ZONE = "America/Chicago";
const STORAGE = process.env.GC_WRITER_STORAGE_DIR?.trim() || "/data/gamechanger-writer";
const STORAGE_STATE_PATH = path.join(STORAGE, "storage-state.json");
const ORG_ID = process.argv[2] ?? "3tin28my5pSV";
const EVENT_ID = process.argv[3] ?? "2b83aa9b-0aa1-4a36-bd79-f4898035c546";
const FIELD_VALUE = process.argv[4] ?? "F3";

async function fileExists(filePath) {
  try {
    const { access } = await import("node:fs/promises");
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function selectLocation(page, fieldValue) {
  const location = page.locator("#location-field");
  await location.waitFor({ state: "visible", timeout: 15_000 });
  await location.click();
  await location.fill("");
  await location.fill(fieldValue);
  await page.waitForTimeout(1_000);

  const addOption = page.locator(".TypeaheadSelect__option").filter({ hasText: new RegExp(`Add.*${fieldValue}`, "i") });
  if (await addOption.first().isVisible().catch(() => false)) {
    await addOption.first().click();
  } else {
    const exact = page.locator(".TypeaheadSelect__option").filter({ hasText: new RegExp(`^${fieldValue}`, "i") });
    if (await exact.first().isVisible().catch(() => false)) {
      await exact.first().click();
    } else {
      throw new Error(`No location typeahead match for "${fieldValue}"`);
    }
  }

  await page.waitForTimeout(300);
  const committed = (await location.inputValue().catch(() => "")).trim();
  if (!committed) {
    throw new Error(`Location "${fieldValue}" did not stick in the form.`);
  }
  return committed;
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

  const editUrl = `${GC_BASE}/organizations/${ORG_ID}/schedule/${EVENT_ID}/edit`;
  await page.goto(editUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.getByRole("button", { name: /^edit$/i }).click();
  const committed = await selectLocation(page, FIELD_VALUE);
  await page.getByRole("button", { name: /^save$/i }).click();
  await page.waitForTimeout(4_000);

  const widgetId = "767f113a-938d-4def-a135-16c6b31bb402";
  const res = await fetch(
    `https://api.team-manager.gc.com/public/widgets/scoreboard/${widgetId}?start=2026-06-28T00:00:00.000Z`,
  );
  const json = await res.json();
  const event = (json.data?.events ?? []).find((e) => e.id === EVENT_ID);

  console.log(
    JSON.stringify({
      committed,
      apiLocation: event?.location?.name ?? null,
      ok: event?.location?.name === FIELD_VALUE,
    }),
  );

  await context.storageState({ path: STORAGE_STATE_PATH });
  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
