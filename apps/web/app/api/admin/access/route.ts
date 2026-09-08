import {
  requireAdmin,
  AdminAuthorizationError,
} from "@/lib/hosted-audio/admin";
export async function GET() {
  try {
    await requireAdmin();
    return Response.json(
      { admin: true },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return Response.json(
      { admin: false },
      {
        status: error instanceof AdminAuthorizationError ? error.status : 503,
        headers: { "Cache-Control": "private, no-store" },
      },
    );
  }
}
