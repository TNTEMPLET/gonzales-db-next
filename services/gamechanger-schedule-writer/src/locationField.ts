import type { Page } from "playwright";

async function readDropdownOptions(page: Page): Promise<string[]> {
  const optionLocators = [
    page.locator(".TypeaheadSelect__option"),
    page.locator("[role='option']"),
  ];
  for (const options of optionLocators) {
    if ((await options.count()) === 0) continue;
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

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * GameChanger location is a Google Places typeahead (#location-field).
 * Custom field labels (F1, F3) must be chosen via "Add \"F3\"" or an existing org option.
 */
export async function selectLocationField(page: Page, locationLabel: string): Promise<void> {
  const trimmed = locationLabel.trim();
  if (!trimmed) return;

  const location = page.locator("#location-field");
  await location.waitFor({ state: "visible", timeout: 15_000 });
  await location.click();
  await location.fill("");
  await location.fill(trimmed);
  await page.waitForTimeout(800);

  const addOption = page
    .locator(".TypeaheadSelect__option")
    .filter({ hasText: new RegExp(`Add.*${escapeRegExp(trimmed)}`, "i") });
  if (await addOption.first().isVisible().catch(() => false)) {
    await addOption.first().click();
  } else {
    const exactOption = page
      .locator(".TypeaheadSelect__option")
      .filter({ hasText: new RegExp(`^${escapeRegExp(trimmed)}`, "i") });
    if (await exactOption.first().isVisible().catch(() => false)) {
      await exactOption.first().click();
    } else if (trimmed.toUpperCase() === "TBD") {
      const tbdOption = page.locator(".TypeaheadSelect__option").filter({ hasText: /^TBD/i });
      if (await tbdOption.first().isVisible().catch(() => false)) {
        await tbdOption.first().click();
      } else {
        const options = await readDropdownOptions(page);
        throw new Error(`Location "TBD" was not found in the GameChanger dropdown (${options.slice(0, 5).join(", ")}).`);
      }
    } else {
      const options = await readDropdownOptions(page);
      throw new Error(
        `Location "${trimmed}" was not found in the GameChanger dropdown (${options.slice(0, 5).join(", ")}).`,
      );
    }
  }

  await page.keyboard.press("Tab").catch(() => undefined);
  await page.waitForTimeout(200);

  const committed = (await location.inputValue().catch(() => "")).trim();
  if (!committed) {
    throw new Error(`Location "${trimmed}" was not committed in the GameChanger form.`);
  }
}
