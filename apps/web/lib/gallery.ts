import "server-only";
import { createClient } from "@/lib/supabase/server";
import { publicStorageUrl } from "@/lib/storage-urls";
export type GalleryItem = {
  id: string;
  title: string;
  username: string | null;
  thumbnail: string | null;
  views: number;
};
export type GalleryPage = { items: GalleryItem[]; next: string | null };
const PAGE_SIZE = 24;
export async function getGalleryPage(
  cursor?: string | null,
): Promise<GalleryPage> {
  const db = await createClient();
  let query = db
    .from("visualisations")
    .select(
      "id,title,created_at,updated_at,thumb_path,view_count,profiles!visualisations_owner_id_fkey(username)",
    )
    .eq("visibility", "public")
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(PAGE_SIZE + 1);
  if (cursor) {
    const [createdAt, id] = cursor.split("~");
    if (
      !createdAt ||
      !/^\d{4}-\d{2}-\d{2}T[\d:.+-]+Z?$/.test(createdAt) ||
      !Number.isFinite(Date.parse(createdAt)) ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        id ?? "",
      )
    )
      throw new Error("Invalid gallery cursor");
    query = query.or(
      `created_at.lt.${createdAt},and(created_at.eq.${createdAt},id.lt.${id})`,
    );
  }
  const { data, error } = await query;
  if (error) throw new Error("The gallery could not be loaded.");
  const rows = (data ?? []).slice(0, PAGE_SIZE);
  const last = rows.at(-1);
  return {
    items: rows.map((row) => ({
      id: row.id,
      title: row.title,
      username: row.profiles?.username ?? null,
      thumbnail:
        publicStorageUrl("thumbnails", row.thumb_path, row.updated_at) ?? null,
      views: row.view_count,
    })),
    next:
      data && data.length > PAGE_SIZE && last
        ? `${last.created_at}~${last.id}`
        : null,
  };
}
