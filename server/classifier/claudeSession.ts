import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";

const TIMEOUT_MS = 45_000;

export interface ClaudeReply {
  text: string;
  inputTokens: number;
  outputTokens: number;
  seconds: number;
  // True when this call had to start a fresh claude process first.
  coldStart: boolean;
}

interface PendingTurn {
  resolve: (reply: ClaudeReply) => void;
  reject: (error: Error) => void;
  started: number;
  coldStart: boolean;
  timer: NodeJS.Timeout;
}

export interface ClaudeSessionOptions {
  claudePath: string;
  model: string;
  systemPrompt: string;
  recycleAfterTurns: number;
}

// One-shot `claude -p` pays ~2.5 s of process start per call, which is too slow for a 5 s cadence.
// Instead a single process is kept alive in stream-json mode and fed one user message per classification;
// it uses the subscription the local Claude Code CLI is logged in with. The conversation grows with each turn,
// so the process is replaced after a number of turns or whenever the system prompt changes.
export class ClaudeSession {
  // Empty working dir so claude doesn't pick up any project CLAUDE.md.
  private readonly workDir = mkdtempSync(join(tmpdir(), "ttrpg-classifier-"));
  private child: ChildProcessWithoutNullStreams | undefined;
  private childKey = "";
  private turns = 0;
  private pending: PendingTurn | undefined;
  private options: ClaudeSessionOptions | undefined;
  private stderr = "";

  ask(options: ClaudeSessionOptions, message: string): Promise<ClaudeReply> {
    if (this.pending) {
      return Promise.reject(new Error("poprzednie zapytanie jeszcze trwa"));
    }
    const key = JSON.stringify([options.claudePath, options.model, options.systemPrompt]);
    const coldStart = !this.child || key !== this.childKey || this.turns >= options.recycleAfterTurns;
    if (coldStart) {
      this.start(options, key);
    }
    this.options = options;
    this.turns++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.fail(new Error(`brak odpowiedzi po ${TIMEOUT_MS / 1000} s`));
        this.stop();
      }, TIMEOUT_MS);
      this.pending = { resolve, reject, started: performance.now(), coldStart, timer };
      const line = JSON.stringify({ type: "user", message: { role: "user", content: message } });
      this.child!.stdin.write(line + "\n");
    });
  }

  // Starting the process ahead of the first classification hides its startup time.
  warmUp(options: ClaudeSessionOptions): void {
    if (!this.child && !this.pending) {
      this.start(options, JSON.stringify([options.claudePath, options.model, options.systemPrompt]));
    }
  }

  stop(): void {
    this.child?.kill();
    this.child = undefined;
  }

  private start(options: ClaudeSessionOptions, key: string): void {
    this.stop();
    this.childKey = key;
    this.turns = 0;
    this.stderr = "";
    const child = spawn(options.claudePath, [
      "-p",
      "--model", options.model,
      "--system-prompt", options.systemPrompt,
      "--tools", "",
      "--strict-mcp-config",
      "--setting-sources", "",
      "--no-session-persistence",
      "--input-format", "stream-json",
      "--output-format", "stream-json",
      "--verbose",
    ], {
      cwd: this.workDir,
      env: { ...process.env, MAX_THINKING_TOKENS: "0" },
      windowsHide: true,
    });
    this.child = child;
    child.stderr.on("data", (chunk: Buffer) => {
      this.stderr = (this.stderr + chunk.toString()).slice(-2000);
    });
    child.on("error", (error) => {
      if (this.child === child) {
        this.child = undefined;
      }
      this.fail(new Error(`nie można uruchomić „${options.claudePath}”: ${error.message}`));
    });
    child.on("exit", (code) => {
      if (this.child === child) {
        this.child = undefined;
        this.fail(new Error(`claude zakończył się (kod ${code}): ${this.stderr.trim() || "brak komunikatu"}`));
      }
    });
    createInterface({ input: child.stdout }).on("line", (line) => this.onLine(line));
  }

  private onLine(line: string): void {
    let message: { type?: string; result?: string; is_error?: boolean; usage?: Record<string, number> };
    try {
      message = JSON.parse(line);
    } catch {
      return;
    }
    if (message.type !== "result" || !this.pending) {
      return;
    }
    const turn = this.pending;
    this.pending = undefined;
    clearTimeout(turn.timer);
    if (message.is_error) {
      turn.reject(new Error(message.result || "błąd claude"));
      return;
    }
    const usage = message.usage ?? {};
    turn.resolve({
      text: message.result ?? "",
      inputTokens: (usage.input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0),
      outputTokens: usage.output_tokens ?? 0,
      seconds: (performance.now() - turn.started) / 1000,
      coldStart: turn.coldStart,
    });
    // Replace a worn-out process right away, while nothing is waiting on it.
    if (this.options && this.turns >= this.options.recycleAfterTurns) {
      this.start(this.options, this.childKey);
    }
  }

  private fail(error: Error): void {
    const turn = this.pending;
    this.pending = undefined;
    if (turn) {
      clearTimeout(turn.timer);
      turn.reject(error);
    }
  }
}
