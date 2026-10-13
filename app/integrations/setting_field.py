from dataclasses import dataclass
from typing import Any, Callable


@dataclass
class SettingField:
    key: str
    label: str
    kind: str = "text"  # text | int | float | color | choice
    default: Any = ""
    choices: Callable[[], list[str]] | None = None
