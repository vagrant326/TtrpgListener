function rgb(hex: string): [number, number, number] {
  const value = hex.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(value.slice(i, i + 2), 16)) as [number, number, number];
}

export function mixColors(start: string, end: string, progress: number): string {
  const eased = progress * progress * (3 - 2 * progress);
  const [a, b] = [rgb(start), rgb(end)];
  return "#" + a.map((channel, i) => Math.round(channel + (b[i] - channel) * eased).toString(16).padStart(2, "0")).join("");
}

// Time-based colour transition. A new fadeTo cancels the running one and continues from the colour currently
// shown, so rapid preset changes never jump. A slow apply simply results in fewer frames.
export class ColorFader {
  private current: string | undefined;
  private generation = 0;

  constructor(
    private readonly apply: (color: string) => Promise<void>,
    private readonly fps: number,
    private readonly onError: (error: Error) => void,
  ) {}

  fadeTo(target: string, seconds: number): void {
    const generation = ++this.generation;
    void this.run(generation, target, seconds);
  }

  private async run(generation: number, target: string, seconds: number): Promise<void> {
    const start = this.current ?? target;
    const began = performance.now();
    while (generation === this.generation) {
      const progress = seconds <= 0 ? 1 : Math.min(1, (performance.now() - began) / 1000 / seconds);
      const color = mixColors(start, target, progress);
      try {
        await this.apply(color);
      } catch (error) {
        this.onError(error as Error);
        return;
      }
      this.current = color;
      if (progress >= 1) {
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 1000 / this.fps));
    }
  }
}
