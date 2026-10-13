from app.integrations.color_fader import ColorFader
from app.integrations.integration import Integration
from app.integrations.integration_action import IntegrationAction
from app.integrations.integration_context import IntegrationContext
from app.integrations.philips_tv_client import PhilipsTvClient
from app.integrations.setting_field import SettingField
from app.models.mood import Mood

# Every frame is an HTTPS request to the TV, so keep the rate modest.
_FADE_FPS = 6


class PhilipsAmbilightIntegration(Integration):
    id = "ambilight"
    name = "Philips Ambilight"
    enabled_by_default = False
    settings_fields = [
        SettingField("ip", "IP telewizora"),
        SettingField("fade_seconds", "Czas przejścia [s]", "float", 3.0),
    ]
    scene_fields = [SettingField("color", "Kolor", "color", "#ffffff")]

    def __init__(self, settings: dict, context: IntegrationContext):
        super().__init__(settings, context)
        self._tv: PhilipsTvClient | None = None
        self._fader = ColorFader(lambda c: self._client().set_color(c), fps=_FADE_FPS,
                                 on_error=lambda e: context.log(f"błąd: {e}"))

    def _client(self) -> PhilipsTvClient:
        ip, device_id, auth_key = self.setting("ip"), self.settings.get("device_id", ""), self.settings.get("auth_key", "")
        if self._tv is None or (self._tv.ip, self._tv.device_id, self._tv.auth_key) != (ip, device_id, auth_key):
            self._tv = PhilipsTvClient(ip, device_id, auth_key)
        return self._tv

    def status(self) -> str:
        return "sparowany" if self.settings.get("auth_key") else "niesparowany"

    def actions(self) -> list[IntegrationAction]:
        return [IntegrationAction("Paruj", self._pair)]

    def _pair(self) -> None:
        tv = PhilipsTvClient(self.setting("ip"))
        tv.request_pairing()
        pin = self.context.ask("Parowanie TV", "Wpisz PIN wyświetlony na telewizorze:")
        if not pin:
            return
        tv.grant_pairing(pin.strip())
        self.settings["device_id"], self.settings["auth_key"] = tv.device_id, tv.auth_key
        self.context.save()
        self.context.log("sparowano")

    def apply(self, scene: dict, mood: Mood) -> None:
        if not self.setting("ip") or not self.settings.get("auth_key"):
            raise RuntimeError("TV niesparowany")
        self._fader.fade_to(scene["color"], float(self.setting("fade_seconds")))
