import { useSyncExternalStore } from "react";
import { Connection, type Snapshot } from "./connection.ts";

export const connection = new Connection("panel");

export function useSnapshot(): Snapshot {
  return useSyncExternalStore(connection.subscribe, connection.getSnapshot);
}
