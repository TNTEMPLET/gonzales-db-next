import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  apiErrorMessage,
  formatClientFetchError,
  projectStatusLabel,
  sortProjectsForAdmin,
  type ProjectRowLike,
} from "../adminUiHelpers";

function row(
  partial: Partial<ProjectRowLike> & Pick<ProjectRowLike, "id" | "name">,
): ProjectRowLike {
  return {
    status: "DRAFT",
    priority: 0,
    seasonYear: 2026,
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...partial,
  };
}

describe("bracket adminUiHelpers", () => {
  it("labels project status", () => {
    assert.equal(projectStatusLabel("READY"), "Live");
    assert.equal(projectStatusLabel("DRAFT"), "Draft");
  });

  it("sorts by name and priority", () => {
    const projects = [
      row({ id: "1", name: "Zulu", priority: 2, status: "DRAFT" }),
      row({ id: "2", name: "Alpha", priority: 1, status: "READY" }),
      row({ id: "3", name: "Beta", priority: 1, status: "DRAFT" }),
    ];
    const byName = sortProjectsForAdmin(projects, "name", "asc");
    assert.deepEqual(
      byName.map((p) => p.name),
      ["Alpha", "Beta", "Zulu"],
    );
    const byPriority = sortProjectsForAdmin(projects, "priority", "asc");
    assert.equal(byPriority[0]?.priority, 1);
  });

  it("formats API and fetch errors", () => {
    assert.equal(
      apiErrorMessage({ error: "Nope", hint: "try again" }, "fail"),
      "Nope — try again",
    );
    assert.equal(
      formatClientFetchError(new Error("fetch failed"), "fallback"),
      "Could not reach the server (connection lost or timed out). Wait a few seconds and use Retry, or refresh the page.",
    );
  });
});
