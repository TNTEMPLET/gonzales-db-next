import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { SCOUT_MAILBOX } from "@/lib/scout/config";
import { formatScoutWhen } from "@/lib/scout/formatWhen";
import { scoutFilterPublishAction, scoutSenderAfterLanding, scoutTicketsHref } from "@/lib/scout/links";
import {
  scoutFilteredAttentionWhere,
  scoutFiltersActive,
  scoutTicketListSummary,
  scoutTicketListWhere,
} from "@/lib/scout/listQuery";
import { readScoutSaveFeedback, rememberScoutSaveFeedback } from "@/lib/scout/saveFeedback";
import { parseScoutListFilters } from "@/lib/scout/ticketPatch";
import { ScoutEmailOff, scoutMessageMeta, scoutTicketListMeta } from "@/lib/scout/visibleHtml";

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

  it("publishes again when a landing is not the sender in the box", () => {
    assert.equal(
      scoutSenderAfterLanding({ typedSender: "beta", appliedSender: "", debouncePending: false }),
      "replace",
    );
    assert.equal(
      scoutSenderAfterLanding({ typedSender: "beta", appliedSender: "", debouncePending: true }),
      "none",
    );
    assert.equal(
      scoutSenderAfterLanding({ typedSender: "beta", appliedSender: "beta", debouncePending: false }),
      "none",
    );
    assert.equal(
      scoutSenderAfterLanding({ typedSender: "", appliedSender: "", debouncePending: false }),
      "none",
    );
  });
});

function renderEmailOff(text: string): string {
  return renderToStaticMarkup(
    createElement(
      ScoutEmailOff,
      null,
      createElement("h2", null, text),
      createElement("p", null, "synthetic.sender.beta@impact-sports.net"),
    ),
  );
}

/** HTML between the two Cloudflare markers, excluding those marker comments. */
function betweenEmailOff(html: string): string {
  const open = "<!--email_off-->";
  const close = "<!--/email_off-->";
  const openAt = html.indexOf(open);
  const closeAt = html.indexOf(close);
  assert.equal(openAt >= 0, true);
  assert.equal(html.indexOf(open, openAt + open.length), -1);
  assert.ok(closeAt > openAt);
  assert.equal(html.indexOf(close, closeAt + close.length), -1);
  return html.slice(openAt + open.length, closeAt);
}

describe("scout visible text", () => {
  it("keeps an email in one string inside the Cloudflare opt-out", () => {
    const when = formatScoutWhen("2026-10-07T21:05:00.000Z");
    const meta = scoutTicketListMeta({
      senderName: "Synthetic Sender Beta",
      senderEmail: "synthetic.sender.beta@impact-sports.net",
      when,
      orgLabel: "Gonzales",
    });
    assert.equal(
      meta,
      `Synthetic Sender Beta · synthetic.sender.beta@impact-sports.net · ${when} · Gonzales`,
    );
    assert.equal(
      scoutMessageMeta({
        senderName: "Synthetic Sender Beta",
        senderEmail: "synthetic.sender.beta@impact-sports.net",
        when,
      }),
      `Synthetic Sender Beta · synthetic.sender.beta@impact-sports.net · ${when}`,
    );
    assert.equal(
      scoutTicketListMeta({
        senderName: null,
        senderEmail: "synthetic.sender.alpha@apbaseball.com",
        when,
        orgLabel: null,
      }),
      `synthetic.sender.alpha@apbaseball.com · ${when}`,
    );

    const markup = renderToStaticMarkup(createElement(ScoutEmailOff, null, createElement("span", null, meta)));
    const inside = betweenEmailOff(markup);
    assert.match(inside, /synthetic\.sender\.beta@impact-sports\.net/);
    const outside = markup.replace(/<!--email_off-->[\s\S]*<!--\/email_off-->/, "");
    assert.equal(outside.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g), null);
  });

  it("renders hostile ticket text as text, not markup", () => {
    const hostile = [
      "-->",
      "<!--/email_off-->",
      "<!--email_off-->",
      '<script>alert("x")</script>',
      "<img src=x onerror=alert(1)>",
      '" onmouseover="alert(1)',
      "'><svg/onload=alert(1)>",
      "&lt;script&gt;",
      "</span><script>alert(1)</script>",
      "a&b<c>d\"e'f",
      "café@exämple.com",
      "\u003cscript\u003ealert(1)\u003c/script\u003e",
      "＜script＞alert(1)＜/script＞",
      "\u202Esynthetic.sender.gamma@apbaseball.com",
      "\u0000",
    ].join("\n");

    const html = renderEmailOff(hostile);
    const inside = betweenEmailOff(html);
    assert.equal(inside.includes("<script"), false);
    assert.equal(inside.includes("<img"), false);
    assert.equal(inside.includes("<svg"), false);
    assert.equal(/<\w+[^>]*\son\w+\s*=/i.test(inside), false);
    assert.match(inside, /&lt;script&gt;/);
    assert.match(inside, /&lt;img/);
    assert.match(inside, /&amp;lt;script&amp;gt;/);
    assert.match(inside, /&amp;/);
    assert.match(inside, /&lt;/);
    assert.match(inside, /&gt;/);
    assert.match(inside, /&quot;/);
    assert.match(inside, /&#x27;/);
    assert.match(inside, /café@exämple\.com/);
    assert.match(inside, /＜script＞alert\(1\)＜\/script＞/);
    assert.match(inside, /synthetic\.sender\.beta@impact-sports\.net/);
    assert.match(inside, /synthetic\.sender\.gamma@apbaseball\.com/);
    assert.ok(html.indexOf("synthetic.sender.beta@impact-sports.net") < html.indexOf("<!--/email_off-->"));
    assert.equal(html.split("<!--").length, 3);
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
