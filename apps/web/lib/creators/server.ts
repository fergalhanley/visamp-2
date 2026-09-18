import "server-only";
import { cache } from "react";
import { createPublicClient } from "@/lib/supabase/public";
import { creatorFromProfile, visualisationFromRow } from "@/lib/visualisations";
import type { CreatorStats } from "@/hooks/use-creator-gallery";

export const loadPublicCreator = cache(async (username: string) => {
  const db = createPublicClient();
  const { data: profile, error } = await db.from("profiles").select("*").eq("username", username).maybeSingle();
  if (error) throw new Error("Could not load creator");
  if (!profile) return null;
  const { data, error: workError } = await db.from("visualisations").select("*")
    .eq("owner_id", profile.id).eq("visibility", "public")
    .order("created_at", { ascending: false }).limit(200);
  if (workError) throw new Error("Could not load creator work");
  if (!data?.length) return null;
  const creator = creatorFromProfile(profile);
  const stats: CreatorStats = {
    id: profile.id, creator, visCount: profile.vis_count, views: profile.total_views,
    likes: data.reduce((sum, row) => sum + row.like_count, 0),
  };
  return { stats, work: data.map(row => visualisationFromRow(row, creator)) };
});
