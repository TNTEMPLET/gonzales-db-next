import { chromium } from "playwright";

const GC_BASE = "https://web.gc.com";
const STORAGE = "/data/gamechanger-writer/storage-state.json";
const ORG_ID = process.argv[2] ?? "Gbw8FIYw5JhE";

async function isSignedOut(page) {
  const signInButton = page.locator("button").filter({ hasText: /^sign in$/i }).first();
  return await signInButton.isVisible().catch(() => false);
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ storageState: STORAGE });
  const page = await context.newPage();

  await page.goto(GC_BASE, { waitUntil: "domcontentloaded" });
  const signedOutHome = await isSignedOut(page);
  console.log("signedOutHome", signedOutHome, "url", page.url());

  const url = `${GC_BASE}/organizations/${ORG_ID}/schedule`;
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => undefined);
  const signedOutSchedule = await isSignedOut(page);

  const addGames = page.getByRole("button", { name: /add games/i });
  let visible = false;
  try {
    await addGames.waitFor({ state: "visible", timeout: 30000 });
    visible = true;
  } catch {
    visible = false;
  }

  console.log(
    JSON.stringify(
      {
        signedOutHome,
        signedOutSchedule,
        scheduleUrl: page.url(),
        addGamesVisible: visible,
        bodyPreview: (await page.locator("body").innerText()).slice(0, 800),
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
