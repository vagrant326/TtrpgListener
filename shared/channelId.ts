export const CHANNEL_IDS = ["light", "music"] as const;

export type ChannelId = (typeof CHANNEL_IDS)[number];

export const CHANNEL_NAMES: Record<ChannelId, string> = {
  light: "Światło",
  music: "Muzyka",
};
