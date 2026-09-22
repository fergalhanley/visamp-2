"use client";
import { useState } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { createClient } from "@/lib/supabase/client";
import { track } from "@/lib/analytics/client";
export function CatalogueVisualActions({
  id,
  ownerId,
}: {
  id: string;
  ownerId?: string;
}) {
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function fork() {
    if (!user || busy) return;
    setBusy(true);
    setError("");
    try {
      const db = createClient();
      const original = await db
        .from("visualisations")
        .select("source,description")
        .eq("id", id)
        .maybeSingle();
      if (original.error) throw original.error;
      if (!original.data)
        throw new Error("This visualisation is no longer available.");
      const result = await db
        .from("visualisations")
        .insert({
          owner_id: user.id,
          source: original.data.source,
          description: original.data.description,
          visibility: "private",
          forked_from_id: id,
        })
        .select("id")
        .single();
      if (result.error) throw result.error;
      track("visualisation_forked", {
        visualisation_id: result.data.id,
        source_id: id,
      });
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- reset the visualisation engine on editor navigation
      location.assign(`/edit/${result.data.id}`);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not fork visualisation.",
      );
      setBusy(false);
    }
  }
  return (
    <span className="set-visual-actions">
      {user && user.id === ownerId && <a href={`/edit/${id}`}>Edit</a>}
      <button
        type="button"
        disabled={!user || busy}
        onClick={() => void fork()}
      >
        {busy ? "Forking…" : "Fork"}
      </button>
      {error && <span role="alert">{error}</span>}
    </span>
  );
}
