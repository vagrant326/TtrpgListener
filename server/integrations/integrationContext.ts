import type { FieldValue } from "../../shared/settingField.ts";

export interface IntegrationContext {
  // Live entry of config.integrations[id]; writes need ConfigStore.save to persist.
  settings(): Record<string, FieldValue>;
  secrets(): Record<string, unknown>;
  updateSecrets(patch: Record<string, unknown>): void;
  log(message: string): void;
  // Call when status() or actions() changed so panels refresh.
  changed(): void;
  showOnProjectors(color: string, fadeSeconds: number): void;
  projectorCount(): number;
}
