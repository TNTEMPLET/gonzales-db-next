import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { SCOUT_ALLOWED_SENDER_DOMAINS, SCOUT_MAILBOX } from "@/lib/scout/config";
import { evaluateScoutSender } from "@/lib/scout/senderRule";

function decision(fromEmail: string, extra?: { labelIds?: string[]; headers?: { name: string; value: string }[] }) {
  return evaluateScoutSender({
    fromEmail,
    labelIds: extra?.labelIds,
    headers: extra?.headers,
  });
}

describe("evaluateScoutSender", () => {
  it("keeps the allowed domains in one config list", () => {
    assert.deepEqual([...SCOUT_ALLOWED_SENDER_DOMAINS], ["apbaseball.com", "impact-sports.net"]);
  });

  it("includes board-style addresses on the allowed domains", () => {
    assert.equal(decision("synthetic.sender.alpha@apbaseball.com").include, true);
    assert.equal(decision("Synthetic.Sender.Beta@Impact-Sports.net").include, true);
    assert.equal(decision("synthetic.sender.gamma+note@apbaseball.com").include, true);
  });

  it("excludes the mailbox owner, sent mail, lists, and automated senders", () => {
    assert.equal(decision(SCOUT_MAILBOX).include, false);
    assert.equal(decision(SCOUT_MAILBOX.toUpperCase()).include, false);
    const [local, domain] = SCOUT_MAILBOX.split("@");
    assert.equal(decision(`${local}+alias@${domain}`).include, false);
    assert.equal(decision(`not${local}@${domain}`).include, true);
    assert.deepEqual(decision("synthetic.sender.alpha@apbaseball.com", { labelIds: ["SENT", "INBOX"] }), {
      include: false,
      reason: "sent mail",
    });
    assert.equal(decision("apboard@apbaseball.com").include, false);
    assert.equal(decision("apboard+daily@apbaseball.com").include, false);
    assert.equal(decision("noreply@apbaseball.com").include, false);
    assert.equal(decision("no-reply@impact-sports.net").include, false);
    assert.equal(decision("do-not-reply@apbaseball.com").include, false);
    assert.equal(decision("notifications@apbaseball.com").include, false);
  });

  it("excludes other domains and lookalike hosts", () => {
    for (const email of [
      "synthetic.sender.alpha@gmail.com",
      "synthetic.sender.alpha@apbaseball.com.example",
      "synthetic.sender.alpha@mail.apbaseball.com",
      "synthetic.sender.alpha@impactsports.net",
      "synthetic.sender.alpha@impact-sports.net.example",
    ]) {
      assert.equal(decision(email).include, false, email);
    }
  });

  it("excludes list and auto-submitted headers", () => {
    const from = "synthetic.sender.alpha@apbaseball.com";
    assert.equal(
      decision(from, { headers: [{ name: "List-Unsubscribe", value: "<mailto:synthetic@example.com>" }] }).include,
      false,
    );
    assert.equal(decision(from, { headers: [{ name: "List-Id", value: "<board.example>" }] }).include, false);
    assert.equal(decision(from, { headers: [{ name: "Precedence", value: "list" }] }).include, false);
    assert.equal(
      decision(from, { headers: [{ name: "Auto-Submitted", value: "auto-generated" }] }).include,
      false,
    );
    assert.equal(decision(from, { headers: [{ name: "Auto-Submitted", value: "no" }] }).include, true);
    assert.equal(
      decision(from, { headers: [{ name: "Sender", value: "apboard@apbaseball.com" }] }).include,
      false,
    );
    assert.equal(
      decision(from, { headers: [{ name: "Sender", value: "noreply@apbaseball.com" }] }).include,
      false,
    );
  });

  it("excludes a missing sender", () => {
    assert.equal(decision("not-an-email").include, false);
    assert.equal(decision("").include, false);
  });
});
