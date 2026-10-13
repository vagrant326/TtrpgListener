import queue
import threading
import time
import wave
from pathlib import Path
from typing import Callable
from urllib.parse import quote

import numpy as np
import requests
import sounddevice as sd

from app.models.app_config import AppConfig

SAMPLE_RATE = 16000


def list_microphones() -> list[str]:
    hostapi_names = {i: h["name"] for i, h in enumerate(sd.query_hostapis())}
    return [
        f"{d['name']} [{hostapi_names[d['hostapi']]}]"
        for d in sd.query_devices()
        if d["max_input_channels"] > 0
    ]


def read_wav(path: str) -> np.ndarray:
    with wave.open(path) as w:
        if w.getsampwidth() != 2:
            raise ValueError("obsługiwany jest tylko 16-bitowy PCM")
        samples = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float32) / 32768
        channels, rate = w.getnchannels(), w.getframerate()
    samples = samples.reshape(-1, channels).mean(axis=1)
    if rate != SAMPLE_RATE:
        target = np.arange(0, len(samples) * SAMPLE_RATE / rate) * rate / SAMPLE_RATE
        samples = np.interp(target, np.arange(len(samples)), samples).astype(np.float32)
    return samples


class AudioListener:
    def __init__(self, config: AppConfig, on_text: Callable[[str, str], None], emit: Callable):
        self._config = config
        self._on_text = on_text
        self._emit = emit
        self._audio: queue.Queue[np.ndarray] = queue.Queue()
        self._running = False
        # Live RMS of the latest audio block, polled by the debug meter.
        self.level = 0.0

    def start(self) -> None:
        self._running = True
        threading.Thread(target=self._run, daemon=True).start()

    def stop(self) -> None:
        self._running = False

    def transcribe_file(self, path: str) -> None:
        threading.Thread(target=self._run_file, args=(path,), daemon=True).start()

    def _device_index(self) -> int | None:
        names = list_microphones()
        if self._config.microphone not in names:
            return None
        inputs = [i for i, d in enumerate(sd.query_devices()) if d["max_input_channels"] > 0]
        return inputs[names.index(self._config.microphone)]

    def _on_block(self, data, *_) -> None:
        samples = data[:, 0].copy()
        self.level = float(np.sqrt(np.mean(samples ** 2)))
        self._audio.put(samples)

    def _run(self) -> None:
        chunk_samples = self._config.chunk_seconds * SAMPLE_RATE
        buffer = np.zeros(0, dtype=np.float32)
        try:
            with sd.InputStream(samplerate=SAMPLE_RATE, channels=1, dtype="float32",
                                device=self._device_index(), callback=self._on_block):
                self._emit("info", f"Nasłuch aktywny ({self._config.microphone})")
                while self._running:
                    try:
                        buffer = np.concatenate([buffer, self._audio.get(timeout=0.5)])
                    except queue.Empty:
                        continue
                    if len(buffer) >= chunk_samples:
                        chunk, buffer = buffer[:chunk_samples], buffer[chunk_samples:]
                        self._transcribe(chunk, "mikrofon")
        except Exception as e:
            self._emit("error", f"Błąd mikrofonu: {e}")
            return
        self.level = 0.0
        self._emit("info", "Nasłuch zatrzymany")

    def _run_file(self, path: str) -> None:
        try:
            audio = read_wav(path)
        except Exception as e:
            self._emit("error", f"Nie można wczytać {path}: {e}")
            return
        name = Path(path).name
        self._emit("info", f"Plik {name}: {len(audio) / SAMPLE_RATE:.1f}s audio")
        step = self._config.chunk_seconds * SAMPLE_RATE
        for start in range(0, len(audio), step):
            self._transcribe(audio[start:start + step], name)

    def _transcribe(self, chunk: np.ndarray, source: str) -> None:
        rms = float(np.sqrt(np.mean(chunk ** 2)))
        seconds = len(chunk) / SAMPLE_RATE
        if rms < self._config.silence_rms:
            self._emit("audio", f"{seconds:.0f}s, RMS {rms:.4f} < {self._config.silence_rms} — cisza, pominięty",
                       source=source, rms=rms, skipped=True)
            return
        hint = self._config.whisper_hint
        started = time.time()
        try:
            response = requests.post(self._config.whisper_url, data=chunk.tobytes(), timeout=60,
                                     headers={"X-Prompt": quote(hint)} if hint else {})
            response.raise_for_status()
        except requests.RequestException as e:
            self._emit("error", f"Whisper niedostępny: {e}")
            return
        result = response.json()
        roundtrip = time.time() - started
        text = result["text"]
        self._emit("audio", f"{seconds:.0f}s, RMS {rms:.4f}, whisper {result['seconds']:.1f}s "
                            f"(z przesyłem {roundtrip:.1f}s), {len(text)} zn.",
                   source=source, rms=rms, whisper_seconds=result["seconds"], roundtrip_seconds=roundtrip,
                   audio_seconds=seconds, text=text)
        if text:
            self._on_text(text, source)
