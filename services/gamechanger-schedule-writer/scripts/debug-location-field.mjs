/**
 * Inspect add-game form fields (location/field). Does not save.
 * Usage: node scripts/debug-location-field.mjs [gcOrganizationId]
 */
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const GC_BASE = "https://web.gc.com";
const BRACKET_TIME_ZONE = "America/Chicago";
const STORAGE = process.env.GC_WRITER_STORAGE_DIR?.trim() || "/data/gamechanger-writer";
const STORAGE_STATE_PATH = path.join(STORAGE, "storage-state.json");
const ORG_ID = process.argv[2] ?? "Gbw8FIYw5JhE";

async function fileExists(filePath) {
  try {
    const { access } = await import("node:fs/promises");
    await access(filePath);
    return true;
  } catch {
    return false;
  }
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
  await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => undefined);

  await page.getByRole("button", { name: /add games/i }).click();
  await page.getByText(/add individual h2h game/i).click();
  await page.waitForTimeout(2_000);

  const labels = await page.locator("label").allInnerTexts();
  const inputs = await page.locator("input, textarea, select").evaluateAll((els) =>
    els.map((el) => ({
      tag: el.tagName.toLowerCase(),
      type: el.getAttribute("type"),
      id: el.id,
      name: el.getAttribute("name"),
      placeholder: el.getAttribute("placeholder"),
      value: el.value,
      ariaLabel: el.getAttribute("aria-label"),
      className: el.className?.slice?.(0, 80) ?? "",
    })),
  );

  const locationByLabel = page.getByLabel(/location/i);
  const locationCount = await locationByLabel.count();
  const locationMeta = [];
  for (let i = 0; i < locationCount; i += 1) {
    const loc = locationByLabel.nth(i);
    locationMeta.push({
      index: i,
      visible: await loc.isVisible().catch(() => false),
      tag: await loc.evaluate((el) => el.tagName.toLowerCase()).catch(() => null),
      id: await loc.getAttribute("id").catch(() => null),
      value: await loc.inputValue().catch(() => null),
      placeholder: await loc.getAttribute("placeholder").catch(() => null),
    });
  }

  const screenshotPath = path.join(STORAGE, `debug-location-${ORG_ID}.png`);
  await page.screenshot({ path: screenshotPath, fullPage: true });

  console.log(
    JSON.stringify(
      {
        orgId: ORG_ID,
        labels: labels.filter(Boolean),
        inputs,
        locationByLabel: locationMeta,
        screenshotPath,
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
