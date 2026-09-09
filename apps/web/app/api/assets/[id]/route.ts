import { sameOrigin } from "@/lib/hosted-audio/uploads";
import { assetError, assetIdentity, readAssetDetails } from "@/lib/assets/server";
import { AssetRejected } from "@/lib/assets/rules";

/**
 * Publish or unpublish. Unpublishing only removes the asset from the library:
 * visuals that already reference it keep working, because bytes that have been
 * served publicly cannot be recalled and breaking other people's work to
 * pretend otherwise would be worse than being honest about it.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    sameOrigin(request);
    const { userId, db } = await assetIdentity();
    const { id } = await params;
    const body = await readAssetDetails(request);
    const visibility = (body as { visibility?: unknown } | null)?.visibility;
    if (visibility !== "public" && visibility !== "private")
      throw new AssetRejected("Visibility must be either public or private.");

    const { data, error } = await db
      .from("assets")
      .update({ visibility })
      .eq("id", id)
      .eq("owner_id", userId)
      .select("id,visibility,published_at")
      .maybeSingle();
    if (error) {
      // Raised by stamp_asset_publication for an unverified or withdrawn asset.
      if (error.code === "42501") throw new AssetRejected(error.message);
      throw new Error(error.message);
    }
    if (!data)
      return Response.json({ error: "Asset not found." }, { status: 404 });
    return Response.json(data, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return assetError(error);
  }
}

/** Only ever permitted for an asset that was never public; RLS is the enforcer. */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    sameOrigin(request);
    const { userId, db } = await assetIdentity();
    const { id } = await params;
    const { data, error } = await db
      .from("assets")
      .delete()
      .eq("id", id)
      .eq("owner_id", userId)
      .select("id")
      .maybeSingle();
    if (error) {
      // A reference from visualisation_assets is ON DELETE RESTRICT.
      if (error.code === "23503")
        throw new AssetRejected("This asset is still used by a visual.");
      throw new Error(error.message);
    }
    if (!data)
      return Response.json(
        { error: "This asset cannot be deleted once it has been public." },
        { status: 409 },
      );
    return Response.json({ deleted: true });
  } catch (error) {
    return assetError(error);
  }
}
