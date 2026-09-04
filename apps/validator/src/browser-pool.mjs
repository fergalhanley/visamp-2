import { chromium } from "playwright";

export class BrowserPool {
  #available = [];
  #waiting = [];
  #size;

  constructor(size) {
    this.#size = size;
  }

  async start() {
    this.#available = await Promise.all(
      Array.from({ length: this.#size }, () => this.#launch()),
    );
  }

  async #launch() {
    return chromium.launch({
      headless: true,
      args: ["--disable-dev-shm-usage", "--enable-webgl", "--use-angle=swiftshader"],
    });
  }

  async acquire() {
    const browser = this.#available.pop();
    if (browser) return browser;
    return new Promise((resolve) => this.#waiting.push(resolve));
  }

  release(browser) {
    const waiter = this.#waiting.shift();
    if (waiter) waiter(browser);
    else this.#available.push(browser);
  }

  async replace(browser) {
    await browser.close().catch(() => {});
    this.release(await this.#launch());
  }

  async close() {
    await Promise.all(this.#available.splice(0).map((browser) => browser.close()));
  }
}
