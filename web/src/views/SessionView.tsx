import { useEffect, useRef } from "react";
import type { AppState } from "../../../shared/appState.ts";
import type { DebugEvent } from "../../../shared/debugEvent.ts";
import { ChannelCard } from "../components/ChannelCard.tsx";
import { SttBanner } from "../components/SttBanner.tsx";

function clock(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function SessionView({ state, events }: { state: AppState; events: DebugEvent[] }) {
  const feedRef = useRef<HTMLDivElement>(null);
  const lastLine = state.transcript[state.transcript.length - 1]?.id;
  useEffect(() => {
    feedRef.current?.scrollTo({ top: feedRef.current.scrollHeight, behavior: "smooth" });
  }, [lastLine]);

  const decisions = events.filter((e) => e.kind === "classify" || e.kind === "preset").slice(-10).reverse();

  return (
    <>
      <SttBanner state={state} />
      <div className="channels">
        <ChannelCard channel="light" state={state} />
        <ChannelCard channel="music" state={state} />
      </div>

      <div className="live">
        <section className="card">
          <div className="card-title">
            <span className="eyebrow">Na żywo</span>
            <span className="spacer" />
            {state.mic.ownerId && (
              <span className="chip"><span className={`dot ${state.mic.speech ? "good pulse" : ""}`} />{state.mic.speech ? "ktoś mówi" : "cisza"}</span>
            )}
          </div>
          <div className="feed" ref={feedRef}>
            {state.transcript.length === 0 && (
              <div className="empty">Tu pojawi się transkrypcja. Włącz nasłuch przyciskiem w prawym górnym rogu.</div>
            )}
            {state.transcript.map((line) => (
              <div key={line.id} className="feed-line">
                <time>{clock(line.at)}</time>
                <div>
                  {line.text}
                  {line.source !== "mikrofon" && <span className="source">{line.source}</span>}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="card">
          <div className="card-title">
            <span className="eyebrow">Decyzje</span>
            <span className="spacer" />
            {state.classifier.busy && <span className="chip"><span className="dot warn pulse" />myśli…</span>}
          </div>
          {decisions.length === 0 && <div className="empty">Jeszcze bez decyzji.</div>}
          {decisions.map((event) => (
            <div key={event.seq} className="decision">
              <div className="row">
                <span className={`kind kind-${event.kind}`}>{event.time.slice(0, 8)}</span>
                <span className="faint" style={{ fontSize: 11.5 }}>{event.kind === "classify" ? "AI" : "zmiana"}</span>
              </div>
              <div>{event.summary}</div>
            </div>
          ))}
        </section>
      </div>
    </>
  );
}
