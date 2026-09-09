import { sameOrigin } from "@/lib/hosted-audio/uploads";
import { assetError, assetIdentity, completeAssetUpload } from "@/lib/assets/server";

/** Called once the bytes are in storage. Nothing is readable until this passes. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    sameOrigin(request);
    const { userId } = await assetIdentity();
    const { id } = await params;
    return Response.json(await completeAssetUpload(id, userId), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return assetError(error);
  }
}
