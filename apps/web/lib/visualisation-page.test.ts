import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ eq: vi.fn(), read: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ from: () => ({ select: () => ({ eq: (...args: unknown[]) => { mocks.eq(...args); return { maybeSingle: mocks.read }; } }) }) }) }));
vi.mock("@/components/shell/vis-sync", () => ({ VisSync: () => null }));
vi.mock("@/lib/visualisations", () => ({ creatorFromProfile: () => ({}), visualisationFromRow: (row: unknown) => row }));
vi.mock("next/navigation", () => ({ notFound: () => { throw Error("404"); }, permanentRedirect: (url: string) => { throw Error(`308:${url}`); }, redirect: (url: string) => { throw Error(`307:${url}`); } }));
import VisPage, { generateMetadata } from "@/app/vis/[id]/page";
const id = "11111111-1111-1111-1111-111111111111";
const work = { id, slug: "prism-velvet-otter", title: "Renamed Work", visibility: "public", creator: { username: "nova" } };
const props = (value: string) => ({ params: Promise.resolve({ id: value }), searchParams: Promise.resolve({}) });
beforeEach(() => { vi.clearAllMocks(); mocks.read.mockResolvedValue({ data: work, error: null }); });
it("redirects legacy UUIDs permanently to the stored slug", async () => {
  await expect(VisPage(props(id))).rejects.toThrow("308:/vis/prism-velvet-otter");
  expect(mocks.eq).toHaveBeenCalledWith("id", id);
});
it("loads a slug and uses it for canonical metadata after a title rename", async () => {
  const meta = await generateMetadata(props(work.slug));
  expect(mocks.eq).toHaveBeenCalledWith("slug", work.slug);
  expect(meta.alternates).toMatchObject({ canonical: "https://www.visamp.io/vis/prism-velvet-otter" });
  expect(meta.title).toBe("Renamed Work by nova");
  await expect(VisPage(props(work.slug))).resolves.toBeDefined();
});
it("preserves private-page exclusion and does not permanently cache draft redirects", async () => {
  mocks.read.mockResolvedValue({ data: { ...work, visibility: "private" }, error: null });
  expect((await generateMetadata(props(id))).robots).toMatchObject({ index: false });
  await expect(VisPage(props(id))).rejects.toThrow("307:/vis/prism-velvet-otter");
});
it("returns 404 when RLS hides a work but propagates database failures", async () => {
  mocks.read.mockResolvedValueOnce({ data: null, error: null });
  await expect(VisPage(props(work.slug))).rejects.toThrow("404");
  mocks.read.mockResolvedValueOnce({ data: null, error: { message: "offline" } });
  await expect(VisPage(props(work.slug))).rejects.toThrow("Could not load visualisation");
});
