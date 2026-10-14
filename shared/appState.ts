import type { AppConfig } from "./appConfig.ts";
import type { ChannelId } from "./channelId.ts";
import type { SettingField } from "./settingField.ts";

export interface IntegrationActionInfo {
  id: string;
  label: string;
  // When set, the UI asks for a value with this label before running the action.
  input?: string;
}

export interface IntegrationInfo {
  id: string;
  name: string;
  channel: ChannelId;
  enabled: boolean;
  status: string;
  settingsFields: SettingField[];
  presetFields: SettingField[];
  actions: IntegrationActionInfo[];
}

export interface ChannelState {
  activePresetId: string | null;
  source: string | null;
  changedAt: number | null;
}

export interface TranscriptLine {
  id: number;
  at: number;
  text: string;
  source: string;
}

export type SttStatus = "offline" | "downloading" | "loading" | "ready" | "error";

export interface AppState {
  config: AppConfig;
  integrations: IntegrationInfo[];
  channels: Record<ChannelId, ChannelState>;
  mic: { ownerId: string | null; speech: boolean };
  stt: { status: SttStatus; progress: number; message: string };
  classifier: { busy: boolean; lastSeconds: number | null; turns: number; tokens: number; error: string };
  transcript: TranscriptLine[];
  scenarios: { names: string[]; running: boolean };
  projectorClients: number;
  dataDir: string;
}
