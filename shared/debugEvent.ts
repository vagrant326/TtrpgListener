export type DebugEventKind =
  | "stt"
  | "transcript"
  | "skip"
  | "classify"
  | "preset"
  | "integration"
  | "scenario"
  | "info"
  | "error";

export interface DebugEvent {
  seq: number;
  time: string;
  kind: DebugEventKind;
  summary: string;
  details?: Record<string, unknown>;
}
