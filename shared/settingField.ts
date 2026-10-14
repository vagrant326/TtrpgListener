export type FieldKind = "text" | "textarea" | "number" | "color" | "choice" | "boolean";

export type FieldValue = string | number | boolean;

export interface SettingField {
  key: string;
  label: string;
  kind: FieldKind;
  default: FieldValue;
  options?: { value: string; label: string }[];
  hint?: string;
}
