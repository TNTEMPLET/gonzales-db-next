import Link from "next/link";

import { getPublishedNewsPosts } from "@/lib/news/queries";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "News | Gonzales Diamond Baseball",
  description:
    "Latest announcements, rainout alerts, and league updates from Gonzales Diamond Baseball.",
};

type NewsListPost = {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  imageUrl: string | null;
  author: string | null;
  featured: boolean;
  publishedAt: Date | null;
};

function formatPublishedDate(value: Date | null) {
  if (!value) return "Draft";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(value);
}

export default async function NewsPage() {
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
          <Link
            href="/news/admin"
            className="text-sm text-brand-gold hover:text-brand-gold/80 transition"
          >
            Admin
          </Link>
        </div>

        {posts.length === 0 ? (
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-8 text-center">
            <p className="text-zinc-300">No published posts yet.</p>
            <p className="text-zinc-500 text-sm mt-2">
              Create your first article in the News Admin page.
            </p>
          </div>
        ) : (
          <div className="grid gap-5">
            {posts.map((post: NewsListPost) => (
              <article
                key={post.id}
                className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-6 hover:border-zinc-700 transition"
              >
                <div className="flex flex-col lg:flex-row lg:items-start gap-5">
                  {post.imageUrl ? (
                    <div className="w-full lg:w-72 xl:w-80 lg:flex-shrink-0 rounded-xl border border-zinc-800 bg-zinc-950/60 p-1">
                      <img
                        src={post.imageUrl}
                        alt={post.title}
                        className="w-full h-auto max-h-[32vh] sm:max-h-[38vh] lg:max-h-[260px] xl:max-h-[300px] rounded-lg object-contain"
                      />
                    </div>
                  ) : null}

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-4 mb-3">
                      <p className="text-xs uppercase tracking-[0.16em] text-zinc-500">
                        {formatPublishedDate(post.publishedAt)}
                      </p>
                      {post.featured ? (
                        <span className="text-[11px] bg-brand-gold text-black px-2 py-1 rounded-full font-semibold tracking-wide">
                          Featured
                        </span>
                      ) : null}
                    </div>
                    <h2 className="text-2xl font-semibold mb-2">
                      {post.title}
                    </h2>
                    {post.excerpt ? (
                      <p className="text-zinc-300 mb-4">{post.excerpt}</p>
                    ) : null}
                    <div className="flex items-center justify-between gap-4">
                      <p className="text-zinc-500 text-sm">
                        By {post.author || "League Staff"}
                      </p>
                      <Link
                        href={`/news/${post.slug}`}
                        className="text-brand-gold hover:text-brand-gold/80 text-sm font-semibold"
                      >
                        Read More
                      </Link>
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
