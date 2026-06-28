import type { Page } from "playwright";

import { GC_BASE } from "./browserSession.js";

export async function captureGcToken(page: Page, orgId: string): Promise<string> {
  let token = "";

  const onRequest = (request: { headers: () => Record<string, string> }) => {
    const value = request.headers()["gc-token"];
    if (value?.trim()) token = value.trim();
  };

  page.on("request", onRequest);
  try {
    await page.goto(`${GC_BASE}/organizations/${orgId}/schedule`, {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });
    await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => undefined);

    if (!token) {
      await page.goto(`${GC_BASE}/organizations/${orgId}/home`, {
        waitUntil: "domcontentloaded",
        timeout: 60_000,
      });
      await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => undefined);
    }
  } finally {
    page.off("request", onRequest);
  }

  if (!token) {
    throw new Error("Could not capture gc-token from the GameChanger browser session.");
  }

  return token;
}
