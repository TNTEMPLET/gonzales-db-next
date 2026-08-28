import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  eventHasArchivedVideo,
  eventHasLiveVideo,
  eventWatchLabel,
  gcOrganizationEventFanUrl,
} from "@/lib/gamechanger/gcFanUrls";
import type { GcScoreboardEvent } from "@/lib/gamechanger/types";

const event: GcScoreboardEvent = {
  id: "90ceba19-9801-4237-b9e4-7e934f69d429",
  start_ts: "2026-06-28T17:00:00.000Z",
  home_team: { id: "h1", name: "Home", is_video_live: true },
  away_team: { id: "a1", name: "Away", has_archived_video: true },
};

describe("gcFanUrls", () => {
  it("builds organization event URLs", () => {
    assert.equal(
      gcOrganizationEventFanUrl("nyKveVgqszKT", event.id),
      `https://web.gc.com/organizations/nyKveVgqszKT/schedule/${event.id}`,
    );
  });

  it("detects live and archived video flags", () => {
    assert.equal(eventHasLiveVideo(event), true);
    assert.equal(eventHasArchivedVideo(event), true);
    assert.equal(eventWatchLabel(event, true), "Watch live on GameChanger");
    assert.equal(eventWatchLabel({ ...event, home_team: { id: "h1", name: "Home" } }, false), "Watch replay on GameChanger");
  });
});
