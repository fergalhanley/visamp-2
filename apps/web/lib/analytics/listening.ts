/** Incremental wall-clock segments; seeks and suspended timers cannot add hours. */
export class ListeningClock {
  private last: number | null = null;
  private seconds = 0;
  tick(now: number, audible: boolean) {
    if (this.last !== null && audible)
      this.seconds += Math.max(0, Math.min((now - this.last) / 1000, 2));
    this.last = now;
    return this.seconds;
  }
  flush() {
    const seconds = this.seconds;
    this.seconds = 0;
    return seconds;
  }
}
