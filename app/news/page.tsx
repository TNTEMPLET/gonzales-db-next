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
    <main className="min-h-screen bg-zinc-950 py-10 text-white sm:py-14">
      <section className="mx-auto max-w-5xl px-4 sm:px-6">
        <div className="mb-8 flex flex-col gap-4 sm:mb-10 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="mb-4 inline-block rounded-full bg-brand-purple px-4 py-2 text-[11px] tracking-[2px] sm:px-6 sm:text-xs sm:tracking-[3px]">
              LEAGUE UPDATES
            </div>
            <h1 className="mb-3 text-3xl font-bold tracking-tight md:text-5xl">
              News & Announcements
            </h1>
            <p className="text-zinc-400 max-w-2xl">
              Stay current with schedules, policy updates, and special events.
            </p>
          </div>
          {isAdmin ? (
            <Link
              href="/news/admin"
              className="inline-flex min-h-11 items-center text-sm text-brand-gold transition hover:text-brand-gold/80"
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
