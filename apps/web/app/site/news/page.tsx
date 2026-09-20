import Link from "next/link";
import { connection } from "next/server";
import { TopBar } from "@/components/chrome/top-bar";
import { SiteFooter } from "@/components/site/site-footer";
import { NewsMarkdown } from "@/components/news/markdown";
import { createPublicClient } from "@/lib/supabase/public";
import { NEWS_PAGE_SIZE } from "@/lib/news/types";
import { publicMetadata } from "@/lib/seo";
export const metadata = publicMetadata(
  "/site/news",
  "News",
  "VisAmp releases, community highlights and updates.",
);
export default async function NewsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  await connection();
  const query = await searchParams;
  const page = Math.max(
    1,
    Math.min(10000, Math.floor(Number(query.page) || 1)),
  );
  const { data, error } = await createPublicClient()
    .from("news_posts")
    .select("*")
    .eq("status", "published")
    .order("published_at", { ascending: false })
    .order("id")
    .range((page - 1) * NEWS_PAGE_SIZE, page * NEWS_PAGE_SIZE);
  return (
    <div className="site-page">
      <TopBar />
      <main className="site-content">
        <p className="site-eyebrow">VISAMP</p>
        <h1>News</h1>
        <p className="mb-10 text-muted-foreground">
          Releases, community highlights and what we’re building next.
        </p>
        {error ? (
          <p role="alert">
            News is temporarily unavailable. Please try again shortly.
          </p>
        ) : !data?.length ? (
          <p>
            {page === 1
              ? "No news yet. Check back soon for our first update."
              : "No more posts."}
          </p>
        ) : (
          <div className="max-w-3xl space-y-14">
            {data.slice(0, NEWS_PAGE_SIZE).map((post) => (
              <article
                key={post.id}
                id={post.id}
                className="space-y-5 border-b border-border pb-12"
              >
                <time
                  className="text-sm text-muted-foreground"
                  dateTime={post.published_at!}
                >
                  {new Date(post.published_at!).toLocaleDateString("en-AU", {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                    timeZone: "Australia/Adelaide",
                  })}
                </time>
                <h2 className="break-words text-3xl font-medium">
                  {post.title}
                </h2>
                <NewsMarkdown body={post.body} />
              </article>
            ))}
          </div>
        )}
        <nav aria-label="News pages" className="mt-8 flex gap-4">
          {page > 1 && (
            <Link
              className="site-button secondary"
              href={`/site/news?page=${page - 1}`}
            >
              Newer posts
            </Link>
          )}
          {!error && data && data.length > NEWS_PAGE_SIZE && (
            <Link
              className="site-button secondary"
              href={`/site/news?page=${page + 1}`}
            >
              Older posts
            </Link>
          )}
        </nav>
      </main>
      <SiteFooter />
    </div>
  );
}
