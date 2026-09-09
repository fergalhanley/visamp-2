import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

/**
 * The visualisation the landing hero renders.
 *
 * The id is hardcoded, not the script: editing that visual in the editor
 * changes the front page, with no deploy. `/` is server-rendered per request,
 * so there is no cache between an edit and the next visitor.
 */
export const LANDING_HERO_VIS_ID = "ea470392-5ff8-4972-8369-8e357f595b01";

/**
 * Read with the service role rather than the viewer's session, deliberately.
 *
 * The hero visual is private, and the landing page is public — under RLS an
 * anonymous visitor would get nothing back. Making it public instead would
 * work, but it would also list it in the gallery below, which is not what a
 * masthead is. This reads one hardcoded id, one column, and nothing else.
 *
 * Returns null rather than throwing on any failure — deleted, renamed away,
 * emptied, or the database being unreachable. The hero then renders its own
 * background and the front page still works, which matters more than the
 * animation.
 */
export async function getLandingHeroSource(): Promise<string | null> {
  try {
    const { data, error } = await createAdminClient()
      .from("visualisations")
      .select("source")
      .eq("id", LANDING_HERO_VIS_ID)
      .maybeSingle();

    if (error || !data?.source?.trim()) return null;
    return data.source;
  } catch {
    return null;
  }
}
