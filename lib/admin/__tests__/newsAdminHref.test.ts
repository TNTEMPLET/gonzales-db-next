import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  adminNewsLoginPath,
  adminNewsPath,
  legacyNewsAdminRedirectPath,
} from "@/lib/admin/newsAdminHref";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const LIVE_ROOTS = ["app", "components", "lib", "scripts"];
const SOURCE_EXT = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);
const LEGACY_NEWS_ADMIN = "/news" + "/admin";
const ALLOWED_RELATIVE = new Set([
  "app/news/admin/page.tsx",
  "lib/admin/__tests__/newsAdminHref.test.ts",
]);

function collectSourceFiles(dir: string, acc: string[]) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectSourceFiles(full, acc);
    } else if (SOURCE_EXT.has(path.extname(entry.name))) {
      acc.push(full);
    }
  }
  return acc;
}

describe("legacy news admin redirect", () => {
  it("sends /news/admin to /admin/news", () => {
    assert.equal(legacyNewsAdminRedirectPath({}), "/admin/news");
    assert.equal(
      legacyNewsAdminRedirectPath(new URLSearchParams()),
      "/admin/news",
    );
  });

  it("keeps org on /news/admin?org=llb", () => {
    assert.equal(legacyNewsAdminRedirectPath({ org: "llb" }), "/admin/news?org=llb");
    assert.equal(
      legacyNewsAdminRedirectPath(new URL("http://localhost/news/admin?org=llb").searchParams),
      "/admin/news?org=llb",
    );
  });

  it("keeps edit and org on /news/admin?edit=some-slug&org=fallball", () => {
    assert.equal(
      legacyNewsAdminRedirectPath({ edit: "some-slug", org: "fallball" }),
      "/admin/news?edit=some-slug&org=fallball",
    );
    assert.equal(
      legacyNewsAdminRedirectPath(
        new URL("http://localhost/news/admin?edit=some-slug&org=fallball").searchParams,
      ),
      "/admin/news?edit=some-slug&org=fallball",
    );
  });

  it("drops empty and unrelated query params", () => {
    assert.equal(
      legacyNewsAdminRedirectPath({ org: "  ", edit: "", denied: "news" }),
      "/admin/news",
    );
    assert.equal(
      legacyNewsAdminRedirectPath({ org: ["", "gonzales"], edit: "draft-1", tab: "teams" }),
      "/admin/news?org=gonzales&edit=draft-1",
    );
  });

  it("sends signed-out visitors back to /admin/news with org and edit", () => {
    const destination = adminNewsPath({ org: "fallball", edit: "some-slug" });
    assert.equal(destination, "/admin/news?org=fallball&edit=some-slug");
    const login = adminNewsLoginPath({ org: "fallball", edit: "some-slug" });
    const next = new URL(`http://localhost${login}`).searchParams.get("next");
    assert.equal(next, destination);
    assert.equal(adminNewsLoginPath({ org: "llb" }), `/admin/login?next=${encodeURIComponent("/admin/news?org=llb")}`);
  });

  it("has no live source link to the legacy news admin path except the redirect page", () => {
    const hits: string[] = [];
    for (const root of LIVE_ROOTS) {
      for (const file of collectSourceFiles(path.join(repoRoot, root), [])) {
        const relative = path.relative(repoRoot, file).split(path.sep).join("/");
        if (ALLOWED_RELATIVE.has(relative)) continue;
        const text = readFileSync(file, "utf8");
        if (text.includes(LEGACY_NEWS_ADMIN)) hits.push(relative);
      }
    }
    assert.deepEqual(hits, []);
  });
});
