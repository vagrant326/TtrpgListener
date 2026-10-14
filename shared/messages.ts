import type { AppState } from "./appState.ts";
import type { ChannelId } from "./channelId.ts";
import type { DebugEvent } from "./debugEvent.ts";

export type ServerMessage =
  | { type: "hello"; clientId: string }
  | { type: "state"; state: AppState }
  | { type: "events"; events: DebugEvent[] }
  | { type: "projector"; color: string; fadeSeconds: number }
  | { type: "reply"; id: number; ok: boolean; result?: ActionResult; error?: string };

export interface ActionResult {
  message?: string;
  openUrl?: string;
}

export type Command =
  | { name: "setConfig"; path: (string | number)[]; value: unknown }
  | { name: "activatePreset"; channel: ChannelId; presetId: string }
  | { name: "setAuto"; channel: ChannelId; auto: boolean }
  | { name: "claimMic" }
  | { name: "releaseMic" }
  | { name: "injectText"; text: string }
  | { name: "classifyNow" }
  | { name: "runAction"; integrationId: string; actionId: string; input?: string }
  | { name: "playScenario"; index: number; lineDelay: number }
  | { name: "stopScenario" };

export type ClientMessage =
  | { type: "command"; id: number; command: Command }
  | { type: "role"; role: "panel" | "projector" };
