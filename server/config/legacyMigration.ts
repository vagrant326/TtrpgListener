import { existsSync, readFileSync } from "node:fs";
import type { AppConfig } from "../../shared/appConfig.ts";
import type { Preset } from "../../shared/preset.ts";
import { LEGACY_CONFIG_PATH, LEGACY_SPOTIFY_TOKEN_PATH } from "../paths.ts";
import { defaultConfig, NIGHT_PRESET } from "./defaultConfig.ts";
import type { Secrets } from "./secretStore.ts";

interface LegacyMood {
  key: string;
  name: string;
  description?: string;
  scene?: Record<string, Record<string, string>>;
}

// The PoC tied colours and playlist into one scene per mood. Each scene is split into a light preset
// and a music preset with the same id, so both channels start out with what the user already had.
export function migrateLegacyConfig(): { config: AppConfig; secrets: Secrets } | null {
  if (!existsSync(LEGACY_CONFIG_PATH)) {
    return null;
  }
  const raw = JSON.parse(readFileSync(LEGACY_CONFIG_PATH, "utf-8"));
  const config = defaultConfig();
  const secrets: Secrets = {};
  const moods: LegacyMood[] = raw.moods ?? [];

  if (moods.length > 0) {
    config.channels.light.presets = moods.map((mood): Preset => ({
      id: mood.key,
      name: mood.name,
      description: mood.description ?? "",
      settings: {
        projector: { color: mood.scene?.projector?.color ?? "#000000" },
        ambilight: { color: mood.scene?.ambilight?.color ?? "#ffffff" },
      },
    }));
    if (!config.channels.light.presets.some((p) => p.id === NIGHT_PRESET.id)) {
      config.channels.light.presets.splice(1, 0, NIGHT_PRESET);
    }
    config.channels.music.presets = moods.map((mood): Preset => ({
      id: mood.key,
      name: mood.name,
      description: mood.description ?? "",
      settings: { spotify: { playlist: mood.scene?.spotify?.playlist ?? "", start: "random", shuffle: true } },
    }));
  }

  const integrations = raw.integrations ?? {};
  const ambilight = integrations.ambilight ?? {};
  config.integrations = {
    projector: { enabled: integrations.projector?.enabled ?? true },
    ambilight: { enabled: ambilight.enabled ?? false, ip: ambilight.ip ?? "", fadeSeconds: ambilight.fade_seconds ?? 3 },
    spotify: {
      enabled: integrations.spotify?.enabled ?? false,
      clientId: integrations.spotify?.client_id ?? "",
      device: integrations.spotify?.device ?? "",
    },
  };
  if (ambilight.auth_key) {
    secrets.ambilight = { deviceId: ambilight.device_id, authKey: ambilight.auth_key };
  }
  if (existsSync(LEGACY_SPOTIFY_TOKEN_PATH)) {
    const token = JSON.parse(readFileSync(LEGACY_SPOTIFY_TOKEN_PATH, "utf-8"));
    if (token.refresh_token) {
      secrets.spotify = { refreshToken: token.refresh_token };
    }
  }

  config.channels.light.auto = config.channels.music.auto = raw.auto_mode ?? true;
  if (raw.whisper_hint) {
    config.classifier.campaignContext = `Nazwy własne: ${String(raw.whisper_hint).replace(/[,\s]+$/, "")}`;
  }
  return { config, secrets };
}
