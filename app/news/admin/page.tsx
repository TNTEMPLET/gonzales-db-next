import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import AdminSectionHeader from "@/components/admin/AdminSectionHeader";
import NewsAdminPanel from "@/components/news/NewsAdminPanel";
import {
  ADMIN_SESSION_COOKIE,
  getAdminUserFromCookieToken,
} from "@/lib/auth/adminSession";

export const metadata = {
  title: "News Admin | Gonzales Diamond Baseball",
  description: "Create and manage Gonzales Diamond Baseball news posts.",
};

export default async function NewsAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string }>;
}) {
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;
  const adminUser = await getAdminUserFromCookieToken(token);

  if (!adminUser) {
    redirect("/admin/login?next=/news/admin");
  }

  const { edit } = await searchParams;

  return (
    <main className="min-h-screen bg-zinc-950 text-white py-14">
      <section className="max-w-6xl mx-auto px-6">
        <div className="mb-8">
          <AdminSectionHeader badge="CONTENT MANAGEMENT" />
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-3">
            News Admin
          </h1>
          <p className="text-zinc-400 max-w-2xl">
            Manage published announcements and drafts from one place.
          </p>
        </div>

        <NewsAdminPanel
          adminEmail={adminUser.email}
          adminName={
            adminUser.firstName || adminUser.lastName
              ? [adminUser.firstName, adminUser.lastName]
                  .filter(Boolean)
                  .join(" ")
              : adminUser.name
          }
          initialEditSlug={edit}
        />
      </section>
    </main>
  );
}
