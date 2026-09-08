import type { Database } from "@/lib/supabase/database.types";

type Licence = Database["public"]["Tables"]["licences"]["Row"];
export function uploadLicenceValid(
  licence: Licence,
  today = new Date().toISOString().slice(0, 10),
) {
  return (
    licence.status === "active" &&
    !!licence.signed_at &&
    !!licence.effective_from &&
    licence.effective_from <= today &&
    (!licence.effective_until || licence.effective_until >= today) &&
    licence.grants_hosting &&
    licence.grants_streaming &&
    licence.grants_transcoding &&
    licence.grants_sync &&
    licence.warrants_master &&
    licence.warrants_publishing
  );
}

/** Bound JSON metadata before buffering it; audio bytes go directly to R2. */
export async function readUploadDetails(request: Request): Promise<unknown> {
  const reader = request.body?.getReader();
  if (!reader) throw new SyntaxError("Missing body");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 4096) {
        await reader.cancel();
        throw new RangeError("Upload details are too large.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
