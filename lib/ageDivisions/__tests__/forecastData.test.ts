import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../..");

describe("forecast loader source", () => {
  it("stays server-only and never writes", () => {
    const source = readFileSync(path.join(here, "../forecastData.ts"), "utf8");
    assert.match(source, /import "server-only"/);
    assert.doesNotMatch(source, /\.(create|update|delete|upsert|createMany|updateMany|deleteMany)\s*\(/);
    assert.doesNotMatch(source, /guardianEmail|contactPhone|rawRow/);

    const index = readFileSync(path.join(here, "../index.ts"), "utf8");
    assert.equal(index.includes("forecastData"), false);
  });

  it("gates the route on DIVISION_AGES and resolves the org from the query", () => {
    const route = readFileSync(
      path.join(repoRoot, "app/api/admin/division-ages/forecast/route.ts"),
      "utf8",
    );
    assert.match(route, /ensureAdminModule\(request, "DIVISION_AGES"\)/);
    assert.match(route, /resolveAdminTargetOrg/);
    assert.match(route, /forecastAuthFailure/);
    assert.match(route, /runDivisionForecast/);
    assert.doesNotMatch(route, /\.(create|update|delete|upsert)\s*\(/);
  });
});

describe("forecast loader behavior", () => {
  it("runs the loader cases with the server-only import allowed", () => {
    const tsx = path.join(repoRoot, "node_modules", ".bin", "tsx");
    const cases = path.join(here, "forecastData.cases.ts");
    const env = { ...process.env };
    delete env.NODE_TEST_CONTEXT;
    delete env.NODE_TEST_WORKER_ID;
    const result = spawnSync(tsx, ["--conditions=react-server", "--test", cases], {
      cwd: repoRoot,
      encoding: "utf8",
      env,
      timeout: 120000,
    });
    const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
    assert.equal(result.status, 0, output.slice(-12000));
    assert.match(output, /fail 0/);
    assert.match(output, /pass [1-9]/);
  });
});
