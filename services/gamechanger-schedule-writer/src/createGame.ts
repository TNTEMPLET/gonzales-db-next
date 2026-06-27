import { mkdir } from "node:fs/promises";
import path from "node:path";

import { chromium, type BrowserContext, type Page } from "playwright";

import type { GameChangerCredentials } from "./credentials.js";
import { findCreatedEventId } from "./findEventId.js";
import type { CreateGameRequest } from "./types.js";

const GC_BASE = "https://web.gc.com";
const STORAGE_DIR = process.env.GC_WRITER_STORAGE_DIR?.trim() || "/data/gamechanger-writer";
const STORAGE_STATE_PATH = path.join(STORAGE_DIR, "storage-state.json");

async function ensureStorageDir(): Promise<void> {
  await mkdir(STORAGE_DIR, { recursive: true });
}

async function openContext(credentials: GameChangerCredentials): Promise<{
  browser: Awaited<ReturnType<typeof chromium.launch>>;
  context: BrowserContext;
  page: Page;
}> {
  await ensureStorageDir();
  const browser = await chromium.launch({
    headless: process.env.GC_WRITER_HEADLESS !== "false",
  });

  const context = await browser.newContext({
    storageState: (await fileExists(STORAGE_STATE_PATH)) ? STORAGE_STATE_PATH : undefined,
  });
  const page = await context.newPage();
  await ensureLoggedIn(page, credentials);
  await context.storageState({ path: STORAGE_STATE_PATH });
  return { browser, context, page };
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await mkdir(path.dirname(filePath), { recursive: true });
    const { access } = await import("node:fs/promises");
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function isSignedOut(page: Page): Promise<boolean> {
  const signInButton = page.locator("button").filter({ hasText: /^sign in$/i }).first();
  return await signInButton.isVisible().catch(() => false);
}

async function clickSignIn(page: Page): Promise<void> {
  const link = page.getByRole("link", { name: /sign in/i });
  if (await link.isVisible().catch(() => false)) {
    await link.click();
    return;
  }
  const button = page.locator("button").filter({ hasText: /^sign in$/i }).first();
  if (await button.isVisible().catch(() => false)) {
    await button.click();
  }
}

async function ensureLoggedIn(page: Page, credentials: GameChangerCredentials): Promise<void> {
  await page.goto(GC_BASE, { waitUntil: "domcontentloaded" });
  if (!(await isSignedOut(page))) return;

  await clickSignIn(page);
  await page.waitForTimeout(1_000);

  const email = page.locator("input[type=email], input[name*=email i]").first();
  if (await email.isVisible().catch(() => false)) {
    await email.fill(credentials.username);
    const continueButton = page.locator("button").filter({ hasText: /^continue$/i }).first();
    if (await continueButton.isVisible().catch(() => false)) {
      await continueButton.click();
      await page.waitForTimeout(2_000);
    }
  }

  const emailCode = process.env.GC_WRITER_EMAIL_CODE?.trim();
  const codeField = page.locator("input[name=code], input[autocomplete=one-time-code]").first();
  if (emailCode && (await codeField.isVisible().catch(() => false))) {
    await codeField.fill(emailCode);
  }

  const password = page.locator("input[type=password]").first();
  if (await password.isVisible().catch(() => false)) {
    await password.fill(credentials.password);
    await page.locator("button").filter({ hasText: /^sign in$/i }).last().click();
    await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => undefined);
  }

  if (page.url().includes("/login") || (await isSignedOut(page))) {
    const needsEmailCode = await page.getByText(/sent a code/i).isVisible().catch(() => false);
    if (needsEmailCode) {
      throw new Error(
        "GameChanger login requires a fresh email verification code. Set GC_WRITER_EMAIL_CODE on the writer host and retry within a few minutes.",
      );
    }
    throw new Error("GameChanger login failed with stored credentials.");
  }
}

async function openAddGameModal(page: Page, gcOrganizationId: string): Promise<void> {
  await page.goto(`${GC_BASE}/organizations/${gcOrganizationId}/schedule`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3_000);

  const addGames = page.getByRole("button", { name: /add games/i });
  if (!(await addGames.isVisible().catch(() => false))) {
    if (await isSignedOut(page)) {
      throw new Error("GameChanger login failed with stored credentials.");
    }
    const needsEmailCode = await page.getByText(/sent a code/i).isVisible().catch(() => false);
    if (needsEmailCode) {
      throw new Error(
        "GameChanger login requires an email verification code. Refresh the writer browser session manually or configure automated OTP retrieval.",
      );
    }
    throw new Error(
      "GameChanger account cannot access the staff schedule editor (Add games control not visible).",
    );
  }

  await addGames.click();
  await page.getByText(/add individual h2h game/i).click();
}

async function fillIfPresent(page: Page, label: RegExp, value: string): Promise<void> {
  const field = page.getByLabel(label);
  if (await field.isVisible().catch(() => false)) {
    await field.click();
    await field.fill(value);
  }
}

async function selectDuration(page: Page, durationLabel: string): Promise<void> {
  const duration = page.getByLabel(/duration/i);
  if (!(await duration.isVisible().catch(() => false))) return;

  const tagName = await duration.evaluate((el) => el.tagName.toLowerCase());
  if (tagName === "select") {
    await duration.selectOption({ label: durationLabel });
    return;
  }

  await duration.click();
  await duration.fill(durationLabel);
  await page.keyboard.press("Enter");
}

async function readDropdownOptions(page: Page): Promise<string[]> {
  const optionLocators = [
    page.locator(".TypeaheadSelect__option"),
    page.locator("[role='option']"),
    page.locator("[role='combobox'].TypeaheadSelect__option"),
  ];
  for (const options of optionLocators) {
    if ((await options.count()) === 0) continue;
    await options.first().waitFor({ state: "visible", timeout: 5_000 }).catch(() => undefined);
    const count = await options.count();
    const labels: string[] = [];
    for (let index = 0; index < count; index += 1) {
      const text = (await options.nth(index).innerText()).trim();
      if (text) labels.push(text);
    }
    if (labels.length > 0) return labels;
  }
  return [];
}

async function selectTeam(page: Page, label: RegExp, teamName: string): Promise<void> {
  const field = page.getByLabel(label);
  await field.click();
  await field.fill(teamName);
  await page.waitForTimeout(500);

  const normalizedTarget = teamName.trim().toLowerCase();
  const typeaheadOption = page.locator(".TypeaheadSelect__option").filter({ hasText: teamName });
  if (await typeaheadOption.first().isVisible().catch(() => false)) {
    await typeaheadOption.first().click();
  } else {
    const options = await readDropdownOptions(page);
    const index = options.findIndex((option) => option.trim().toLowerCase() === normalizedTarget);
    if (index < 0) {
      throw new Error(`Team "${teamName}" was not found in the GameChanger dropdown.`);
    }
    for (let step = 0; step <= index; step += 1) {
      await page.keyboard.press("ArrowDown");
    }
    await page.keyboard.press("Enter");
  }

  const committed = (await field.inputValue().catch(() => "")).trim();
  if (!committed) {
    throw new Error(`Team "${teamName}" was not committed in the GameChanger form.`);
  }
}

export async function createGameChangerGame(
  credentials: GameChangerCredentials,
  request: CreateGameRequest,
): Promise<string> {
  if (!request.gcOrganizationId) {
    throw new Error("gcOrganizationId is required.");
  }
  if (!request.widgetId) {
    throw new Error("widgetId is required.");
  }
  if (!request.gcFormDate || !request.gcFormTime) {
    throw new Error("gcFormDate and gcFormTime are required.");
  }

  const { browser, context, page } = await openContext(credentials);
  try {
    await openAddGameModal(page, request.gcOrganizationId);
    await fillIfPresent(page, /date/i, request.gcFormDate);
    await fillIfPresent(page, /^time$/i, request.gcFormTime);
    await selectDuration(page, request.durationLabel?.trim() || "2 hr");
    await selectTeam(page, /home team/i, request.homeTeam);
    await selectTeam(page, /away team/i, request.awayTeam);
    if (request.field?.trim()) {
      await fillIfPresent(page, /location/i, request.field.trim());
    }
    await page.getByRole("button", { name: /save & close/i }).click();
    await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => undefined);

    const eventId = await findCreatedEventId(request.widgetId, request, request.scheduledFor);
    if (!eventId) {
      throw new Error("GameChanger game was saved but no matching eventId was found on the scoreboard.");
    }
    await context.storageState({ path: STORAGE_STATE_PATH });
    return eventId;
  } finally {
    await context.close();
    await browser.close();
  }
}
