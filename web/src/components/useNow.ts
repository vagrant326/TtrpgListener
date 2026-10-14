import { useEffect, useState } from "react";

export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

export function ago(timestamp: number | null, now: number): string {
  if (timestamp === null) {
    return "";
  }
  const seconds = Math.max(0, Math.round((now - timestamp) / 1000));
  if (seconds < 60) {
    return `${seconds} s temu`;
  }
  const minutes = Math.floor(seconds / 60);
  return minutes < 60 ? `${minutes} min temu` : `${Math.floor(minutes / 60)} h ${minutes % 60} min temu`;
}
