import type { Preset } from "../../shared/preset.ts";

export function presetColor(preset: Preset | undefined): string {
  const color = preset?.settings.projector?.color ?? preset?.settings.ambilight?.color;
  return typeof color === "string" ? color : "#3a3b48";
}

// Music presets have no colour of their own; derive a stable gradient from the id so tiles stay recognisable.
export function musicGradient(id: string): string {
  let hash = 0;
  for (const char of id) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  const hue = hash % 360;
  return `linear-gradient(135deg, hsl(${hue} 55% 32%), hsl(${(hue + 50) % 360} 60% 18%))`;
}

export function playlistLabel(preset: Preset): string {
  const playlist = String(preset.settings.spotify?.playlist ?? "");
  if (!playlist) {
    return "bez playlisty";
  }
  const start = preset.settings.spotify?.start === "beginning" ? "od początku" : "od losowego";
  return `Spotify · ${start}`;
}

export function slugify(name: string): string {
  return name.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ł/g, "l")
    .replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || "preset";
}
