import threading
import time
from typing import Callable


def _rgb(hex_color: str) -> tuple[int, int, int]:
    value = hex_color.lstrip("#")
    return int(value[0:2], 16), int(value[2:4], 16), int(value[4:6], 16)


def mix(start: str, end: str, progress: float) -> str:
    eased = progress * progress * (3 - 2 * progress)
    channels = (round(a + (b - a) * eased) for a, b in zip(_rgb(start), _rgb(end)))
    return "#{:02x}{:02x}{:02x}".format(*channels)


class ColorFader:
    """Time-based colour transition. A new fade_to cancels the running one and continues from the colour
    currently shown, so rapid scene changes never jump. A slow `apply` simply results in fewer frames."""

    def __init__(self, apply: Callable[[str], None], fps: float,
                 on_error: Callable[[Exception], None], initial: str | None = None):
        self._apply = apply
        self._fps = fps
        self._on_error = on_error
        self._current = initial
        self._generation = 0
        self._lock = threading.Lock()

    def fade_to(self, target: str, seconds: float) -> None:
        with self._lock:
            self._generation += 1
            generation = self._generation
        threading.Thread(target=self._run, args=(generation, target, seconds), daemon=True).start()

    def _run(self, generation: int, target: str, seconds: float) -> None:
        start = self._current or target
        began = time.monotonic()
        while generation == self._generation:
            progress = 1.0 if seconds <= 0 else min(1.0, (time.monotonic() - began) / seconds)
            color = mix(start, target, progress)
            try:
                self._apply(color)
            except Exception as e:
                self._on_error(e)
                return
            self._current = color
            if progress >= 1.0:
                return
            time.sleep(1 / self._fps)
