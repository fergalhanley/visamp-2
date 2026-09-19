export const artistLinkTypes = [
  { value: "website", label: "Website", domains: [] },
  { value: "spotify", label: "Spotify", domains: ["spotify.com"] },
  { value: "applemusic", label: "Apple Music", domains: ["music.apple.com"] },
  { value: "soundcloud", label: "SoundCloud", domains: ["soundcloud.com"] },
  { value: "bandcamp", label: "Bandcamp", domains: ["bandcamp.com"] },
  { value: "youtube", label: "YouTube", domains: ["youtube.com", "youtu.be"] },
  { value: "instagram", label: "Instagram", domains: ["instagram.com"] },
  { value: "tiktok", label: "TikTok", domains: ["tiktok.com"] },
  { value: "facebook", label: "Facebook", domains: ["facebook.com", "fb.com"] },
  { value: "x", label: "X", domains: ["x.com", "twitter.com"] },
  {
    value: "threads",
    label: "Threads",
    domains: ["threads.com", "threads.net"],
  },
  { value: "bluesky", label: "Bluesky", domains: ["bsky.app"] },
  { value: "twitch", label: "Twitch", domains: ["twitch.tv"] },
  {
    value: "discord",
    label: "Discord",
    domains: ["discord.gg", "discord.com"],
  },
  { value: "patreon", label: "Patreon", domains: ["patreon.com"] },
  { value: "mixcloud", label: "Mixcloud", domains: ["mixcloud.com"] },
  { value: "beatport", label: "Beatport", domains: ["beatport.com"] },
] as const;
export type ArtistLinkType = (typeof artistLinkTypes)[number]["value"];
export type ArtistLink = { type: ArtistLinkType; url: string };
export const MAX_ARTIST_LINKS = 20;

/** Shared validation: only navigable web URLs, never scripts or credentials. */
export function parseArtistLinks(value: unknown): ArtistLink[] {
  if (!Array.isArray(value) || value.length > MAX_ARTIST_LINKS)
    throw new Error(`Add up to ${MAX_ARTIST_LINKS} links.`);
  const seen = new Set<string>();
  return value.map((entry) => {
    if (!entry || typeof entry !== "object")
      throw new Error("Choose a link type and enter its URL.");
    const kind = artistLinkTypes.find((kind) => kind.value === entry.type);
    if (!kind) throw new Error("Choose a supported link type.");
    if (typeof entry.url !== "string" || entry.url.trim().length > 500)
      throw new Error(
        "Links must be full web addresses, up to 500 characters.",
      );
    let url: URL;
    try {
      if (/[\u0000-\u0020\u007f]/.test(entry.url.trim())) throw new Error();
      url = new URL(entry.url.trim());
      if (
        !["https:", "http:"].includes(url.protocol) ||
        !url.hostname ||
        url.username ||
        url.password ||
        url.href.length > 500
      )
        throw new Error();
    } catch {
      throw new Error(
        "Enter a full http or https link without spaces or sign-in details.",
      );
    }
    const domains: readonly string[] = kind.domains;
    if (
      domains.length &&
      !domains.some(
        (domain) =>
          url.hostname === domain || url.hostname.endsWith(`.${domain}`),
      )
    ) {
      throw new Error(
        `Enter a ${kind.label} link, or choose Website for a different address.`,
      );
    }
    const key = `${kind.value}:${url.href}`;
    if (seen.has(key)) throw new Error("This link is already listed.");
    seen.add(key);
    return { type: kind.value, url: url.href };
  });
}

/** Old websites remain readable during rollout; malformed legacy rows are omitted. */
export function readArtistLinks(
  value: unknown,
  website?: string | null,
): ArtistLink[] {
  const entries =
    Array.isArray(value) && value.length
      ? value
      : website
        ? [{ type: "website", url: website }]
        : [];
  const links = entries.slice(0, MAX_ARTIST_LINKS).flatMap((entry) => {
    try {
      return parseArtistLinks([entry]);
    } catch {
      return [];
    }
  });
  return [
    ...new Map(
      links.map((link) => [`${link.type}:${link.url}`, link]),
    ).values(),
  ];
}
