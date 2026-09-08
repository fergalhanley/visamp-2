import assert from "node:assert/strict";
import test from "node:test";
import { chromium } from "playwright";

const base = process.env.VISAMP_WEB_TEST_URL;
test(
  "site navigation, mobile gallery and anonymous access boundaries",
  { skip: !base, timeout: 120000 },
  async () => {
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage({
        viewport: { width: 1440, height: 1000 },
        reducedMotion: "reduce",
      });
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto(base, { waitUntil: "networkidle" });
      assert.equal(await page.locator(".landing-hero").count(), 1);
      assert.equal(
        await page.locator("#canvas, #visamp-stage").count(),
        0,
        "landing must not mount the player",
      );
      assert.equal(
        await page.locator(".site-header").getAttribute("inert"),
        "",
      );
      assert.equal(
        await page
          .getByRole("link", { name: "Play Now", exact: true })
          .getAttribute("href"),
        "/player",
      );
      await page.getByRole("link", { name: "Discover", exact: true }).click();
      await page.waitForFunction(() =>
        document
          .querySelector(".site-header")
          ?.classList.contains("is-visible"),
      );
      assert.equal(
        await page.locator(".site-header").getAttribute("inert"),
        null,
      );
      await page.getByRole("button", { name: "Site links" }).click();
      await page
        .getByRole("menuitem", { name: "Cookie Policy", exact: true })
        .waitFor();
      for (const label of [
        "Cookie Policy",
        "Privacy Policy",
        "Terms and Conditions",
        "Licencing",
        "Epilepsy Warning",
        "About",
      ])
        assert.equal(
          await page
            .getByRole("menuitem", { name: label, exact: true })
            .count(),
          1,
        );
      await page.keyboard.press("Escape");
      await page.setViewportSize({ width: 390, height: 844 });
      assert.equal(
        await page
          .locator(".site-page")
          .evaluate((element) => element.scrollWidth > element.clientWidth),
        false,
      );
      const gallery = await page.request.get(base + "/api/gallery");
      assert.equal(gallery.status(), 200);
      const data = await gallery.json();
      assert.ok(data.items.length <= 24);
      for (const item of data.items)
        assert.equal(
          Object.hasOwn(item, "source"),
          false,
          "gallery must not ship scripts",
        );
      if (data.next) {
        const next = await page.request.get(
          base + "/api/gallery?cursor=" + encodeURIComponent(data.next),
        );
        assert.equal(next.status(), 200);
        const following = await next.json();
        assert.equal(
          following.items.some((item) =>
            data.items.some((first) => first.id === item.id),
          ),
          false,
        );
      }
      assert.equal(
        (await page.request.get(base + "/api/gallery?cursor=invalid")).status(),
        400,
      );
      for (const route of [
        "/upload",
        "/admin",
        "/site/about",
        "/site/privacy-policy",
        "/site/epilepsy-warning",
      ]) {
        assert.equal(
          (
            await page.goto(base + route, { waitUntil: "networkidle" })
          ).status(),
          200,
        );
        assert.equal(await page.locator("#canvas, #visamp-stage").count(), 0);
      }
      for (const endpoint of [
        "/api/uploads",
        "/api/admin/access",
        "/api/admin/overview",
      ]) {
        assert.equal(
          (await page.request.get(base + endpoint)).status(),
          401,
          endpoint,
        );
      }
      for (const endpoint of [
        "/api/uploads",
        "/api/uploads/00000000-0000-4000-8000-000000000000/complete",
        "/api/uploads/00000000-0000-4000-8000-000000000000/cancel",
        "/api/admin/tracks/00000000-0000-4000-8000-000000000000/publish",
        "/api/admin/tracks/00000000-0000-4000-8000-000000000000/withdraw",
      ]) {
        assert.equal(
          (
            await page.request.post(base + endpoint, {
              headers: { Origin: new URL(base).origin },
              data: {},
            })
          ).status(),
          401,
        );
        assert.equal(
          (
            await page.request.post(base + endpoint, {
              headers: { Origin: "https://untrusted.example" },
              data: {},
            })
          ).status(),
          403,
        );
      }
      assert.deepEqual(errors, []);
    } finally {
      await browser.close();
    }
  },
);
