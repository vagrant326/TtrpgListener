import tkinter as tk

from screeninfo import get_monitors

from app.integrations.color_fader import ColorFader
from app.integrations.integration import Integration
from app.integrations.integration_action import IntegrationAction
from app.integrations.integration_context import IntegrationContext
from app.integrations.setting_field import SettingField
from app.models.mood import Mood


def monitor_labels() -> list[str]:
    return [f"{i}: {m.width}x{m.height}{' (główny)' if m.is_primary else ''}" for i, m in enumerate(get_monitors())]


class ProjectorIntegration(Integration):
    id = "projector"
    name = "Rzutnik (okno pełnoekranowe)"
    settings_fields = [
        SettingField("monitor", "Monitor (puste = pierwszy niegłówny)", "choice", "", monitor_labels),
        SettingField("fade_seconds", "Czas przejścia [s]", "float", 3.0),
    ]
    scene_fields = [SettingField("color", "Kolor", "color", "#000000")]

    def __init__(self, settings: dict, context: IntegrationContext):
        super().__init__(settings, context)
        self._window: tk.Toplevel | None = None
        self._color = "#000000"
        self._fader = ColorFader(lambda c: context.run_on_ui(self._paint, c), fps=30,
                                 on_error=lambda e: context.log(f"błąd: {e}"), initial=self._color)

    def actions(self) -> list[IntegrationAction]:
        return [IntegrationAction("Pokaż / ukryj", lambda: self.context.run_on_ui(self._toggle))]

    def status(self) -> str:
        return "widoczne" if self._window is not None else "ukryte"

    def apply(self, scene: dict, mood: Mood) -> None:
        self._fader.fade_to(scene["color"], float(self.setting("fade_seconds")))

    def _paint(self, color: str) -> None:
        self._color = color
        if self._window is not None:
            self._window.configure(background=color)

    def _toggle(self) -> None:
        if self._window is not None:
            self._window.destroy()
            self._window = None
            return
        monitors = get_monitors()
        label = self.setting("monitor")
        index = int(label.split(":")[0]) if label else next((i for i, m in enumerate(monitors) if not m.is_primary), 0)
        monitor = monitors[index] if index < len(monitors) else monitors[0]
        self._window = tk.Toplevel(self.context.root, background=self._color, cursor="none")
        self._window.overrideredirect(True)
        self._window.geometry(f"{monitor.width}x{monitor.height}+{monitor.x}+{monitor.y}")
        self._window.attributes("-topmost", True)
        self._window.bind("<Escape>", lambda _: self._toggle())
