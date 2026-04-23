import { notFound } from "next/navigation";
import Link from "next/link";

import { getPublishedNewsPostBySlug } from "@/lib/news/queries";
import { getSiteConfig } from "@/lib/siteConfig";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ slug: string }>;
};

function formatPublishedDate(value: Date | null) {
  if (!value) return "Draft";
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(value);
}

export async function generateMetadata({ params }: PageProps) {
  const { slug } = await params;
  const post = await getPublishedNewsPostBySlug(slug);

  const site = getSiteConfig();

  if (!post) {
    return {
      title: `News Article Not Found | ${site.name}`,
    };
  }

  return {
    title: `${post.title} | ${site.name}`,
    description: post.excerpt || "League news update",
  };
}

export default async function NewsDetailPage({ params }: PageProps) {
  const { slug } = await params;
  const post = await getPublishedNewsPostBySlug(slug);

  if (!post) notFound();

  return (
    <main className="min-h-screen bg-zinc-950 text-white py-14">
      <article className="max-w-4xl mx-auto px-6">
        <Link
          href="/news"
          className="text-sm text-brand-gold hover:text-brand-gold/80 transition"
        >
          Back to News
        </Link>

        <header className="mt-6 mb-8 border-b border-zinc-800 pb-6">
          <p className="text-xs uppercase tracking-[0.16em] text-zinc-500 mb-3">
            {formatPublishedDate(post.publishedAt)}
          </p>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-4">
            {post.title}
          </h1>
          <p className="text-zinc-400">By {post.author || "League Staff"}</p>
        </header>

        {post.excerpt ? (
          <p className="text-lg text-zinc-300 mb-8">{post.excerpt}</p>
        ) : null}

        {post.imageUrl ? (
          <div className="w-full rounded-2xl border border-zinc-800 bg-zinc-950/60 p-1 mb-8">
            <img
              src={post.imageUrl}
              alt={post.title}
              className="w-full h-auto max-h-[50vh] md:max-h-[65vh] rounded-xl object-contain"
            />
          </div>
        ) : null}

        <div className="prose prose-invert max-w-none prose-p:text-zinc-200 prose-headings:text-white">
          <p className="whitespace-pre-line leading-8">{post.content}</p>
        </div>
      </article>
    </main>
  );
}
