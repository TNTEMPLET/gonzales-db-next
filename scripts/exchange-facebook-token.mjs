#!/usr/bin/env node
/**
 * Local-only helper: exchange a short-lived User access token for a long-lived User token,
 * then list Pages via /me/accounts so you can copy FACEBOOK_PAGE_ID and FACEBOOK_PAGE_ACCESS_TOKEN.
 *
 * Docs: https://developers.facebook.com/docs/facebook-login/guides/access-tokens/get-long-lived
 *
 * Setup in .env.local (do not commit):
 *   FACEBOOK_APP_ID
 *   FACEBOOK_APP_SECRET   ← must be the App Secret from Meta Basic settings, NOT an access token
 *   FACEBOOK_SHORT_LIVED_USER_TOKEN  ← from Graph API Explorer (User token with pages_show_list, pages_manage_posts)
 *
 * Run from repo root:
 *   node scripts/exchange-facebook-token.mjs
 *
 * Or: node --env-file=.env.local scripts/exchange-facebook-token.mjs
 *
 * Remove FACEBOOK_SHORT_LIVED_USER_TOKEN from .env.local after use.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const GRAPH_VERSION = "v21.0";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

function loadDotenvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const raw = fs.readFileSync(filePath, "utf8");
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

function looksLikeAccessToken(value) {
  return /^EAA[A-Za-z0-9_-]{20,}/.test(value || "");
}

async function graphGet(url) {
  const res = await fetch(url);
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg =
      json?.error?.message ||
      (typeof json?.error === "string" ? json.error : null) ||
      res.statusText;
    throw new Error(`${res.status} ${msg}`);
  }
  return json;
}

async function main() {
  loadDotenvFile(path.join(ROOT, ".env.local"));
  loadDotenvFile(path.join(ROOT, ".env"));

  const appId = process.env.FACEBOOK_APP_ID?.trim();
  const appSecret = process.env.FACEBOOK_APP_SECRET?.trim();
  const shortUser = process.env.FACEBOOK_SHORT_LIVED_USER_TOKEN?.trim();

  if (!appId || !appSecret) {
    console.error(
      "Missing FACEBOOK_APP_ID or FACEBOOK_APP_SECRET in environment or .env.local",
    );
    process.exit(1);
  }

  if (looksLikeAccessToken(appSecret)) {
    console.error(
      "FACEBOOK_APP_SECRET looks like an access token (starts with EAA…).",
      "Use the App Secret from Meta → App settings → Basic, not a User/Page token.",
    );
    process.exit(1);
  }

  if (!shortUser) {
    console.error(
      "Missing FACEBOOK_SHORT_LIVED_USER_TOKEN.\n",
      "Add a short-lived User token from Graph API Explorer with pages_show_list and pages_manage_posts,",
      "then run this script again. Remove that variable after you are done.",
    );
    process.exit(1);
  }

  console.log("Exchanging short-lived User token for long-lived User token…\n");

  const exchangeParams = new URLSearchParams({
    grant_type: "fb_exchange_token",
    client_id: appId,
    client_secret: appSecret,
    fb_exchange_token: shortUser,
  });

  const exchangeUrl = `https://graph.facebook.com/${GRAPH_VERSION}/oauth/access_token?${exchangeParams}`;
  let longUser;
  try {
    longUser = await graphGet(exchangeUrl);
  } catch (e) {
    console.error("Exchange failed:", e.message);
    process.exit(1);
  }

  const longUserToken = longUser.access_token;
  if (!longUserToken) {
    console.error("Unexpected response:", JSON.stringify(longUser, null, 2));
    process.exit(1);
  }

  const expiresIn = longUser.expires_in;
  console.log("Long-lived User token obtained.");
  if (expiresIn != null) {
    console.log(`  expires_in (seconds): ${expiresIn} (~${Math.round(expiresIn / 86400)} days)\n`);
  } else {
    console.log("");
  }

  console.log("Fetching Pages (me/accounts)…\n");

  const accountsParams = new URLSearchParams({
    access_token: longUserToken,
    fields: "id,name,access_token,category,tasks",
  });
  const accountsUrl = `https://graph.facebook.com/${GRAPH_VERSION}/me/accounts?${accountsParams}`;

  let accounts;
  try {
    accounts = await graphGet(accountsUrl);
  } catch (e) {
    console.error("me/accounts failed:", e.message);
    process.exit(1);
  }

  const data = accounts.data;
  if (!Array.isArray(data) || data.length === 0) {
    console.log("No Pages returned. Check that your User token has pages_show_list and that this Facebook user manages at least one Page.");
    process.exit(0);
  }

  console.log("Add these to .env.local for the Social media module (pick the right Page):\n");
  console.log("--- copy below ---\n");

  for (const page of data) {
    const id = page.id;
    const name = page.name || "(unnamed)";
    const pageToken = page.access_token;
    if (!pageToken) {
      console.error(`# ${name} (${id}) — no access_token in API response; regenerate User token with pages_show_list.`);
      console.log("");
      continue;
    }

    const verifyUrl = `https://graph.facebook.com/${GRAPH_VERSION}/me?fields=id,name&access_token=${encodeURIComponent(pageToken)}`;
    try {
      const me = await graphGet(verifyUrl);
      if (String(me.id) !== String(id)) {
        console.error(
          `# ${name} — token mismatch: /me returned id ${me.id} (expected Page ${id}). Do not use the User token from Explorer; use access_token inside this Page object in me/accounts.`,
        );
        console.log("");
        continue;
      }
    } catch (e) {
      console.error(`# ${name} — could not verify Page token: ${e.message}`);
      console.log("");
      continue;
    }

    console.log(`# ${name}`);
    console.log(`FACEBOOK_PAGE_ID=${id}`);
    console.log(`FACEBOOK_PAGE_ACCESS_TOKEN=${pageToken}`);
    console.log("");
  }

  console.log("--- end copy ---\n");
  console.log(
    "Use the Page token above (from me/accounts), not the User token in Graph Explorer’s sidebar.",
    "GET /me with a Page token returns that Page; with a User token it returns your User.",
  );
  console.log(
    "Security: remove FACEBOOK_SHORT_LIVED_USER_TOKEN from .env.local.",
    "Do not commit tokens. Rotate App Secret if it was ever set to a token by mistake.",
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
