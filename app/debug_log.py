import json
import threading
from datetime import datetime
from typing import Callable

from app.config_store import DATA_DIR

LOG_DIR = DATA_DIR / "logs"


class DebugLog:
    """Every pipeline step emits an event here. Events go to a per-run JSONL file and to UI subscribers.

    Kinds: audio, transcript, skip, classify, scene, integration, scenario, info, error.
    """

    def __init__(self):
        LOG_DIR.mkdir(parents=True, exist_ok=True)
        self.path = LOG_DIR / f"session-{datetime.now():%Y%m%d-%H%M%S}.jsonl"
        self._lock = threading.Lock()
        self._listeners: list[Callable[[dict], None]] = []

    def subscribe(self, listener: Callable[[dict], None]) -> None:
        self._listeners.append(listener)

    def emit(self, kind: str, summary: str, **details) -> None:
        event = {"time": datetime.now().strftime("%H:%M:%S.%f")[:-3], "kind": kind, "summary": summary, **details}
        with self._lock, self.path.open("a", encoding="utf-8") as f:
            f.write(json.dumps(event, ensure_ascii=False) + "\n")
        for listener in self._listeners:
            listener(event)
