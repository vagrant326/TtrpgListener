import type { AppConfig } from "../../shared/appConfig.ts";
import { CHANNEL_IDS, CHANNEL_NAMES, type ChannelId } from "../../shared/channelId.ts";

export type Decision = Partial<Record<ChannelId, string>>;

const CHANNEL_GUIDANCE: Record<ChannelId, string> = {
  light: "oświetlenie oddaje porę dnia, miejsce i klimat sceny",
  music: "muzyka oddaje napięcie i emocje tego, co się dzieje",
};

// Built only from presets, so it stays identical between calls and the claude process can be reused.
export function buildSystemPrompt(config: AppConfig): string {
  const channels = CHANNEL_IDS.map((channel) => {
    const presets = config.channels[channel].presets.map((p) => `  - ${p.id}: ${p.description || p.name}`).join("\n");
    return `${CHANNEL_NAMES[channel]} (klucz "${channel}") — ${CHANNEL_GUIDANCE[channel]}:\n${presets}`;
  }).join("\n\n");
  const campaign = config.classifier.campaignContext.trim();
  return [
    "Jesteś reżyserem nastroju sesji gry fabularnej (RPG). Dostajesz na bieżąco fragmenty transkrypcji rozmowy przy stole. "
      + "Transkrypcja jest automatyczna, bez podziału na osoby i z błędami.",
    campaign ? `Kontekst kampanii: ${campaign}` : "",
    `Kanały i ich presety:\n\n${channels}`,
    "Kanały są niezależne: np. noc może trwać, a muzyka przechodzi ze spokoju w walkę. "
      + "Zmieniaj preset tylko gdy rozmowa wyraźnie na to wskazuje; w razie wątpliwości zostaw obecny. "
      + "Rozmowy poza grą (jedzenie, przerwa) nie zmieniają nastroju.",
    'Odpowiadasz wyłącznie jedną linią JSON z kluczami tylko dla kanałów, o które proszę, np. {"music":"walka"}. Bez komentarzy.',
  ].filter(Boolean).join("\n\n");
}

export function buildMessage(
  config: AppConfig,
  current: Record<ChannelId, string | null>,
  ask: ChannelId[],
  context: string,
  fresh: string,
): string {
  const state = CHANNEL_IDS.map((channel) => {
    const locked = config.channels[channel].auto ? "" : " (ustawione ręcznie)";
    return `${channel}=${current[channel] ?? "brak"}${locked}`;
  }).join(", ");
  return [
    `Obecnie: ${state}`,
    `Wybierz: ${ask.join(", ")}`,
    context ? `Wcześniej: ${context}` : "",
    `Nowe: ${fresh}`,
  ].filter(Boolean).join("\n");
}

export function parseDecision(config: AppConfig, answer: string, ask: ChannelId[]): Decision {
  const decision: Decision = {};
  let parsed: Record<string, unknown> = {};
  const json = answer.match(/\{[^{}]*\}/);
  if (json) {
    try {
      parsed = JSON.parse(json[0]);
    } catch {
      parsed = {};
    }
  }
  for (const channel of ask) {
    const value = String(parsed[channel] ?? "").trim().toLowerCase();
    const preset = config.channels[channel].presets.find((p) => p.id.toLowerCase() === value);
    if (preset) {
      decision[channel] = preset.id;
    }
  }
  return decision;
}
