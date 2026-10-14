import { useSyncExternalStore } from "react";

let current: { text: string; error: boolean } | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;
const listeners = new Set<() => void>();

export function notify(text: string, error = false): void {
  current = { text, error };
  listeners.forEach((l) => l());
  clearTimeout(timer);
  timer = setTimeout(() => {
    current = null;
    listeners.forEach((l) => l());
  }, error ? 6000 : 3500);
}

export function Toast() {
  const toast = useSyncExternalStore((l) => {
    listeners.add(l);
    return () => listeners.delete(l);
  }, () => current);
  return toast ? <div className={`toast${toast.error ? " error" : ""}`}>{toast.text}</div> : null;
}

// Runs a command and surfaces failures, so call sites stay one-liners.
export async function attempt<T>(run: () => Promise<T>): Promise<T | undefined> {
  try {
    return await run();
  } catch (error) {
    notify((error as Error).message, true);
    return undefined;
  }
}
