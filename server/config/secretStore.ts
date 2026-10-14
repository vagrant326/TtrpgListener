import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { DATA_DIR, SECRETS_PATH } from "../paths.ts";

export type Secrets = Record<string, Record<string, unknown>>;

// Pairing keys and OAuth tokens live apart from settings.json, because settings are broadcast to every panel.
export class SecretStore {
  private secrets: Secrets;

  constructor(initial?: Secrets) {
    this.secrets = existsSync(SECRETS_PATH) ? JSON.parse(readFileSync(SECRETS_PATH, "utf-8")) : {};
    if (initial) {
      this.secrets = { ...initial, ...this.secrets };
      this.save();
    }
  }

  get(integrationId: string): Record<string, unknown> {
    return this.secrets[integrationId] ?? {};
  }

  update(integrationId: string, patch: Record<string, unknown>): void {
    this.secrets[integrationId] = { ...this.get(integrationId), ...patch };
    this.save();
  }

  private save(): void {
    mkdirSync(DATA_DIR, { recursive: true });
    const tmp = `${SECRETS_PATH}.tmp`;
    writeFileSync(tmp, JSON.stringify(this.secrets, null, 2), "utf-8");
    renameSync(tmp, SECRETS_PATH);
  }
}
