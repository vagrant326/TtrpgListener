import type { FieldValue } from "./settingField.ts";

export interface Preset {
  id: string;
  name: string;
  // Shown to the classifier: describe what the table sounds like when this preset fits.
  description: string;
  // Per integration id, shaped by that integration's presetFields.
  settings: Record<string, Record<string, FieldValue>>;
}
