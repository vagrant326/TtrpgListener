import { useMemo, useRef, useState } from "react";
import type { AppState } from "../../../shared/appState.ts";
import type { DebugEvent, DebugEventKind } from "../../../shared/debugEvent.ts";
import { connection } from "../api/useApp.ts";
import { decodeToPcm } from "../audio/micCapture.ts";
import { useMic } from "../audio/micController.ts";
import { attempt, notify } from "../components/toast.tsx";

const KINDS: DebugEventKind[] = ["transcript", "stt", "classify", "preset", "integration", "scenario", "skip", "info", "error"];

function computeStats(events: DebugEvent[]) {
  let sttCount = 0, sttSeconds = 0, audioSeconds = 0;
  let classifyCount = 0, classifySeconds = 0, hits = 0, checked = 0;
  for (const event of events) {
    const d = event.details ?? {};
    if (event.kind === "stt") {
      sttCount++;
      sttSeconds += Number(d.seconds ?? 0);
      audioSeconds += Number(d.audioSeconds ?? 0);
    } else if (event.kind === "classify") {
      classifyCount++;
      classifySeconds += Number(d.seconds ?? 0);
      for (const match of Object.values((d.matches ?? {}) as Record<string, boolean>)) {
        checked++;
        hits += match ? 1 : 0;
      }
    }
  }
  return { sttCount, sttSeconds, audioSeconds, classifyCount, classifySeconds, hits, checked };
}

export function DebugView({ state, events }: { state: AppState; events: DebugEvent[] }) {
  const micState = useMic();
  const [text, setText] = useState("");
  const [scenario, setScenario] = useState(0);
  const [delay, setDelay] = useState("0.5");
  const [hidden, setHidden] = useState<Set<DebugEventKind>>(new Set());
  const [selected, setSelected] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const stats = useMemo(() => computeStats(events), [events]);
  const visible = events.filter((e) => !hidden.has(e.kind)).slice(-800).reverse();
  const selectedEvent = events.find((e) => e.seq === selected);

  const inject = () => {
    if (text.trim()) {
      void attempt(() => connection.send({ name: "injectText", text: text.trim() }));
      setText("");
    }
  };

  const transcribeFile = async (file: File) => {
    notify(`Dekoduję ${file.name}…`);
    await attempt(async () => {
      const pcm = await decodeToPcm(file);
      const response = await fetch(`/api/transcribe?name=${encodeURIComponent(file.name)}`, { method: "POST", body: pcm.buffer as ArrayBuffer });
      if (!response.ok) {
        throw new Error(await response.text());
      }
    });
  };

  return (
    <div className="stack">
      <section className="card">
        <div className="card-title"><h2>Wejście</h2></div>
        <div className="stack" style={{ gap: 12 }}>
          <div className="row wrap">
            <span className="muted" style={{ width: 90 }}>Mikrofon</span>
            <div className="meter"><div style={{ width: `${Math.min(100, Math.sqrt(micState.level / 0.3) * 100)}%` }} /></div>
            <span className="chip" style={{ minWidth: 150 }}>
              <span className={`dot ${state.mic.speech ? "good pulse" : ""}`} />
              {micState.active ? `${state.mic.speech ? "mowa" : "cisza"} · RMS ${micState.level.toFixed(3)}` : "nasłuch wyłączony"}
            </span>
          </div>
          <div className="row wrap">
            <input className="input" style={{ flex: 1, minWidth: 220 }} placeholder="Wpisz kwestię, jakby padła przy stole…"
              value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && inject()} />
            <button className="btn" onClick={inject}>Wstrzyknij</button>
            <button className="btn" onClick={() => void attempt(() => connection.send({ name: "classifyNow" }))}>Klasyfikuj teraz</button>
            <button className="btn" disabled={state.stt.status !== "ready"} onClick={() => fileRef.current?.click()}>Transkrybuj plik…</button>
            <input ref={fileRef} type="file" accept="audio/*" hidden onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) {
                void transcribeFile(file);
              }
            }} />
          </div>
          <div className="row wrap">
            <span className="muted" style={{ width: 90 }}>Scenariusz</span>
            <select className="select" style={{ flex: 1, minWidth: 220 }} value={scenario} onChange={(e) => setScenario(Number(e.target.value))}>
              {state.scenarios.names.map((name, i) => <option key={i} value={i}>{name}</option>)}
            </select>
            <span className="muted">odstęp linii [s]</span>
            <input className="input" style={{ width: 70 }} value={delay} onChange={(e) => setDelay(e.target.value)} />
            {state.scenarios.running
              ? <button className="btn" onClick={() => void attempt(() => connection.send({ name: "stopScenario" }))}>■ Stop</button>
              : <button className="btn primary" onClick={() => void attempt(() => connection.send({ name: "playScenario", index: scenario, lineDelay: Number(delay) || 0.5 }))}>▶ Odtwórz</button>}
          </div>
        </div>
      </section>

      <div className="stats">
        <div className="stat">
          <span className="eyebrow">Mowa → tekst</span>
          <strong>{stats.sttCount ? `${(stats.sttSeconds / stats.sttCount).toFixed(2)} s` : "—"}</strong>
          <span className="faint">{stats.sttCount} fragm.{stats.sttSeconds ? ` · ${(stats.audioSeconds / stats.sttSeconds).toFixed(1)}× czasu rzecz.` : ""}</span>
        </div>
        <div className="stat">
          <span className="eyebrow">Claude</span>
          <strong>{stats.classifyCount ? `${(stats.classifySeconds / stats.classifyCount).toFixed(1)} s` : "—"}</strong>
          <span className="faint">{stats.classifyCount} zapytań · ostatnie {state.classifier.lastSeconds?.toFixed(1) ?? "—"} s</span>
        </div>
        <div className="stat">
          <span className="eyebrow">Tokeny</span>
          <strong>{state.classifier.tokens.toLocaleString("pl-PL")}</strong>
          <span className="faint">śr. {state.classifier.turns ? Math.round(state.classifier.tokens / state.classifier.turns) : 0} / zapytanie</span>
        </div>
        <div className="stat">
          <span className="eyebrow">Trafność scenariuszy</span>
          <strong>{stats.checked ? `${stats.hits}/${stats.checked}` : "—"}</strong>
          <span className="faint">{stats.checked ? `${Math.round((stats.hits / stats.checked) * 100)}%` : "odtwórz scenariusz"}</span>
        </div>
      </div>

      <section className="card">
        <div className="card-title" style={{ flexWrap: "wrap" }}>
          <h2>Zdarzenia</h2>
          <div className="filters">
            {KINDS.map((kind) => (
              <button key={kind} className={hidden.has(kind) ? "" : "on"} onClick={() => {
                const next = new Set(hidden);
                if (next.has(kind)) {
                  next.delete(kind);
                } else {
                  next.add(kind);
                }
                setHidden(next);
              }}>{kind}</button>
            ))}
          </div>
        </div>
        <div className="events">
          <div className="event-list">
            {visible.map((event) => (
              <div key={event.seq} className={`event-row${event.seq === selected ? " selected" : ""}`} onClick={() => setSelected(event.seq)}>
                <time>{event.time}</time>
                <span className={`kind kind-${event.kind}`}>{event.kind}</span>
                <span>{event.summary}</span>
              </div>
            ))}
          </div>
          <pre className="details">{selectedEvent ? JSON.stringify(selectedEvent, null, 2) : "Kliknij zdarzenie, żeby zobaczyć szczegóły (pełny prompt, tokeny, czasy)."}</pre>
        </div>
      </section>
    </div>
  );
}
