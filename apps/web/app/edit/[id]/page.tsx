import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { EditorShell } from "@/components/editor/editor-shell";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Editor",
  // Drafts and private work must never be indexed.
  robots: { index: false, follow: false },
};

/**
 * E6.12 — editing your own work saves in place; anyone else's is read-only and
 * offers a fork (which arrives with E6.11).
 *
 * RLS already hides private work from non-owners, so a `notFound()` here covers
 * both "no such id" and "not yours".
 */
export default async function EditorPage({ params }: PageProps<"/edit/[id]">) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: visualisation } = await supabase
    .from("visualisations")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (!visualisation) notFound();

  return (
    <EditorShell
      visualisation={visualisation}
      canEdit={Boolean(user) && visualisation.owner_id === user!.id}
    />
  );
}
