import type { AppConfig } from "../../shared/appConfig.ts";
import type { Preset } from "../../shared/preset.ts";

function light(id: string, name: string, description: string, projector: string, ambilight: string): Preset {
  return { id, name, description, settings: { projector: { color: projector }, ambilight: { color: ambilight } } };
}

function music(id: string, name: string, description: string): Preset {
  return { id, name, description, settings: { spotify: { playlist: "", start: "random", shuffle: true } } };
}

export const NIGHT_PRESET = light("noc", "Noc", "noc, ciemność, obóz po zmroku, warta, skradanie się, sen", "#0b1030", "#1a2a80");

export function defaultConfig(): AppConfig {
  return {
    channels: {
      light: {
        auto: true,
        presets: [
          light("spokoj", "Spokój", "dzień, rozmowa, eksploracja, handel, odpoczynek, planowanie", "#1a1208", "#ffb060"),
          NIGHT_PRESET,
          light("walka", "Walka", "inicjatywa, ataki, rzuty na trafienie, obrażenia, czary bojowe", "#300000", "#ff0000"),
          light("smutek", "Smutek", "śmierć, strata, żałoba, porażka, przygnębienie", "#050a20", "#2040ff"),
          light("zwyciestwo", "Zwycięstwo", "pokonanie wroga, radość, świętowanie, nagrody, łup", "#302800", "#ffd700"),
        ],
      },
      music: {
        auto: true,
        presets: [
          music("spokoj", "Spokój", "rozmowa, eksploracja, handel, odpoczynek, planowanie"),
          music("walka", "Walka", "inicjatywa, ataki, rzuty na trafienie, obrażenia, czary bojowe"),
          music("smutek", "Smutek", "śmierć, strata, żałoba, porażka, przygnębienie"),
          music("zwyciestwo", "Zwycięstwo", "pokonanie wroga, radość, świętowanie, nagrody, łup"),
        ],
      },
    },
    integrations: {},
    stt: {
      url: "http://127.0.0.1:8765",
      vadThreshold: 0.5,
      minSilenceSeconds: 0.4,
      maxSpeechSeconds: 10,
    },
    classifier: {
      claudePath: "claude",
      model: "haiku",
      everySeconds: 5,
      minNewChars: 25,
      contextSeconds: 60,
      maxChars: 1200,
      recycleAfterTurns: 12,
      campaignContext: "",
    },
    corrections: "",
  };
}
