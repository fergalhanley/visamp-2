import { sameOrigin } from "@/lib/hosted-audio/uploads";
import {
  ASSET_BUCKET,
  assetError,
  assetIdentity,
  readAssetDetails,
  startAssetUpload,
} from "@/lib/assets/server";

/** The caller's own library, in any state, plus everything publicly offerable. */
export async function GET() {
  try {
    const { userId, db } = await assetIdentity();
    const mine = await db
      .from("assets")
      .select("id,kind,file_name,bytes,status,error,visibility,published_at,withdrawn_at,created_at")
      .eq("owner_id", userId)
      .order("created_at", { ascending: false })
      .limit(300);
    // Discovery filters on visibility explicitly. The read policy deliberately
    // keeps unpublished assets readable so existing references survive, which
    // is not the same as offering them for new use.
    const shared = await db
      .from("assets")
      .select("id,kind,file_name,bytes,created_at")
      .eq("visibility", "public")
      .eq("status", "ready")
      .is("withdrawn_at", null)
      .neq("owner_id", userId)
      .order("created_at", { ascending: false })
      .limit(200);
    if (mine.error || shared.error)
      throw new Error(mine.error?.message ?? shared.error?.message);
    return Response.json(
      { assets: mine.data, library: shared.data },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return assetError(error);
  }
}

export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const { userId, db } = await assetIdentity();
    const body = await readAssetDetails(request);
    const upload = await startAssetUpload(body, userId, db);
    return Response.json(
      {
        id: upload.id,
        bucket: ASSET_BUCKET,
        objectKey: upload.objectKey,
        contentType: upload.mimeType,
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return assetError(error);
  }
}
