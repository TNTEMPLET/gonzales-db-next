import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  applyTripInviteTemplate,
  DEFAULT_TRIP_INVITE_BODY,
  DEFAULT_TRIP_INVITE_SUBJECT,
} from "@/lib/trip/inviteEmailTemplates";

describe("applyTripInviteTemplate", () => {
  it("replaces merge fields", () => {
    const out = applyTripInviteTemplate(
      "Hi {{guardian_first_name}} — {{player_name}} {{invite_url}}",
      {
        player_name: "Alex Rivera",
        player_first_name: "Alex",
        guardian_name: "Pat Rivera",
        guardian_first_name: "Pat",
        event_name: "SW Regional",
        team_label: "10U",
        org_name: "Ascension",
        invite_url: "https://example.com/trip/TR-abc",
      },
    );
    assert.equal(out, "Hi Pat — Alex Rivera https://example.com/trip/TR-abc");
  });

  it("default templates include invite_url and player_name", () => {
    assert.match(DEFAULT_TRIP_INVITE_SUBJECT, /\{\{player_name\}\}/);
    assert.match(DEFAULT_TRIP_INVITE_BODY, /\{\{invite_url\}\}/);
  });
});
