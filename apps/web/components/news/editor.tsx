"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/auth/auth-provider";
import { AccountMenu } from "@/components/auth/account-menu";
import { NewsMarkdown } from "./markdown";
import { NEWS_IMAGE_MAX_BYTES, type NewsPost } from "@/lib/news/types";

export function NewsEditor() {
  const { user, loading } = useAuth();
  if (loading) return <p role="status">Checking your account…</p>;
  if (!user)
    return (
      <div className="site-form">
        <p>Sign in with a site administrator account to manage news.</p>
        <AccountMenu />
      </div>
    );
  return <Editor key={user.id} />;
}
function Editor() {
  const [posts, setPosts] = useState<NewsPost[] | null>(null);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [selected, setSelected] = useState<NewsPost | null>(null);
  const [writing, setWriting] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [alt, setAlt] = useState("");
  const textarea = useRef<HTMLTextAreaElement>(null);
  const dirty =
    writing &&
    (title !== (selected?.title ?? "") || body !== (selected?.body ?? ""));
  const refresh = useCallback(
    async (signal?: AbortSignal) => {
      const response = await fetch(`/api/admin/news?page=${page}`, {
        cache: "no-store",
        signal,
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setPosts(result.posts);
      setHasMore(result.hasMore);
    },
    [page],
  );
  useEffect(() => {
    const controller = new AbortController();
    // Fetch completion updates state asynchronously; abort on navigation.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh(controller.signal).catch((cause) => {
      if (!controller.signal.aborted) setError(cause.message);
    });
    return () => controller.abort();
  }, [refresh]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  function open(post: NewsPost | null) {
    if (dirty && !window.confirm("Discard your unsaved changes?")) return;
    setSelected(post);
    setTitle(post?.title ?? "");
    setBody(post?.body ?? "");
    setWriting(true);
    setPreview(false);
    setMessage("");
    setError("");
  }
  async function save(status: NewsPost["status"]) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch(
        selected ? `/api/admin/news/${selected.id}` : "/api/admin/news",
        {
          method: selected ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title,
            body,
            status,
            updated_at: selected?.updated_at,
          }),
        },
      );
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setSelected(result.post);
      setTitle(result.post.title);
      setBody(result.post.body);
      setMessage(
        status === "published"
          ? "Published. Your update is now on the News page."
          : "Draft saved. Only administrators can see it.",
      );
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save post.");
    } finally {
      setBusy(false);
    }
  }
  async function upload(file: File) {
    if (!selected) return;
    if (!alt.trim()) {
      setError("Add an image description before uploading.");
      return;
    }
    if (file.size > NEWS_IMAGE_MAX_BYTES) {
      setError("Choose an image under 3 MB.");
      return;
    }
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const form = new FormData();
      form.set("file", file);
      const response = await fetch(`/api/admin/news/${selected.id}/images`, {
        method: "POST",
        body: form,
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      const description = alt.trim().replace(/[\\\[\]\r\n]/g, " ");
      const position = textarea.current?.selectionStart ?? body.length;
      const markdown = `\n\n![${description}](${result.url})\n\n`;
      setBody(
        (value) => value.slice(0, position) + markdown + value.slice(position),
      );
      setAlt("");
      setMessage("Image inserted. Save your post to keep the change.");
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not upload image.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-8">
      {error && (
        <p role="alert" className="site-message">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="site-message">
          {message}
        </p>
      )}
      {!posts ? (
        <div>
          <p>{error ? "News editor unavailable." : "Loading posts…"}</p>
          <button
            className="site-button secondary"
            onClick={() => {
              setError("");
              void refresh().catch((cause) => setError(cause.message));
            }}
          >
            Retry
          </button>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-3">
            <button
              className="site-button primary"
              disabled={busy}
              onClick={() => open(null)}
            >
              New post
            </button>
            <Link
              href="/site/news"
              target="_blank"
              className="site-button secondary"
            >
              View public News
            </Link>
          </div>
          {writing && (
            <section
              className="site-form !max-w-none"
              aria-label="News post editor"
            >
              <h2 className="text-xl">
                {selected ? "Edit post" : "New post"}{" "}
                <span className="text-sm text-muted-foreground">
                  · {selected?.status ?? "unsaved draft"}
                  {dirty ? " · unsaved changes" : ""}
                </span>
              </h2>
              <fieldset disabled={busy} className="min-w-0 space-y-5">
                <label className="block">
                  Title
                  <input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    maxLength={200}
                    required
                    className="mt-2 w-full"
                  />
                </label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="site-button secondary"
                    aria-pressed={!preview}
                    onClick={() => setPreview(false)}
                  >
                    Write
                  </button>
                  <button
                    type="button"
                    className="site-button secondary"
                    aria-pressed={preview}
                    onClick={() => setPreview(true)}
                  >
                    Preview
                  </button>
                </div>
                {preview ? (
                  <div className="min-h-64 rounded-xl border border-border p-5">
                    <h2 className="mb-6 break-words text-3xl">
                      {title || "Untitled post"}
                    </h2>
                    <NewsMarkdown body={body || "Nothing to preview yet."} />
                  </div>
                ) : (
                  <label className="block">
                    Content
                    <textarea
                      ref={textarea}
                      value={body}
                      onChange={(e) => setBody(e.target.value)}
                      rows={16}
                      maxLength={50000}
                      className="mt-2 w-full font-mono text-sm"
                    />
                    <span className="text-xs text-muted-foreground">
                      Markdown: ## Heading, **bold**, *italic*, - list item,
                      [link text](https://example.com). Blank lines separate
                      paragraphs. HTML is not supported.
                    </span>
                  </label>
                )}
                <div className="space-y-3 rounded-xl border border-border p-4">
                  <h3>Add an image</h3>
                  <p className="text-sm text-muted-foreground">
                    JPG, PNG or WebP, up to 3 MB.{" "}
                    {selected
                      ? "The image is inserted at your cursor, or at the end of the post."
                      : "Save a draft first to enable image uploads."}
                  </p>
                  <label className="block">
                    Image description
                    <input
                      value={alt}
                      onChange={(e) => setAlt(e.target.value)}
                      maxLength={300}
                      disabled={!selected}
                      placeholder="Describe the image for readers who can’t see it"
                      className="mt-2 w-full"
                    />
                  </label>
                  <label className="block">
                    Upload image
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      disabled={!selected || !alt.trim()}
                      className="mt-2 block w-full"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        e.target.value = "";
                        if (file) void upload(file);
                      }}
                    />
                  </label>
                </div>
                <div className="flex flex-wrap gap-3">
                  <button
                    className="site-button secondary"
                    disabled={!title.trim()}
                    onClick={() => void save(selected?.status ?? "draft")}
                  >
                    {selected?.status === "published"
                      ? "Save published changes"
                      : "Save draft"}
                  </button>
                  {selected?.status !== "published" ? (
                    <button
                      className="site-button primary"
                      disabled={!title.trim() || !body.trim()}
                      onClick={() => void save("published")}
                    >
                      Publish
                    </button>
                  ) : (
                    <button
                      className="site-button secondary"
                      onClick={() => {
                        if (
                          window.confirm(
                            "Unpublish this post? It will become a private draft.",
                          )
                        )
                          void save("draft");
                      }}
                    >
                      Unpublish
                    </button>
                  )}
                  {busy && <span role="status">Saving…</span>}
                </div>
              </fieldset>
            </section>
          )}
          <div className="site-table-wrap">
            <table className="site-table">
              <thead>
                <tr>
                  <th>Post</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {posts.map((post) => (
                  <tr key={post.id}>
                    <td className="break-words">{post.title}</td>
                    <td>{post.status}</td>
                    <td>
                      <button
                        className="site-button secondary"
                        disabled={busy}
                        onClick={() => open(post)}
                        aria-label={`Edit ${post.title}`}
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!posts.length && (
              <p className="py-6">No posts yet. Create your first update.</p>
            )}
          </div>
          <div className="flex items-center justify-between">
            <button
              className="site-button secondary"
              disabled={!page || busy}
              onClick={() => setPage(page - 1)}
            >
              Previous
            </button>
            <span>Page {page + 1}</span>
            <button
              className="site-button secondary"
              disabled={!hasMore || busy}
              onClick={() => setPage(page + 1)}
            >
              Next
            </button>
          </div>
        </>
      )}
    </div>
  );
}
