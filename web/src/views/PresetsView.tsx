import type { AppState, IntegrationInfo } from "../../../shared/appState.ts";
import { CHANNEL_IDS, CHANNEL_NAMES, type ChannelId } from "../../../shared/channelId.ts";
import type { Preset } from "../../../shared/preset.ts";
import { connection } from "../api/useApp.ts";
import { FieldForm, FieldRow } from "../components/FieldInput.tsx";
import { ChevronIcon, CopyIcon, DownIcon, PlusIcon, TrashIcon, UpIcon } from "../components/icons.tsx";
import { musicGradient, presetColor, slugify } from "../presetVisuals.ts";

const DESCRIPTION_HINT: Record<ChannelId, string> = {
  light: "np. „noc, ciemność, obóz po zmroku, skradanie się”",
  music: "np. „inicjatywa, ataki, obrażenia, czary bojowe”",
};

function uniqueId(base: string, presets: Preset[], except?: Preset): string {
  let id = base;
  for (let n = 2; presets.some((p) => p !== except && p.id === id); n++) {
    id = `${base}_${n}`;
  }
  return id;
}

export function PresetsView({ state }: { state: AppState }) {
  return (
    <div className="editor-columns">
      {CHANNEL_IDS.map((channel) => (
        <ChannelPresets key={channel} channel={channel} state={state} />
      ))}
    </div>
  );
}

function ChannelPresets({ channel, state }: { channel: ChannelId; state: AppState }) {
  const presets = state.config.channels[channel].presets;
  const integrations = state.integrations.filter((i) => i.channel === channel);
  const save = (next: Preset[]) => connection.setConfig(["channels", channel, "presets"], next);

  const replace = (index: number, preset: Preset) => save(presets.map((p, i) => (i === index ? preset : p)));
  const move = (index: number, delta: number) => {
    const next = [...presets];
    const [item] = next.splice(index, 1);
    next.splice(index + delta, 0, item);
    save(next);
  };

  return (
    <section className="card">
      <div className="card-title">
        <h2>{CHANNEL_NAMES[channel]}</h2>
        <span className="faint">{presets.length} presetów</span>
        <span className="spacer" />
        <button className="btn small" onClick={() => {
          const name = "Nowy preset";
          save([...presets, { id: uniqueId(slugify(name), presets), name, description: "", settings: {} }]);
        }}>
          <PlusIcon /> Dodaj
        </button>
      </div>
      <div className="stack" style={{ gap: 8 }}>
        {presets.map((preset, index) => (
          <PresetEditor key={index} channel={channel} preset={preset} presets={presets} integrations={integrations}
            first={index === 0} last={index === presets.length - 1}
            onChange={(next) => replace(index, next)}
            onMove={(delta) => move(index, delta)}
            onDuplicate={() => {
              const copy = { ...structuredClone(preset), name: `${preset.name} (kopia)` };
              copy.id = uniqueId(slugify(copy.name), presets);
              save([...presets.slice(0, index + 1), copy, ...presets.slice(index + 1)]);
            }}
            onDelete={() => {
              if (confirm(`Usunąć preset „${preset.name}”?`)) {
                save(presets.filter((_, i) => i !== index));
              }
            }} />
        ))}
      </div>
    </section>
  );
}

interface PresetEditorProps {
  channel: ChannelId;
  preset: Preset;
  presets: Preset[];
  integrations: IntegrationInfo[];
  first: boolean;
  last: boolean;
  onChange: (preset: Preset) => void;
  onMove: (delta: number) => void;
  onDuplicate: () => void;
  onDelete: () => void;
}

function PresetEditor({ channel, preset, presets, integrations, first, last, onChange, onMove, onDuplicate, onDelete }: PresetEditorProps) {
  const swatch = channel === "light" ? presetColor(preset) : musicGradient(preset.id);
  const rename = (name: string) => {
    // The id follows the name until the user edits the id by hand.
    const followsName = preset.id === uniqueId(slugify(preset.name), presets, preset);
    onChange({ ...preset, name, id: followsName ? uniqueId(slugify(name), presets, preset) : preset.id });
  };

  return (
    <details className="preset-editor">
      <summary>
        <span className="mini-swatch" style={{ background: swatch }} />
        <strong>{preset.name}</strong>
        <span className="faint" style={{ fontFamily: "var(--mono)", fontSize: 12 }}>{preset.id}</span>
        <span className="spacer" />
        <button className="btn ghost small" disabled={first} title="W górę" onClick={(e) => { e.preventDefault(); onMove(-1); }}><UpIcon /></button>
        <button className="btn ghost small" disabled={last} title="W dół" onClick={(e) => { e.preventDefault(); onMove(1); }}><DownIcon /></button>
        <button className="btn ghost small" title="Duplikuj" onClick={(e) => { e.preventDefault(); onDuplicate(); }}><CopyIcon /></button>
        <button className="btn ghost small danger" title="Usuń" onClick={(e) => { e.preventDefault(); onDelete(); }}><TrashIcon /></button>
        <ChevronIcon />
      </summary>
      <div className="body">
        <div className="form">
          <FieldRow label="Nazwa">
            <input className="input" value={preset.name} onChange={(e) => rename(e.target.value)} />
          </FieldRow>
          <FieldRow label="Klucz" hint="Krótki identyfikator, którym odpowiada AI.">
            <input className="input" style={{ fontFamily: "var(--mono)" }} value={preset.id}
              onChange={(e) => onChange({ ...preset, id: slugify(e.target.value) })} />
          </FieldRow>
          <FieldRow label="Kiedy wybierać" hint={`Opis dla AI: jak brzmi rozmowa, gdy ten preset pasuje — ${DESCRIPTION_HINT[channel]}`}>
            <textarea className="textarea" value={preset.description} onChange={(e) => onChange({ ...preset, description: e.target.value })} />
          </FieldRow>
        </div>
        {integrations.map((integration) => (
          <div key={integration.id} className="integration-block" style={{ opacity: integration.enabled ? 1 : 0.55 }}>
            <div className="eyebrow" style={{ marginBottom: 10 }}>
              {integration.name}{integration.enabled ? "" : " · wyłączona"}
            </div>
            <FieldForm fields={integration.presetFields} values={preset.settings[integration.id] ?? {}}
              onChange={(key, value) => onChange({
                ...preset,
                settings: { ...preset.settings, [integration.id]: { ...preset.settings[integration.id], [key]: value } },
              })} />
          </div>
        ))}
      </div>
    </details>
  );
}
