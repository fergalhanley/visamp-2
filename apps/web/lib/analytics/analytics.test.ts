import { beforeEach, describe, expect, it, vi } from "vitest";
import { analyticsEnvironment, routeTemplate } from "./config";
import { cleanProperties } from "./events";
import { ListeningClock } from "./listening";

const mock = vi.hoisted(() => ({
  init: vi.fn(),
  track: vi.fn(),
  identify: vi.fn(),
  reset: vi.fn(),
  opt_in_tracking: vi.fn(),
  opt_out_tracking: vi.fn(),
}));
vi.mock("mixpanel-browser", () => ({ default: { init: mock.init } }));
beforeEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
  vi.clearAllMocks();
  const storage = () => {
    const values = new Map<string, string>();
    return {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => {
        values.set(key, value);
      },
      removeItem: (key: string) => {
        values.delete(key);
      },
    };
  };
  vi.stubGlobal("localStorage", storage());
  vi.stubGlobal("sessionStorage", storage());
  mock.init.mockReturnValue(mock);
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
});
describe("analytics isolation", () => {
  it("requires both production deployment and hostname; automation always stages", () => {
    expect(analyticsEnvironment("production", "visamp.io")).toBe("production");
    for (const [deployment, host] of [
      ["production", "localhost"],
      ["preview", "visamp.io"],
      ["development", "visamp.io"],
      ["production", "preview.vercel.app"],
    ])
      expect(analyticsEnvironment(deployment, host!)).toBe("staging");
    expect(analyticsEnvironment("production", "visamp.io", true)).toBe(
      "staging",
    );
  });
  it("removes URL identifiers, arbitrary query strings, code and raw errors", () => {
    expect(routeTemplate("/edit/private-id?prompt=secret#code")).toBe(
      "/edit/[id]",
    );
    expect(routeTemplate("/unknown/secret@example.com")).toBe("/unknown");
    expect(
      cleanProperties("generation_failed", {
        request_id: "id",
        prompt: "secret",
        error: "secret",
        failure_category: "validation",
      }),
    ).toEqual({ request_id: "id", failure_category: "validation" });
  });
  it("does not initialise or send anything before opt-in", async () => {
    const client = await import("./client");
    await client.pageViewed("/");
    client.track("billing_viewed");
    expect(mock.init).not.toHaveBeenCalled();
    expect(mock.track).not.toHaveBeenCalled();
  });
  it("deduplicates rerenders but counts Back and resets account identity", async () => {
    const client = await import("./client");
    await client.setAnalyticsConsent(true);
    await client.pageViewed("/");
    await client.pageViewed("/");
    await client.pageViewed("/artists");
    await client.pageViewed("/");
    expect(
      mock.track.mock.calls.filter(([name]) => name === "page_viewed"),
    ).toHaveLength(3);
    client.identifyAnalytics("user-a");
    client.identifyAnalytics("user-b");
    expect(mock.reset).toHaveBeenCalledTimes(1);
    expect(mock.identify.mock.calls).toEqual([["user-a"], ["user-b"]]);
    client.identifyAnalytics(null);
    expect(mock.reset).toHaveBeenCalledTimes(2);
  });
  it("withdrawal immediately stops tracking and requests server revocation", async () => {
    const client = await import("./client");
    await client.setAnalyticsConsent(true);
    client.track("billing_viewed");
    await client.setAnalyticsConsent(false);
    client.track("billing_viewed");
    expect(mock.track).toHaveBeenCalledTimes(1);
    expect(mock.opt_out_tracking).toHaveBeenCalledOnce();
    expect(
      JSON.parse(vi.mocked(fetch).mock.calls.at(-1)![1]!.body as string)
        .accepted,
    ).toBe(false);
  });
  it("reports a failed server preference update so withdrawal can be retried", async () => {
    const client = await import("./client");
    vi.mocked(fetch).mockResolvedValueOnce({ ok: false } as Response);
    expect(await client.setAnalyticsConsent(false)).toBe(false);
    expect(client.consent()).toBe("declined");
  });
});
it("listening segments exclude pauses, do not overlap and bound suspended timers", () => {
  const clock = new ListeningClock();
  clock.tick(0, false);
  clock.tick(1000, true);
  clock.tick(2000, true);
  expect(clock.flush()).toBe(2);
  expect(clock.flush()).toBe(0);
  clock.tick(3000, false);
  expect(clock.flush()).toBe(0);
  clock.tick(3_600_000, true);
  expect(clock.flush()).toBe(2);
});

it("holds consented events during SDK startup but discards them on withdrawal", async () => {
  const client = await import("./client");
  localStorage.setItem(client.consentKey, "accepted");
  client.track("editor_opened", { visualisation_id: "first" });
  await client.initialiseAnalytics();
  expect(mock.track).toHaveBeenCalledWith(
    "editor_opened",
    expect.objectContaining({ visualisation_id: "first" }),
  );
  await client.setAnalyticsConsent(false);
  client.track("editor_opened", { visualisation_id: "declined" });
  await client.setAnalyticsConsent(true);
  expect(
    mock.track.mock.calls.some(
      ([, props]) => props.visualisation_id === "declined",
    ),
  ).toBe(false);
});
