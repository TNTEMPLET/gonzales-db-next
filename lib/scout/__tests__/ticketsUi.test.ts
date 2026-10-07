import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { SCOUT_MAILBOX } from "@/lib/scout/config";
import { formatScoutWhen } from "@/lib/scout/formatWhen";
import { scoutFilterPublishAction, scoutTicketsHref } from "@/lib/scout/links";
import {
  scoutFilteredAttentionWhere,
  scoutFiltersActive,
  scoutTicketListSummary,
  scoutTicketListWhere,
} from "@/lib/scout/listQuery";
import { readScoutSaveFeedback, rememberScoutSaveFeedback } from "@/lib/scout/saveFeedback";
import { parseScoutListFilters } from "@/lib/scout/ticketPatch";

describe("scout timestamps", () => {
  it("formats Central time with a normal space before AM/PM", () => {
    const afternoon = formatScoutWhen("2026-10-07T21:05:00.000Z");
    assert.equal(afternoon, "Oct 7, 4:05 PM");
    assert.equal(formatScoutWhen("2026-01-15T06:00:00.000Z"), "Jan 15, 12:00 AM");
    assert.equal(formatScoutWhen("2026-07-04T17:30:00.000Z"), "Jul 4, 12:30 PM");
    assert.equal(formatScoutWhen("2026-03-08T07:59:00.000Z"), "Mar 8, 1:59 AM");
    assert.equal(formatScoutWhen("2026-03-08T08:00:00.000Z"), "Mar 8, 3:00 AM");
    assert.equal(formatScoutWhen("2026-11-01T06:30:00.000Z"), "Nov 1, 1:30 AM");
    assert.equal(formatScoutWhen("2026-11-01T07:30:00.000Z"), "Nov 1, 1:30 AM");
    assert.equal(formatScoutWhen("2026-11-01T08:30:00.000Z"), "Nov 1, 2:30 AM");
    assert.equal(formatScoutWhen(null), "never");
    assert.equal(formatScoutWhen("not-a-date"), "never");
    assert.equal(
      [...afternoon].every((char) => (char.codePointAt(0) ?? 0) < 128),
      true,
    );
  });
});

describe("scout ticket links", () => {
  it("keeps the admin shell org separate from the Scout org tag", () => {
    const href = scoutTicketsHref({
      shellOrg: "fallball",
      status: "all",
      orgTag: "gonzales",
      sender: " synthetic.sender.alpha@apbaseball.com ",
      ticketId: "synthetic-ticket",
    });
    const url = new URL(href, "https://admin.example");
    assert.equal(url.searchParams.get("org"), "fallball");
    assert.equal(url.searchParams.get("orgTag"), "gonzales");
    assert.equal(url.searchParams.get("status"), null);
    assert.equal(url.searchParams.get("sender"), "synthetic.sender.alpha@apbaseball.com");
    assert.equal(url.searchParams.get("ticket"), "synthetic-ticket");
    assert.equal(
      parseScoutListFilters({
        status: url.searchParams.get("status"),
        orgTag: url.searchParams.get("orgTag"),
        sender: url.searchParams.get("sender"),
      }).orgTag,
      "gonzales",
    );
  });

  it("replaces a filter that was reverted while the previous navigation is in flight", () => {
    const applied = scoutTicketsHref({
      shellOrg: "fallball",
      status: "all",
      orgTag: "all",
      sender: "",
    });
    const inFlight = scoutTicketsHref({
      shellOrg: "fallball",
      status: "NEW",
      orgTag: "all",
      sender: "",
    });
    assert.equal(scoutFilterPublishAction({ desired: inFlight, applied, inFlight: null }), "replace");
    assert.equal(scoutFilterPublishAction({ desired: inFlight, applied, inFlight }), "none");
    assert.equal(scoutFilterPublishAction({ desired: applied, applied, inFlight }), "replace");
    assert.equal(scoutFilterPublishAction({ desired: applied, applied, inFlight: null }), "none");
    assert.equal(scoutFilterPublishAction({ desired: applied, applied, inFlight: applied }), "none");
  });
});

describe("scout list summary", () => {
  it("counts new or open inside the active filters", () => {
    const filtered = scoutFilteredAttentionWhere({
      status: "all",
      orgTag: "gonzales",
      sender: "synthetic.sender",
    });
    assert.deepEqual(filtered, {
      mailbox: SCOUT_MAILBOX,
      status: { in: ["NEW", "OPEN"] },
      orgTag: "gonzales",
      senderEmail: { contains: "synthetic.sender", mode: "insensitive" },
    });
    assert.equal(
      scoutFilteredAttentionWhere({ status: "DONE", orgTag: "all", sender: "" }),
      null,
    );
    assert.equal(scoutTicketListWhere({ status: "NEW", orgTag: "all", sender: "" }).status, "NEW");
    assert.equal(scoutFiltersActive({ status: "all", orgTag: "all", sender: "" }), false);
    assert.equal(scoutFiltersActive({ status: "all", orgTag: "none", sender: "" }), true);
    assert.equal(
      scoutTicketListSummary({ ticketCount: 12, attentionCount: 8, filtersActive: false }),
      "12 tickets · 8 new or open",
    );
    assert.equal(
      scoutTicketListSummary({ ticketCount: 4, attentionCount: 2, filtersActive: true }),
      "4 tickets · 2 new or open in this view",
    );
    assert.equal(
      scoutTicketListSummary({ ticketCount: 1, attentionCount: 0, filtersActive: true }),
      "1 ticket",
    );
  });
});

describe("scout save feedback", () => {
  it("remembers a confirmation for the ticket that was saved", () => {
    rememberScoutSaveFeedback("synthetic-ticket", { tone: "ok", text: "Saved" });
    assert.deepEqual(readScoutSaveFeedback("synthetic-ticket"), { tone: "ok", text: "Saved" });
    rememberScoutSaveFeedback("synthetic-ticket", null);
    assert.equal(readScoutSaveFeedback("synthetic-ticket"), null);
  });
});
