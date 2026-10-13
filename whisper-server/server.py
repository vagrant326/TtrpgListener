import json
import os
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import unquote

import numpy as np
from faster_whisper import WhisperModel

MODEL_NAME = os.environ.get("WHISPER_MODEL", "small")
LANGUAGE = os.environ.get("WHISPER_LANGUAGE", "pl")

print(f"Loading model {MODEL_NAME}...", flush=True)
model = WhisperModel(MODEL_NAME, device="cpu", compute_type="int8")
print("Model loaded", flush=True)


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        self._send(200, {"status": "ok", "model": MODEL_NAME})

    def do_POST(self):
        # Body: raw mono 16 kHz float32 PCM. Optional "X-Prompt" header carries proper nouns (url-encoded).
        length = int(self.headers.get("Content-Length", 0))
        audio = np.frombuffer(self.rfile.read(length), dtype=np.float32)
        prompt = unquote(self.headers.get("X-Prompt", "")) or None

        started = time.time()
        segments, _ = model.transcribe(
            audio,
            language=LANGUAGE,
            initial_prompt=prompt,
            vad_filter=True,
            beam_size=1,
        )
        text = " ".join(s.text.strip() for s in segments).strip()
        self._send(200, {"text": text, "seconds": round(time.time() - started, 2)})

    def _send(self, code, payload):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args):
        pass


ThreadingHTTPServer(("0.0.0.0", 8765), Handler).serve_forever()
