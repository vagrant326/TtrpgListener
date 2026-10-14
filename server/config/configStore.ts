import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import type { AppConfig } from "../../shared/appConfig.ts";
import { CONFIG_PATH, DATA_DIR } from "../paths.ts";
import { defaultConfig } from "./defaultConfig.ts";
import { migrateLegacyConfig } from "./legacyMigration.ts";
import type { Secrets } from "./secretStore.ts";

const SAVE_DELAY_MS = 300;

export class ConfigStore {
  readonly config: AppConfig;
  // Secrets found in the legacy config; handed over to the SecretStore once at startup.
  readonly migratedSecrets: Secrets | undefined;
  readonly migratedFromLegacy: boolean;
  private saveTimer: NodeJS.Timeout | undefined;

  constructor() {
    const defaults = defaultConfig();
    if (existsSync(CONFIG_PATH)) {
      const stored: Partial<AppConfig> = JSON.parse(readFileSync(CONFIG_PATH, "utf-8"));
      this.config = {
        ...defaults,
        ...stored,
        channels: { ...defaults.channels, ...stored.channels },
        stt: { ...defaults.stt, ...stored.stt },
        classifier: { ...defaults.classifier, ...stored.classifier },
      };
      this.migratedFromLegacy = false;
    } else {
      const migrated = migrateLegacyConfig();
      this.config = migrated?.config ?? defaults;
      this.migratedSecrets = migrated?.secrets;
      this.migratedFromLegacy = migrated !== null;
      this.saveNow();
    }
  }

  setPath(path: (string | number)[], value: unknown): void {
    if (path.length === 0 || path.some((key) => key === "__proto__" || key === "constructor")) {
      throw new Error("nieprawidłowa ścieżka konfiguracji");
    }
    let target: Record<string | number, unknown> = this.config as unknown as Record<string, unknown>;
    for (const key of path.slice(0, -1)) {
      if (typeof target[key] !== "object" || target[key] === null) {
        target[key] = {};
      }
      target = target[key] as Record<string | number, unknown>;
    }
    target[path[path.length - 1]] = value;
    this.save();
  }

  save(): void {
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.saveNow(), SAVE_DELAY_MS);
  }

  saveNow(): void {
    clearTimeout(this.saveTimer);
    mkdirSync(DATA_DIR, { recursive: true });
    const tmp = `${CONFIG_PATH}.tmp`;
    writeFileSync(tmp, JSON.stringify(this.config, null, 2), "utf-8");
    renameSync(tmp, CONFIG_PATH);
  }
}
