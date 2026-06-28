import { chromium } from "playwright";

const GC_BASE = "https://web.gc.com";
const STORAGE = "/data/gamechanger-writer/storage-state.json";
const ORG_ID = process.argv[2] ?? "Gbw8FIYw5JhE";

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ storageState: STORAGE });
  const page = await context.newPage();
  const url = `${GC_BASE}/organizations/${ORG_ID}/schedule`;
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(5000);
  await page.screenshot({ path: `/data/gamechanger-writer/debug-${ORG_ID}.png`, fullPage: true });

  const buttons = await page.locator("button").allInnerTexts();
  const links = await page.locator("a").allInnerTexts();
  const bodyText = (await page.locator("body").innerText()).slice(0, 2000);

  console.log(
    JSON.stringify(
      {
        url: page.url(),
        title: await page.title(),
        buttons: buttons.filter(Boolean).slice(0, 40),
        links: links.filter(Boolean).slice(0, 40),
        bodyPreview: bodyText,
        addGamesVisible: await page
          .getByRole("button", { name: /add games/i })
          .isVisible()
          .catch(() => false),
        addGameVisible: await page
          .getByRole("button", { name: /add game/i })
          .isVisible()
          .catch(() => false),
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
