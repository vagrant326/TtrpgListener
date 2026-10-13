import threading
import tkinter as tk
from tkinter import simpledialog
from typing import Callable


class IntegrationContext:
    def __init__(self, root: tk.Tk, post_to_ui: Callable, log: Callable[[str], None], save: Callable[[], None]):
        self.root = root
        self._post_to_ui = post_to_ui
        self._log = log
        self._save = save

    def run_on_ui(self, fn: Callable, *args) -> None:
        self._post_to_ui(fn, *args)

    def log(self, message: str) -> None:
        self._log(message)

    def save(self) -> None:
        self._save()

    def ask(self, title: str, prompt: str) -> str | None:
        """Blocks the calling worker thread until the user answers. Never call from the UI thread."""
        answer: dict[str, str | None] = {}
        done = threading.Event()

        def show():
            answer["value"] = simpledialog.askstring(title, prompt, parent=self.root)
            done.set()

        self._post_to_ui(show)
        done.wait()
        return answer.get("value")
