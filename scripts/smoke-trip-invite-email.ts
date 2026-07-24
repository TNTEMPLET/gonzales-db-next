// @ts-nocheck
/**
 * E2E smoke for trip invite emails.
 *
 * Phase A — DB + Resend connectivity (no guardian spam)
 * Phase B — Live HTTP against admin.apbaseball.com (login + preview + optional send)
 *
 * Usage:
 *   DATABASE_URL=... RESEND_API_KEY=... \
 *     pnpm exec tsx scripts/smoke-trip-invite-email.ts
 *
 *   SMOKE_SEND_TO=you@example.com   # enables live Resend + full-path API send to THIS address only
 *   SMOKE_ADMIN_EMAIL=... SMOKE_ADMIN_PASSWORD=...  # defaults to smoke-test admin
 *   SMOKE_BASE_URL=https://admin.apbaseball.com
 *   SMOKE_ORG=ascension
 *   SMOKE_EVENT_ID=...   # optional pin
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaPostgresAdapter } from "@prisma/adapter-ppg";
import pg from "pg";
import WS from "ws";

// Prisma PPG adapter needs WebSocket in Node < 22
if (typeof globalThis.WebSocket === "undefined") {
  (globalThis as unknown as { WebSocket: typeof WS }).WebSocket = WS as unknown as typeof WebSocket;
}

function isPrismaHosted(url: string) {
  return /db\.prisma\.io|prisma-data\.net/i.test(url);
}

function createAdapter(connectionString: string) {
  if (isPrismaHosted(connectionString)) {
    return new PrismaPostgresAdapter({ connectionString });
  }
  return new PrismaPg(new pg.Pool({ connectionString }));
}

function maskEmail(e: string) {
  const [u, d] = e.split("@");
  if (!d) return "***";
  return `${(u || "").slice(0, 2)}***@${d}`;
}

function parseAnswers(json: string | null | undefined): Record<string, unknown> {
  if (!json) return {};
  try {
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return {};
  }
}

async function resendSend(opts: {
  apiKey: string;
  from: string;
  to: string;
  subject: string;
  html: string;
  text: string;
}) {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${opts.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: opts.from,
      to: [opts.to],
      subject: opts.subject,
      html: opts.html,
      text: opts.text,
    }),
  });
  const json = (await response.json()) as {
    id?: string;
    message?: string;
    name?: string;
  };
  if (!response.ok) {
    throw new Error(json.message || json.name || `Resend ${response.status}`);
  }
  return json;
}

type CookieJar = Map<string, string>;

function storeCookies(jar: CookieJar, res: Response) {
  const anyHeaders = res.headers as Headers & {
    getSetCookie?: () => string[];
  };
  let list: string[] = [];
  if (typeof anyHeaders.getSetCookie === "function") {
    try {
      list = anyHeaders.getSetCookie() || [];
    } catch {
      list = [];
    }
  }
  // Node 18 fetch often only exposes a single set-cookie header string
  if (list.length === 0) {
    const fallback = res.headers.get("set-cookie");
    if (fallback) {
      // May contain multiple cookies joined — split on comma only when it looks like a new cookie
      list = fallback.split(/,(?=\s*[^;=\s]+=)/).map((s) => s.trim());
    }
  }
  for (const line of list) {
    const part = line.split(";")[0];
    const eq = part.indexOf("=");
    if (eq > 0) jar.set(part.slice(0, eq).trim(), part.slice(eq + 1).trim());
  }
}

function cookieHeader(jar: CookieJar) {
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL required");

  const resendKey =
    process.env.RESEND_API_KEY?.trim() ||
    "";
  const from =
    process.env.COMMUNICATIONS_EMAIL_FROM?.trim() ||
    "AP Baseball <noreply@apbaseball.com>";
  const baseUrl = (
    process.env.SMOKE_BASE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "https://admin.apbaseball.com"
  ).replace(/\/$/, "");
  const org = process.env.SMOKE_ORG || "ascension";
  const smokeTo = (process.env.SMOKE_SEND_TO || "").trim().toLowerCase();
  const adminEmail =
    process.env.SMOKE_ADMIN_EMAIL || "smoke-test@apbaseball.com";
  const adminPassword =
    process.env.SMOKE_ADMIN_PASSWORD || "SmokeTest-Dev-2026!";
  const eventIdFilter = (process.env.SMOKE_EVENT_ID || "").trim();

  const results: Array<{ step: string; ok: boolean; detail: string }> = [];
  const pass = (step: string, detail: string) => {
    results.push({ step, ok: true, detail });
    console.log(`✅ ${step}: ${detail}`);
  };
  const fail = (step: string, detail: string) => {
    results.push({ step, ok: false, detail });
    console.error(`❌ ${step}: ${detail}`);
  };

  console.log("=== Trip invite email E2E smoke ===");
  console.log({
    baseUrl,
    org,
    resendKey: resendKey ? `set len=${resendKey.length}` : "MISSING",
    from,
    smokeTo: smokeTo || "(none — no live send to inbox)",
    adminEmail,
    eventIdFilter: eventIdFilter || "(latest)",
  });

  const prisma = new PrismaClient({ adapter: createAdapter(databaseUrl) });

  try {
    // ── A1: schema / events ─────────────────────────────────────────────
    const events = await prisma.tripEvent.findMany({
      where: eventIdFilter ? { id: eventIdFilter } : { organizationId: org },
      orderBy: { updatedAt: "desc" },
      take: 5,
      include: {
        participants: {
          orderBy: { playerFullName: "asc" },
          include: { response: true },
        },
      },
    });
    if (events.length === 0) {
      fail("db.events", `No trip events for org=${org}`);
    } else {
      pass(
        "db.events",
        events
          .map(
            (e) =>
              `${e.name} [${e.status}] n=${e.participants.length} id=${e.id.slice(0, 8)}`,
          )
          .join(" | "),
      );
    }

    const primary = events[0];
    if (primary) {
      let withEmail = 0;
      let stamped = 0;
      console.log(`\n--- Roster: ${primary.name} (${primary.status}) ---`);
      for (const p of primary.participants) {
        const answers = parseAnswers(p.response?.answersJson);
        const gEmail =
          (typeof answers.guardian1_email === "string" &&
            answers.guardian1_email.trim().toLowerCase()) ||
          p.response?.submitterEmail?.trim().toLowerCase() ||
          null;
        if (gEmail) withEmail++;
        if (p.inviteEmailCount > 0) stamped++;
        console.log(
          [
            p.playerFullName.padEnd(24).slice(0, 24),
            p.status.padEnd(11),
            `cnt=${p.inviteEmailCount}`,
            `email=${gEmail ? maskEmail(gEmail) : "NONE"}`,
            `to=${p.inviteEmailTo ? maskEmail(p.inviteEmailTo) : "-"}`,
          ].join(" | "),
        );
      }
      pass(
        "db.roster",
        `total=${primary.participants.length} withEmail=${withEmail} stampedSent=${stamped}`,
      );
      if (primary.status !== "open") {
        fail(
          "db.event_open",
          `Event status is "${primary.status}" — invite API rejects draft/closed`,
        );
      } else {
        pass("db.event_open", "open");
      }
    }

    // ── A2: delivery audit ──────────────────────────────────────────────
    const deliveries = await prisma.communicationDelivery.findMany({
      where: { recipientType: "TRIP_GUARDIAN" },
      orderBy: { createdAt: "desc" },
      take: 30,
    });
    const byStatus: Record<string, number> = {};
    for (const d of deliveries) {
      byStatus[d.status] = (byStatus[d.status] || 0) + 1;
    }
    console.log("\n--- Last TRIP_GUARDIAN deliveries ---");
    if (!deliveries.length) {
      console.log("(none)");
      fail(
        "db.deliveries",
        "Zero TRIP_GUARDIAN rows — no successful audited send yet (or all failed before write)",
      );
    } else {
      for (const d of deliveries.slice(0, 12)) {
        console.log({
          status: d.status,
          to: d.toEmail ? maskEmail(d.toEmail) : null,
          err: d.errorMessage,
          at: d.createdAt.toISOString(),
          msgId: d.providerMessageId,
        });
      }
      pass("db.deliveries", JSON.stringify(byStatus));
    }

    const camps = await prisma.communicationCampaign.findMany({
      where: { title: { contains: "Trip invites" } },
      orderBy: { createdAt: "desc" },
      take: 8,
    });
    console.log("\n--- Trip invite campaigns ---");
    for (const c of camps) {
      const dels = await prisma.communicationDelivery.groupBy({
        by: ["status"],
        where: { campaignId: c.id },
        _count: true,
      });
      console.log({
        title: c.title,
        status: c.status,
        from: c.fromEmail,
        createdAt: c.createdAt.toISOString(),
        sentAt: c.sentAt?.toISOString() ?? null,
        deliveries: Object.fromEntries(dels.map((x) => [x.status, x._count])),
      });
    }
    if (camps.some((c) => c.status === "SENDING")) {
      fail(
        "db.campaign_stuck",
        "Campaign(s) still SENDING — post-send DB write likely died mid-flight",
      );
    } else if (camps.length) {
      pass("db.campaigns", `${camps.length} campaign(s), none stuck SENDING`);
    }

    // ── A3: Resend direct ───────────────────────────────────────────────
    if (!resendKey) {
      fail("resend.config", "RESEND_API_KEY missing in smoke env");
    } else if (!smokeTo) {
      // Validate key with domains list (no send)
      const dr = await fetch("https://api.resend.com/domains", {
        headers: { Authorization: `Bearer ${resendKey}` },
      });
      const dj = (await dr.json()) as { message?: string; data?: unknown[] };
      if (!dr.ok) {
        fail("resend.auth", dj.message || `HTTP ${dr.status}`);
      } else {
        pass("resend.auth", `domains ok (${(dj.data || []).length} domain(s))`);
      }
      console.log(
        "(Set SMOKE_SEND_TO=you@email.com to send a real test message)",
      );
    } else {
      try {
        const r = await resendSend({
          apiKey: resendKey,
          from,
          to: smokeTo,
          subject: "[SMOKE] Resend connectivity — trip invites",
          html: "<p>Direct Resend OK for trip invite path.</p>",
          text: "Direct Resend OK for trip invite path.",
        });
        pass("resend.direct_send", `id=${r.id}`);
      } catch (e) {
        fail(
          "resend.direct_send",
          e instanceof Error ? e.message : String(e),
        );
      }
    }

    // ── B: Live HTTP admin API ──────────────────────────────────────────
    console.log(`\n--- Live API ${baseUrl} ---`);
    const jar: CookieJar = new Map();

    // login
    try {
      const loginRes = await fetch(`${baseUrl}/api/admin/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: adminEmail, password: adminPassword }),
        redirect: "manual",
      });
      storeCookies(jar, loginRes);
      const loginBody = (await loginRes.json().catch(() => ({}))) as {
        error?: string;
        ok?: boolean;
      };
      if (!loginRes.ok && loginRes.status !== 200) {
        fail(
          "http.login",
          `${loginRes.status} ${loginBody.error || loginRes.statusText} (cookies=${jar.size})`,
        );
      } else if (jar.size === 0) {
        fail("http.login", "login returned ok but no Set-Cookie");
      } else {
        pass("http.login", `status=${loginRes.status} cookies=${[...jar.keys()].join(",")}`);
      }
    } catch (e) {
      fail("http.login", e instanceof Error ? e.message : String(e));
    }

    if (jar.size > 0 && primary) {
      // preview
      try {
        const prevRes = await fetch(
          `${baseUrl}/api/admin/trip/events/${primary.id}/invite-emails?org=${encodeURIComponent(primary.organizationId)}`,
          { headers: { Cookie: cookieHeader(jar) } },
        );
        const prev = (await prevRes.json()) as {
          error?: string;
          communicationsEnabled?: boolean;
          resendConfigured?: boolean;
          summary?: {
            total: number;
            withEmail: number;
            missingEmail: number;
            alreadySent: number;
          };
          recipients?: Array<{
            playerFullName: string;
            canSend: boolean;
            skipReason: string | null;
            email: string | null;
            inviteEmailCount: number;
          }>;
        };
        if (!prevRes.ok) {
          fail("http.preview", `${prevRes.status} ${prev.error || ""}`);
        } else {
          pass(
            "http.preview",
            `comms=${prev.communicationsEnabled} resendConfigured=${prev.resendConfigured} summary=${JSON.stringify(prev.summary)}`,
          );
          if (prev.resendConfigured === false) {
            fail(
              "http.resend_configured",
              "Production reports resendConfigured=false — RESEND_API_KEY missing on this Vercel project",
            );
          } else if (prev.resendConfigured === true) {
            pass("http.resend_configured", "true");
          }
          console.log(
            "sample recipients:",
            (prev.recipients || []).slice(0, 5).map((r) => ({
              name: r.playerFullName,
              canSend: r.canSend,
              skip: r.skipReason,
              cnt: r.inviteEmailCount,
              email: r.email ? maskEmail(r.email) : null,
            })),
          );
        }
      } catch (e) {
        fail("http.preview", e instanceof Error ? e.message : String(e));
      }

      // event detail email summary
      try {
        const detRes = await fetch(
          `${baseUrl}/api/admin/trip/events/${primary.id}?org=${encodeURIComponent(primary.organizationId)}`,
          { headers: { Cookie: cookieHeader(jar) } },
        );
        const det = (await detRes.json()) as {
          error?: string;
          emailSummary?: Record<string, number>;
          participants?: Array<{
            playerFullName: string;
            emailStatus?: string;
            inviteEmailCount?: number;
          }>;
        };
        if (!detRes.ok) {
          fail("http.event_detail", `${detRes.status} ${det.error || ""}`);
        } else {
          pass(
            "http.event_detail",
            `emailSummary=${JSON.stringify(det.emailSummary)}`,
          );
          const statuses = (det.participants || []).reduce(
            (acc, p) => {
              const s = p.emailStatus || "?";
              acc[s] = (acc[s] || 0) + 1;
              return acc;
            },
            {} as Record<string, number>,
          );
          console.log("participant emailStatus counts:", statuses);
        }
      } catch (e) {
        fail("http.event_detail", e instanceof Error ? e.message : String(e));
      }

      // Full path: create smoke participant, POST invite-emails, cleanup
      if (smokeTo && jar.size > 0) {
        console.log("\n--- Full-path API send to SMOKE_SEND_TO only ---");
        const token = `SMOKE${Date.now().toString(36)}`;
        let participantId: string | null = null;
        const prevStatus = primary.status;
        try {
          if (prevStatus !== "open") {
            await prisma.tripEvent.update({
              where: { id: primary.id },
              data: { status: "open" },
            });
          }
          const p = await prisma.tripParticipant.create({
            data: {
              eventId: primary.id,
              organizationId: primary.organizationId,
              playerFullName: "SMOKE TEST PLAYER",
              inviteToken: token,
              status: "not_started",
              response: {
                create: {
                  answersJson: JSON.stringify({
                    guardian1_email: smokeTo,
                    guardian1_first_name: "Smoke",
                    guardian1_last_name: "Tester",
                    first_name: "Smoke",
                    last_name: "Player",
                  }),
                  submitterEmail: smokeTo,
                  submitterName: "Smoke Tester",
                },
              },
            },
          });
          participantId = p.id;
          console.log("created smoke participant", participantId);

          const sendRes = await fetch(
            `${baseUrl}/api/admin/trip/events/${primary.id}/invite-emails?org=${encodeURIComponent(primary.organizationId)}`,
            {
              method: "POST",
              headers: {
                Cookie: cookieHeader(jar),
                "Content-Type": "application/json",
                Accept: "application/json",
              },
              body: JSON.stringify({
                participantIds: [participantId],
                resend: true,
                subjectTemplate:
                  "[SMOKE] {{event_name}} link for {{player_name}}",
                bodyTemplate:
                  "Hi {{guardian_first_name}},\n\nE2E smoke test only.\n{{invite_url}}\n",
              }),
            },
          );
          const sendText = await sendRes.text();
          let sendBody: {
            error?: string;
            success?: boolean;
            sent?: number;
            failed?: number;
            skipped?: unknown[];
            campaignId?: string | null;
          } = {};
          try {
            sendBody = JSON.parse(sendText) as typeof sendBody;
          } catch {
            sendBody = {
              error: `Non-JSON response (${sendRes.status}): ${sendText.slice(0, 240)}`,
            };
          }
          console.log(
            "POST invite-emails",
            sendRes.status,
            "ct=",
            sendRes.headers.get("content-type"),
            "vercel-error=",
            sendRes.headers.get("x-vercel-error"),
            sendBody,
          );

          if (!sendRes.ok) {
            fail(
              "http.send",
              `${sendRes.status} ${sendBody.error || JSON.stringify(sendBody)}`,
            );
          } else if ((sendBody.sent ?? 0) >= 1) {
            pass(
              "http.send",
              `sent=${sendBody.sent} campaign=${sendBody.campaignId?.slice(0, 10)}`,
            );
          } else {
            fail(
              "http.send",
              `ok response but sent=${sendBody.sent} failed=${sendBody.failed} skipped=${JSON.stringify(sendBody.skipped)}`,
            );
          }

          // verify stamp
          const refreshed = await prisma.tripParticipant.findUnique({
            where: { id: participantId },
          });
          if ((refreshed?.inviteEmailCount ?? 0) > 0) {
            pass(
              "db.stamp_after_send",
              `count=${refreshed?.inviteEmailCount} to=${refreshed?.inviteEmailTo}`,
            );
          } else {
            fail(
              "db.stamp_after_send",
              "inviteEmailCount still 0 after claimed send",
            );
          }
        } catch (e) {
          fail("http.send", e instanceof Error ? e.message : String(e));
        } finally {
          if (participantId) {
            try {
              await prisma.communicationDelivery.deleteMany({
                where: { tripParticipantId: participantId },
              });
              await prisma.communicationRecipientSnapshot.deleteMany({
                where: { tripParticipantId: participantId },
              });
              await prisma.tripResponse.deleteMany({
                where: { participantId },
              });
              await prisma.tripParticipant.delete({
                where: { id: participantId },
              });
              console.log("cleaned smoke participant");
            } catch (ce) {
              console.warn(
                "cleanup error",
                ce instanceof Error ? ce.message : ce,
              );
            }
          }
          if (prevStatus !== "open") {
            await prisma.tripEvent.update({
              where: { id: primary.id },
              data: { status: prevStatus },
            });
          }
        }
      }
    }

    // ── Summary ─────────────────────────────────────────────────────────
    console.log("\n========== SMOKE SUMMARY ==========");
    const failed = results.filter((r) => !r.ok);
    const passed = results.filter((r) => r.ok);
    for (const r of results) {
      console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.step} — ${r.detail}`);
    }
    console.log(`\n${passed.length} passed, ${failed.length} failed`);
    if (failed.length) process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
