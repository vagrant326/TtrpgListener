from dataclasses import dataclass, field

from app.models.mood import Mood


def _default_moods() -> list[Mood]:
    def mood(key: str, name: str, description: str, ambilight: str, projector: str) -> Mood:
        return Mood(key, name, description, {"ambilight": {"color": ambilight}, "projector": {"color": projector}})

    return [
        mood("spokoj", "Spokój", "rozmowa, eksploracja, handel, odpoczynek, planowanie", "#ffb060", "#1a1208"),
        mood("walka", "Walka", "inicjatywa, ataki, rzuty na trafienie, obrażenia, czary bojowe", "#ff0000", "#300000"),
        mood("smutek", "Smutek", "śmierć, strata, żałoba, porażka, przygnębienie", "#2040ff", "#050a20"),
        mood("zwyciestwo", "Zwycięstwo", "pokonanie wroga, radość, świętowanie, nagrody, łup", "#ffd700", "#302800"),
    ]


@dataclass
class AppConfig:
    moods: list[Mood] = field(default_factory=_default_moods)
    # Per integration id: {"enabled": bool, ...that integration's settings_fields}.
    integrations: dict[str, dict] = field(default_factory=dict)
    whisper_url: str = "http://127.0.0.1:8765"
    # Proper nouns (often English) fed to Whisper as initial_prompt so it spells them correctly.
    whisper_hint: str = ""
    microphone: str = "(domyślny)"
    chunk_seconds: int = 10
    silence_rms: float = 0.004
    classify_every_seconds: int = 45
    min_chars_to_classify: int = 60
    max_chars_per_request: int = 1500
    claude_model: str = "haiku"
    auto_mode: bool = True
