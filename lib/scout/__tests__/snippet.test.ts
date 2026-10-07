import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { SCOUT_MAILBOX, SCOUT_SNIPPET_MAX } from "@/lib/scout/config";
import { planScoutMessage } from "@/lib/scout/plan";
import {
  decodeGmailEntities,
  scoutDisplaySnippet,
  toScoutSnippet,
} from "@/lib/scout/snippet";
import { ScoutEmailOff } from "@/lib/scout/visibleHtml";

const HOSTILE = "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &#39;a&amp;b&#39;";
const HOSTILE_PLAIN = `<script>alert("x")</script> 'a&b'`;

function rendered(text: string): string {
  return renderToStaticMarkup(createElement(ScoutEmailOff, null, createElement("p", null, text)));
}

describe("gmail snippet text", () => {
  it("decodes entities before the 200-character cap", () => {
    assert.equal(toScoutSnippet(HOSTILE), HOSTILE_PLAIN);
    assert.equal(toScoutSnippet("Score &lt; 5 &amp; &#39;ok&#39;"), "Score < 5 & 'ok'");
    assert.equal(decodeGmailEntities("&amp;lt;script&amp;gt;"), "&lt;script&gt;");
    assert.equal(toScoutSnippet("&#60;script&#62;"), "<script>");
    assert.equal(toScoutSnippet("&#x3C;script&#x3E;"), "<script>");

    const encoded = "&amp;".repeat(SCOUT_SNIPPET_MAX + 5);
    const clipped = toScoutSnippet(encoded);
    assert.equal(clipped, `${"&".repeat(SCOUT_SNIPPET_MAX - 1)}…`);
    assert.equal(clipped.includes("&amp;"), false);
  });

  it("stores the decoded snippet from a planned message", () => {
    const plan = planScoutMessage(null, SCOUT_MAILBOX, {
      gmailMessageId: "synthetic-msg-entities",
      gmailThreadId: "synthetic-thread-entities",
      fromEmail: "synthetic.sender.alpha@apbaseball.com",
      fromName: "Synthetic Sender Alpha",
      subject: "Synthetic request",
      receivedAt: new Date("2026-10-07T15:00:00.000Z"),
      snippet: HOSTILE,
      labelIds: ["INBOX"],
      headers: [],
    });
    assert.equal(plan.type, "create");
    if (plan.type !== "create") return;
    assert.equal(plan.snippet, HOSTILE_PLAIN);
    assert.equal(plan.message.snippet, HOSTILE_PLAIN);
  });

  it("renders decoded markup as text inside the email opt-out", () => {
    const stored = toScoutSnippet(HOSTILE);
    const fromLegacyRow = scoutDisplaySnippet(HOSTILE);
    assert.equal(fromLegacyRow, stored);
    assert.equal(scoutDisplaySnippet(stored), stored);

    for (const text of [stored, fromLegacyRow]) {
      const html = rendered(text);
      assert.equal(html.includes("<script"), false);
      assert.equal(html.includes("<img"), false);
      assert.equal(html.includes("&amp;lt;"), false);
      assert.equal(html.includes("&amp;amp;"), false);
      assert.match(html, /&lt;script&gt;alert\(&quot;x&quot;\)&lt;\/script&gt;/);
      assert.match(html, /&#x27;a&amp;b&#x27;/);
      assert.equal(html.includes("<!--email_off-->"), true);
      assert.ok(html.indexOf("&lt;script&gt;") < html.indexOf("<!--/email_off-->"));
    }
  });
});
