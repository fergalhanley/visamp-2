import { createAdminClient } from "@/lib/supabase/admin";
import {
  creatorFromProfile,
  visualisationFromRow,
} from "@/lib/visualisations";

/**
 * Visuals eligible for artist video creation.
 *
 * Direct Supabase reads deliberately expose source only for public work.
 * Protected/product work therefore crosses this service boundary instead.
 * M1 still executes Visript client-side, so this prevents product UI/API source
 * access but is not cryptographic source protection.
 */
export async function GET() {
  try {
    const { data, error } = await createAdminClient()
      .from("visualisations")
      .select("*, profiles!visualisations_owner_id_fkey(*)")
      .in("visibility", ["public", "protected", "product"])
      .order("updated_at", { ascending: false })
      .limit(200);

    if (error) throw error;

    return Response.json(
      {
        visualisations: (data ?? [])
          .filter(
            (row) =>
              row.visibility !== "product" ||
              row.marketplace_price_credits !== null,
          )
          .map((row) =>
            visualisationFromRow(row, creatorFromProfile(row.profiles)),
          ),
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    console.error("[studio-visuals]", error);
    return Response.json(
      { error: "Visuals are temporarily unavailable." },
      { status: 503 },
    );
  }
}
