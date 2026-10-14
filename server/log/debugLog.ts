import { createWriteStream, mkdirSync, type WriteStream } from "node:fs";
import { join } from "node:path";
import type { DebugEvent, DebugEventKind } from "../../shared/debugEvent.ts";
import { LOG_DIR } from "../paths.ts";

const BACKLOG_SIZE = 2000;

function timestamp(date: Date): string {
  const pad = (n: number, width = 2) => String(n).padStart(width, "0");
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}`;
}

// Every pipeline step reports here. Events go to a per-run JSONL file and to connected panels.
export class DebugLog {
  readonly path: string;
  readonly backlog: DebugEvent[] = [];
  private readonly file: WriteStream;
  private seq = 0;
  private listeners: ((event: DebugEvent) => void)[] = [];

  constructor() {
    mkdirSync(LOG_DIR, { recursive: true });
    const now = new Date();
    const stamp = now.toISOString().slice(0, 19).replace(/[-:]/g, "").replace("T", "-");
    this.path = join(LOG_DIR, `session-${stamp}.jsonl`);
    this.file = createWriteStream(this.path, { flags: "a", encoding: "utf-8" });
  }

  subscribe(listener: (event: DebugEvent) => void): void {
    this.listeners.push(listener);
  }

  emit(kind: DebugEventKind, summary: string, details?: Record<string, unknown>): void {
    const event: DebugEvent = { seq: ++this.seq, time: timestamp(new Date()), kind, summary, details };
    this.backlog.push(event);
    if (this.backlog.length > BACKLOG_SIZE) {
      this.backlog.shift();
    }
    this.file.write(JSON.stringify(event) + "\n");
    for (const listener of this.listeners) {
      listener(event);
    }
  }
}
