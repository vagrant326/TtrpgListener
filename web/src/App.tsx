import { useEffect, useState } from "react";
import { useSnapshot } from "./api/useApp.ts";
import { MicCapture } from "./audio/micCapture.ts";
import { mic, useMic } from "./audio/micController.ts";
import { LogoIcon, MicIcon, MonitorIcon, SparkIcon } from "./components/icons.tsx";
import { notify, Toast } from "./components/toast.tsx";
import { presetColor } from "./presetVisuals.ts";
import { DebugView } from "./views/DebugView.tsx";
import { IntegrationsView } from "./views/IntegrationsView.tsx";
import { PresetsView } from "./views/PresetsView.tsx";
import { SessionView } from "./views/SessionView.tsx";
import { SettingsView } from "./views/SettingsView.tsx";

const TABS = [
  ["session", "Sesja"],
  ["presets", "Presety"],
  ["integrations", "Integracje"],
  ["settings", "Ustawienia"],
  ["debug", "Debug"],
] as const;

type Tab = (typeof TABS)[number][0];

interface ScreenDetailsLike {
  screens: { isPrimary: boolean; availLeft: number; availTop: number; availWidth: number; availHeight: number }[];
}

// Chromium's Window Management API lets the projector window open directly on the second screen.
async function openProjector(): Promise<void> {
  let features = "popup,width=960,height=540";
  const getScreenDetails = (window as unknown as { getScreenDetails?: () => Promise<ScreenDetailsLike> }).getScreenDetails;
  if (getScreenDetails) {
    try {
      const details = await getScreenDetails();
      const screen = details.screens.find((s) => !s.isPrimary);
      if (screen) {
        features = `popup,left=${screen.availLeft},top=${screen.availTop},width=${screen.availWidth},height=${screen.availHeight}`;
      }
    } catch {
      // Permission denied: open a normal window the user can drag over.
    }
  }
  window.open("/projector", "ttrpg-projector", features);
}

function initialTab(): Tab {
  const hash = location.hash.slice(1);
  return TABS.some(([id]) => id === hash) ? (hash as Tab) : "session";
}

export function App() {
  const { connected, clientId, state, events } = useSnapshot();
  const micState = useMic();
  const [tab, setTab] = useState<Tab>(initialTab);

  useEffect(() => {
    history.replaceState(null, "", `#${tab}`);
  }, [tab]);
  useEffect(() => {
    const onHash = () => setTab(initialTab());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  // Another panel took over the microphone, or the app restarted and forgot this page.
  useEffect(() => {
    if (micState.active && !connected) {
      mic.stop(false);
      notify("Nasłuch zatrzymany — utracono połączenie z aplikacją", true);
    } else if (micState.active && state?.mic.ownerId && state.mic.ownerId !== clientId) {
      mic.stop(false);
      notify("Nasłuch przejęło inne okno panelu");
    }
  }, [micState.active, connected, state?.mic.ownerId, clientId]);

  useEffect(() => {
    if (micState.error) {
      notify(`Mikrofon: ${micState.error}`, true);
    }
  }, [micState.error]);

  const activeLight = state?.config.channels.light.presets.find((p) => p.id === state.channels.light.activePresetId);
  useEffect(() => {
    document.documentElement.style.setProperty("--glow", activeLight ? presetColor(activeLight) : "#3a2a14");
  }, [activeLight]);

  if (!state) {
    return <div className="offline"><div className="muted">Łączenie z aplikacją…</div></div>;
  }

  const listening = micState.active;
  const levelGlow = listening ? `0 0 0 ${Math.min(10, micState.level * 60)}px rgba(255, 90, 90, 0.35)` : "none";
  const sttReady = state.stt.status === "ready";
  const otherOwner = state.mic.ownerId !== null && state.mic.ownerId !== clientId;

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand"><span className="brand-mark"><LogoIcon /></span>TTRPG Listener</div>
        <nav className="nav">
          {TABS.map(([id, label]) => (
            <button key={id} className={tab === id ? "active" : ""} onClick={() => setTab(id)}>{label}</button>
          ))}
        </nav>
        <div className="topbar-actions">
          <span className="chip" title={state.classifier.error || "Klasyfikator Claude"}>
            <span className={`dot ${state.classifier.error ? "bad" : state.classifier.busy ? "warn pulse" : state.classifier.turns ? "good" : ""}`} />
            <SparkIcon />
            {state.classifier.lastSeconds !== null ? `${state.classifier.lastSeconds.toFixed(1)} s` : "AI"}
          </span>
          <button className="btn" title="Otwórz okno rzutnika (dwuklik w oknie = pełny ekran)" onClick={() => void openProjector()}>
            <MonitorIcon /><span className="label">Rzutnik{state.projectorClients ? ` · ${state.projectorClients}` : ""}</span>
          </button>
          <button className={`mic-btn${listening ? " on" : ""}`}
            disabled={!sttReady || !MicCapture.supported || micState.starting}
            title={!MicCapture.supported ? "Mikrofon działa tylko pod localhost albo HTTPS" : !sttReady ? state.stt.message : ""}
            onClick={() => (listening ? mic.stop() : void mic.start())}>
            <span className="mic-level" style={{ boxShadow: levelGlow }}><MicIcon /></span>
            <span className="label">{listening ? "Słucham" : micState.starting ? "Uruchamiam…" : otherOwner ? "Słucha inne okno" : "Start nasłuchu"}</span>
          </button>
        </div>
      </header>

      {tab === "session" && <SessionView state={state} events={events} />}
      {tab === "presets" && <PresetsView state={state} />}
      {tab === "integrations" && <IntegrationsView state={state} />}
      {tab === "settings" && <SettingsView state={state} />}
      {tab === "debug" && <DebugView state={state} events={events} />}

      {!connected && <div className="offline"><div className="muted">Utracono połączenie z aplikacją — ponawiam…</div></div>}
      <Toast />
    </div>
  );
}
