import type { AppState } from "../../../shared/appState.ts";

export function SttBanner({ state }: { state: AppState }) {
  const { status, progress, message } = state.stt;
  if (status === "ready") {
    return null;
  }
  return (
    <div className="banner">
      <div style={{ flex: 1 }}>
        <strong>Rozpoznawanie mowy: </strong>
        <span className="muted">{message}</span>
        {status === "downloading" && (
          <div className="progress" style={{ marginTop: 8 }}>
            <div style={{ width: `${Math.round(progress * 100)}%` }} />
          </div>
        )}
      </div>
      {status === "downloading" && <span className="muted">{Math.round(progress * 100)}%</span>}
    </div>
  );
}
