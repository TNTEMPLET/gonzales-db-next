import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import {
  resolveAllStarVaultAccessForAdmin,
} from "@/lib/allStar/auth";
import { hasAdminRoleAtLeast, type AdminRole } from "@/lib/auth/adminRoles";
import { getEffectiveAdminRoleForOrg } from "@/lib/auth/effectiveAdminRole";
import { ADMIN_SESSION_COOKIE, getAdminUserFromCookieToken } from "@/lib/auth/adminSession";
import AdminSectionHeader from "@/components/admin/AdminSectionHeader";
import AllStarProgramNav from "@/components/admin/allStar/AllStarProgramNav";
import AllStarRosterPayments from "@/components/admin/allStar/AllStarRosterPayments";
import AllStarCrossOrgPaymentSummary from "@/components/admin/allStar/AllStarCrossOrgPaymentSummary";
import AllStarPageConfigPanel from "@/components/admin/allStar/AllStarPageConfigPanel";
import {
  getSiteConfig,
  isAdminModuleEnabledForOrg,
  isMasterDeployment,
  isContentOrgId,
  resolveAdminTargetOrg,
} from "@/lib/siteConfig";

export function generateMetadata() {
  const site = getSiteConfig();
  return {
    title: `All-Star Payments | ${site.name}`,
    description: "View and manage All-Star payment rosters.",
  };
}

export default async function AdminPaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ org?: string }>;
}) {
  const { org } = await searchParams;
  const currentOrg = resolveAdminTargetOrg(org ?? undefined);
  if (isContentOrgId(org) && !isAdminModuleEnabledForOrg(currentOrg, "ALL_STAR_PAYMENTS")) {
    redirect(`/admin?org=${currentOrg}&denied=payments`);
  }

  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;
  const adminUser = await getAdminUserFromCookieToken(token);
  if (!adminUser) {
    redirect("/admin/login?next=/admin/payments");
  }

  const effectiveRole = await getEffectiveAdminRoleForOrg(
    adminUser.id,
    adminUser.isMaster,
    currentOrg,
  );
  const role: AdminRole = effectiveRole ?? (adminUser.isMaster ? "MASTER_ADMIN" : "PARK_DIRECTOR");
  const { vaultView } = await resolveAllStarVaultAccessForAdmin({
    isMaster: adminUser.isMaster,
    email: adminUser.email,
    organizationId: currentOrg,
  });

  if (!vaultView && !adminUser.isMaster && !hasAdminRoleAtLeast(role, "BOARD_MEMBER")) {
    redirect("/admin?denied=payments");
  }

  const masterMode = isMasterDeployment();
  // In master mode: no ?org param (or non-org param) = "All Sites"; specific org param = single org view
  const allSitesMode = masterMode && !isContentOrgId(org);

  return (
    <main className="min-h-screen bg-zinc-950 py-10 text-white sm:py-14">
      <section className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mb-8">
          <AdminSectionHeader
            badge="ALL-STAR PAYMENTS"
            currentOrg={allSitesMode ? null : currentOrg}
            currentPath="/admin/payments"
            allowRolePreview={hasAdminRoleAtLeast(role, "ADMIN")}
            allowViewByUser={adminUser.isMaster}
          />
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-3">
            All-Star Payment Rosters
          </h1>
          <p className="text-zinc-400 max-w-3xl">
            Use this after final All-Star rosters are set. Seed or sync payment rows from finalized rosters, import PayPal activity, and keep paid/unpaid status current before families receive follow-up reminders.
          </p>
          <div className="mt-4 rounded-xl border border-amber-800/50 bg-amber-950/20 p-3 text-sm text-amber-100">
            Payments follow the roster decisions made in the All-Star Vault. If a player is missing here, confirm the cycle roster is finalized before editing payment rows by hand.
          </div>
        </div>

        <AllStarProgramNav
          stage="payments"
          org={allSitesMode ? null : currentOrg}
          allSites={allSitesMode}
        />

        {/* ── Settings ──────────────────────────────────────────────────────── */}
        <div className="mb-2">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-zinc-500">Settings</h2>
        </div>
        {allSitesMode ? (
          <>
            <AllStarPageConfigPanel org="gonzales" orgLabel="Gonzales Diamond Baseball" />
            <AllStarPageConfigPanel org="ascension" orgLabel="Ascension Little League" />
          </>
        ) : (
          <AllStarPageConfigPanel
            org={currentOrg}
            orgLabel={masterMode ? (currentOrg === "gonzales" ? "Gonzales Diamond Baseball" : "Ascension Little League") : undefined}
          />
        )}

        {/* ── Operations ────────────────────────────────────────────────────── */}
        <div className="mt-6 mb-2">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-zinc-500">Operations</h2>
        </div>
        {masterMode ? (
          <AllStarCrossOrgPaymentSummary org={allSitesMode ? undefined : currentOrg} />
        ) : (
          <div className="rounded-2xl border border-zinc-700 bg-zinc-950/80 overflow-hidden p-6">
            <AllStarRosterPayments org={currentOrg} />
          </div>
        )}
      </section>
    </main>
  );
}
