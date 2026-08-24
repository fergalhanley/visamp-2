import type { Metadata } from "next";

import { EditorShell } from "@/components/editor/editor-shell";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Editor",
  // Drafts and private work must never be indexed.
  robots: { index: false, follow: false },
};

/**
 * E6.12 — editing your own work saves in place; anyone else's is read-only and
 * offers a fork.
 *
 * A missing row renders the editor's empty stage rather than a 404. RLS hides
 * private work from non-owners, so "no such id", "just deleted" and "not yours"
 * all arrive here identically — and after deleting something, landing back on
 * an empty editor is more use than an error page.
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

  return (
    <EditorShell
      visualisation={visualisation}
      canEdit={Boolean(user && visualisation && visualisation.owner_id === user.id)}
    />
  );
}
