import "server-only";
import { NextResponse } from "next/server";
import { AdminAuthorizationError } from "@/lib/hosted-audio/admin";
export function newsError(error: unknown) {
  if (error instanceof AdminAuthorizationError)
    return NextResponse.json(
      { error: error.message },
      { status: error.status },
    );
  console.error("News request failed", error);
  return NextResponse.json(
    { error: "Could not complete this request. Please try again." },
    { status: 500 },
  );
}
export function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin;
}
