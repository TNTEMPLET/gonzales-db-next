import { mkdir } from "node:fs/promises";
import path from "node:path";

import { chromium, type BrowserContext, type Page } from "playwright";

import type { GameChangerCredentials } from "./credentials.js";
import { findCreatedScoreboardEvent } from "./findEventId.js";
import {
  assertScheduledForMatchesGcForm,
  assertStartTsMatchesExpected,
  assertWriterBrowserTimezone,
  expectedUtcFromGcForm,
  GC_WRITER_TIMEZONE,
} from "./gcScheduleTime.js";
import { selectLocationField } from "./locationField.js";
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
    locale: "en-US",
    timezoneId: GC_WRITER_TIMEZONE,
  });
  const page = await context.newPage();
  await assertWriterBrowserTimezone(page);
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
  await page.goto(`${GC_BASE}/organizations/${gcOrganizationId}/schedule`, {
    waitUntil: "domcontentloaded",
    timeout: 60_000,
  });
  await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => undefined);

  const addGames = page.getByRole("button", { name: /add games/i });
  try {
    await addGames.waitFor({ state: "visible", timeout: 30_000 });
  } catch {
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

function normalizeGcFormTimeForCompare(value: string): string {
  const match = value.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) return value.trim().toUpperCase();
  const hours = Number(match[1]);
  const minutes = match[2]!;
  const meridiem = match[3]!.toUpperCase();
  return `${hours}:${minutes} ${meridiem}`;
}

async function fillScheduleDateTime(page: Page, gcFormDate: string, gcFormTime: string): Promise<void> {
  const dateField = page.locator("#start-time-field-date");
  const timeField = page.locator("#start-time-field-time");

  await dateField.waitFor({ state: "visible", timeout: 15_000 });
  await timeField.waitFor({ state: "visible", timeout: 15_000 });

  // GameChanger's React form ignores direct DOM value assignment. Use real focus/fill
  // so the controlled inputs commit before Save (otherwise games default to ~2:00 AM).
  await dateField.click();
  await dateField.fill(gcFormDate);
  await page.keyboard.press("Tab");

  await timeField.click();
  await timeField.fill(gcFormTime);
  await page.keyboard.press("Tab");

  const dateValue = (await dateField.inputValue().catch(() => "")).trim();
  if (!dateValue) {
    throw new Error(`Could not fill GameChanger schedule date (${gcFormDate}).`);
  }
  const timeValue = (await timeField.inputValue().catch(() => "")).trim();
  if (!timeValue) {
    throw new Error(`Could not fill GameChanger schedule time (${gcFormTime}).`);
  }

  const expectedTime = normalizeGcFormTimeForCompare(gcFormTime);
  const actualTime = normalizeGcFormTimeForCompare(timeValue);
  if (actualTime !== expectedTime) {
    throw new Error(
      `GameChanger schedule time did not stick (expected ${expectedTime}, read ${actualTime}).`,
    );
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

function resolveLocationLabel(request: CreateGameRequest): string | undefined {
  const field = request.field?.trim();
  if (field) return field;
  return request.venue?.trim() || undefined;
}

function validateCreateRequest(request: CreateGameRequest): string {
  if (!request.gcFormDate || !request.gcFormTime) {
    throw new Error("gcFormDate and gcFormTime are required.");
  }

  const expectedFromForm = expectedUtcFromGcForm(request.gcFormDate, request.gcFormTime);
  if (!expectedFromForm) {
    throw new Error(`Invalid gcFormDate/gcFormTime (${request.gcFormDate} ${request.gcFormTime}).`);
  }

  if (request.scheduledFor) {
    assertScheduledForMatchesGcForm(request.scheduledFor, request.gcFormDate, request.gcFormTime);
    return request.scheduledFor;
  }

  return expectedFromForm;
}

function assertSavedLocation(expected: string | undefined, actual: string | undefined): void {
  if (!expected) return;
  const normalizedExpected = expected.trim();
  const normalizedActual = actual?.trim() ?? "";
  if (normalizedActual !== normalizedExpected) {
    throw new Error(
      `GameChanger saved the wrong location (expected ${normalizedExpected}, got ${normalizedActual || "empty"}).`,
    );
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

  const expectedStartIso = validateCreateRequest(request);
  const locationLabel = resolveLocationLabel(request);

  const { browser, context, page } = await openContext(credentials);
  try {
    await openAddGameModal(page, request.gcOrganizationId);
    await fillScheduleDateTime(page, request.gcFormDate!, request.gcFormTime!);
    await selectDuration(page, request.durationLabel?.trim() || "2 hr");
    await selectTeam(page, /home team/i, request.homeTeam);
    await selectTeam(page, /away team/i, request.awayTeam);
    if (locationLabel) {
      await selectLocationField(page, locationLabel);
    }
    await page.getByRole("button", { name: /save & close/i }).click();
    await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => undefined);

    const savedEvent = await findCreatedScoreboardEvent(
      request.widgetId,
      request,
      expectedStartIso,
    );
    if (!savedEvent) {
      throw new Error("GameChanger game was saved but no matching event was found on the scoreboard.");
    }

    assertStartTsMatchesExpected(expectedStartIso, savedEvent.start_ts);
    assertSavedLocation(locationLabel, savedEvent.location?.name);

    await context.storageState({ path: STORAGE_STATE_PATH });
    return savedEvent.id;
  } finally {
    await context.close();
    await browser.close();
  }
}
