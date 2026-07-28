import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import AdminSectionHeader from "@/components/admin/AdminSectionHeader";
import TournamentAlertsPanel from "@/components/admin/TournamentAlertsPanel";
import {
  canAccessAdminModule,
  hasAdminRoleAtLeast,
  type AdminRole,
} from "@/lib/auth/adminRoles";
import {
  ADMIN_SESSION_COOKIE,
  getAdminUserFromCookieToken,
} from "@/lib/auth/adminSession";
import { getEffectiveAdminRoleForOrg } from "@/lib/auth/effectiveAdminRole";
import { bracketGameChangerSchema } from "@/lib/gamechanger/types";
import prisma from "@/lib/prisma";
import {
  BRACKET_ORGS,
  formatOrganizationIdDisplay,
  getSiteConfig,
  isMasterDeployment,
  type BracketOrgId,
} from "@/lib/siteConfig";
import { safeParseBracketSpec } from "@/lib/tournament-brackets/bracketSpec";
import { getTournamentAlertProviderStatus } from "@/lib/tournament-monitor/alertSender";
import { formatTournamentDateTime } from "@/lib/tournament-monitor/formatDateTime";

type StatusTone = "good" | "warn" | "bad" | "neutral";

type SiteEventPayload = {
  target?: unknown;
  check?: {
    status?: unknown;
    ms?: unknown;
    error?: unknown;
  };
};

type MonitorSnapshot = {
  latestRun: Awaited<ReturnType<typeof loadMonitorSnapshot>>["latestRun"];
  recentRuns: Awaited<ReturnType<typeof loadMonitorSnapshot>>["recentRuns"];
  recentEvents: Awaited<ReturnType<typeof loadMonitorSnapshot>>["recentEvents"];
  subscriptions: Awaited<ReturnType<typeof loadMonitorSnapshot>>["subscriptions"];
  storageReady: boolean;
  errorMessage: string | null;
};

const statusToneClasses: Record<StatusTone, string> = {
  good: "border-emerald-500/30 bg-emerald-500/10 text-emerald-100",
  warn: "border-amber-500/30 bg-amber-500/10 text-amber-100",
  bad: "border-red-500/30 bg-red-500/10 text-red-100",
  neutral: "border-zinc-700 bg-zinc-900/80 text-zinc-200",
};

export function generateMetadata() {
  const site = getSiteConfig();
  return {
    title: `Tournament Alert Status | ${site.name}`,
    description:
      "Mobile-friendly tournament communications status for monitor runs, recent alerts, and provider readiness.",
  };
}

function relativeAge(value: Date | null | undefined) {
  if (!value) return "No run recorded";
  const minutes = Math.max(0, Math.round((Date.now() - value.getTime()) / 60000));
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  return `${Math.round(hours / 24)} day ago`;
}

function statusTone(status: string | null | undefined): StatusTone {
  if (status === "COMPLETED" || status === "SITE_RECOVERED" || status === "GAME_FINAL") {
    return "good";
  }
  if (status === "PARTIAL" || status === "PENDING" || status === "RUNNING" || status === "LIVE_HEARTBEAT" || status === "GAME_LIVE") {
    return "warn";
  }
  if (status === "FAILED" || status === "SITE_DOWN" || status === "GC_GAME_CREATE_FAILED") {
    return "bad";
  }
  return "neutral";
}

function envEnabled(value: string | undefined) {
  return value?.trim().toLowerCase() === "true";
}

function siteEventLabel(type: string | undefined, payload: unknown) {
  const parsed = payload as SiteEventPayload | null;
  const target = parsed?.target === "live-api" ? "Live feed" : "Public site";
  if (type === "SITE_DOWN") {
    const status = parsed?.check?.status ? ` (${String(parsed.check.status)})` : "";
    return `${target} down${status}`;
  }
  if (type === "SITE_RECOVERED") return `${target} recovered`;
  return "No site incident";
}

async function loadMonitorSnapshot() {
  return Promise.all([
    prisma.tournamentMonitorRun.findFirst({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        status: true,
        checkedCount: true,
        eventCount: true,
        sentCount: true,
        failedCount: true,
        errorMessage: true,
        createdAt: true,
        completedAt: true,
      },
    }),
    prisma.tournamentMonitorRun.findMany({
      orderBy: { createdAt: "desc" },
      take: 4,
      select: {
        id: true,
        status: true,
        checkedCount: true,
        eventCount: true,
        sentCount: true,
        failedCount: true,
        createdAt: true,
        completedAt: true,
      },
    }),
    prisma.tournamentMonitorEvent.findMany({
      orderBy: { createdAt: "desc" },
      take: 16,
      select: {
        id: true,
        type: true,
        organizationId: true,
        bracketProjectId: true,
        matchId: true,
        title: true,
        message: true,
        payload: true,
        emailSentCount: true,
        smsSentCount: true,
        failedCount: true,
        sentAt: true,
        createdAt: true,
        bracketProject: {
          select: {
            id: true,
            name: true,
            organizationId: true,
          },
        },
      },
    }),
    prisma.tournamentMonitorSubscription.findMany({
      orderBy: [{ active: "desc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        channels: true,
        active: true,
      },
    }),
  ]).then(([latestRun, recentRuns, recentEvents, subscriptions]) => ({
    latestRun,
    recentRuns,
    recentEvents,
    subscriptions,
  }));
}

async function loadSafeMonitorSnapshot(): Promise<MonitorSnapshot> {
  try {
    return {
      ...(await loadMonitorSnapshot()),
      storageReady: true,
      errorMessage: null,
    };
  } catch (error: unknown) {
    console.error("[admin-tournament-alerts] Failed to load monitor tables", error);
    return {
      latestRun: null,
      recentRuns: [],
      recentEvents: [],
      subscriptions: [],
      storageReady: false,
      errorMessage: error instanceof Error ? error.message : "Tournament monitor storage is unavailable.",
    };
  }
}

export default async function AdminTournamentAlertsPage() {
  if (!isMasterDeployment()) {
    redirect("/admin?denied=tournament-alerts");
  }

  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;
  const adminUser = await getAdminUserFromCookieToken(token);

  if (!adminUser) {
    redirect(`/admin/login?next=${encodeURIComponent("/admin/tournament-alerts")}`);
  }

  if (!adminUser.isMaster) {
    redirect("/admin?denied=tournament-alerts-master");
  }

  const effectiveRole = await getEffectiveAdminRoleForOrg(
    adminUser.id,
    adminUser.isMaster,
    "gonzales",
  );
  const role: AdminRole = effectiveRole ?? (adminUser.isMaster ? "MASTER_ADMIN" : "PARK_DIRECTOR");
  if (!canAccessAdminModule(role, "TOURNAMENT_ALERTS")) {
    redirect("/admin?denied=tournament-alerts");
  }

  const [monitorSnapshot, bracketRows] = await Promise.all([
    loadSafeMonitorSnapshot(),
    prisma.bracketProject.findMany({
      where: {
        organizationId: { in: [...BRACKET_ORGS] },
        status: "READY",
      },
      orderBy: [{ organizationId: "asc" }, { priority: "asc" }, { updatedAt: "desc" }],
      take: 12,
      select: {
        id: true,
        organizationId: true,
        name: true,
        status: true,
        spec: true,
        updatedAt: true,
      },
    }),
  ]);
  const {
    latestRun,
    recentRuns,
    recentEvents,
    subscriptions,
    storageReady: monitorStorageReady,
    errorMessage: monitorStorageError,
  } = monitorSnapshot;

  const providerStatus = getTournamentAlertProviderStatus();
  const activeRecipients = subscriptions.filter((subscription) => subscription.active);
  const emailRecipients = activeRecipients.filter((subscription) => subscription.channels.includes("EMAIL") && subscription.email);
  const smsRecipients = activeRecipients.filter((subscription) => subscription.channels.includes("SMS") && subscription.phone);
  const siteEventsByProject = new Map<string, (typeof recentEvents)[number]>();
  for (const event of recentEvents) {
    if (!event.bracketProjectId) continue;
    if (event.type !== "SITE_DOWN" && event.type !== "SITE_RECOVERED") continue;
    if (!siteEventsByProject.has(event.bracketProjectId)) {
      siteEventsByProject.set(event.bracketProjectId, event);
    }
  }

  const activeProjects = bracketRows.map((project) => {
    const parsed = safeParseBracketSpec(project.spec);
    const gc = parsed.ok
      ? bracketGameChangerSchema.safeParse(parsed.spec.gameChanger)
      : null;
    const gameChanger = gc?.success ? gc.data : null;
    const latestSiteEvent = siteEventsByProject.get(project.id);
    return {
      id: project.id,
      organizationId: project.organizationId as BracketOrgId,
      name: project.name,
      status: project.status,
      updatedAt: project.updatedAt,
      widgetReady: Boolean(gameChanger?.widgetId),
      scheduleManagerEnabled: Boolean(gameChanger?.scheduleManagerEnabled),
      latestSiteEvent,
    };
  });

  const monitorReadyCount = activeProjects.filter((project) => project.widgetReady).length;
  const latestRunTone = latestRun ? statusTone(latestRun.status) : "warn";
  const writerEnabled = envEnabled(process.env.GAMECHANGER_SCHEDULE_WRITER_ENABLED);
  const providerCards = [
    {
      label: "Email Alerts",
      value: providerStatus.emailConfigured ? "Provider ready" : "Setup needed",
      tone: providerStatus.emailConfigured ? "good" : "bad",
      detail: providerStatus.emailConfigured
        ? `${emailRecipients.length} active email recipient${emailRecipients.length === 1 ? "" : "s"}.`
        : "Add RESEND_API_KEY and COMMUNICATIONS_EMAIL_FROM for email delivery.",
    },
    {
      label: "SMS Alerts",
      value: providerStatus.smsConfigured ? "Twilio ready" : "Not required today",
      tone: providerStatus.smsConfigured ? "good" : "neutral",
      detail: providerStatus.smsConfigured
        ? `${smsRecipients.length} active SMS recipient${smsRecipients.length === 1 ? "" : "s"}.`
        : "Use this page and email alerts while Twilio setup waits.",
    },
    {
      label: "GameChanger Writer",
      value: writerEnabled ? "Live writes enabled" : "Monitor only",
      tone: writerEnabled ? "good" : "warn",
      detail: writerEnabled
        ? "Schedule Manager can create unlocked games when enabled per bracket."
        : "Set GAMECHANGER_SCHEDULE_WRITER_ENABLED=true only when live creation is approved.",
    },
    {
      label: "Cron Secret",
      value: process.env.TOURNAMENT_MONITOR_CRON_SECRET || process.env.CRON_SECRET ? "Configured" : "Dev fallback",
      tone: process.env.TOURNAMENT_MONITOR_CRON_SECRET || process.env.CRON_SECRET ? "good" : "warn",
      detail: "Production should set TOURNAMENT_MONITOR_CRON_SECRET or CRON_SECRET.",
    },
  ] satisfies Array<{ label: string; value: string; tone: StatusTone; detail: string }>;

  return (
    <main className="min-h-screen bg-zinc-950 py-5 text-white sm:py-8">
      <section className="mx-auto max-w-5xl px-3 sm:px-6">
        <AdminSectionHeader
          badge="TOURNAMENT ALERTS"
          currentPath="/admin/tournament-alerts"
          allowRolePreview={hasAdminRoleAtLeast(role, "ADMIN")}
          allowViewByUser={adminUser.isMaster}
          moduleHubHref="/admin/tournament-brackets"
          moduleHubLabel="Tournament Brackets"
        />

        <div className="mb-5 rounded-3xl border border-zinc-800 bg-[radial-gradient(circle_at_top_left,rgba(239,68,68,0.16),transparent_32%),linear-gradient(180deg,rgba(24,24,27,0.98),rgba(9,9,11,0.98))] p-4 shadow-[0_24px_80px_rgba(0,0,0,0.3)] sm:p-6">
          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-red-100">
            Mobile status board
          </p>
          <div className="mt-4 grid gap-4 md:grid-cols-[1.3fr_0.7fr] md:items-end">
            <div>
              <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
                Tournament Communications Status
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-300">
                Quick phone view for tournament monitor runs, recent alerts,
                provider readiness, and email setup while SMS is offline.
              </p>
            </div>
            <div className={`rounded-2xl border p-4 ${statusToneClasses[latestRunTone]}`}>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] opacity-75">
                Latest Run
              </p>
              <p className="mt-2 text-2xl font-bold">
                {latestRun?.status ?? "No runs"}
              </p>
              <p className="mt-1 text-sm opacity-85">
                {relativeAge(latestRun?.completedAt ?? latestRun?.createdAt)}
              </p>
            </div>
          </div>
        </div>

        <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatusCard
            label="Monitor"
            value={latestRun ? `${latestRun.checkedCount} checked` : "Not run yet"}
            detail="Cron watches tournament sites, live GameChanger feeds, finals, and creation alerts."
            tone={latestRun ? latestRunTone : "warn"}
          />
          <StatusCard
            label="Active Tournaments"
            value={`${monitorReadyCount}/${activeProjects.length} ready`}
            detail="Ready brackets with GameChanger widgets are eligible for monitor checks."
            tone={monitorReadyCount > 0 ? "good" : "warn"}
          />
          <StatusCard
            label="Recent Alerts"
            value={`${recentEvents.length}`}
            detail="Latest tournament monitor events across all bracket sites."
            tone={recentEvents.length > 0 ? "good" : "neutral"}
          />
          <StatusCard
            label="Recipients"
            value={`${activeRecipients.length} active`}
            detail="Manage recipients and send test alerts below."
            tone={activeRecipients.length > 0 ? "good" : "warn"}
          />
        </div>

        {!providerStatus.emailConfigured ? (
          <section className="mb-5 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-amber-50 sm:p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold">Email setup is the next action</h2>
                <p className="mt-1 text-sm text-amber-100/85">
                  Add RESEND_API_KEY and COMMUNICATIONS_EMAIL_FROM, then use the test alert control below.
                </p>
              </div>
              <Link
                href="/admin/communications?org=gonzales"
                className="inline-flex min-h-11 items-center justify-center rounded-xl bg-amber-200 px-4 text-sm font-semibold text-zinc-950"
              >
                Open Communications
              </Link>
            </div>
          </section>
        ) : null}

        {!monitorStorageReady ? (
          <section className="mb-5 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-red-50 sm:p-5">
            <h2 className="text-lg font-semibold">Monitor storage needs setup</h2>
            <p className="mt-1 text-sm text-red-100/85">
              The Tournament Monitor tables are not available yet, so this page is running in status-only mode.
              Apply the `20260627021500_tournament_monitor_alerts` Prisma migration, then reload this page to manage
              recipients and test alerts.
            </p>
            {monitorStorageError ? (
              <p className="mt-3 rounded-xl border border-red-400/30 bg-red-950/30 p-3 text-xs text-red-100/80">
                {monitorStorageError}
              </p>
            ) : null}
          </section>
        ) : null}

        <section className="mb-5 grid gap-3 md:grid-cols-2">
          {providerCards.map((card) => (
            <StatusCard
              key={card.label}
              label={card.label}
              value={card.value}
              detail={card.detail}
              tone={card.tone}
            />
          ))}
        </section>

        <section className="mb-5 rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4 sm:p-5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-xl font-semibold">Latest Monitor Run</h2>
              <p className="text-sm text-zinc-400">
                Counts from the newest tournament monitor job.
              </p>
            </div>
            <Link
              href="/admin/scores"
              className="inline-flex min-h-10 items-center text-sm font-semibold text-red-200 hover:text-red-100"
            >
              Scores monitor panel
            </Link>
          </div>
          {latestRun ? (
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Metric label="Checked" value={latestRun.checkedCount} />
              <Metric label="Alerts" value={latestRun.eventCount} />
              <Metric label="Sent" value={latestRun.sentCount} />
              <Metric label="Failed" value={latestRun.failedCount} />
            </div>
          ) : (
            <p className="mt-4 rounded-xl border border-zinc-800 bg-zinc-950/70 p-4 text-sm text-zinc-400">
              No monitor runs have been recorded yet.
            </p>
          )}
          {latestRun?.errorMessage ? (
            <p className="mt-3 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-100">
              {latestRun.errorMessage}
            </p>
          ) : null}
        </section>

        <section className="mb-5 rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4 sm:p-5">
          <h2 className="text-xl font-semibold">Active Tournament Status</h2>
          <div className="mt-4 space-y-3">
            {activeProjects.length ? (
              activeProjects.map((project) => (
                <div
                  key={project.id}
                  className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-zinc-100">{project.name}</p>
                      <p className="mt-1 text-xs text-zinc-500">
                        {formatOrganizationIdDisplay(project.organizationId)} / {project.status} / updated {formatTournamentDateTime(project.updatedAt)}
                      </p>
                    </div>
                    <span
                      className={`rounded-full border px-2 py-1 text-[11px] font-semibold ${
                        project.widgetReady ? statusToneClasses.good : statusToneClasses.warn
                      }`}
                    >
                      {project.widgetReady ? "Watched" : "No GC"}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-zinc-400">
                    {siteEventLabel(project.latestSiteEvent?.type, project.latestSiteEvent?.payload)}
                    {" / "}
                    Schedule Manager {project.scheduleManagerEnabled ? "enabled" : "disabled"}
                  </p>
                </div>
              ))
            ) : (
              <p className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-4 text-sm text-zinc-400">
                No ready tournament brackets found.
              </p>
            )}
          </div>
        </section>

        <section className="mb-5 rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4 sm:p-5">
          <h2 className="text-xl font-semibold">Recent Alert Events</h2>
          <div className="mt-4 space-y-3">
            {recentEvents.length ? (
              recentEvents.map((event) => (
                <div
                  key={event.id}
                  className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-zinc-100">
                        {event.title}
                      </p>
                      <p className="mt-1 line-clamp-2 text-sm text-zinc-400">
                        {event.message}
                      </p>
                    </div>
                    <span className={`rounded-full border px-2 py-1 text-[11px] font-semibold ${statusToneClasses[statusTone(event.type)]}`}>
                      {event.type}
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-zinc-500">
                    {formatOrganizationIdDisplay(event.organizationId)} / {event.bracketProject?.name ?? "Monitor"} / {formatTournamentDateTime(event.createdAt)}
                    {event.matchId ? ` / ${event.matchId}` : ""}
                  </p>
                  <p className="mt-1 text-xs text-zinc-500">
                    Email {event.emailSentCount} / SMS {event.smsSentCount} / failed {event.failedCount}
                  </p>
                </div>
              ))
            ) : (
              <p className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-4 text-sm text-zinc-400">
                No recent monitor alerts yet.
              </p>
            )}
          </div>
        </section>

        {monitorStorageReady ? <TournamentAlertsPanel /> : null}

        <section className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4 sm:p-5">
          <h2 className="text-xl font-semibold">Run History</h2>
          <div className="mt-4 space-y-2">
            {recentRuns.map((run) => (
              <div
                key={run.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-zinc-800 bg-zinc-950/70 p-3"
              >
                <div>
                  <p className="text-sm font-semibold text-zinc-100">{run.status}</p>
                  <p className="mt-1 text-xs text-zinc-500">
                    {formatTournamentDateTime(run.completedAt ?? run.createdAt)}
                  </p>
                </div>
                <p className="text-right text-xs text-zinc-400">
                  {run.checkedCount} checked
                  <br />
                  {run.failedCount} failed
                </p>
              </div>
            ))}
            {recentRuns.length === 0 ? (
              <p className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-4 text-sm text-zinc-400">
                No run history available.
              </p>
            ) : null}
          </div>
        </section>
      </section>
    </main>
  );
}

function StatusCard({
  label,
  value,
  detail,
  tone,
}: {
  label: string;
  value: string;
  detail: string;
  tone: StatusTone;
}) {
  return (
    <div className={`rounded-2xl border p-4 ${statusToneClasses[tone]}`}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.24em] opacity-70">
        {label}
      </p>
      <p className="mt-2 text-xl font-bold">{value}</p>
      <p className="mt-2 text-sm leading-5 opacity-80">{detail}</p>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-500">
        {label}
      </p>
      <p className="mt-2 text-2xl font-bold text-white">{value}</p>
    </div>
  );
}
