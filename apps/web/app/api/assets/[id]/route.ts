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

/** Only ever permitted for an asset that was never public and unreferenced. */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    sameOrigin(request);
    const { db } = await assetIdentity();
    const { id } = await params;
    // Deleting the row directly would strand the object: the row is the only
    // record of what to clean up, and the storage policy authorises against it.
    // delete_own_asset enqueues the object and removes the row together.
    const { error } = await db.rpc("delete_own_asset", { p_asset_id: id });
    if (error) {
      if (error.code === "42501") throw new AssetRejected(error.message);
      throw new Error(error.message);
    }
    return Response.json({ deleted: true });
  } catch (error) {
    return assetError(error);
  }
}
