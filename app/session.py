import threading
import time
from typing import Callable

from app.audio_listener import AudioListener
from app.debug_log import DebugLog
from app.integrations.integration import Integration
from app.integrations.integration_context import IntegrationContext
from app.integrations.registry import INTEGRATIONS
from app.models.app_config import AppConfig
from app.models.mood import Mood
from app.mood_classifier import classify


class Session:
    def __init__(self, config: AppConfig, debug: DebugLog,
                 make_context: Callable[[str, str], IntegrationContext], on_mood: Callable[[Mood], None]):
        self.config = config
        self.debug = debug
        self.integrations: list[Integration] = [
            cls(config.integrations.setdefault(cls.id, {"enabled": cls.enabled_by_default}), make_context(cls.id, cls.name))
            for cls in INTEGRATIONS
        ]
        self.current_mood: Mood | None = None
        self.tokens_used = 0
        # Set by the scenario player so the timer doesn't steal its text mid-segment.
        self.suspend_auto = False
        self._on_mood = on_mood
        self._listener: AudioListener | None = None
        self._pending: list[str] = []
        self._pending_lock = threading.Lock()
        self._classify_lock = threading.Lock()
        self._stop_loop = threading.Event()

    @property
    def is_listening(self) -> bool:
        return self._listener is not None

    @property
    def mic_level(self) -> float:
        return self._listener.level if self._listener else 0.0

    def start_listening(self) -> None:
        self._listener = AudioListener(self.config, self.inject_text, self.debug.emit)
        self._listener.start()
        self._stop_loop.clear()
        threading.Thread(target=self._auto_loop, daemon=True).start()

    def stop_listening(self) -> None:
        if self._listener is not None:
            self._listener.stop()
            self._listener = None
        self._stop_loop.set()

    def transcribe_file(self, path: str) -> None:
        AudioListener(self.config, self.inject_text, self.debug.emit).transcribe_file(path)

    def inject_text(self, text: str, source: str = "ręcznie") -> None:
        with self._pending_lock:
            self._pending.append(text)
        self.debug.emit("transcript", f"[{source}] {text}", source=source, text=text)

    def classify_now(self) -> None:
        threading.Thread(target=self.classify, kwargs={"force": True}, daemon=True).start()

    def _auto_loop(self) -> None:
        while not self._stop_loop.wait(self.config.classify_every_seconds):
            if self.config.auto_mode and not self.suspend_auto:
                self.classify()

    def classify(self, force: bool = False, expected: str | None = None) -> str | None:
        with self._classify_lock:
            with self._pending_lock:
                fragment = " ".join(self._pending)
                if not fragment:
                    if force:
                        self.debug.emit("skip", "Brak nowego tekstu do klasyfikacji")
                    return None
                if len(fragment) < self.config.min_chars_to_classify and not force:
                    self.debug.emit("skip", f"Za mało tekstu ({len(fragment)} zn. < {self.config.min_chars_to_classify}) — czekam dalej",
                                    chars=len(fragment))
                    return None
                self._pending.clear()

            # Only the newest text is sent; the current mood carries the context forward.
            fragment = fragment[-self.config.max_chars_per_request:]
            current = self.current_mood.key if self.current_mood else None
            try:
                result = classify(self.config.moods, current, fragment, self.config.claude_model)
            except Exception as e:
                self.debug.emit("error", f"Klasyfikacja nieudana: {e}")
                return None

            self.tokens_used += result.input_tokens + result.output_tokens
            verdict = ""
            if expected is not None:
                verdict = " ✓" if result.mood_key == expected else f" ✗ (oczekiwano {expected})"
            self.debug.emit(
                "classify",
                f"{current or '—'} → {result.mood_key or repr(result.raw)} | "
                f"{result.input_tokens}+{result.output_tokens} tok | {result.seconds:.1f}s{verdict}",
                mood=result.mood_key, raw=result.raw, expected=expected,
                match=None if expected is None else result.mood_key == expected,
                input_tokens=result.input_tokens, output_tokens=result.output_tokens,
                tokens_total=self.tokens_used, seconds=result.seconds, chars=len(fragment),
                system_prompt=result.system_prompt, user_prompt=result.user_prompt,
            )
            mood = next((m for m in self.config.moods if m.key == result.mood_key), None)
            if mood is not None and self.config.auto_mode and mood is not self.current_mood:
                self.apply_mood(mood, "auto")
            return result.mood_key

    def apply_mood(self, mood: Mood, source: str) -> None:
        self.current_mood = mood
        self.debug.emit("scene", f"Scena: {mood.name} ({source})", mood=mood.key, source=source)
        self._on_mood(mood)
        for integration in self.integrations:
            if integration.enabled:
                threading.Thread(target=self._apply_integration, args=(integration, mood), daemon=True).start()

    def _apply_integration(self, integration: Integration, mood: Mood) -> None:
        scene = integration.scene_for(mood)
        started = time.time()
        try:
            integration.apply(scene, mood)
        except Exception as e:
            self.debug.emit("error", f"{integration.name}: {e}", integration=integration.id, scene=scene)
            return
        self.debug.emit("integration", f"{integration.name}: wywołano ({(time.time() - started) * 1000:.0f} ms)",
                        integration=integration.id, scene=scene)

    def shutdown(self) -> None:
        self.stop_listening()
        for integration in self.integrations:
            integration.shutdown()
