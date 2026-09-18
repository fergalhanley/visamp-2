import "server-only";
import { checkApiRateLimit } from "@/lib/rate-limit";
import { HostedAudioHttpError } from "@/lib/hosted-audio/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export class MusicError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}
export const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export async function musicIdentity(required = true) {
  const { data, error } = await (await createClient()).auth.getUser();
  if (required && (error || !data.user))
    throw new MusicError(401, "Sign in to manage your music library.");
  return {
    userId: error ? null : (data.user?.id ?? null),
    db: createAdminClient(),
  };
}
export function musicResponse(data: unknown) {
  return Response.json(data, {
    headers: { "Cache-Control": "private, no-store" },
  });
}
export function musicError(error: unknown) {
  if (error instanceof MusicError || error instanceof HostedAudioHttpError)
    return Response.json({ error: error.message }, { status: error.status });
  console.error("[music]", error);
  return Response.json(
    { error: "Music is unavailable. Please try again." },
    { status: 503 },
  );
}
export async function musicBody(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin)
    throw new MusicError(403, "Invalid request origin.");
  const reader = request.body?.getReader();
  if (!reader) throw new MusicError(400, "Missing details.");
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > 16000) {
        await reader.cancel();
        throw new MusicError(413, "Too much data.");
      }
      chunks.push(part.value);
    }
    const data = JSON.parse(Buffer.concat(chunks).toString());
    if (!data || typeof data !== "object" || Array.isArray(data))
      throw new Error();
    return data as Record<string, unknown>;
  } catch (error) {
    if (error instanceof MusicError) throw error;
    throw new MusicError(400, "Invalid details.");
  }
}
export function boundedText(value: unknown, max: number, required = false) {
  if (
    typeof value !== "string" ||
    value.length > max ||
    (required && !value.trim())
  )
    throw new MusicError(
      400,
      `Enter ${required ? "1 to " : "up to "}${max} characters.`,
    );
  return value.trim();
}

export async function musicRate(request: Request, artwork = false) {
  const result = await checkApiRateLimit(
    request,
    artwork ? "music-artwork" : "music-library",
    artwork ? 600 : 180,
    60000,
  );
  if (!result.allowed)
    throw new MusicError(
      result.configured ? 429 : 503,
      result.configured
        ? "Too many requests. Please try again shortly."
        : "Music is temporarily unavailable.",
    );
}
