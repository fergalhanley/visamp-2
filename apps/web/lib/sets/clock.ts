/** Audio-clock time when running, monotonic time through suspension/failure/handoff. */
export class PlaybackClock {
  private wall: number;
  private audio: number | null = null;
  private elapsed = 0;
  constructor(
    private wallNow: () => number,
    private audioNow: () => number | null,
  ) {
    this.wall = wallNow();
  }
  now = () => {
    const wall = this.wallNow(),
      audio = this.audioNow();
    this.elapsed += Math.max(
      0,
      audio !== null && this.audio !== null
        ? audio - this.audio
        : wall - this.wall,
    );
    this.wall = wall;
    this.audio = audio;
    return this.elapsed;
  };
}
