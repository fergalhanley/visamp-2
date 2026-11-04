import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const db = vi.hoisted(() => ({
  from: vi.fn(),
  select: vi.fn(),
  eq: vi.fn(),
  abortSignal: vi.fn(),
  maybeSingle: vi.fn(),
}));
vi.mock("./public-client", () => ({ createEmbedClient: () => db }));
import { loadEmbedVisualisation } from "./public-visualisation";
beforeEach(() => {
  vi.clearAllMocks();
  for (const method of [db.from, db.select, db.eq, db.abortSignal])
    method.mockReturnValue(db);
});
it("requests only public source using the anonymous client", async () => {
  db.maybeSingle.mockResolvedValue({
    data: {
      id: "123",
      slug: "waves",
      title: "Waves",
      source: "draw()",
      visibility: "public",
      profiles: { username: "artist" },
    },
    error: null,
  });
  expect(await loadEmbedVisualisation("waves")).toMatchObject({
    source: "draw()",
    credit: "artist",
    href: "/vis/waves",
  });
  expect(db.eq).toHaveBeenCalledWith("visibility", "public");
  expect(db.eq).toHaveBeenCalledWith("slug", "waves");
});
it.each(["private", "protected", "product"])(
  "never returns %s source, even if the query misbehaves",
  async (visibility) => {
    db.maybeSingle.mockResolvedValue({
      data: { visibility, source: "secret" },
      error: null,
    });
    expect(await loadEmbedVisualisation("waves")).toBeNull();
  },
);
it("rejects invalid identifiers before a database call", async () => {
  expect(await loadEmbedVisualisation("x,y(id)")).toBeNull();
  expect(db.from).not.toHaveBeenCalled();
});
it("surfaces unavailable data without leaking backend details", async () => {
  db.maybeSingle.mockResolvedValue({
    data: null,
    error: { message: "internal details" },
  });
  await expect(loadEmbedVisualisation("waves")).rejects.toThrow(
    "The visualisation could not be loaded.",
  );
});
