import { WebSocket } from "ws";
import type { AppConfig } from "../../shared/appConfig.ts";
import type { SttStatus } from "../../shared/appState.ts";
import type { DebugLog } from "../log/debugLog.ts";

const HEALTH_POLL_MS = 2000;
const RECONNECT_MS = 1000;
// 100 ms frames, so up to 5 s of audio held while connecting.
const BACKLOG_FRAMES = 50;

interface Utterance {
  text: string;
  audioSeconds: number;
  seconds: number;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Client of the STT container (stt-server/): streams microphone PCM to it and receives finished utterances.
export class SpeechService {
  status: SttStatus = "offline";
  progress = 0;
  message = "Łączenie z kontenerem STT…";
  private socket: WebSocket | undefined;
  private live = false;
  private speakingNow = false;
  private backlog: Int16Array[] = [];

  constructor(
    private readonly config: AppConfig,
    private readonly log: DebugLog,
    private readonly onText: (text: string, source: string) => void,
    private readonly onChange: () => void,
  ) {}

  get speaking(): boolean {
    return this.speakingNow;
  }

  init(): void {
    void this.pollHealth();
    setInterval(() => void this.pollHealth(), HEALTH_POLL_MS);
  }

  startLive(): void {
    this.live = true;
    this.connect();
  }

  stopLive(): void {
    this.live = false;
    this.backlog = [];
    this.socket?.close();
    this.socket = undefined;
    this.setSpeaking(false);
  }

  feedLive(pcm: Int16Array): void {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(pcm);
    } else if (this.live && this.backlog.length < BACKLOG_FRAMES) {
      // Audio arriving while the stream (re)connects would otherwise cut off the first words.
      this.backlog.push(pcm);
    }
  }

  async transcribeFile(pcm: Int16Array, name: string): Promise<void> {
    this.log.emit("info", `Plik ${name}: ${(pcm.length / 16000).toFixed(1)} s audio`);
    const response = await fetch(`${this.config.stt.url}/transcribe?${this.vadParams()}`, {
      method: "POST",
      body: new Uint8Array(pcm.buffer as ArrayBuffer, pcm.byteOffset, pcm.byteLength),
    });
    const payload = await response.json() as { segments?: Utterance[]; error?: string };
    if (!response.ok || !payload.segments) {
      throw new Error(payload.error ?? `STT: HTTP ${response.status}`);
    }
    for (const utterance of payload.segments) {
      this.handleUtterance(utterance, name);
    }
  }

  private connect(): void {
    const socket = new WebSocket(`${this.config.stt.url.replace(/^http/, "ws")}/stream?${this.vadParams()}`);
    this.socket = socket;
    socket.on("open", () => {
      for (const pcm of this.backlog.splice(0)) {
        socket.send(pcm);
      }
    });
    socket.on("message", (data) => {
      const message = JSON.parse(data.toString());
      if (message.type === "text") {
        this.handleUtterance(message, "mikrofon");
      } else if (message.type === "speech") {
        this.setSpeaking(message.speaking);
      } else if (message.type === "error") {
        this.log.emit("error", `Transkrypcja nieudana: ${message.message}`);
      }
    });
    socket.on("error", () => {});
    socket.on("close", (_code, reason) => {
      if (this.socket !== socket || !this.live) {
        return;
      }
      // The container restarted or is still loading; keep the session alive by reconnecting.
      this.log.emit("error", `Połączenie z STT przerwane${reason.length ? ` (${reason})` : ""} — ponawiam`);
      this.setSpeaking(false);
      setTimeout(() => {
        if (this.live && this.socket === socket) {
          this.connect();
        }
      }, RECONNECT_MS);
    });
  }

  private async pollHealth(): Promise<void> {
    let next: { status: SttStatus; progress: number; message: string };
    try {
      const response = await fetch(`${this.config.stt.url}/health`, { signal: AbortSignal.timeout(1500) });
      next = await response.json();
    } catch {
      next = { status: "offline", progress: 0, message: "Kontener STT nie działa — uruchom „docker compose up -d”" };
    }
    if (next.status !== this.status || next.progress !== this.progress || next.message !== this.message) {
      if (next.status === "ready" && this.status !== "ready") {
        this.log.emit("info", `STT gotowe: ${next.message}`);
      }
      Object.assign(this, next);
      this.onChange();
    }
  }

  private handleUtterance(utterance: Utterance, source: string): void {
    const text = this.applyCorrections(utterance.text);
    this.log.emit("stt", `${utterance.audioSeconds.toFixed(1)} s mowy → ${utterance.seconds.toFixed(2)} s, ${text.length} zn.`, {
      source, audioSeconds: utterance.audioSeconds, seconds: utterance.seconds, raw: utterance.text, text,
    });
    if (text) {
      this.onText(text, source);
    }
  }

  private vadParams(): string {
    const { vadThreshold, minSilenceSeconds, maxSpeechSeconds } = this.config.stt;
    return new URLSearchParams({
      threshold: String(vadThreshold),
      minSilence: String(minSilenceSeconds),
      maxSpeech: String(maxSpeechSeconds),
    }).toString();
  }

  private applyCorrections(text: string): string {
    let result = text;
    for (const line of this.config.corrections.split("\n")) {
      const [wrong, right] = line.split("=>").map((part) => part?.trim());
      if (wrong && right !== undefined) {
        const pattern = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(wrong)}(?![\\p{L}\\p{N}])`, "giu");
        result = result.replace(pattern, right);
      }
    }
    return result;
  }

  private setSpeaking(speaking: boolean): void {
    if (speaking !== this.speakingNow) {
      this.speakingNow = speaking;
      this.onChange();
    }
  }
}
