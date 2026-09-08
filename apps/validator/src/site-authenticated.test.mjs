import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { chromium } from "playwright";

const base = process.env.VISAMP_WEB_TEST_URL;
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const userId = "11111111-1111-4111-8111-111111111111";
const artistId = "22222222-2222-4222-8222-222222222222";
const licenceId = "33333333-3333-4333-8333-333333333333";
const jobId = "44444444-4444-4444-8444-444444444444";
const trackId = "55555555-5555-4555-8555-555555555555";

// Browser-only auth fixture. Every auth/data/API request is intercepted; the
// initial page request carries no fixture cookie and no real account is used.
async function signedInPage(browser, routeName, api) {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
  });
  const cookieName =
    "sb-" + new URL(supabaseUrl).hostname.split(".")[0] + "-auth-token";
  const user = {
    id: userId,
    email: "fixture@example.test",
    aud: "authenticated",
    role: "authenticated",
    app_metadata: { provider: "email", providers: ["email"] },
    user_metadata: {},
    created_at: "2026-01-01T00:00:00Z",
  };
  const expiresAt = Math.floor(Date.now() / 1000) + 3600;
  const jwt = [
    Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString(
      "base64url",
    ),
    Buffer.from(
      JSON.stringify({ sub: userId, exp: expiresAt, role: "authenticated" }),
    ).toString("base64url"),
    "browser-fixture-only",
  ].join(".");
  const session = {
    access_token: jwt,
    refresh_token: "browser-fixture-only",
    expires_at: expiresAt,
    expires_in: 3600,
    token_type: "bearer",
    user,
  };
  await context.addInitScript(
    ({ name, value }) => {
      document.cookie = name + "=" + value + "; Path=/; SameSite=Lax";
    },
    {
      name: cookieName,
      value:
        "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url"),
    },
  );
  await context.route(new URL(supabaseUrl).origin + "/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/auth/v1/user") return route.fulfill({ json: user });
    if (path === "/rest/v1/profiles")
      return route.fulfill({
        json: [
          {
            id: userId,
            username: "visualtester",
            display_name: "Do not display this name",
            avatar_path: null,
            avatar_url: null,
            bio: null,
            vis_count: 0,
            total_views: 0,
          },
        ],
      });
    return route.fulfill({
      status: 403,
      json: { error: "Unexpected fixture request" },
    });
  });
  await context.route("**/api/**", async (route) => {
    if (new URL(route.request().url()).pathname === "/api/admin/access")
      return route.fulfill({ json: { admin: routeName === "/admin" } });
    return api(route);
  });
  const page = await context.newPage();
  await page.goto(base + routeName, { waitUntil: "networkidle" });
  await page.getByRole("link", { name: "visualtester", exact: true }).waitFor();
  assert.equal(
    await page.getByText("Do not display this name", { exact: true }).count(),
    0,
  );
  return { page, context };
}

test(
  "artist uploads directly and retries submission without uploading the file again",
  { skip: !base || !supabaseUrl, timeout: 90000 },
  async () => {
    const browser = await chromium.launch();
    let puts = 0,
      starts = 0,
      completions = 0;
    const bytes = Buffer.from("test lossless master browser fixture");
    try {
      const { page, context } = await signedInPage(
        browser,
        "/upload",
        async (route) => {
          const path = new URL(route.request().url()).pathname;
          const method = route.request().method();
          if (path === "/api/uploads" && method === "GET")
            return route.fulfill({
              json: {
                artists: [
                  {
                    id: artistId,
                    name: "Test musician",
                    slug: "test-musician",
                  },
                ],
                licences: [
                  { id: licenceId, artistId, signedAt: "2026-01-01T00:00:00Z" },
                ],
                uploads:
                  completions > 1
                    ? [
                        {
                          id: jobId,
                          title: "First track",
                          status: "queued",
                          error: null,
                        },
                      ]
                    : [],
                admin: false,
              },
            });
          if (path === "/api/uploads" && method === "POST") {
            starts++;
            const data = route.request().postDataJSON();
            assert.equal(data.title, "First track");
            assert.equal(data.artistId, artistId);
            assert.equal(data.licenceId, licenceId);
            assert.equal(data.bytes, bytes.length);
            assert.equal(
              data.sha256,
              createHash("sha256").update(bytes).digest("hex"),
            );
            assert.equal(data.rightsConfirmed, true);
            return route.fulfill({
              json: {
                id: jobId,
                url: "https://upload-fixture.example/object",
                contentType: "audio/wav",
              },
            });
          }
          if (path === "/api/uploads/" + jobId + "/complete") {
            completions++;
            return route.fulfill(
              completions === 1
                ? {
                    status: 503,
                    json: { error: "Temporary submission failure" },
                  }
                : { json: { status: "queued" } },
            );
          }
          return route.fulfill({
            status: 501,
            json: { error: "Unexpected fixture route" },
          });
        },
      );
      await context.route("https://upload-fixture.example/**", (route) => {
        const headers = {
          "Access-Control-Allow-Origin": new URL(base).origin,
          "Access-Control-Allow-Methods": "PUT",
          "Access-Control-Allow-Headers": "content-type",
        };
        if (route.request().method() === "OPTIONS")
          return route.fulfill({ status: 204, headers });
        puts++;
        assert.equal(route.request().method(), "PUT");
        assert.deepEqual(route.request().postDataBuffer(), bytes);
        return route.fulfill({ status: 200, headers });
      });
      await page.getByLabel("Track title", { exact: true }).fill("First track");
      await page.locator('input[type="file"]').setInputFiles({
        name: "recording.wav",
        mimeType: "audio/wav",
        buffer: bytes,
      });
      await page.getByRole("checkbox").check();
      await page
        .getByRole("button", { name: "Upload track", exact: true })
        .click();
      await page
        .getByText("Temporary submission failure", { exact: true })
        .waitFor();
      await page
        .getByRole("button", { name: "Retry submission", exact: true })
        .click();
      await page
        .getByText(
          "Upload received. Your track is queued for processing and admin review.",
          { exact: true },
        )
        .waitFor();
      assert.deepEqual(
        { puts, starts, completions },
        { puts: 1, starts: 1, completions: 2 },
      );
      await context.close();
    } finally {
      await browser.close();
    }
  },
);

test(
  "admin edits and publishes a draft and can cancel withdrawal",
  { skip: !base || !supabaseUrl, timeout: 90000 },
  async () => {
    const browser = await chromium.launch();
    let track = {
      id: trackId,
      title: "Draft track",
      album: null,
      status: "draft",
      play_count: 12,
    };
    let publishes = 0,
      withdrawals = 0;
    try {
      const { page, context } = await signedInPage(
        browser,
        "/admin",
        async (route) => {
          const path = new URL(route.request().url()).pathname;
          if (path === "/api/admin/overview")
            return route.fulfill({
              json: {
                stats: { users: 8, visualisations: 12, tracks: 1, pending: 0 },
                tracks: [track],
                uploads: [],
                hasMore: false,
              },
            });
          if (
            path === "/api/admin/tracks/" + trackId &&
            route.request().method() === "PATCH"
          ) {
            track = { ...track, ...route.request().postDataJSON() };
            return route.fulfill({ json: { track } });
          }
          if (path.endsWith("/publish")) {
            publishes++;
            track.status = "live";
            return route.fulfill({ json: { track } });
          }
          if (path.endsWith("/withdraw")) {
            withdrawals++;
            return route.fulfill({ json: { withdrawn: true } });
          }
          return route.fulfill({
            status: 501,
            json: { error: "Unexpected fixture route" },
          });
        },
      );
      await page.getByRole("button", { name: "Edit", exact: true }).click();
      await page.getByLabel("Title", { exact: true }).fill("Renamed recording");
      await page.getByLabel("Album", { exact: true }).fill("First album");
      await page
        .getByRole("button", { name: "Save changes", exact: true })
        .click();
      await page
        .getByRole("cell", { name: "Renamed recording First album" })
        .waitFor();
      await page.getByRole("button", { name: "Publish", exact: true }).click();
      await page.getByRole("cell", { name: "live", exact: true }).waitFor();
      assert.equal(publishes, 1);
      page.once("dialog", (dialog) => dialog.dismiss());
      await page.getByRole("button", { name: "Withdraw", exact: true }).click();
      assert.equal(withdrawals, 0);
      await page.screenshot({ path: "/tmp/visamp-admin-fixture.png" });
      await context.close();
    } finally {
      await browser.close();
    }
  },
);
test(
  "failed transfers release the pending slot; expired submissions allow a new upload",
  { skip: !base || !supabaseUrl, timeout: 90000 },
  async () => {
    const browser = await chromium.launch();
    try {
      for (const scenario of ["transfer-failed", "expired"]) {
        let cancelled = 0;
        const { page, context } = await signedInPage(
          browser,
          "/upload",
          async (route) => {
            const path = new URL(route.request().url()).pathname;
            if (path === "/api/uploads" && route.request().method() === "GET")
              return route.fulfill({
                json: {
                  artists: [
                    {
                      id: artistId,
                      name: "Test musician",
                      slug: "test-musician",
                    },
                  ],
                  licences: [
                    {
                      id: licenceId,
                      artistId,
                      signedAt: "2026-01-01T00:00:00Z",
                    },
                  ],
                  uploads: [],
                  admin: false,
                },
              });
            if (path === "/api/uploads")
              return route.fulfill({
                json: {
                  id: jobId,
                  url: "https://upload-fixture.example/object",
                  contentType: "audio/wav",
                },
              });
            if (path.endsWith("/cancel")) {
              cancelled++;
              return route.fulfill({ json: { status: "failed" } });
            }
            if (path.endsWith("/complete"))
              return route.fulfill({
                status: 409,
                json: { error: "Upload expired. Please submit again." },
              });
            return route.fulfill({
              status: 501,
              json: { error: "Unexpected fixture route" },
            });
          },
        );
        await context.route("https://upload-fixture.example/**", (route) =>
          route.fulfill({
            status:
              route.request().method() === "OPTIONS"
                ? 204
                : scenario === "transfer-failed"
                  ? 500
                  : 200,
            headers: {
              "Access-Control-Allow-Origin": new URL(base).origin,
              "Access-Control-Allow-Methods": "PUT",
              "Access-Control-Allow-Headers": "content-type",
            },
          }),
        );
        await page
          .getByLabel("Track title", { exact: true })
          .fill("Recovery test");
        await page
          .locator('input[type="file"]')
          .setInputFiles({
            name: "recording.wav",
            mimeType: "audio/wav",
            buffer: Buffer.from("fixture"),
          });
        await page.getByRole("checkbox").check();
        await page
          .getByRole("button", { name: "Upload track", exact: true })
          .click();
        await page
          .getByText(
            scenario === "transfer-failed"
              ? "Upload failed. Please try again."
              : "Upload expired. Please submit again.",
            { exact: true },
          )
          .waitFor();
        assert.equal(
          await page
            .getByRole("button", { name: "Upload track", exact: true })
            .isEnabled(),
          true,
        );
        assert.equal(
          await page
            .getByRole("button", { name: "Retry submission", exact: true })
            .count(),
          0,
        );
        assert.equal(cancelled, scenario === "transfer-failed" ? 1 : 0);
        await context.close();
      }
    } finally {
      await browser.close();
    }
  },
);
