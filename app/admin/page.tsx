import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import {
  ADMIN_SESSION_COOKIE,
  getAdminUserFromCookieToken,
} from "@/lib/auth/adminSession";
import AdminOrgSwitcher from "@/components/admin/AdminOrgSwitcher";
import {
  getOrgDisplayName,
  getSiteConfig,
  getSiteConfigForOrg,
  isMasterDeployment,
  resolveAdminTargetOrg,
} from "@/lib/siteConfig";

export function generateMetadata() {
  const site = getSiteConfig();
  return {
    title: `Admin Dashboard | ${site.name}`,
    description:
      "Central admin dashboard for users, news posts, and dugout moderation.",
  };
}

export default async function AdminDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ org?: string }>;
}) {
  const { org } = await searchParams;
  const currentOrg = resolveAdminTargetOrg(org);

  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;
  const adminUser = await getAdminUserFromCookieToken(token);

  if (!adminUser) {
    redirect("/admin/login?next=/admin");
  }

  const displayName =
    [adminUser.firstName, adminUser.lastName].filter(Boolean).join(" ") ||
    adminUser.name ||
    adminUser.email;

  const orgQuery = `?org=${currentOrg}`;
  const masterMode = isMasterDeployment();
  const currentSite = getSiteConfigForOrg(currentOrg);
  const cards = [
    {
      href: `/admin/users${orgQuery}`,
      title: "User Management",
      description: masterMode
        ? "Control admin access, role elevation, and account governance for the active organization."
        : "Promote/demote admins and manage user access roles.",
      action: masterMode ? "Open Access Console" : "Open Users",
    },
    {
      href: `/admin/scores${orgQuery}`,
      title: "Scores & Standings",
      description: masterMode
        ? "Capture game outcomes, correct results, and keep standings accurate for the selected site."
        : "Enter game scores and automatically power standings by age group.",
      action: masterMode ? "Open Game Ops" : "Open Score Entry",
    },
    {
      href: `/news/admin${orgQuery}`,
      title: "News Management",
      description: masterMode
        ? "Coordinate announcements, featured stories, and publishing cadence from the AP Baseball desk."
        : "Create, edit, publish, and delete site news posts.",
      action: masterMode ? "Open Content Desk" : "Open News Admin",
    },
    {
      href: `/admin/dugout${orgQuery}`,
      title: "Dugout Moderation",
      description: masterMode
        ? "Monitor internal coach conversations and enforce moderation standards from one command post."
        : "Edit or remove any post in The Dugout feed.",
      action: masterMode ? "Open Dugout Watch" : "Open Dugout Moderation",
    },
  ];

  const statusChips = [
    {
      label: "Platform",
      value: masterMode ? "AP Baseball Master" : getOrgDisplayName(currentOrg),
    },
    { label: "Target Site", value: getOrgDisplayName(currentOrg) },
    {
      label: "Endpoint",
      value: currentSite.siteUrl.replace("https://", ""),
    },
  ];

  const oversightCards = [
    {
      title: "Organization Target",
      value: getOrgDisplayName(currentOrg),
      detail: `Operations currently pointed at ${currentSite.name}.`,
    },
    {
      title: "Publishing Scope",
      value: masterMode ? "Cross-site capable" : "Single-site",
      detail: masterMode
        ? "Switch target org at any time without leaving the control plane."
        : "Admin actions apply only to this organization.",
    },
    {
      title: "Operator",
      value: displayName,
      detail: masterMode
        ? "Authenticated for AP Baseball administrative control."
        : "Authenticated for organization-level operations.",
    },
  ];

  return (
    <main
      className={`min-h-screen text-white py-14 ${
        masterMode
          ? "bg-[radial-gradient(circle_at_top_left,rgba(239,68,68,0.14),transparent_22%),radial-gradient(circle_at_top_right,rgba(255,255,255,0.06),transparent_24%),linear-gradient(180deg,#09090b,#111827_45%,#09090b)]"
          : "bg-zinc-950"
      }`}
    >
      <section className="max-w-6xl mx-auto px-6">
        <div
          className={`mb-8 ${
            masterMode
              ? "rounded-4xl border border-zinc-800 bg-[linear-gradient(180deg,rgba(24,24,27,0.92),rgba(9,9,11,0.98))] p-8 shadow-[0_30px_120px_rgba(0,0,0,0.35)]"
              : ""
          }`}
        >
          <div
            className={
              masterMode
                ? "flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between"
                : ""
            }
          >
            <div>
              <div
                className={`inline-flex items-center gap-2 rounded-full px-6 py-2 text-xs tracking-[3px] mb-4 ${
                  masterMode
                    ? "border border-red-500/30 bg-red-500/10 text-red-100"
                    : "bg-brand-purple"
                }`}
              >
                {masterMode ? (
                  <span className="h-2 w-2 rounded-full bg-red-400" />
                ) : null}
                {masterMode ? "AP BASEBALL CONTROL CENTER" : "ADMIN DASHBOARD"}
              </div>
              <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-3">
                {masterMode
                  ? "Command and Control for AP Baseball"
                  : `Welcome, ${displayName}`}
              </h1>
              <p className="text-zinc-400 max-w-3xl">
                {masterMode
                  ? "Direct operations for Gonzales DYB and Ascension Little League from a single administrative surface. Switch target sites, publish updates, manage access, and monitor league operations without dropping context."
                  : "Manage users, publish league updates, and moderate dugout posts from one place."}
              </p>
            </div>

            <div className="flex flex-col gap-4 xl:min-w-[320px] xl:max-w-90">
              <AdminOrgSwitcher currentOrg={currentOrg} currentPath="/admin" />
              {masterMode ? (
                <div className="rounded-2xl border border-zinc-800 bg-zinc-950/80 p-4">
                  <p className="text-[10px] uppercase tracking-[0.28em] text-zinc-500">
                    Active Operator
                  </p>
                  <p className="mt-2 text-lg font-semibold text-white">
                    {displayName}
                  </p>
                  <p className="mt-1 text-sm text-zinc-400">
                    {adminUser.email}
                  </p>
                </div>
              ) : null}
            </div>
          </div>

          {masterMode ? (
            <div className="mt-8 grid gap-4 md:grid-cols-3">
              {oversightCards.map((item) => (
                <div
                  key={item.title}
                  className="rounded-2xl border border-zinc-800 bg-zinc-950/75 p-5"
                >
                  <p className="text-[10px] uppercase tracking-[0.24em] text-zinc-500">
                    {item.title}
                  </p>
                  <p className="mt-3 text-2xl font-semibold text-white">
                    {item.value}
                  </p>
                  <p className="mt-2 text-sm text-zinc-400">{item.detail}</p>
                </div>
              ))}
            </div>
          ) : null}
        </div>

        {masterMode ? (
          <div className="mb-8 flex flex-wrap gap-3">
            {statusChips.map((item) => (
              <div
                key={item.label}
                className="rounded-full border border-zinc-800 bg-zinc-900/70 px-4 py-2"
              >
                <span className="mr-2 text-[10px] uppercase tracking-[0.24em] text-zinc-500">
                  {item.label}
                </span>
                <span className="text-sm font-semibold text-zinc-200">
                  {item.value}
                </span>
              </div>
            ))}
          </div>
        ) : null}

        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          {cards.map((card) => (
            <article
              key={card.href}
              className={`rounded-3xl border p-6 ${
                masterMode
                  ? "border-zinc-800 bg-[linear-gradient(180deg,rgba(24,24,27,0.9),rgba(9,9,11,0.95))] shadow-[0_18px_50px_rgba(0,0,0,0.18)]"
                  : "border-zinc-800 bg-zinc-900/70"
              }`}
            >
              <div className="mb-3 inline-flex rounded-full border border-zinc-700 px-3 py-1 text-[10px] uppercase tracking-[0.22em] text-zinc-400">
                {masterMode ? "Control Module" : "Admin"}
              </div>
              <h2 className="text-2xl font-semibold mb-2">{card.title}</h2>
              <p className="text-zinc-400 text-sm mb-5">{card.description}</p>
              <Link
                href={card.href}
                className={`inline-block text-sm font-semibold ${
                  masterMode
                    ? "text-red-100 hover:text-red-50"
                    : "text-brand-gold hover:text-brand-gold/80"
                }`}
              >
                {card.action}
              </Link>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
