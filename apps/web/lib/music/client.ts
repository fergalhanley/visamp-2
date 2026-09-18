export async function musicRequest<T>(
  url: string,
  body?: Record<string, unknown>,
  method = "POST",
): Promise<T> {
  const response = await fetch(
    url,
    body
      ? {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      : { cache: "no-store" },
  );
  const data = await response.json();
  if (!response.ok)
    throw new Error(data.error ?? "Could not update your music library.");
  return data as T;
}
export function collectionChanged() {
  window.dispatchEvent(new Event("visamp:music-changed"));
}
