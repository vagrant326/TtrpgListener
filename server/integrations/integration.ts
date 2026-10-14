import type { IntegrationActionInfo, IntegrationInfo } from "../../shared/appState.ts";
import type { ChannelId } from "../../shared/channelId.ts";
import type { ActionResult } from "../../shared/messages.ts";
import type { Preset } from "../../shared/preset.ts";
import type { FieldValue, SettingField } from "../../shared/settingField.ts";
import type { IntegrationContext } from "./integrationContext.ts";

// One output device or service. It belongs to one channel and reacts when that channel's preset changes.
// settingsFields are global (Integrations tab), presetFields are configured per preset (Presets tab);
// the panel builds both forms from these lists, so a new integration needs no UI changes.
export abstract class Integration {
  abstract readonly id: string;
  abstract readonly name: string;
  abstract readonly channel: ChannelId;
  readonly enabledByDefault: boolean = false;
  readonly settingsFields: SettingField[] = [];
  readonly presetFields: SettingField[] = [];
  // Extra HTTP GET routes served by the app, e.g. an OAuth callback. Handler returns an HTML message.
  readonly routes: Record<string, (url: URL) => Promise<string>> = {};

  constructor(protected readonly context: IntegrationContext) {}

  get enabled(): boolean {
    return Boolean(this.context.settings().enabled ?? this.enabledByDefault);
  }

  setting<T extends FieldValue>(key: string): T {
    const field = this.settingsFields.find((f) => f.key === key);
    return (this.context.settings()[key] ?? field?.default) as T;
  }

  presetSettings(preset: Preset): Record<string, FieldValue> {
    const stored = preset.settings[this.id] ?? {};
    return Object.fromEntries(this.presetFields.map((f) => [f.key, stored[f.key] ?? f.default]));
  }

  status(): string {
    return "";
  }

  actions(): IntegrationActionInfo[] {
    return [];
  }

  async runAction(_actionId: string, _input?: string): Promise<ActionResult | void> {}

  // Throw to report a failure in the debug log.
  abstract apply(settings: Record<string, FieldValue>, preset: Preset): Promise<void>;

  start(): void {}

  shutdown(): void {}

  info(): IntegrationInfo {
    return {
      id: this.id,
      name: this.name,
      channel: this.channel,
      enabled: this.enabled,
      status: this.status(),
      settingsFields: this.settingsFields,
      presetFields: this.presetFields,
      actions: this.actions(),
    };
  }
}
