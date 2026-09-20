export type NewsPost = {
  id: string;
  title: string;
  body: string;
  status: "draft" | "published";
  published_at: string | null;
  created_at: string;
  updated_at: string;
};
export const NEWS_PAGE_SIZE = 10;
export const NEWS_IMAGE_MAX_BYTES = 3 * 1024 * 1024;
export const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function parseNewsInput(
  value: unknown,
): Pick<NewsPost, "title" | "body" | "status"> {
  if (!value || typeof value !== "object") throw new Error("Invalid post.");
  const body = value as Record<string, unknown>;
  if (
    typeof body.title !== "string" ||
    !body.title.trim() ||
    body.title.trim().length > 200
  )
    throw new Error("Enter a title of up to 200 characters.");
  if (typeof body.body !== "string" || body.body.length > 50000)
    throw new Error("Content must be at most 50,000 characters.");
  if (body.status !== "draft" && body.status !== "published")
    throw new Error("Invalid post status.");
  if (body.status === "published" && !body.body.trim())
    throw new Error("Add content before publishing.");
  return { title: body.title.trim(), body: body.body, status: body.status };
}
