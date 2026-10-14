import { randomUUID } from "node:crypto";
import type { Server } from "node:http";
import { type WebSocket, WebSocketServer } from "ws";
import type { DebugEvent } from "../../shared/debugEvent.ts";
import type { ClientMessage, ServerMessage } from "../../shared/messages.ts";
import type { App } from "../app.ts";

const STATE_THROTTLE_MS = 80;
const EVENT_BATCH_MS = 150;

interface Client {
  id: string;
  socket: WebSocket;
  role: "panel" | "projector";
}

// One WebSocket per open page. JSON frames carry state, events and commands;
// binary frames from the page that owns the microphone carry 16 kHz mono PCM16.
export class ClientHub {
  private readonly clients = new Set<Client>();
  private stateTimer: NodeJS.Timeout | undefined;
  private eventBatch: DebugEvent[] = [];
  private eventTimer: NodeJS.Timeout | undefined;

  constructor(server: Server, private readonly app: App) {
    new WebSocketServer({ server, path: "/ws" }).on("connection", (socket) => this.onConnection(socket));
    app.on("changed", () => this.scheduleState());
    app.on("projector", (color, fadeSeconds) => this.broadcast({ type: "projector", color, fadeSeconds }, "projector"));
    app.log.subscribe((event) => {
      this.eventBatch.push(event);
      this.eventTimer ??= setTimeout(() => this.flushEvents(), EVENT_BATCH_MS);
    });
  }

  private onConnection(socket: WebSocket): void {
    const client: Client = { id: randomUUID(), socket, role: "panel" };
    this.clients.add(client);
    this.send(client, { type: "hello", clientId: client.id });
    this.send(client, { type: "state", state: this.app.state() });
    this.send(client, { type: "events", events: this.app.log.backlog });

    socket.on("message", (data, isBinary) => {
      if (isBinary) {
        const buffer = data as Buffer;
        // Copy into an aligned buffer: Int16Array needs an even byte offset.
        this.app.handleAudio(client.id, new Int16Array(new Uint8Array(buffer).buffer, 0, buffer.length >> 1));
        return;
      }
      let message: ClientMessage;
      try {
        message = JSON.parse(data.toString());
      } catch {
        return;
      }
      void this.onMessage(client, message);
    });
    socket.on("close", () => {
      this.clients.delete(client);
      this.app.releaseMic(client.id);
      this.updateProjectorCount();
    });
  }

  private async onMessage(client: Client, message: ClientMessage): Promise<void> {
    if (message.type === "role") {
      client.role = message.role;
      if (client.role === "projector") {
        this.send(client, { type: "projector", color: this.app.projectorColor, fadeSeconds: 0 });
      }
      this.updateProjectorCount();
      return;
    }
    try {
      const result = await this.app.handleCommand(client.id, message.command);
      this.send(client, { type: "reply", id: message.id, ok: true, result: result ?? undefined });
    } catch (error) {
      const text = (error as Error).message;
      this.app.log.emit("error", `${message.command.name}: ${text}`);
      this.send(client, { type: "reply", id: message.id, ok: false, error: text });
    }
  }

  private updateProjectorCount(): void {
    this.app.projectorClients = [...this.clients].filter((c) => c.role === "projector").length;
    this.scheduleState();
  }

  private scheduleState(): void {
    this.stateTimer ??= setTimeout(() => {
      this.stateTimer = undefined;
      this.broadcast({ type: "state", state: this.app.state() }, "panel");
    }, STATE_THROTTLE_MS);
  }

  private flushEvents(): void {
    this.eventTimer = undefined;
    const events = this.eventBatch;
    this.eventBatch = [];
    this.broadcast({ type: "events", events }, "panel");
  }

  private broadcast(message: ServerMessage, role: Client["role"]): void {
    const text = JSON.stringify(message);
    for (const client of this.clients) {
      if (client.role === role && client.socket.readyState === client.socket.OPEN) {
        client.socket.send(text);
      }
    }
  }

  private send(client: Client, message: ServerMessage): void {
    client.socket.send(JSON.stringify(message));
  }
}
