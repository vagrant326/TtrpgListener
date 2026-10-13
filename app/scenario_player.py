import json
import threading
from pathlib import Path

from app.session import Session

SCENARIOS_PATH = Path(__file__).parent / "debug_scenarios.json"


def load_scenarios() -> list[dict]:
    return json.loads(SCENARIOS_PATH.read_text(encoding="utf-8"))


class ScenarioPlayer:
    """Feeds scripted transcript lines into the session as if Whisper produced them, then classifies each
    segment and compares the result with the segment's expected mood."""

    def __init__(self, session: Session):
        self._session = session
        self._stop = threading.Event()
        self.running = False

    def play(self, scenario: dict, line_delay: float) -> None:
        if self.running:
            return
        self._stop.clear()
        threading.Thread(target=self._run, args=(scenario, line_delay), daemon=True).start()

    def stop(self) -> None:
        self._stop.set()

    def _run(self, scenario: dict, line_delay: float) -> None:
        self.running = True
        self._session.suspend_auto = True
        debug = self._session.debug
        hits = 0
        segments = scenario["segments"]
        debug.emit("scenario", f"Start scenariusza „{scenario['name']}” ({len(segments)} segmentów)")
        try:
            for number, segment in enumerate(segments, 1):
                debug.emit("scenario", f"Segment {number}/{len(segments)}: {segment.get('note', '')}",
                           expected=segment["expected"])
                for line in segment["lines"]:
                    if self._stop.wait(line_delay):
                        debug.emit("scenario", "Scenariusz przerwany")
                        return
                    self._session.inject_text(line, "scenariusz")
                if self._session.classify(force=True, expected=segment["expected"]) == segment["expected"]:
                    hits += 1
            debug.emit("scenario", f"Koniec „{scenario['name']}”: {hits}/{len(segments)} zgodnych",
                       hits=hits, total=len(segments))
        finally:
            self._session.suspend_auto = False
            self.running = False
