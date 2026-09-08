import { chromium } from "playwright";

export class BrowserPool {
  #available = [];
  #waiting = [];
  #size;
  #maxQueue;
  #queueWaitMs;
  #closed = false;

  constructor(size, { maxQueue, queueWaitMs }) {
    this.#size = size;
    this.#maxQueue = maxQueue;
    this.#queueWaitMs = queueWaitMs;
  }

  async start() {
    this.#available = await Promise.all(
      Array.from({ length: this.#size }, () => this.#launch()),
    );
  }

  async #launch() {
    return chromium.launch({
      headless: true,
      args: [
        "--disable-dev-shm-usage",
        "--enable-webgl",
        "--use-angle=swiftshader",
      ],
    });
  }

  async acquire() {
    if (this.#closed) throw new Error("validator pool is closed");
    const browser = this.#available.pop();
    if (browser) return browser;
    if (this.#waiting.length >= this.#maxQueue) {
      throw new PoolCapacityError("validator queue is full");
    }

    return new Promise((resolve, reject) => {
      const waiter = { resolve, reject, timer: undefined };
      waiter.timer = setTimeout(() => {
        const index = this.#waiting.indexOf(waiter);
        if (index !== -1) this.#waiting.splice(index, 1);
        reject(new PoolCapacityError("validator queue wait limit exceeded"));
      }, this.#queueWaitMs);
      this.#waiting.push(waiter);
    });
  }

  release(browser) {
    if (this.#closed) {
      void browser.close().catch(() => {});
      return;
    }
    const waiter = this.#waiting.shift();
    if (waiter) {
      clearTimeout(waiter.timer);
      waiter.resolve(browser);
    } else this.#available.push(browser);
  }

  async replace(browser) {
    await browser.close().catch(() => {});
    if (this.#closed) return;
    this.release(await this.#launch());
  }

  async close() {
    this.#closed = true;
    for (const waiter of this.#waiting.splice(0)) {
      clearTimeout(waiter.timer);
      waiter.reject(new PoolCapacityError("validator pool is closed"));
    }
    await Promise.all(
      this.#available.splice(0).map((browser) => browser.close()),
    );
  }
}

export class PoolCapacityError extends Error {}
