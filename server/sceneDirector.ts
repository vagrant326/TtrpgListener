import type { AppConfig } from "../shared/appConfig.ts";
import type { AppState, ChannelState, TranscriptLine } from "../shared/appState.ts";
import { CHANNEL_IDS, type ChannelId } from "../shared/channelId.ts";
import { buildMessage, buildSystemPrompt, type Decision, parseDecision } from "./classifier/classifierPrompt.ts";
import { ClaudeSession, type ClaudeSessionOptions } from "./classifier/claudeSession.ts";
import type { Integration } from "./integrations/integration.ts";
import type { DebugLog } from "./log/debugLog.ts";

const TRANSCRIPT_LIMIT = 300;
const TICK_MS = 500;

// Owns the two channels (light, music): keeps the transcript, asks Claude every few seconds which preset
// fits each channel that is in auto mode, and pushes the chosen preset to that channel's integrations.
export class SceneDirector {
  readonly channels: Record<ChannelId, ChannelState> = {
    light: { activePresetId: null, source: null, changedAt: null },
    music: { activePresetId: null, source: null, changedAt: null },
  };
  readonly transcript: TranscriptLine[] = [];
  readonly classifier: AppState["classifier"] = { busy: false, lastSeconds: null, turns: 0, tokens: 0, error: "" };
  // Set by the scenario player so the timer doesn't classify half of a scripted segment.
  suspendAuto = false;
  private readonly claude = new ClaudeSession();
  private lastClassifiedLineId = 0;
  private lastRunAt = 0;
  private nextLineId = 1;
  private timer: NodeJS.Timeout | undefined;

  constructor(
    private readonly config: AppConfig,
    private readonly integrations: Integration[],
    private readonly log: DebugLog,
    private readonly onChange: () => void,
  ) {}

  start(): void {
    this.timer = setInterval(() => this.tick(), TICK_MS);
  }

  shutdown(): void {
    clearInterval(this.timer);
    this.claude.stop();
  }

  warmUp(): void {
    this.claude.warmUp(this.claudeOptions());
  }

  addText(text: string, source: string): void {
    this.transcript.push({ id: this.nextLineId++, at: Date.now(), text, source });
    if (this.transcript.length > TRANSCRIPT_LIMIT) {
      this.transcript.shift();
    }
    this.log.emit("transcript", `[${source}] ${text}`, { source, text });
    this.onChange();
  }

  setAuto(channel: ChannelId, auto: boolean): void {
    this.config.channels[channel].auto = auto;
    this.onChange();
  }

  activate(channel: ChannelId, presetId: string, source: string): void {
    const preset = this.config.channels[channel].presets.find((p) => p.id === presetId);
    if (!preset) {
      return;
    }
    this.channels[channel] = { activePresetId: preset.id, source, changedAt: Date.now() };
    this.log.emit("preset", `${channel === "light" ? "Światło" : "Muzyka"}: ${preset.name} (${source})`, { channel, preset: preset.id, source });
    for (const integration of this.integrations) {
      if (integration.enabled && integration.channel === channel) {
        void this.applyIntegration(integration, channel, preset.id);
      }
    }
    this.onChange();
  }

  async classify(options: { force?: boolean; expected?: Decision } = {}): Promise<Decision | null> {
    const autoChannels = CHANNEL_IDS.filter((c) => this.config.channels[c].auto);
    // Manual "classify now" with every channel locked still asks about all of them, just without applying.
    const ask = options.expected
      ? (Object.keys(options.expected) as ChannelId[])
      : autoChannels.length > 0 || !options.force ? autoChannels : [...CHANNEL_IDS];
    const fresh = this.transcript.filter((line) => line.id > this.lastClassifiedLineId);
    if (ask.length === 0 || this.classifier.busy) {
      return null;
    }
    if (fresh.length === 0) {
      if (options.force) {
        this.log.emit("skip", "Brak nowego tekstu do klasyfikacji");
      }
      return null;
    }

    const { maxChars, contextSeconds } = this.config.classifier;
    const freshText = fresh.map((l) => l.text).join(" ").slice(-maxChars);
    const contextFrom = Date.now() - contextSeconds * 1000;
    const contextText = this.transcript
      .filter((l) => l.id <= this.lastClassifiedLineId && l.at >= contextFrom)
      .map((l) => l.text).join(" ").slice(-Math.floor(maxChars / 2));
    const current = Object.fromEntries(CHANNEL_IDS.map((c) => [c, this.channels[c].activePresetId])) as Record<ChannelId, string | null>;
    const claudeOptions = this.claudeOptions();
    const message = buildMessage(this.config, current, ask, contextText, freshText);

    this.lastClassifiedLineId = fresh[fresh.length - 1].id;
    this.lastRunAt = Date.now();
    this.classifier.busy = true;
    this.onChange();
    try {
      const reply = await this.claude.ask(claudeOptions, message);
      const decision = parseDecision(this.config, reply.text, ask);
      this.classifier.lastSeconds = reply.seconds;
      this.classifier.turns++;
      this.classifier.tokens += reply.inputTokens + reply.outputTokens;
      this.classifier.error = "";

      const parts = ask.map((channel) => {
        const picked = decision[channel];
        const expected = options.expected?.[channel];
        const verdict = expected === undefined ? "" : picked === expected ? " ✓" : ` ✗ (oczekiwano ${expected})`;
        const change = picked && picked !== current[channel] ? `${current[channel] ?? "—"} → ${picked}` : picked ?? `? ${JSON.stringify(reply.text)}`;
        return `${channel}: ${change}${verdict}`;
      });
      this.log.emit("classify", `${parts.join(" · ")} | ${reply.seconds.toFixed(1)} s${reply.coldStart ? " (start procesu)" : ""} | ${reply.inputTokens}+${reply.outputTokens} tok`, {
        decision,
        expected: options.expected,
        matches: options.expected ? Object.fromEntries(ask.map((c) => [c, decision[c] === options.expected![c]])) : undefined,
        raw: reply.text,
        seconds: reply.seconds,
        coldStart: reply.coldStart,
        inputTokens: reply.inputTokens,
        outputTokens: reply.outputTokens,
        freshChars: freshText.length,
        contextChars: contextText.length,
        systemPrompt: claudeOptions.systemPrompt,
        message,
      });

      for (const channel of ask) {
        const picked = decision[channel];
        if (picked && this.config.channels[channel].auto && picked !== this.channels[channel].activePresetId) {
          this.activate(channel, picked, "auto");
        }
      }
      return decision;
    } catch (error) {
      this.classifier.error = (error as Error).message;
      this.log.emit("error", `Klasyfikacja nieudana: ${this.classifier.error}`);
      return null;
    } finally {
      this.classifier.busy = false;
      this.onChange();
    }
  }

  private tick(): void {
    const { everySeconds, minNewChars } = this.config.classifier;
    if (this.suspendAuto || this.classifier.busy || Date.now() - this.lastRunAt < everySeconds * 1000) {
      return;
    }
    if (!CHANNEL_IDS.some((c) => this.config.channels[c].auto)) {
      return;
    }
    const freshChars = this.transcript
      .filter((line) => line.id > this.lastClassifiedLineId)
      .reduce((sum, line) => sum + line.text.length, 0);
    if (freshChars >= minNewChars) {
      void this.classify();
    }
  }

  private claudeOptions(): ClaudeSessionOptions {
    const { claudePath, model, recycleAfterTurns } = this.config.classifier;
    return { claudePath, model, recycleAfterTurns, systemPrompt: buildSystemPrompt(this.config) };
  }

  private async applyIntegration(integration: Integration, channel: ChannelId, presetId: string): Promise<void> {
    const preset = this.config.channels[channel].presets.find((p) => p.id === presetId)!;
    const settings = integration.presetSettings(preset);
    const started = performance.now();
    try {
      await integration.apply(settings, preset);
    } catch (error) {
      this.log.emit("error", `${integration.name}: ${(error as Error).message}`, { integration: integration.id, settings });
      return;
    }
    this.log.emit("integration", `${integration.name}: ${preset.name} (${Math.round(performance.now() - started)} ms)`, {
      integration: integration.id, settings,
    });
  }
}
