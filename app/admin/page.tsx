import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import {
  ADMIN_SESSION_COOKIE,
  getAdminUserFromCookieToken,
} from "@/lib/auth/adminSession";

export const metadata = {
  title: "Admin Dashboard | Gonzales Diamond Baseball",
  description:
    "Central admin dashboard for users, news posts, and dugout moderation.",
};

export default async function AdminDashboardPage() {
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

  const cards = [
    {
      href: "/admin/users",
      title: "User Management",
      description: "Promote/demote admins and manage user access roles.",
      action: "Open Users",
    },
    {
      href: "/news/admin",
      title: "News Management",
      description: "Create, edit, publish, and delete site news posts.",
      action: "Open News Admin",
    },
    {
      href: "/admin/dugout",
      title: "Dugout Moderation",
      description: "Edit or remove any post in The Dugout feed.",
      action: "Open Dugout Moderation",
    },
  ];

  return (
    <main className="min-h-screen bg-zinc-950 text-white py-14">
      <section className="max-w-6xl mx-auto px-6">
        <div className="mb-8">
          <div className="inline-block bg-brand-purple text-xs tracking-[3px] px-6 py-2 rounded-full mb-4">
            ADMIN DASHBOARD
          </div>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-3">
            Welcome, {displayName}
          </h1>
          <p className="text-zinc-400 max-w-3xl">
            Manage users, publish league updates, and moderate dugout posts from
            one place.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-5">
          {cards.map((card) => (
            <article
              key={card.href}
              className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-6"
            >
              <h2 className="text-2xl font-semibold mb-2">{card.title}</h2>
              <p className="text-zinc-400 text-sm mb-5">{card.description}</p>
              <Link
                href={card.href}
                className="inline-block text-sm font-semibold text-brand-gold hover:text-brand-gold/80"
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
