/**
 * Dry-run location field fill on add-game form (no save).
 */
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const GC_BASE = "https://web.gc.com";
const BRACKET_TIME_ZONE = "America/Chicago";
const STORAGE = process.env.GC_WRITER_STORAGE_DIR?.trim() || "/data/gamechanger-writer";
const STORAGE_STATE_PATH = path.join(STORAGE, "storage-state.json");
const ORG_ID = process.argv[2] ?? "3tin28my5pSV";
const FIELD_VALUE = process.argv[3] ?? "F3";

async function fileExists(filePath) {
  try {
    const { access } = await import("node:fs/promises");
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readDropdownOptions(page) {
  const optionLocators = [
    page.locator(".TypeaheadSelect__option"),
    page.locator("[role='option']"),
  ];
  for (const options of optionLocators) {
    if ((await options.count()) === 0) continue;
    const count = await options.count();
    const labels = [];
    for (let index = 0; index < count; index += 1) {
      const text = (await options.nth(index).innerText()).trim();
      if (text) labels.push(text);
    }
    if (labels.length > 0) return labels;
  }
  return [];
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

  await page.goto(`${GC_BASE}/organizations/${ORG_ID}/schedule`, {
    waitUntil: "domcontentloaded",
    timeout: 60_000,
  });
  await page.getByRole("button", { name: /add games/i }).click();
  await page.getByText(/add individual h2h game/i).click();
  await page.waitForTimeout(2_000);

  const location = page.locator("#location-field");
  await location.waitFor({ state: "visible", timeout: 10_000 });

  await location.click();
  await location.fill(FIELD_VALUE);
  await page.waitForTimeout(1_500);

  const optionsAfterFill = await readDropdownOptions(page);
  const typeahead = page.locator(".TypeaheadSelect__option").filter({ hasText: FIELD_VALUE });
  const typeaheadVisible = await typeahead.first().isVisible().catch(() => false);

  if (typeaheadVisible) {
    await typeahead.first().click();
  } else if (optionsAfterFill.length > 0) {
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
  } else {
    await page.keyboard.press("Tab");
  }

  await page.waitForTimeout(500);
  const valueAfter = (await location.inputValue().catch(() => "")).trim();

  // Also try edit page on existing game with location
  const editUrl = `${GC_BASE}/organizations/${ORG_ID}/schedule/2b83aa9b-0aa1-4a36-bd79-f4898035c546/edit`;
  await page.goto(editUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.getByRole("button", { name: /^edit$/i }).click().catch(() => undefined);
  await page.waitForTimeout(2_000);
  const editLocation = page.locator("#location-field");
  const editVisible = await editLocation.isVisible().catch(() => false);
  let editValue = "";
  let editOptions = [];
  if (editVisible) {
    editValue = (await editLocation.inputValue().catch(() => "")).trim();
    await editLocation.click();
    await editLocation.fill(FIELD_VALUE);
    await page.waitForTimeout(1_500);
    editOptions = await readDropdownOptions(page);
  }

  console.log(
    JSON.stringify(
      {
        fieldValue: FIELD_VALUE,
        addForm: {
          optionsAfterFill,
          typeaheadVisible,
          valueAfter,
        },
        editForm: {
          visible: editVisible,
          valueBefore: editValue,
          optionsAfterFill: editOptions,
        },
      },
      null,
      2,
    ),
  );

  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
