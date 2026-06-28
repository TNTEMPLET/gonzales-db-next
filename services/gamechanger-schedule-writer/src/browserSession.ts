import { mkdir } from "node:fs/promises";
import path from "node:path";

import { chromium, type BrowserContext, type Page } from "playwright";

import type { GameChangerCredentials } from "./credentials.js";
import { GC_WRITER_TIMEZONE } from "./gcScheduleTime.js";

export const GC_BASE = "https://web.gc.com";
export const GC_API_BASE = "https://api.team-manager.gc.com";
export const STORAGE_DIR = process.env.GC_WRITER_STORAGE_DIR?.trim() || "/data/gamechanger-writer";
export const STORAGE_STATE_PATH = path.join(STORAGE_DIR, "storage-state.json");

async function ensureStorageDir(): Promise<void> {
  await mkdir(STORAGE_DIR, { recursive: true });
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

export async function isSignedOut(page: Page): Promise<boolean> {
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

export async function ensureLoggedIn(page: Page, credentials: GameChangerCredentials): Promise<void> {
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

export async function openBrowserSession(credentials: GameChangerCredentials): Promise<{
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
    locale: "en-US",
    timezoneId: GC_WRITER_TIMEZONE,
  });
  const page = await context.newPage();
  const { assertWriterBrowserTimezone } = await import("./gcScheduleTime.js");
  await assertWriterBrowserTimezone(page);
  await ensureLoggedIn(page, credentials);
  await context.storageState({ path: STORAGE_STATE_PATH });
  return { browser, context, page };
}

export async function persistBrowserSession(context: BrowserContext): Promise<void> {
  await context.storageState({ path: STORAGE_STATE_PATH });
}
