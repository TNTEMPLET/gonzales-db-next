import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { SCOUT_GMAIL_READONLY_SCOPE, SCOUT_MAILBOX, SCOUT_SNIPPET_MAX } from "@/lib/scout/config";
import { scoutApiAccess, scoutPageAccess } from "@/lib/scout/access";
import { scoutCronAccess } from "@/lib/scout/cronAuth";
import { gmailDelegatedJwtOptions, messageForGmailAuthFailure } from "@/lib/google/gmailServiceAccount";
import { scoutSyntheticSeedBlockReason } from "@/lib/scout/seedGuard";
import { SYNTHETIC_SCOUT_TICKETS } from "@/lib/scout/syntheticFixtures";
import { parseScoutListFilters, parseScoutTicketPatch } from "@/lib/scout/ticketPatch";

const OTHER_ADMIN = "synthetic.admin@apbaseball.com";

describe("scout access", () => {
  it("shows the page only to the mailbox operator on the master deployment", () => {
    assert.equal(scoutPageAccess({ masterDeployment: false, email: SCOUT_MAILBOX }), "not_found");
    assert.equal(scoutPageAccess({ masterDeployment: true, email: null }), "login");
    assert.equal(scoutPageAccess({ masterDeployment: true, email: OTHER_ADMIN }), "not_found");
    assert.equal(scoutPageAccess({ masterDeployment: true, email: SCOUT_MAILBOX }), "allow");
  });

  it("hides the API on other deployments and forbids other admins", () => {
    assert.deepEqual(scoutApiAccess({ masterDeployment: false, email: SCOUT_MAILBOX }), {
      ok: false,
      status: 404,
    });
    assert.deepEqual(scoutApiAccess({ masterDeployment: true, email: null }), { ok: false, status: 401 });
    assert.deepEqual(scoutApiAccess({ masterDeployment: true, email: OTHER_ADMIN }), { ok: false, status: 403 });
    assert.deepEqual(scoutApiAccess({ masterDeployment: true, email: ` ${SCOUT_MAILBOX.toUpperCase()} ` }), { ok: true });
  });
});

describe("scout cron access", () => {
  it("no-ops off master and refuses a missing secret on master", () => {
    assert.deepEqual(
      scoutCronAccess({ orgId: "gonzales", authorizationHeader: null, cronSecret: undefined }),
      { action: "skip" },
    );
    assert.deepEqual(
      scoutCronAccess({ orgId: "fallball", authorizationHeader: "Bearer secret", cronSecret: "secret" }),
      { action: "skip" },
    );
    assert.deepEqual(
      scoutCronAccess({ orgId: "master", authorizationHeader: "Bearer secret", cronSecret: undefined }),
      { action: "deny" },
    );
    assert.deepEqual(
      scoutCronAccess({ orgId: "master", authorizationHeader: "Bearer secret", cronSecret: "   " }),
      { action: "deny" },
    );
    assert.deepEqual(
      scoutCronAccess({ orgId: "master", authorizationHeader: "Bearer wrong", cronSecret: "secret" }),
      { action: "deny" },
    );
    assert.deepEqual(
      scoutCronAccess({ orgId: "master", authorizationHeader: "Bearer secret", cronSecret: "secret" }),
      { action: "run" },
    );
  });
});

describe("gmail delegation", () => {
  it("always sets the mailbox subject and the readonly scope", () => {
    const options = gmailDelegatedJwtOptions({
      client_email: "synthetic-service@example.iam.gserviceaccount.com",
      private_key: "synthetic-key",
    });
    assert.deepEqual(options.scopes, [SCOUT_GMAIL_READONLY_SCOPE]);
    assert.equal(options.subject, SCOUT_MAILBOX);
    assert.equal(SCOUT_GMAIL_READONLY_SCOPE, "https://www.googleapis.com/auth/gmail.readonly");
  });

  it("maps delegation failures to the page message", () => {
    assert.equal(
      messageForGmailAuthFailure(Object.assign(new Error("unauthorized_client"), { response: { status: 401 } })),
      "Gmail access not granted yet",
    );
    assert.equal(messageForGmailAuthFailure(new Error("socket hang up")), "Scout could not reach Gmail.");
  });
});

describe("synthetic seed guard", () => {
  it("refuses production and allows a local database", () => {
    assert.match(
      scoutSyntheticSeedBlockReason({ VERCEL_ENV: "production", DATABASE_URL: "postgresql://localhost/dev" }) ?? "",
      /production/,
    );
    assert.match(
      scoutSyntheticSeedBlockReason({
        DATABASE_URL: "postgresql://user:secret@localhost/app",
        PROD_DATABASE_URL: "postgresql://user:secret@localhost/app",
      }) ?? "",
      /production database/,
    );
    assert.match(
      scoutSyntheticSeedBlockReason({ DATABASE_URL: "postgresql://localhost/prod" }) ?? "",
      /production database/,
    );
    assert.equal(
      scoutSyntheticSeedBlockReason({
        VERCEL_ENV: "preview",
        DATABASE_URL: "postgresql://localhost/apbaseball_dev",
      }),
      null,
    );
    assert.match(
      scoutSyntheticSeedBlockReason(
        { DATABASE_URL: "postgresql://example.db.prisma.io/staging" },
        "script",
      ) ?? "",
      /hosted database/,
    );
    assert.equal(
      scoutSyntheticSeedBlockReason(
        { VERCEL_ENV: "preview", DATABASE_URL: "postgresql://example.db.prisma.io/staging" },
        "admin",
      ),
      null,
    );
    assert.match(
      scoutSyntheticSeedBlockReason(
        { DATABASE_URL: "postgresql://example.db.prisma.io/postgres" },
        "admin",
      ) ?? "",
      /hosted database/,
    );
    assert.equal(
      scoutSyntheticSeedBlockReason({ DATABASE_URL: "postgresql://127.0.0.1:5432/apbaseball_dev" }, "admin"),
      null,
    );
    assert.match(
      scoutSyntheticSeedBlockReason({
        DATABASE_URL: "postgresql://user:secret@db.example:5432/app",
        PROD_DATABASE_URL: "postgresql://user:other@db.example/app?sslmode=require",
      }) ?? "",
      /production database/,
    );
  });

  it("allows hosted staging only when SCOUT_ALLOW_SAMPLE_TICKETS=1, and production still wins", () => {
    const staging = { DATABASE_URL: "postgresql://example.db.prisma.io:5432/staging" };
    assert.equal(
      scoutSyntheticSeedBlockReason({ ...staging, SCOUT_ALLOW_SAMPLE_TICKETS: "1" }, "admin"),
      null,
    );
    assert.match(scoutSyntheticSeedBlockReason(staging, "admin") ?? "", /hosted database/);
    for (const value of ["true", "TRUE", "yes", " 1", "1 ", " 1 ", "1\n", "01"]) {
      assert.match(
        scoutSyntheticSeedBlockReason({ ...staging, SCOUT_ALLOW_SAMPLE_TICKETS: value }, "admin") ?? "",
        /hosted database/,
        value,
      );
    }
    assert.match(
      scoutSyntheticSeedBlockReason({ ...staging, SCOUT_ALLOW_SAMPLE_TICKETS: "" }, "admin") ?? "",
      /hosted database/,
    );
    assert.match(
      scoutSyntheticSeedBlockReason({ ...staging, SCOUT_ALLOW_SAMPLE_TICKETS: "0" }, "admin") ?? "",
      /hosted database/,
    );
    assert.match(
      scoutSyntheticSeedBlockReason({ ...staging, SCOUT_ALLOW_SAMPLE_TICKETS: "1" }, "script") ?? "",
      /hosted database/,
    );
    assert.match(
      scoutSyntheticSeedBlockReason({
        ...staging,
        VERCEL_ENV: "production",
        SCOUT_ALLOW_SAMPLE_TICKETS: "1",
      }) ?? "",
      /production/,
    );
    assert.match(
      scoutSyntheticSeedBlockReason({
        ...staging,
        VERCEL_ENV: " production ",
        SCOUT_ALLOW_SAMPLE_TICKETS: "1",
      }) ?? "",
      /production/,
    );
    assert.match(
      scoutSyntheticSeedBlockReason({
        ...staging,
        VERCEL_ENV: "Production",
        SCOUT_ALLOW_SAMPLE_TICKETS: "1",
      }) ?? "",
      /production/,
    );
    assert.match(
      scoutSyntheticSeedBlockReason({
        DATABASE_URL: "postgresql://user:secret@db.example:5432/app",
        PROD_DATABASE_URL: "postgresql://user:other@db.example/app?sslmode=require",
        SCOUT_ALLOW_SAMPLE_TICKETS: "1",
      }) ?? "",
      /production database/,
    );
    assert.match(
      scoutSyntheticSeedBlockReason({
        DATABASE_URL: "postgresql://user:secret@db.example:5432//App/",
        PROD_DATABASE_URL: "postgres://user:other@DB.example/app",
        SCOUT_ALLOW_SAMPLE_TICKETS: "1",
      }) ?? "",
      /production database/,
    );
    assert.match(
      scoutSyntheticSeedBlockReason({
        DATABASE_URL: "postgresql://db.prod.example/staging",
        SCOUT_ALLOW_SAMPLE_TICKETS: "1",
      }) ?? "",
      /production database/,
    );
    assert.match(
      scoutSyntheticSeedBlockReason({
        DATABASE_URL: "postgresql://example.db.prisma.io/apbaseball_production",
        SCOUT_ALLOW_SAMPLE_TICKETS: "1",
      }) ?? "",
      /production database/,
    );
    assert.match(
      scoutSyntheticSeedBlockReason({
        DATABASE_URL: "postgresql://example.db.prisma.io//apbaseball_production/",
        SCOUT_ALLOW_SAMPLE_TICKETS: "1",
      }) ?? "",
      /production database/,
    );
    assert.equal(
      scoutSyntheticSeedBlockReason({
        VERCEL_ENV: "preview",
        DATABASE_URL: "postgresql://example.db.prisma.io/staging",
      }),
      null,
    );
    assert.equal(
      scoutSyntheticSeedBlockReason({ DATABASE_URL: "postgresql://127.0.0.1:5432/apbaseball_dev" }, "admin"),
      null,
    );
  });

  it("uses synthetic fixtures only", () => {
    const blob = JSON.stringify(SYNTHETIC_SCOUT_TICKETS).toLowerCase();
    assert.equal(blob.includes(SCOUT_MAILBOX), false);
    assert.equal(blob.includes("trent"), false);
    for (const ticket of SYNTHETIC_SCOUT_TICKETS) {
      assert.match(ticket.gmailThreadId, /^synthetic-scout-thread-/);
      assert.match(ticket.subject, /^Synthetic request/);
      for (const message of ticket.messages) {
        assert.match(message.senderEmail, /^synthetic\.sender\./);
        assert.equal(message.snippet.length <= SCOUT_SNIPPET_MAX, true);
      }
    }
  });
});

describe("ticket patch", () => {
  it("accepts status, org tag, and notes", () => {
    assert.deepEqual(parseScoutTicketPatch({ status: "DONE", orgTag: "gonzales", notes: "Synthetic note" }), {
      ok: true,
      data: { status: "DONE", orgTag: "gonzales", notes: "Synthetic note" },
    });
    assert.equal(parseScoutTicketPatch({ orgTag: "" }).ok, true);
    assert.equal(parseScoutTicketPatch({ status: "LATER" }).ok, false);
    assert.equal(parseScoutTicketPatch({}).ok, false);
    assert.deepEqual(parseScoutListFilters({ status: "OPEN", orgTag: "none", sender: " synthetic " }), {
      status: "OPEN",
      orgTag: "none",
      sender: "synthetic",
    });
  });
});
