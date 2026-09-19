// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const m = vi.hoisted(() => ({
  user: vi.fn(),
  from: vi.fn(),
  rpc: vi.fn(),
  image: vi.fn(),
  rate: vi.fn(),
  deletions: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: m.user } }),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ from: m.from, rpc: m.rpc }),
}));
vi.mock("@/lib/hosted-audio/deletions", () => ({
  processHostedAudioDeletions: m.deletions,
}));
vi.mock("@/lib/music/artwork", () => ({ uploadArtwork: m.image }));
vi.mock("@/lib/rate-limit", () => ({ checkApiRateLimit: m.rate }));
import { GET as tracks } from "@/app/api/music/tracks/route";
import { POST as collection } from "@/app/api/music/collections/route";
import {
  PATCH as artist,
  POST as artistImage,
} from "@/app/api/my-artists/[id]/route";
import {
  PATCH as track,
  DELETE as removeTrack,
} from "@/app/api/my-tracks/[id]/route";
const owner = "11111111-1111-4111-8111-111111111111";
const id = "22222222-2222-4222-8222-222222222222";
function query(result: unknown) {
  const chain: Record<string, unknown> = {
    then: (resolve: (v: unknown) => unknown) =>
      Promise.resolve(result).then(resolve),
  };
  for (const method of [
    "select",
    "eq",
    "in",
    "order",
    "range",
    "update",
    "delete",
    "insert",
    "upsert",
  ]) {
    chain[method] = vi.fn(() => chain);
  }
  chain.maybeSingle = vi.fn(async () => result);
  chain.single = vi.fn(async () => result);
  return chain;
}
function request(path: string, body: unknown, method = "POST") {
  return new Request(`http://localhost${path}`, {
    method,
    headers: { origin: "http://localhost", "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  m.deletions.mockResolvedValue({ completed: 1, failed: 0 });
  m.user.mockResolvedValue({ data: { user: { id: owner } }, error: null });
  m.rate.mockResolvedValue({ allowed: true });
  m.rpc.mockResolvedValue({
    data: { tracks: [], nextOffset: null },
    error: null,
  });
});
it("scopes catalogue favourites to the session, never a caller supplied user", async () => {
  const response = await tracks(
    new Request(
      `http://localhost/api/music/tracks?favourites=true&userId=${id}&q=hello&offset=40`,
    ),
  );
  expect(response.status).toBe(200);
  expect(m.rpc).toHaveBeenCalledWith(
    "browse_music",
    expect.objectContaining({
      p_user_id: owner,
      p_favourites: true,
      p_query: "hello",
      p_offset: 40,
    }),
  );
});
it("rejects signed-out collections and invalid paging", async () => {
  m.user.mockResolvedValue({ data: { user: null }, error: null });
  expect(
    (
      await tracks(
        new Request("http://localhost/api/music/tracks?favourites=true"),
      )
    ).status,
  ).toBe(401);
  expect(
    (await tracks(new Request("http://localhost/api/music/tracks?offset=-1")))
      .status,
  ).toBe(400);
  expect(m.rpc).not.toHaveBeenCalled();
});
it("refuses another user's playlist mutation", async () => {
  const q = query({ data: null, error: null });
  m.from.mockReturnValue(q);
  const response = await collection(
    request("/api/music/collections", {
      action: "rename",
      playlistId: id,
      title: "Stolen",
    }),
  );
  expect(response.status).toBe(404);
  expect(q.eq).toHaveBeenCalledWith("owner_id", owner);
  expect(q.update).not.toHaveBeenCalled();
});
it("rejects cross-origin writes before a collection mutation", async () => {
  const response = await collection(
    new Request("http://localhost/api/music/collections", {
      method: "POST",
      headers: { origin: "https://elsewhere.test" },
      body: '{"action":"create","title":"x"}',
    }),
  );
  expect(response.status).toBe(403);
  expect(m.from).not.toHaveBeenCalled();
});
it("does not accept artist profile edits or artwork for another owner", async () => {
  const q = query({ data: null, error: null });
  m.from.mockReturnValue(q);
  expect(
    (
      await artist(
        request(
          `/api/my-artists/${id}`,
          { name: "New", bio: "", websiteUrl: "" },
          "PATCH",
        ),
        { params: Promise.resolve({ id }) },
      )
    ).status,
  ).toBe(404);
  expect(
    (
      await artistImage(request(`/api/my-artists/${id}`, {}), {
        params: Promise.resolve({ id }),
      })
    ).status,
  ).toBe(404);
  expect(m.image).not.toHaveBeenCalled();
  expect(q.update).not.toHaveBeenCalled();
  expect(q.eq).toHaveBeenCalledWith("claimed_by", owner);
});
it("requires the track artist to belong to the caller", async () => {
  const t = query({ data: { id, music_artist_id: id }, error: null });
  const a = query({ data: null, error: null });
  m.from.mockImplementation((name) => (name === "tracks" ? t : a));
  expect(
    (
      await track(
        request(
          `/api/my-tracks/${id}`,
          { title: "Changed", album: "" },
          "PATCH",
        ),
        { params: Promise.resolve({ id }) },
      )
    ).status,
  ).toBe(404);
  expect(t.update).not.toHaveBeenCalled();
  expect(a.eq).toHaveBeenCalledWith("claimed_by", owner);
});
it("reports artist name collisions without leaking SQL details", async () => {
  const q = query({ data: { id }, error: null });
  q.update = vi.fn(() =>
    query({
      data: null,
      error: { code: "23505", message: "secret SQL detail" },
    }),
  );
  m.from.mockReturnValue(q);
  const response = await artist(
    request(
      `/api/my-artists/${id}`,
      { name: "Taken", bio: "", websiteUrl: "" },
      "PATCH",
    ),
    { params: Promise.resolve({ id }) },
  );
  expect(response.status).toBe(409);
  expect(JSON.stringify(await response.json())).not.toContain("secret SQL");
});
it("rejects unsafe website URLs", async () => {
  const q = query({ data: { id }, error: null });
  m.from.mockReturnValue(q);
  const response = await artist(
    request(
      `/api/my-artists/${id}`,
      { name: "Artist", bio: "", websiteUrl: "javascript:alert(1)" },
      "PATCH",
    ),
    { params: Promise.resolve({ id }) },
  );
  expect(response.status).toBe(400);
  expect(q.update).not.toHaveBeenCalled();
});

it("withdraws tracks using the authenticated owner and processes queued assets", async () => {
  const response = await removeTrack(
    request(`/api/my-tracks/${id}`, { userId: id }, "DELETE"),
    { params: Promise.resolve({ id }) },
  );
  expect(response.status).toBe(200);
  expect(m.rpc).toHaveBeenCalledWith("withdraw_owned_track", {
    p_track_id: id,
    p_user_id: owner,
  });
  expect(m.deletions).toHaveBeenCalledWith({ trackId: id });
});
it("cannot remove another owner's track or delete its assets", async () => {
  m.rpc.mockResolvedValue({ error: { code: "42501" } });
  const response = await removeTrack(
    request(`/api/my-tracks/${id}`, {}, "DELETE"),
    { params: Promise.resolve({ id }) },
  );
  expect(response.status).toBe(404);
  expect(m.deletions).not.toHaveBeenCalled();
});
it("saves validated typed links and keeps the legacy website field compatible", async () => {
  const q = query({ data: { id }, error: null });
  m.from.mockReturnValue(q);
  const response = await artist(request(`/api/my-artists/${id}`, {
    name: "Act", bio: "Biography", links: [{type:"website",url:"https://act.example"},{type:"spotify",url:"https://open.spotify.com/artist/test"}],
  }, "PATCH"), {params:Promise.resolve({id})});
  expect(response.status).toBe(200);
  expect(q.update).toHaveBeenCalledWith({name:"Act",bio:"Biography",website_url:"https://act.example/",links:[{type:"website",url:"https://act.example/"},{type:"spotify",url:"https://open.spotify.com/artist/test"}]});
});
it("rejects unsafe artist links before writing and permits clearing all links", async () => {
  const q = query({data:{id},error:null});m.from.mockReturnValue(q);
  const response=await artist(request(`/api/my-artists/${id}`,{name:"Act",bio:"",links:[{type:"website",url:"javascript:alert(1)"}]},"PATCH"),{params:Promise.resolve({id})});
  expect(response.status).toBe(400);expect(q.update).not.toHaveBeenCalled();
  const cleared=await artist(request(`/api/my-artists/${id}`,{name:"Act",bio:"",links:[]},"PATCH"),{params:Promise.resolve({id})});
  expect(cleared.status).toBe(200);expect(q.update).toHaveBeenCalledWith({name:"Act",bio:null,website_url:null,links:[]});
});
it("stores artist banners separately after checking ownership", async () => {
  const q = query({ data: { id }, error: null });
  m.from.mockReturnValue(q);
  m.image.mockResolvedValue("artist-banners/new.webp");
  const response = await artistImage(request(`/api/my-artists/${id}?image=banner`, {}), { params: Promise.resolve({ id }) });
  expect(response.status).toBe(200);
  expect(q.eq).toHaveBeenCalledWith("claimed_by", owner);
  expect(m.image).toHaveBeenCalledWith(expect.any(Request), `artist-banners/${id}`, "banner");
  expect(q.update).toHaveBeenCalledWith({ banner_key: "artist-banners/new.webp" });
});
it("rejects another user's banner upload before processing the file", async () => {
  m.from.mockReturnValue(query({ data: null, error: null }));
  const response = await artistImage(request(`/api/my-artists/${id}?image=banner`, {}), { params: Promise.resolve({ id }) });
  expect(response.status).toBe(404);
  expect(m.image).not.toHaveBeenCalled();
});
