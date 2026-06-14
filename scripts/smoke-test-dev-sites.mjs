#!/usr/bin/env node
/**
 * Smoke-test dev sites: page loads + authenticated admin APIs.
 * Usage: node scripts/smoke-test-dev-sites.mjs [--base http://192.168.100.156]
 */

const BASE_HOST = process.argv.includes("--base")
  ? process.argv[process.argv.indexOf("--base") + 1]
  : "http://192.168.100.156";

const SITES = [
  { name: "gonzales", port: 3000, org: "gonzales" },
  { name: "ascension", port: 3001, org: "ascension" },
  { name: "master", port: 3002, org: null },
  { name: "ladistrict2", port: 3003, org: "ladistrict2" },
];

const PUBLIC_PATHS = ["/", "/admin/login", "/news", "/scores", "/teams"];

const ADMIN_PATHS = [
  "/admin",
  "/admin/teams",
  "/admin/scores",
  "/admin/all-star",
  "/admin/payments",
  "/admin/cap-orders",
  "/admin/sponsors",
  "/admin/users",
  "/admin/reports",
  "/admin/alerts",
  "/admin/dugout",
  "/admin/social",
  "/admin/documents",
  "/admin/assignr",
  "/admin/communications",
  "/admin/tournament-brackets",
  "/admin/park-info",
  "/news/admin",
];

const ADMIN_APIS = [
  "/api/admin/me",
  "/api/admin/all-star/payments/all-orgs",
  "/api/admin/all-star/cycles?organizationId=gonzales",
];

const EMAIL = process.env.SMOKE_EMAIL ?? "smoke-test@apbaseball.com";
const PASSWORD = process.env.SMOKE_PASSWORD ?? "SmokeTest-Dev-2026!";

function siteBase(port) {
  return `${BASE_HOST}:${port}`;
}

function orgQuery(org, path) {
  if (!org || org === "ladistrict2") return path;
  if (path.includes("?")) return `${path}&org=${org}`;
  if (
    path.startsWith("/admin/payments") ||
    path.startsWith("/admin/cap-orders") ||
    path.startsWith("/admin/teams") ||
    path.startsWith("/admin/scores") ||
    path.startsWith("/admin/all-star") ||
    path.startsWith("/admin/sponsors") ||
    path.startsWith("/admin/users") ||
    path.startsWith("/admin/reports") ||
    path.startsWith("/admin/alerts") ||
    path.startsWith("/admin/dugout") ||
    path.startsWith("/admin/communications") ||
    path.startsWith("/news/admin")
  ) {
    return `${path}?org=${org === "master" ? "gonzales" : org}`;
  }
  return path;
}

async function fetchTimed(url, opts = {}) {
  const started = Date.now();
  try {
    const res = await fetch(url, { redirect: "manual", ...opts });
    const ms = Date.now() - started;
    let bodySnippet = "";
    if (res.status >= 500) {
      bodySnippet = (await res.text()).slice(0, 120).replace(/\s+/g, " ");
    }
    return { ok: res.ok || (res.status >= 300 && res.status < 400), status: res.status, ms, bodySnippet, res };
  } catch (err) {
    return { ok: false, status: 0, ms: Date.now() - started, error: err.message };
  }
}

async function login(port) {
  const base = siteBase(port);
  const form = new URLSearchParams({
    email: EMAIL,
    password: PASSWORD,
    next: "/admin",
  });
  const res = await fetch(`${base}/api/admin/login/redirect`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
    redirect: "manual",
  });
  const setCookie = res.headers.getSetCookie?.() ?? [];
  const cookie = setCookie
    .map((c) => c.split(";")[0])
    .filter((c) => c.startsWith("gdb_admin_session="))
    .join("; ");
  return cookie;
}

function statusLabel(r) {
  if (r.error) return `ERR ${r.error}`;
  if (r.status >= 500) return `FAIL ${r.status}${r.bodySnippet ? ` (${r.bodySnippet})` : ""}`;
  if (r.status >= 400) return `FAIL ${r.status}`;
  if (r.status >= 300 && r.status < 400) return `REDIR ${r.status}`;
  return `OK ${r.status}`;
}

async function main() {
  console.log(`Smoke test host: ${BASE_HOST}`);
  console.log(`Login: ${EMAIL}\n`);

  const summary = { pass: 0, fail: 0, warn: 0, rows: [] };

  function record(site, kind, path, result, note = "") {
    const label = statusLabel(result);
    const fail = label.startsWith("FAIL") || label.startsWith("ERR");
    const warn = label.startsWith("REDIR") && kind === "api";
    if (fail) summary.fail += 1;
    else if (warn) summary.warn += 1;
    else summary.pass += 1;
    summary.rows.push({ site, kind, path, label, ms: result.ms, note, fail, warn });
    const icon = fail ? "✗" : warn ? "!" : "✓";
    console.log(`${icon} [${site}] ${kind} ${path} → ${label} (${result.ms}ms)${note ? ` — ${note}` : ""}`);
  }

  for (const site of SITES) {
    const base = siteBase(site.port);
    console.log(`\n=== ${site.name} (${base}) ===`);

    for (const path of PUBLIC_PATHS) {
      if (site.name === "ladistrict2" && (path === "/teams" || path === "/scores")) continue;
      const r = await fetchTimed(`${base}${path}`);
      record(site.name, "page", path, r);
    }

    let cookie = "";
    try {
      cookie = await login(site.port);
    } catch (err) {
      record(site.name, "auth", "login", { ok: false, status: 0, ms: 0, error: String(err.message) });
      continue;
    }
    if (!cookie) {
      record(site.name, "auth", "login", { ok: false, status: 0, ms: 0, error: "no session cookie" });
      continue;
    }
    record(site.name, "auth", "login", { ok: true, status: 303, ms: 0 });

    for (const path of ADMIN_PATHS) {
      if (site.name !== "master" && path === "/admin/tournament-brackets") continue;
      if (site.name === "ladistrict2") continue;
      const fullPath = orgQuery(site.org ?? "gonzales", path);
      const r = await fetchTimed(`${base}${fullPath}`, {
        headers: { Cookie: cookie },
      });
      record(site.name, "admin-page", fullPath, r);
    }

    for (const api of ADMIN_APIS) {
      if (site.name !== "master" && api.includes("all-orgs")) continue;
      if (site.name === "ladistrict2") continue;
      const r = await fetchTimed(`${base}${api}`, { headers: { Cookie: cookie } });
      let note = "";
      if (r.res && r.ok) {
        try {
          const json = await r.res.json();
          if (api.includes("all-orgs")) {
            note = `orgs=${json.orgs?.length ?? "?"} grandTotal=${json.grandTotals?.total ?? "?"}`;
          } else if (api.includes("/me")) {
            note = json.authenticated ? `role=${json.user?.role}` : "not authed";
          }
        } catch {
          note = "invalid json";
        }
      }
      record(site.name, "api", api, r, note);
    }
  }

  console.log("\n=== SUMMARY ===");
  console.log(`Pass: ${summary.pass}  Warn: ${summary.warn}  Fail: ${summary.fail}`);
  const failures = summary.rows.filter((r) => r.fail);
  if (failures.length) {
    console.log("\nFailures:");
    for (const f of failures) {
      console.log(`  - [${f.site}] ${f.kind} ${f.path} → ${f.label}`);
    }
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
