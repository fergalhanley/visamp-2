const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

function safeHttpsUrl(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

export function publicStorageUrl(
  bucket: "avatars" | "thumbnails",
  objectPath: string | null | undefined,
  version?: string,
): string | undefined {
  if (!supabaseUrl || !objectPath) return undefined;

  try {
    const base = new URL(supabaseUrl);
    const encodedPath = objectPath.split("/").map(encodeURIComponent).join("/");
    const url = new URL(
      `/storage/v1/object/public/${bucket}/${encodedPath}`,
      base,
    );
    if (version) url.searchParams.set("v", version);
    return url.toString();
  } catch {
    return undefined;
  }
}

export function profileAvatarUrl(
  profile: {
    avatar_path: string | null;
    avatar_url: string | null;
  } | null,
): string | undefined {
  return (
    publicStorageUrl("avatars", profile?.avatar_path) ??
    safeHttpsUrl(profile?.avatar_url)
  );
}
