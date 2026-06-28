/**
 * Dry-run: open GC add-game form, fill schedule fields, read values back (no save).
 * Usage: node scripts/dry-run-form-timezone.mjs [gcOrganizationId]
 */
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const GC_BASE = "https://web.gc.com";
const BRACKET_TIME_ZONE = "America/Chicago";
const STORAGE = process.env.GC_WRITER_STORAGE_DIR?.trim() || "/data/gamechanger-writer";
const STORAGE_STATE_PATH = path.join(STORAGE, "storage-state.json");
const ORG_ID = process.argv[2] ?? "Gbw8FIYw5JhE";
const TEST_DATE = "06/28/26";
const TEST_TIME = "10:00 AM";

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

  const browserTz = await page.evaluate(() => Intl.DateTimeFormat().resolvedOptions().timeZone);
  const browserNow = await page.evaluate(() => new Date().toString());

  await page.goto(`${GC_BASE}/organizations/${ORG_ID}/schedule`, {
    waitUntil: "domcontentloaded",
    timeout: 60_000,
  });
  await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => undefined);

  const addGames = page.getByRole("button", { name: /add games/i });
  await addGames.waitFor({ state: "visible", timeout: 30_000 });
  await addGames.click();
  await page.getByText(/add individual h2h game/i).click();
  await page.waitForTimeout(2_000);

  const dateField = page.locator("#start-time-field-date");
  const timeField = page.locator("#start-time-field-time");

  const dateVisible = await dateField.isVisible().catch(() => false);
  const timeVisible = await timeField.isVisible().catch(() => false);
  if (!dateVisible || !timeVisible) {
    const labels = await page.locator("label").allInnerTexts();
    const inputs = await page.locator("input").evaluateAll((els) =>
      els.map((el) => ({
        type: el.getAttribute("type"),
        name: el.getAttribute("name"),
        placeholder: el.getAttribute("placeholder"),
        id: el.id,
        value: el.value,
      })),
    );
    const screenshotPath = path.join(STORAGE, `dry-run-timezone-${ORG_ID}-debug.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(
      JSON.stringify(
        {
          ok: false,
          error: "date/time fields not visible",
          dateVisible,
          timeVisible,
          labels: labels.filter(Boolean).slice(0, 30),
          inputs: inputs.slice(0, 20),
          screenshotPath,
        },
        null,
        2,
      ),
    );
    await browser.close();
    process.exit(1);
  }

  await dateField.waitFor({ state: "visible", timeout: 5_000 });
  await timeField.waitFor({ state: "visible", timeout: 5_000 });

  const defaultDate = (await dateField.inputValue().catch(() => "")).trim();
  const defaultTime = (await timeField.inputValue().catch(() => "")).trim();

  await page.evaluate(
    ({ date, time }) => {
      const dateEl = document.querySelector("#start-time-field-date");
      const timeEl = document.querySelector("#start-time-field-time");
      if (!dateEl || !timeEl) throw new Error("schedule fields missing");
      dateEl.value = date;
      dateEl.dispatchEvent(new Event("input", { bubbles: true }));
      dateEl.dispatchEvent(new Event("change", { bubbles: true }));
      timeEl.value = time;
      timeEl.dispatchEvent(new Event("input", { bubbles: true }));
      timeEl.dispatchEvent(new Event("change", { bubbles: true }));
    },
    { date: TEST_DATE, time: TEST_TIME },
  );

  const dateValue = (await dateField.inputValue().catch(() => "")).trim();
  const timeValue = (await timeField.inputValue().catch(() => "")).trim();

  const screenshotPath = path.join(STORAGE, `dry-run-timezone-${ORG_ID}.png`);
  await page.screenshot({ path: screenshotPath, fullPage: true });

  console.log(
    JSON.stringify(
      {
        ok: dateValue.length > 0 && timeValue.length > 0,
        orgId: ORG_ID,
        containerTz: process.env.TZ ?? null,
        playwrightTimezoneId: BRACKET_TIME_ZONE,
        browserResolvedTimezone: browserTz,
        browserNow,
        formDefaultsBeforeFill: { dateValue: defaultDate, timeValue: defaultTime },
        intended: { gcFormDate: TEST_DATE, gcFormTime: TEST_TIME },
        readBack: { dateValue, timeValue },
        screenshotPath,
      },
      null,
      2,
    ),
  );

  await browser.close();

  if (!dateValue || !timeValue) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
