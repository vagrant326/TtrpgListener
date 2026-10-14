import { useState } from "react";
import type { AppState, IntegrationActionInfo, IntegrationInfo } from "../../../shared/appState.ts";
import { CHANNEL_NAMES } from "../../../shared/channelId.ts";
import { connection } from "../api/useApp.ts";
import { FieldForm } from "../components/FieldInput.tsx";
import { Switch } from "../components/Switch.tsx";
import { attempt, notify } from "../components/toast.tsx";

export function IntegrationsView({ state }: { state: AppState }) {
  return (
    <div className="stack">
      {state.integrations.map((integration) => (
        <IntegrationCard key={integration.id} integration={integration} values={state.config.integrations[integration.id] ?? {}} />
      ))}
      <section className="card muted" style={{ fontSize: 13 }}>
        <div className="eyebrow" style={{ marginBottom: 8 }}>Spotify — jednorazowa konfiguracja</div>
        Na <a href="https://developer.spotify.com/dashboard" target="_blank" rel="noreferrer" style={{ color: "var(--accent)" }}>developer.spotify.com/dashboard</a> utwórz
        aplikację (Web API) z Redirect URI <code>http://127.0.0.1:8888/callback</code>, wklej Client ID powyżej i kliknij „Połącz”.
        Wymaga Spotify Premium i uruchomionej aplikacji Spotify na jakimś urządzeniu.
      </section>
    </div>
  );
}

function IntegrationCard({ integration, values }: { integration: IntegrationInfo; values: Record<string, unknown> }) {
  const set = (key: string, value: unknown) => connection.setConfig(["integrations", integration.id, key], value);
  return (
    <section className="card">
      <div className="card-title" style={{ flexWrap: "wrap" }}>
        <h2>{integration.name}</h2>
        <span className="chip">{CHANNEL_NAMES[integration.channel]}</span>
        {integration.status && <span className="chip"><span className={`dot ${integration.enabled ? "good" : ""}`} />{integration.status}</span>}
        <span className="spacer" />
        <Switch label={integration.enabled ? "WŁĄCZONA" : "WYŁĄCZONA"} checked={integration.enabled} onChange={(v) => set("enabled", v)} />
      </div>
      {integration.settingsFields.length > 0 && (
        <FieldForm fields={integration.settingsFields} values={values as Record<string, string>} onChange={set} />
      )}
      {integration.actions.length > 0 && (
        <div className="row wrap" style={{ marginTop: 16 }}>
          {integration.actions.map((action) => <ActionButton key={action.id} integration={integration} action={action} />)}
        </div>
      )}
    </section>
  );
}

function ActionButton({ integration, action }: { integration: IntegrationInfo; action: IntegrationActionInfo }) {
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    const result = await attempt(() => connection.send({
      name: "runAction",
      integrationId: integration.id,
      actionId: action.id,
      input: action.input ? input : undefined,
    }));
    setBusy(false);
    if (result?.openUrl) {
      window.open(result.openUrl, "_blank");
    }
    if (result?.message) {
      notify(result.message);
    }
  };
  return (
    <div className="row">
      {action.input && (
        <input className="input" style={{ width: 180 }} placeholder={action.input} value={input}
          onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void run()} />
      )}
      <button className="btn" disabled={busy || (action.input !== undefined && !input)} onClick={() => void run()}>
        {busy ? "…" : action.label}
      </button>
    </div>
  );
}
