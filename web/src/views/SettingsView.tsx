import { useEffect, useState } from "react";
import type { AppState } from "../../../shared/appState.ts";
import type { SettingField } from "../../../shared/settingField.ts";
import { connection } from "../api/useApp.ts";
import { MicCapture } from "../audio/micCapture.ts";
import { mic, useMic } from "../audio/micController.ts";
import { FieldForm, FieldRow } from "../components/FieldInput.tsx";
import { SttBanner } from "../components/SttBanner.tsx";
import { Switch } from "../components/Switch.tsx";

const CLASSIFIER_FIELDS: SettingField[] = [
  { key: "campaignContext", label: "Kontekst kampanii", kind: "textarea", default: "", hint: "Nazwy własne, setting, styl drużyny — pomaga AI zrozumieć przekręcone słowa." },
  { key: "everySeconds", label: "Pytaj AI co [s]", kind: "number", default: 5, hint: "Tylko gdy pojawił się nowy tekst; jedno zapytanie trwa ~2 s." },
  { key: "minNewChars", label: "Min. nowych znaków", kind: "number", default: 25 },
  { key: "contextSeconds", label: "Kontekst wstecz [s]", kind: "number", default: 60, hint: "Wcześniejsza rozmowa dołączana do każdego zapytania." },
  { key: "maxChars", label: "Maks. znaków nowego tekstu", kind: "number", default: 1200 },
  { key: "model", label: "Model", kind: "text", default: "haiku" },
  { key: "recycleAfterTurns", label: "Nowa rozmowa co [zapytań]", kind: "number", default: 12, hint: "Proces claude trzyma historię; świeży startuje w tle." },
  { key: "claudePath", label: "Polecenie claude", kind: "text", default: "claude", hint: "Używa subskrypcji, na którą zalogowany jest Claude Code." },
];

const STT_FIELDS: SettingField[] = [
  { key: "vadThreshold", label: "Czułość detekcji mowy", kind: "number", default: 0.5, hint: "0–1; wyżej = mniej fałszywych wyzwoleń przy hałasie. Działa od następnego włączenia nasłuchu." },
  { key: "minSilenceSeconds", label: "Pauza kończąca wypowiedź [s]", kind: "number", default: 0.4 },
  { key: "maxSpeechSeconds", label: "Maks. długość fragmentu [s]", kind: "number", default: 10 },
  { key: "url", label: "Adres kontenera STT", kind: "text", default: "http://127.0.0.1:8765" },
];

export function SettingsView({ state }: { state: AppState }) {
  const micState = useMic();
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  useEffect(() => {
    void MicCapture.devices().then(setDevices);
  }, [micState.active]);

  return (
    <div className="stack">
      <SttBanner state={state} />

      <section className="card">
        <div className="card-title"><h2>Mikrofon (ta przeglądarka)</h2></div>
        {!MicCapture.supported && (
          <p className="muted">Ta strona nie ma dostępu do mikrofonu — przeglądarka pozwala na to tylko pod adresem localhost / 127.0.0.1 albo przez HTTPS.</p>
        )}
        <div className="form">
          <FieldRow label="Urządzenie" hint={devices.some((d) => d.label) ? undefined : "Nazwy urządzeń pojawią się po pierwszym włączeniu nasłuchu."}>
            <select className="select" value={micState.options.deviceId} onChange={(e) => mic.setOptions({ deviceId: e.target.value })}>
              <option value="">Domyślne</option>
              {devices.map((d, i) => <option key={d.deviceId || i} value={d.deviceId}>{d.label || `Mikrofon ${i + 1}`}</option>)}
            </select>
          </FieldRow>
          <FieldRow label="Redukcja szumu" hint="Filtr przeglądarki; przy słabym mikrofonie zwykle pomaga.">
            <Switch checked={micState.options.noiseSuppression} onChange={(v) => mic.setOptions({ noiseSuppression: v })} />
          </FieldRow>
          <FieldRow label="Automatyczne wzmocnienie" hint="Podbija ciche, dalekie głosy przy stole.">
            <Switch checked={micState.options.autoGainControl} onChange={(v) => mic.setOptions({ autoGainControl: v })} />
          </FieldRow>
        </div>
      </section>

      <section className="card">
        <div className="card-title">
          <h2>Rozpoznawanie mowy</h2>
          <span className="chip">{state.stt.status === "ready" ? state.stt.message : state.stt.status}</span>
        </div>
        <FieldForm fields={STT_FIELDS} values={{ ...state.config.stt }}
          onChange={(key, value) => connection.setConfig(["stt", key], value)} />
        <div className="form" style={{ marginTop: 10 }}>
          <FieldRow label="Poprawki transkrypcji" hint="Jedna para w linii: „pistonkrik => Piston Creek”. Stosowane do każdego tekstu.">
            <textarea className="textarea" style={{ fontFamily: "var(--mono)", fontSize: 12.5 }} rows={4}
              value={state.config.corrections} onChange={(e) => connection.setConfig(["corrections"], e.target.value)} />
          </FieldRow>
        </div>
      </section>

      <section className="card">
        <div className="card-title"><h2>Klasyfikacja (Claude)</h2></div>
        <FieldForm fields={CLASSIFIER_FIELDS} values={{ ...state.config.classifier }}
          onChange={(key, value) => connection.setConfig(["classifier", key], value)} />
      </section>

      <p className="faint" style={{ fontSize: 12.5 }}>Dane aplikacji: {state.dataDir}</p>
    </div>
  );
}
