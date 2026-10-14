import { EventEmitter } from "node:events";
import type { AppState } from "../shared/appState.ts";
import type { ActionResult, Command } from "../shared/messages.ts";
import { ConfigStore } from "./config/configStore.ts";
import { SecretStore } from "./config/secretStore.ts";
import { ScenarioPlayer } from "./debug/scenarioPlayer.ts";
import type { Integration } from "./integrations/integration.ts";
import { INTEGRATIONS } from "./integrations/registry.ts";
import { DebugLog } from "./log/debugLog.ts";
import { DATA_DIR } from "./paths.ts";
import { SceneDirector } from "./sceneDirector.ts";
import { SpeechService } from "./stt/speechService.ts";

const VISIBLE_TRANSCRIPT_LINES = 40;

interface AppEvents {
  changed: [];
  projector: [color: string, fadeSeconds: number];
}

export class App extends EventEmitter<AppEvents> {
  readonly log = new DebugLog();
  readonly configStore = new ConfigStore();
  readonly integrations: Integration[];
  readonly director: SceneDirector;
  readonly speech: SpeechService;
  readonly scenarios: ScenarioPlayer;
  projectorColor = "#000000";
  projectorClients = 0;
  private readonly secrets = new SecretStore(this.configStore.migratedSecrets);
  private micOwner: string | null = null;

  constructor() {
    super();
    const config = this.configStore.config;
    const changed = () => this.emit("changed");
    this.integrations = INTEGRATIONS.map((IntegrationClass) => {
      // The id is only known once constructed, so the context reads it lazily; constructors must not call the context.
      const integration: Integration = new IntegrationClass({
        settings: () => config.integrations[integration.id],
        secrets: () => this.secrets.get(integration.id),
        updateSecrets: (patch) => this.secrets.update(integration.id, patch),
        log: (message) => this.log.emit("integration", `${integration.name}: ${message}`, { integration: integration.id }),
        changed,
        showOnProjectors: (color, fadeSeconds) => {
          this.projectorColor = color;
          this.emit("projector", color, fadeSeconds);
        },
        projectorCount: () => this.projectorClients,
      });
      const stored = (config.integrations[integration.id] ??= {});
      stored.enabled ??= integration.enabledByDefault;
      for (const field of integration.settingsFields) {
        stored[field.key] ??= field.default;
      }
      return integration;
    });
    this.director = new SceneDirector(config, this.integrations, this.log, changed);
    this.speech = new SpeechService(config, this.log, (text, source) => this.director.addText(text, source), changed);
    this.scenarios = new ScenarioPlayer(this.director, this.log, changed);
  }

  start(): void {
    this.log.emit("info", `Log sesji: ${this.log.path}`);
    if (this.configStore.migratedFromLegacy) {
      this.log.emit("info", "Zaimportowano ustawienia z poprzedniej wersji (sceny rozdzielone na presety światła i muzyki)");
    }
    for (const integration of this.integrations) {
      integration.start();
    }
    this.director.start();
    this.speech.init();
  }

  shutdown(): void {
    this.speech.stopLive();
    this.director.shutdown();
    for (const integration of this.integrations) {
      integration.shutdown();
    }
    this.configStore.saveNow();
  }

  state(): AppState {
    return {
      config: this.configStore.config,
      integrations: this.integrations.map((i) => i.info()),
      channels: this.director.channels,
      mic: { ownerId: this.micOwner, speech: this.speech.speaking },
      stt: { status: this.speech.status, progress: this.speech.progress, message: this.speech.message },
      classifier: this.director.classifier,
      transcript: this.director.transcript.slice(-VISIBLE_TRANSCRIPT_LINES),
      scenarios: { names: this.scenarios.scenarios.map((s) => s.name), running: this.scenarios.running },
      projectorClients: this.projectorClients,
      dataDir: DATA_DIR,
    };
  }

  async handleCommand(clientId: string, command: Command): Promise<ActionResult | void> {
    switch (command.name) {
      case "setConfig":
        this.configStore.setPath(command.path, command.value);
        break;
      case "activatePreset":
        // Picking a preset by hand takes the channel out of auto mode, otherwise the next classification undoes it.
        this.director.setAuto(command.channel, false);
        this.configStore.save();
        this.director.activate(command.channel, command.presetId, "ręcznie");
        break;
      case "setAuto":
        this.director.setAuto(command.channel, command.auto);
        this.configStore.save();
        break;
      case "claimMic":
        if (this.speech.status !== "ready") {
          throw new Error("model mowy nie jest gotowy");
        }
        this.speech.stopLive();
        this.micOwner = clientId;
        this.speech.startLive();
        this.director.warmUp();
        this.log.emit("info", "Nasłuch aktywny");
        break;
      case "releaseMic":
        this.releaseMic(clientId);
        break;
      case "injectText":
        this.director.addText(command.text, "ręcznie");
        break;
      case "classifyNow":
        void this.director.classify({ force: true });
        break;
      case "runAction": {
        const integration = this.integrations.find((i) => i.id === command.integrationId);
        if (!integration) {
          throw new Error(`nieznana integracja ${command.integrationId}`);
        }
        const result = await integration.runAction(command.actionId, command.input);
        if (result?.message) {
          this.log.emit("integration", `${integration.name}: ${result.message}`, { integration: integration.id });
        }
        this.emit("changed");
        return result;
      }
      case "playScenario":
        void this.scenarios.play(command.index, command.lineDelay);
        break;
      case "stopScenario":
        this.scenarios.stop();
        break;
    }
    this.emit("changed");
  }

  handleAudio(clientId: string, pcm: Int16Array): void {
    if (clientId === this.micOwner) {
      this.speech.feedLive(pcm);
    }
  }

  releaseMic(clientId: string): void {
    if (this.micOwner === clientId) {
      this.micOwner = null;
      this.speech.stopLive();
      this.log.emit("info", "Nasłuch zatrzymany");
      this.emit("changed");
    }
  }
}
