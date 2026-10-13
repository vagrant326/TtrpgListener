import re

import spotipy
from spotipy.oauth2 import SpotifyPKCE

from app.config_store import DATA_DIR
from app.integrations.integration import Integration
from app.integrations.integration_action import IntegrationAction
from app.integrations.integration_context import IntegrationContext
from app.integrations.setting_field import SettingField
from app.models.mood import Mood

REDIRECT_URI = "http://127.0.0.1:8888/callback"
SCOPE = "user-modify-playback-state user-read-playback-state"


def to_context_uri(playlist: str) -> str:
    match = re.search(r"playlist[/:]([A-Za-z0-9]+)", playlist)
    return f"spotify:playlist:{match.group(1)}" if match else playlist


class SpotifyIntegration(Integration):
    id = "spotify"
    name = "Spotify (Premium)"
    enabled_by_default = False
    settings_fields = [
        SettingField("client_id", "Client ID"),
        SettingField("device", "Urządzenie (fragment nazwy, puste = aktywne)"),
    ]
    scene_fields = [SettingField("playlist", "Playlista (link lub URI)")]

    def __init__(self, settings: dict, context: IntegrationContext):
        super().__init__(settings, context)
        self._client: spotipy.Spotify | None = None
        self._client_id = ""
        self._user = ""
        self._last_uri = ""

    def _spotify(self) -> spotipy.Spotify:
        client_id = self.setting("client_id")
        if not client_id:
            raise RuntimeError("brak Client ID")
        if self._client is None or client_id != self._client_id:
            self._client_id = client_id
            self._client = spotipy.Spotify(auth_manager=SpotifyPKCE(
                client_id=client_id, redirect_uri=REDIRECT_URI, scope=SCOPE,
                cache_handler=spotipy.CacheFileHandler(cache_path=str(DATA_DIR / "spotify_token.json")),
            ))
        return self._client

    def status(self) -> str:
        return f"połączone: {self._user}" if self._user else ""

    def actions(self) -> list[IntegrationAction]:
        return [IntegrationAction("Połącz", self._connect), IntegrationAction("Pokaż urządzenia", self._list_devices)]

    def _connect(self) -> None:
        self._user = self._spotify().current_user()["display_name"]
        self.context.log(f"połączono jako {self._user}")

    def _list_devices(self) -> None:
        devices = self._spotify().devices()["devices"]
        summary = ", ".join(f"{d['name']} ({d['type']}{', aktywne' if d['is_active'] else ''})" for d in devices)
        self.context.log(f"urządzenia: {summary or 'brak — uruchom aplikację Spotify'}")

    def apply(self, scene: dict, mood: Mood) -> None:
        if not scene["playlist"]:
            return
        uri = to_context_uri(scene["playlist"])
        if uri == self._last_uri:
            self.context.log("ta sama playlista co obecna — bez zmian")
            return
        client = self._spotify()
        devices = client.devices()["devices"]
        if not devices:
            raise RuntimeError("brak urządzeń — uruchom aplikację Spotify")
        wanted = self.setting("device").lower()
        device = (next((d for d in devices if wanted and wanted in d["name"].lower()), None)
                  or next((d for d in devices if d["is_active"]), devices[0]))
        # Passing device_id also transfers playback there if another device was active.
        client.start_playback(device_id=device["id"], context_uri=uri)
        client.shuffle(True, device_id=device["id"])
        self._last_uri = uri
        self.context.log(f"gra {uri} na „{device['name']}”")
