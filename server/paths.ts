import { homedir } from "node:os";
import { join } from "node:path";

function appDataBase(): string {
  if (process.platform === "win32") {
    return process.env.APPDATA ?? join(homedir(), "AppData", "Roaming");
  }
  if (process.platform === "darwin") {
    return join(homedir(), "Library", "Application Support");
  }
  return process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config");
}

export const DATA_DIR = join(appDataBase(), "TtrpgListener");
export const CONFIG_PATH = join(DATA_DIR, "settings.json");
export const SECRETS_PATH = join(DATA_DIR, "secrets.json");
// Written by the Python PoC; imported once when settings.json doesn't exist yet.
export const LEGACY_CONFIG_PATH = join(DATA_DIR, "config.json");
export const LEGACY_SPOTIFY_TOKEN_PATH = join(DATA_DIR, "spotify_token.json");
export const LOG_DIR = join(DATA_DIR, "logs");
export const WEB_DIR = join(import.meta.dirname, "..", "dist", "web");
