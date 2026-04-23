import { cookies } from "next/headers";
import Link from "next/link";

import NewsPostList from "@/components/news/NewsPostList";
import {
  ADMIN_SESSION_COOKIE,
  getAdminUserByToken,
} from "@/lib/auth/adminSession";
import { getPublishedNewsPosts } from "@/lib/news/queries";

import { getSiteConfig } from "@/lib/siteConfig";

export const dynamic = "force-dynamic";

export function generateMetadata() {
  const site = getSiteConfig();
  return {
    title: `News | ${site.name}`,
    description: `Latest announcements, rainout alerts, and league updates from ${site.name}.`,
  };
}

export default async function NewsPage() {
  const cookieStore = await cookies();
  const adminToken = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;
  const admin = await getAdminUserByToken(adminToken);
  const isAdmin = Boolean(admin);

  const posts = await getPublishedNewsPosts();

  return (
    <main className="min-h-screen bg-zinc-950 text-white py-14">
      <section className="max-w-5xl mx-auto px-6">
        <div className="flex items-end justify-between gap-4 mb-10">
          <div>
            <div className="inline-block bg-brand-purple text-xs tracking-[3px] px-6 py-2 rounded-full mb-4">
              LEAGUE UPDATES
            </div>
            <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-3">
              News & Announcements
            </h1>
            <p className="text-zinc-400 max-w-2xl">
              Stay current with schedules, policy updates, and special events.
            </p>
          </div>
          {isAdmin ? (
            <Link
              href="/news/admin"
              className="text-sm text-brand-gold hover:text-brand-gold/80 transition"
            >
              + New Post
            </Link>
          ) : null}
        </div>

        <NewsPostList posts={posts} isAdmin={isAdmin} />
      </section>
    </main>
  );
}
