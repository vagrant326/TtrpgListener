from dataclasses import dataclass
from typing import Callable


@dataclass
class IntegrationAction:
    label: str
    # Runs on a worker thread; use IntegrationContext.run_on_ui for anything touching tkinter.
    run: Callable[[], None]
