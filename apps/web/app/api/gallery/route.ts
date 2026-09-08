import { getGalleryPage } from "@/lib/gallery";
export async function GET(request: Request) {
  try {
    return Response.json(
      await getGalleryPage(new URL(request.url).searchParams.get("cursor")),
    );
  } catch (error) {
    const invalid =
      error instanceof Error && error.message === "Invalid gallery cursor";
    return Response.json(
      { error: invalid ? error.message : "The gallery could not be loaded." },
      { status: invalid ? 400 : 503 },
    );
  }
}
