import json
import os
from dataclasses import asdict, fields
from pathlib import Path

from app.models.app_config import AppConfig
from app.models.mood import Mood

DATA_DIR = Path(os.environ.get("APPDATA", Path.home())) / "TtrpgListener"
CONFIG_PATH = DATA_DIR / "config.json"


def _migrate_v1(raw: dict) -> None:
    """First PoC version kept scene settings flat on the mood and integration settings at top level."""
    for mood in raw.get("moods", []):
        scene = mood.setdefault("scene", {})
        if "ambilight_color" in mood:
            scene["ambilight"] = {"color": mood.pop("ambilight_color")}
        if "projector_color" in mood:
            scene["projector"] = {"color": mood.pop("projector_color")}
        if "spotify_playlist" in mood:
            scene["spotify"] = {"playlist": mood.pop("spotify_playlist")}
    integrations = raw.setdefault("integrations", {})
    if "tv_ip" in raw:
        integrations.setdefault("ambilight", {}).update(
            ip=raw.pop("tv_ip"), device_id=raw.pop("tv_device_id", ""), auth_key=raw.pop("tv_auth_key", ""))
    if "spotify_client_id" in raw:
        integrations.setdefault("spotify", {})["client_id"] = raw.pop("spotify_client_id")
    if raw.get("microphone") == "":
        raw["microphone"] = "(domyślny)"


def load_config() -> AppConfig:
    if not CONFIG_PATH.exists():
        return AppConfig()
    raw = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
    _migrate_v1(raw)
    known = {f.name for f in fields(AppConfig)} - {"moods"}
    config = AppConfig(**{k: v for k, v in raw.items() if k in known})
    if "moods" in raw:
        mood_fields = {f.name for f in fields(Mood)}
        config.moods = [Mood(**{k: v for k, v in m.items() if k in mood_fields}) for m in raw["moods"]]
    return config


def save_config(config: AppConfig) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    tmp = CONFIG_PATH.with_suffix(".tmp")
    tmp.write_text(json.dumps(asdict(config), ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(CONFIG_PATH)
