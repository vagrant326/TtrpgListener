import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Decision } from "../classifier/classifierPrompt.ts";
import type { DebugLog } from "../log/debugLog.ts";
import type { SceneDirector } from "../sceneDirector.ts";

interface Scenario {
  name: string;
  segments: { expected: Decision; note?: string; lines: string[] }[];
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Feeds scripted transcript lines as if the microphone produced them, classifies after each segment
// and compares the picked presets with the segment's expected ones.
export class ScenarioPlayer {
  readonly scenarios: Scenario[] = JSON.parse(readFileSync(join(import.meta.dirname, "scenarios.json"), "utf-8"));
  running = false;
  private stopRequested = false;

  constructor(
    private readonly director: SceneDirector,
    private readonly log: DebugLog,
    private readonly onChange: () => void,
  ) {}

  stop(): void {
    this.stopRequested = true;
  }

  async play(index: number, lineDelaySeconds: number): Promise<void> {
    const scenario = this.scenarios[index];
    if (this.running || !scenario) {
      return;
    }
    this.running = true;
    this.stopRequested = false;
    this.director.suspendAuto = true;
    this.onChange();
    let hits = 0;
    let checked = 0;
    this.log.emit("scenario", `Start scenariusza „${scenario.name}” (${scenario.segments.length} segmentów)`);
    try {
      for (const [number, segment] of scenario.segments.entries()) {
        this.log.emit("scenario", `Segment ${number + 1}/${scenario.segments.length}: ${segment.note ?? ""}`, { expected: segment.expected });
        for (const line of segment.lines) {
          await sleep(lineDelaySeconds * 1000);
          if (this.stopRequested) {
            this.log.emit("scenario", "Scenariusz przerwany");
            return;
          }
          this.director.addText(line, "scenariusz");
        }
        while (this.director.classifier.busy) {
          await sleep(100);
        }
        const decision = await this.director.classify({ force: true, expected: segment.expected });
        for (const [channel, expected] of Object.entries(segment.expected)) {
          checked++;
          hits += decision?.[channel as keyof Decision] === expected ? 1 : 0;
        }
      }
      this.log.emit("scenario", `Koniec „${scenario.name}”: ${hits}/${checked} zgodnych`, { hits, checked });
    } finally {
      this.director.suspendAuto = false;
      this.running = false;
      this.onChange();
    }
  }
}
