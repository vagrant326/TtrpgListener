import json
import os
import re
import subprocess
import tempfile
import time
from dataclasses import dataclass

from app.models.mood import Mood

# Empty working dir so claude doesn't pick up any project CLAUDE.md.
_WORKDIR = tempfile.mkdtemp(prefix="ttrpg-classifier-")


@dataclass
class ClassificationResult:
    mood_key: str | None
    raw: str
    input_tokens: int
    output_tokens: int
    seconds: float
    system_prompt: str
    user_prompt: str


def classify(moods: list[Mood], current_key: str | None, transcript: str, model: str) -> ClassificationResult:
    mood_lines = "\n".join(f"- {m.key}: {m.description}" for m in moods)
    system_prompt = (
        "Klasyfikujesz nastrój sesji gry fabularnej (RPG) na podstawie fragmentu transkrypcji rozmowy graczy. "
        "Transkrypcja jest automatyczna i zawiera błędy.\n"
        f"Dostępne nastroje:\n{mood_lines}\n"
        "Zmień nastrój tylko gdy fragment wyraźnie na to wskazuje; w razie wątpliwości zostaw obecny. "
        "Odpowiedz wyłącznie jednym kluczem nastroju, bez niczego więcej."
    )
    prompt = f"Obecny nastrój: {current_key or 'brak'}\nFragment:\n{transcript}"

    started = time.time()
    env = {**os.environ, "MAX_THINKING_TOKENS": "0"}
    completed = subprocess.run(
        ["claude", "-p", prompt, "--model", model, "--system-prompt", system_prompt,
         "--tools", "", "--strict-mcp-config", "--setting-sources", "",
         "--no-session-persistence", "--output-format", "json"],
        cwd=_WORKDIR, env=env, capture_output=True, text=True, encoding="utf-8", timeout=90,
        creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
    )
    if completed.returncode != 0:
        raise RuntimeError(completed.stderr.strip() or completed.stdout.strip())

    payload = json.loads(completed.stdout)
    answer = payload.get("result", "")
    words = re.findall(r"\w+", answer.lower())
    keys = {m.key.lower(): m.key for m in moods}
    usage = payload.get("usage", {})
    return ClassificationResult(
        mood_key=next((keys[w] for w in words if w in keys), None),
        raw=answer,
        input_tokens=usage.get("input_tokens", 0),
        output_tokens=usage.get("output_tokens", 0),
        seconds=time.time() - started,
        system_prompt=system_prompt,
        user_prompt=prompt,
    )
