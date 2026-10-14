import type { CSSProperties } from "react";
import type { AppState } from "../../../shared/appState.ts";
import { CHANNEL_NAMES, type ChannelId } from "../../../shared/channelId.ts";
import { connection } from "../api/useApp.ts";
import { musicGradient, playlistLabel, presetColor } from "../presetVisuals.ts";
import { PauseIcon } from "./icons.tsx";
import { Switch } from "./Switch.tsx";
import { attempt, notify } from "./toast.tsx";
import { ago, useNow } from "./useNow.ts";

const AUTO_HINT: Record<ChannelId, string> = {
  light: "AI dobiera porę dnia i klimat",
  music: "AI dobiera muzykę do akcji",
};

export function ChannelCard({ channel, state }: { channel: ChannelId; state: AppState }) {
  const now = useNow();
  const config = state.config.channels[channel];
  const live = state.channels[channel];
  const active = config.presets.find((p) => p.id === live.activePresetId);
  const spotify = state.integrations.find((i) => i.id === "spotify");
  const color = presetColor(active);

  const meta = active
    ? `${live.source === "auto" ? "wybrane przez AI" : live.source === "ręcznie" ? "wybrane ręcznie" : live.source} · ${ago(live.changedAt, now)}`
    : "jeszcze nic nie wybrano";

  return (
    <section className="card channel">
      <div className="card-title">
        <span className="eyebrow">{CHANNEL_NAMES[channel]}</span>
        <span className="spacer" />
        <span className="faint" style={{ fontSize: 12 }}>{config.auto ? AUTO_HINT[channel] : "sterowanie ręczne"}</span>
        <Switch label="AUTO" checked={config.auto}
          onChange={(auto) => void attempt(() => connection.send({ name: "setAuto", channel, auto }))} />
      </div>

      <div className="channel-hero">
        {channel === "light"
          ? <div className="orb" style={{ background: `radial-gradient(circle at 35% 30%, #fff6, ${color} 45%)`, boxShadow: active ? `0 0 42px -4px ${color}` : "none" }} />
          : <div className={`music-disc${active ? " spinning" : ""}`} style={active ? { background: `radial-gradient(circle, #0b0c11 18%, transparent 19%), ${musicGradient(active.id)}` } : undefined} />}
        <div style={{ minWidth: 0 }}>
          <div className="hero-name">{active?.name ?? "—"}</div>
          <div className="hero-meta">{meta}</div>
          {channel === "music" && active && <div className="hero-meta">{playlistLabel(active)}</div>}
        </div>
        <span className="spacer" />
        {channel === "music" && spotify?.enabled && (
          <button className="btn icon-btn" title="Pauza Spotify"
            onClick={() => void attempt(async () => {
              await connection.send({ name: "runAction", integrationId: "spotify", actionId: "pause" });
              notify("Spotify wstrzymane");
            })}>
            <PauseIcon />
          </button>
        )}
      </div>

      <div className="presets">
        {config.presets.map((preset) => {
          const isActive = preset.id === live.activePresetId;
          const background = channel === "light" ? presetColor(preset) : musicGradient(preset.id);
          return (
            <button key={preset.id} className={`preset-tile${isActive ? " active" : ""}`}
              style={{ "--tile-glow": channel === "light" ? background : "#ffffff55" } as CSSProperties}
              title={preset.description}
              onClick={() => void attempt(() => connection.send({ name: "activatePreset", channel, presetId: preset.id }))}>
              <span className="swatch" style={{ background }} />
              <span className="tile-name">{preset.name}</span>
              {channel === "music" && <span className="tile-sub">{playlistLabel(preset)}</span>}
            </button>
          );
        })}
      </div>
    </section>
  );
}
