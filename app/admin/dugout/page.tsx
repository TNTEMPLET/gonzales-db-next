import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import AdminSectionHeader from "@/components/admin/AdminSectionHeader";
import DugoutModerationPanel from "@/components/admin/DugoutModerationPanel";
import {
  ADMIN_SESSION_COOKIE,
  getAdminUserFromCookieToken,
} from "@/lib/auth/adminSession";
import { getSiteConfig, resolveAdminTargetOrg } from "@/lib/siteConfig";

export function generateMetadata() {
  const site = getSiteConfig();
  return {
    title: `Dugout Moderation | ${site.name}`,
    description: "Edit and delete Dugout feed posts as an admin.",
  };
}

export default async function AdminDugoutPage({
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
    redirect("/admin/login?next=/admin/dugout");
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-white py-14">
      <section className="max-w-6xl mx-auto px-6">
        <div className="mb-8">
          <AdminSectionHeader
            badge="FEED MODERATION"
            currentOrg={currentOrg}
            currentPath="/admin/dugout"
          />
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-3">
            Dugout Moderation
          </h1>
          <p className="text-zinc-400 max-w-2xl">
            Review, edit, and remove dugout posts to keep coach communication
            clear and appropriate.
          </p>
        </div>

        <DugoutModerationPanel targetOrg={currentOrg} />
      </section>
    </main>
  );
}
