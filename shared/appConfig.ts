import type { ChannelId } from "./channelId.ts";
import type { Preset } from "./preset.ts";
import type { FieldValue } from "./settingField.ts";

export interface ChannelConfig {
  presets: Preset[];
  // In auto mode the classifier picks this channel's preset; a manual pick switches it off.
  auto: boolean;
}

export interface SttConfig {
  url: string;
  vadThreshold: number;
  minSilenceSeconds: number;
  maxSpeechSeconds: number;
}

export interface ClassifierConfig {
  claudePath: string;
  model: string;
  everySeconds: number;
  minNewChars: number;
  contextSeconds: number;
  maxChars: number;
  recycleAfterTurns: number;
  campaignContext: string;
}

export interface AppConfig {
  channels: Record<ChannelId, ChannelConfig>;
  // Per integration id: { enabled, ...that integration's settingsFields }.
  integrations: Record<string, Record<string, FieldValue>>;
  stt: SttConfig;
  classifier: ClassifierConfig;
  // One "wrong => right" pair per line, applied to every transcript.
  corrections: string;
}
