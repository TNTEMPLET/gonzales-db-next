import type { Page } from "playwright";

import { openBrowserSession, persistBrowserSession } from "./browserSession.js";
import type { GameChangerCredentials } from "./credentials.js";
import { findCreatedScoreboardEvent } from "./findEventId.js";
import {
  assertScheduledForMatchesGcForm,
  assertStartTsMatchesExpected,
  expectedUtcFromGcForm,
} from "./gcScheduleTime.js";
import { selectLocationField } from "./locationField.js";
import type { CreateGameRequest } from "./types.js";
import { GC_BASE, isSignedOut } from "./browserSession.js";

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

  const { browser, context, page } = await openBrowserSession(credentials);
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

    await persistBrowserSession(context);
    return savedEvent.id;
  } finally {
    await context.close();
    await browser.close();
  }
}
