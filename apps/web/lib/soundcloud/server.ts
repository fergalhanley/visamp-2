import "server-only";

/**
 * SoundCloud access, server side only.
 *
 * The client secret never leaves the server. Browsers are handed pre-signed CDN
 * URLs instead of tokens — see `resolveStreamUrl`.
 *
 * Client credentials are used for the initial token, which covers public
 * playlists. The returned refresh token is then rotated as access tokens
 * expire. A user-level Authorization Code flow would only be needed for
 * private playlists or a listener's own likes.
 */

const TOKEN_ENDPOINT = "https://secure.soundcloud.com/oauth/token";
const API = "https://api.soundcloud.com";

interface CachedToken {
  accessToken: string;
  refreshToken: string;
  /** Epoch ms. */
  expiresAt: number;
}

interface TokenState {
  cached: CachedToken | null;
  /** Collapses concurrent token exchanges into a single request. */
  inFlight: Promise<string> | null;
}

/**
 * Tokens are rate limited to 50 per 12 hours per app, so one must be reused
 * across requests rather than minted per call.
 *
 * Keeping this on globalThis preserves it across Next.js module replacement in
 * local development. Separate processes still need a shared secure cache if
 * this app is deployed with enough cold starts to approach SoundCloud's cap.
 */
const soundCloudGlobal = globalThis as typeof globalThis & {
  __visampSoundCloudTokenState?: TokenState;
};
const tokenState = (soundCloudGlobal.__visampSoundCloudTokenState ??= {
  cached: null,
  inFlight: null,
});

function credentials(): { id: string; secret: string } {
  const id = process.env.SOUNDCLOUD_CLIENT_ID;
  const secret = process.env.SOUNDCLOUD_CLIENT_SECRET;

  if (!id || !secret) {
    throw new Error("SoundCloud credentials are not configured");
  }
  return { id, secret };
}

interface TokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
}

async function exchangeToken(
  body: URLSearchParams,
  authorization?: string,
): Promise<string> {
  const headers = new Headers({
    "Content-Type": "application/x-www-form-urlencoded",
  });
  if (authorization) headers.set("Authorization", authorization);

  const response = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers,
    body,
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`SoundCloud token request failed (${response.status})`);
  }

  const data = (await response.json()) as TokenResponse;
  if (
    !data.access_token ||
    !data.refresh_token ||
    typeof data.expires_in !== "number" ||
    !Number.isFinite(data.expires_in)
  ) {
    throw new Error("SoundCloud returned an invalid token response");
  }

  // Only replace the cache after a complete response. Refresh tokens are
  // single-use, so this atomically rotates access and refresh credentials.
  tokenState.cached = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    // Renew a minute early rather than racing the expiry.
    expiresAt: Date.now() + Math.max(0, data.expires_in - 60) * 1000,
  };

  return tokenState.cached.accessToken;
}

async function requestClientCredentialsToken(): Promise<string> {
  const { id, secret } = credentials();
  return exchangeToken(
    new URLSearchParams({ grant_type: "client_credentials" }),
    `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`,
  );
}

async function refreshAccessToken(refreshToken: string): Promise<string> {
  const { id, secret } = credentials();
  return exchangeToken(
    new URLSearchParams({
      grant_type: "refresh_token",
      client_id: id,
      client_secret: secret,
      refresh_token: refreshToken,
    }),
  );
}

async function getToken(): Promise<string> {
  if (tokenState.cached && tokenState.cached.expiresAt > Date.now()) {
    return tokenState.cached.accessToken;
  }

  tokenState.inFlight ??= (
    tokenState.cached
      ? refreshAccessToken(tokenState.cached.refreshToken)
      : requestClientCredentialsToken()
  ).finally(() => {
    tokenState.inFlight = null;
  });

  return tokenState.inFlight;
}

async function scFetch(path: string, init?: RequestInit): Promise<Response> {
  const token = await getToken();
  const headers = new Headers(init?.headers);
  headers.set("Authorization", `OAuth ${token}`);
  headers.set("accept", "application/json; charset=utf-8");

  return fetch(`${API}${path}`, {
    ...init,
    headers,
    cache: "no-store",
    // /resolve answers with a 302 to the real resource.
    redirect: init?.redirect ?? "follow",
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
 * The API's stream endpoint needs our OAuth token, but answers with a 302 to a
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
    headers: { Authorization: `OAuth ${token}` },
    redirect: "manual",
    cache: "no-store",
  });

  const signed = redirect.headers.get("location");
  if (redirect.status < 300 || redirect.status >= 400 || !signed) {
    throw new Error("SoundCloud did not return a signed stream URL");
  }

  return signed;
}
