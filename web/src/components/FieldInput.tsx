import { type ReactNode, useEffect, useState } from "react";
import type { FieldValue, SettingField } from "../../../shared/settingField.ts";
import { Switch } from "./Switch.tsx";

export function FieldInput({ field, value, onChange }: { field: SettingField; value: FieldValue | undefined; onChange: (value: FieldValue) => void }) {
  const current = value ?? field.default;
  switch (field.kind) {
    case "color":
      return (
        <label className="color-input">
          <input type="color" value={String(current)} onChange={(e) => onChange(e.target.value)} />
          {String(current)}
        </label>
      );
    case "boolean":
      return <Switch checked={Boolean(current)} onChange={onChange} />;
    case "choice":
      return (
        <select className="select" value={String(current)} onChange={(e) => onChange(e.target.value)}>
          {field.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      );
    case "number":
      return <NumberInput value={Number(current)} onChange={onChange} />;
    case "textarea":
      return <textarea className="textarea" value={String(current)} onChange={(e) => onChange(e.target.value)} />;
    default:
      return <input className="input" value={String(current)} onChange={(e) => onChange(e.target.value)} />;
  }
}

// Keeps the typed text locally, so intermediate input like "0." isn't normalised away mid-typing.
export function NumberInput({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => {
    if (Number(draft) !== value) {
      setDraft(String(value));
    }
  }, [value]);
  return (
    <input className="input" inputMode="decimal" value={draft}
      onChange={(e) => {
        const text = e.target.value.replace(",", ".");
        setDraft(text);
        if (text.trim() !== "" && !Number.isNaN(Number(text))) {
          onChange(Number(text));
        }
      }} />
  );
}

export function FieldForm({ fields, values, onChange }: {
  fields: SettingField[];
  values: Record<string, FieldValue | undefined>;
  onChange: (key: string, value: FieldValue) => void;
}) {
  return (
    <div className="form">
      {fields.map((field) => (
        <FieldRow key={field.key} label={field.label} hint={field.hint}>
          <FieldInput field={field} value={values[field.key]} onChange={(value) => onChange(field.key, value)} />
        </FieldRow>
      ))}
    </div>
  );
}

export function FieldRow({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <>
      <label className="field-label">{label}</label>
      <div>
        {children}
        {hint && <div className="field-hint">{hint}</div>}
      </div>
    </>
  );
}
