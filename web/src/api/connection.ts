import type { AppConfig } from "../../../shared/appConfig.ts";
import type { AppState } from "../../../shared/appState.ts";
import type { DebugEvent } from "../../../shared/debugEvent.ts";
import type { ActionResult, ClientMessage, Command, ServerMessage } from "../../../shared/messages.ts";

const EVENT_LIMIT = 3000;

export interface Snapshot {
  connected: boolean;
  clientId: string | null;
  state: AppState | null;
  events: DebugEvent[];
}

function setIn(target: Record<string | number, unknown>, path: (string | number)[], value: unknown): Record<string | number, unknown> {
  const [key, ...rest] = path;
  const copy = Array.isArray(target) ? [...target] as unknown as Record<string | number, unknown> : { ...target };
  copy[key] = rest.length === 0 ? value : setIn((target[key] ?? {}) as Record<string | number, unknown>, rest, value);
  return copy;
}

// Single WebSocket to the app. Keeps the latest state and event log for React (useSyncExternalStore).
export class Connection {
  private socket: WebSocket | undefined;
  private snapshot: Snapshot = { connected: false, clientId: null, state: null, events: [] };
  private listeners = new Set<() => void>();
  private nextId = 1;
  private replies = new Map<number, { resolve: (r: ActionResult | undefined) => void; reject: (e: Error) => void }>();
  // While config edits are in flight, echoes of older server state must not overwrite what the user is typing.
  private pendingConfigWrites = 0;
  private projectorListener: ((color: string, fadeSeconds: number) => void) | undefined;

  constructor(private readonly role: "panel" | "projector") {
    this.connect();
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): Snapshot => this.snapshot;

  onProjector(listener: (color: string, fadeSeconds: number) => void): void {
    this.projectorListener = listener;
  }

  send(command: Command): Promise<ActionResult | undefined> {
    const id = this.nextId++;
    const message: ClientMessage = { type: "command", id, command };
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error("brak połączenia z aplikacją"));
    }
    this.socket.send(JSON.stringify(message));
    return new Promise((resolve, reject) => this.replies.set(id, { resolve, reject }));
  }

  setConfig(path: (string | number)[], value: unknown): void {
    const state = this.snapshot.state;
    if (state) {
      const config = setIn(state.config as unknown as Record<string, unknown>, path, value) as unknown as AppConfig;
      this.update({ state: { ...state, config } });
    }
    this.pendingConfigWrites++;
    this.send({ name: "setConfig", path, value })
      .catch(() => {})
      .finally(() => this.pendingConfigWrites--);
  }

  sendAudio(pcm: Int16Array): void {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(pcm.buffer as ArrayBuffer);
    }
  }

  private connect(): void {
    const protocol = location.protocol === "https:" ? "wss" : "ws";
    const socket = new WebSocket(`${protocol}://${location.host}/ws`);
    socket.binaryType = "arraybuffer";
    this.socket = socket;
    socket.onopen = () => {
      socket.send(JSON.stringify({ type: "role", role: this.role } satisfies ClientMessage));
      this.update({ connected: true });
    };
    socket.onclose = () => {
      for (const reply of this.replies.values()) {
        reply.reject(new Error("połączenie przerwane"));
      }
      this.replies.clear();
      this.pendingConfigWrites = 0;
      this.update({ connected: false, events: [] });
      setTimeout(() => this.connect(), 1500);
    };
    socket.onmessage = (message) => this.onMessage(JSON.parse(message.data as string) as ServerMessage);
  }

  private onMessage(message: ServerMessage): void {
    switch (message.type) {
      case "hello":
        this.update({ clientId: message.clientId });
        break;
      case "state": {
        const keepConfig = this.pendingConfigWrites > 0 && this.snapshot.state;
        this.update({ state: keepConfig ? { ...message.state, config: this.snapshot.state!.config } : message.state });
        break;
      }
      case "events":
        this.update({ events: [...this.snapshot.events, ...message.events].slice(-EVENT_LIMIT) });
        break;
      case "projector":
        this.projectorListener?.(message.color, message.fadeSeconds);
        break;
      case "reply": {
        const reply = this.replies.get(message.id);
        this.replies.delete(message.id);
        if (message.ok) {
          reply?.resolve(message.result);
        } else {
          reply?.reject(new Error(message.error));
        }
        break;
      }
    }
  }

  private update(patch: Partial<Snapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch };
    for (const listener of this.listeners) {
      listener();
    }
  }
}
