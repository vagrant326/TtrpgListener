from abc import ABC, abstractmethod
from typing import Any

from app.integrations.integration_action import IntegrationAction
from app.integrations.integration_context import IntegrationContext
from app.integrations.setting_field import SettingField
from app.models.mood import Mood


class Integration(ABC):
    """One output device/service driven by scenes.

    `settings_fields` describe global settings (shown on the Integrations tab), `scene_fields` describe
    what each mood configures for this integration (shown in the mood editor). Values live in the config,
    so the UI is generated from these lists and nothing else needs to change when adding an integration.
    """

    id: str = ""
    name: str = ""
    enabled_by_default: bool = True
    settings_fields: list[SettingField] = []
    scene_fields: list[SettingField] = []

    def __init__(self, settings: dict, context: IntegrationContext):
        # Live reference into the persisted config: writes here are saved with the config.
        self.settings = settings
        self.context = context

    @property
    def enabled(self) -> bool:
        return self.settings.get("enabled", self.enabled_by_default)

    def setting(self, key: str) -> Any:
        default = next((f.default for f in self.settings_fields if f.key == key), "")
        return self.settings.get(key, default)

    def scene_for(self, mood: Mood) -> dict:
        stored = mood.scene.get(self.id, {})
        return {f.key: stored.get(f.key, f.default) for f in self.scene_fields}

    def actions(self) -> list[IntegrationAction]:
        return []

    def status(self) -> str:
        return ""

    @abstractmethod
    def apply(self, scene: dict, mood: Mood) -> None:
        """Called on a worker thread. Raise to report a failure in the debug log."""

    def shutdown(self) -> None:
        pass
