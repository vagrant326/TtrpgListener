import { useSyncExternalStore } from "react";
import { connection } from "../api/useApp.ts";
import { MicCapture, type MicOptions } from "./micCapture.ts";

const OPTIONS_KEY = "ttrpg-mic-options";

interface MicSnapshot {
  active: boolean;
  starting: boolean;
  level: number;
  error: string;
  options: MicOptions;
}

function loadOptions(): MicOptions {
  const defaults: MicOptions = { deviceId: "", noiseSuppression: true, autoGainControl: true };
  try {
    return { ...defaults, ...JSON.parse(localStorage.getItem(OPTIONS_KEY) ?? "{}") };
  } catch {
    return defaults;
  }
}

// Microphone settings are per device (stored in this browser), the transcription itself runs on the server.
class MicController {
  private capture: MicCapture | undefined;
  private snapshot: MicSnapshot = { active: false, starting: false, level: 0, error: "", options: loadOptions() };
  private listeners = new Set<() => void>();

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = () => this.snapshot;

  async start(): Promise<void> {
    if (this.snapshot.active || this.snapshot.starting) {
      return;
    }
    this.update({ starting: true, error: "" });
    try {
      await connection.send({ name: "claimMic" });
      const capture = new MicCapture();
      await capture.start(this.snapshot.options, (pcm, rms) => {
        connection.sendAudio(pcm);
        this.update({ level: rms });
      });
      this.capture = capture;
      this.update({ active: true, starting: false });
    } catch (error) {
      void connection.send({ name: "releaseMic" }).catch(() => {});
      this.update({ starting: false, error: (error as Error).message });
    }
  }

  stop(notifyServer = true): void {
    this.capture?.stop();
    this.capture = undefined;
    this.update({ active: false, level: 0 });
    if (notifyServer) {
      void connection.send({ name: "releaseMic" }).catch(() => {});
    }
  }

  setOptions(patch: Partial<MicOptions>): void {
    const options = { ...this.snapshot.options, ...patch };
    try {
      localStorage.setItem(OPTIONS_KEY, JSON.stringify(options));
    } catch {
      // Storage unavailable (private mode); the options still apply for this page.
    }
    this.update({ options });
    if (this.snapshot.active) {
      this.stop();
      void this.start();
    }
  }

  private update(patch: Partial<MicSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch };
    for (const listener of this.listeners) {
      listener();
    }
  }
}

export const mic = new MicController();

export function useMic(): MicSnapshot {
  return useSyncExternalStore(mic.subscribe, mic.getSnapshot);
}
