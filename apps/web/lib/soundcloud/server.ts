import "server-only";

/**
 * SoundCloud access, server side only.
 *
 * The client secret never leaves the server. Browsers are handed pre-signed CDN
 * URLs instead of tokens — see `resolveStreamUrl`.
 *
 * Only the client-credentials flow is used, which covers public playlists. A
 * user-level Authorization Code flow (and the registered redirect URI) would
 * only be needed for private playlists or a listener's own likes.
 */

const TOKEN_ENDPOINT = "https://secure.soundcloud.com/oauth/token";
const API = "https://api.soundcloud.com";

interface CachedToken {
  value: string;
  /** Epoch ms. */
  expiresAt: number;
}

/**
 * Tokens are rate limited to 50 per 12 hours per app, so one must be reused
 * across requests rather than minted per call.
 *
 * Module scope means one token per server instance. That is fine for a single
 * long-lived process, but a serverless deployment that cold-starts often could
 * still approach the cap — move this to a shared cache before it matters.
 */
let cachedToken: CachedToken | null = null;
/** Collapses concurrent misses into a single token request. */
let inFlight: Promise<string> | null = null;

function credentials(): { id: string; secret: string } {
  const id = process.env.SOUNDCLOUD_CLIENT_ID;
  const secret = process.env.SOUNDCLOUD_CLIENT_SECRET;

  if (!id || !secret) {
    throw new Error("SoundCloud credentials are not configured");
  }
  return { id, secret };
}

async function requestToken(): Promise<string> {
  const { id, secret } = credentials();

  const response = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`,
    },
    body: "grant_type=client_credentials",
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`SoundCloud token request failed (${response.status})`);
  }

  const data = (await response.json()) as { access_token: string; expires_in: number };

  cachedToken = {
    value: data.access_token,
    // Renew a minute early rather than racing the expiry.
    expiresAt: Date.now() + (data.expires_in - 60) * 1000,
  };

  return cachedToken.value;
}

async function getToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now()) {
    return cachedToken.value;
  }

  inFlight ??= requestToken().finally(() => {
    inFlight = null;
  });

  return inFlight;
}

async function scFetch(path: string, init?: RequestInit): Promise<Response> {
  const token = await getToken();

  return fetch(`${API}${path}`, {
    ...init,
    headers: {
      ...init?.headers,
      Authorization: `Bearer ${token}`,
      accept: "application/json; charset=utf-8",
    },
    cache: "no-store",
    // /resolve answers with a 302 to the real resource.
    redirect: "follow",
  });
}

export interface SoundCloudTrack {
  id: number;
  title: string;
  artist: string;
  durationMs: number;
  artworkUrl: string | null;
  permalinkUrl: string | null;
}

export interface SoundCloudPlaylist {
  title: string;
  permalinkUrl: string | null;
  tracks: SoundCloudTrack[];
  /** Tracks dropped because SoundCloud will not stream them to this app. */
  unplayable: number;
}

interface RawTrack {
  id?: number;
  title?: string;
  access?: string;
  streamable?: boolean;
  duration?: number;
  artwork_url?: string | null;
  permalink_url?: string | null;
  user?: { username?: string } | null;
}

/** Accepts any soundcloud.com permalink; the API decides whether it is a set. */
export async function resolvePlaylist(url: string): Promise<SoundCloudPlaylist> {
  const response = await scFetch(`/resolve?url=${encodeURIComponent(url)}`);

  if (response.status === 404) {
    throw new Error("That SoundCloud URL could not be found");
  }
  if (!response.ok) {
    throw new Error(`SoundCloud rejected that URL (${response.status})`);
  }

  const data = (await response.json()) as {
    kind?: string;
    title?: string;
    permalink_url?: string;
    tracks?: RawTrack[];
  };

  if (data.kind !== "playlist") {
    throw new Error("That link is not a SoundCloud playlist");
  }

  const raw = data.tracks ?? [];
  const tracks: SoundCloudTrack[] = [];

  for (const track of raw) {
    // `access` is playable | preview | blocked. Anything but playable would
    // either cut off after 30s or fail outright, so it is not offered.
    if (!track.id || track.access !== "playable" || track.streamable === false) {
      continue;
    }

    tracks.push({
      id: track.id,
      title: track.title ?? "Untitled",
      artist: track.user?.username ?? "Unknown",
      durationMs: track.duration ?? 0,
      artworkUrl: track.artwork_url ?? null,
      permalinkUrl: track.permalink_url ?? null,
    });
  }

  return {
    title: data.title ?? "SoundCloud playlist",
    permalinkUrl: data.permalink_url ?? null,
    tracks,
    unplayable: raw.length - tracks.length,
  };
}

/**
 * Turns a track id into a browser-usable HLS URL.
 *
 * The API's stream endpoint needs our bearer token, but answers with a 302 to a
 * CDN URL that is signed and needs no auth — and which does send permissive
 * CORS headers, so hls.js can read it and the analyser can see the audio. We
 * follow that redirect here and hand the browser only the signed URL.
 */
export async function resolveStreamUrl(trackId: number): Promise<string> {
  const response = await scFetch(`/tracks/${trackId}/streams`);

  if (!response.ok) {
    throw new Error(`No stream available for track ${trackId}`);
  }

  const streams = (await response.json()) as Record<string, string>;
  // Prefer mp3 HLS: broader decoder support than AAC across browsers.
  const hls = streams.hls_mp3_128_url ?? streams.hls_aac_160_url;

  if (!hls) {
    throw new Error("SoundCloud returned no HLS stream for this track");
  }

  const token = await getToken();
  const redirect = await fetch(hls, {
    headers: { Authorization: `Bearer ${token}` },
    redirect: "manual",
    cache: "no-store",
  });

  const signed = redirect.headers.get("location");
  if (!signed) {
    throw new Error("SoundCloud did not return a signed stream URL");
  }

  return signed;
}
