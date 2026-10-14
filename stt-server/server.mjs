// Speech-to-text service: Silero VAD cuts the stream into utterances, NVIDIA Parakeet TDT 0.6B v3 (int8, CPU)
// transcribes each one. Models are downloaded on first start into MODELS_DIR (a Docker volume).
//
// GET  /health       → { status: downloading|loading|ready|error, progress, message }
// POST /transcribe   → body: 16 kHz mono PCM16; returns { segments: [{ text, audioSeconds, seconds }] }
// WS   /stream       → client sends binary 16 kHz mono PCM16 frames;
//                      server sends { type: "speech", speaking } and { type: "text", text, audioSeconds, seconds }
// VAD tuning for both: ?threshold=0.5&minSilence=0.4&maxSpeech=10
import { createWriteStream, existsSync, mkdirSync, renameSync } from "node:fs";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { WebSocketServer } from "ws";

const sherpa = createRequire(import.meta.url)("sherpa-onnx-node");

const SAMPLE_RATE = 16000;
const VAD_WINDOW = 512;
const MODELS_DIR = process.env.MODELS_DIR ?? "/models";
const THREADS = Number(process.env.STT_THREADS ?? 4);
const PARAKEET_URL = "https://huggingface.co/csukuangfj/sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8/resolve/main";
const PARAKEET_DIR = join(MODELS_DIR, "parakeet-tdt-0.6b-v3-int8");
const FILES = {
  tokens: { path: join(PARAKEET_DIR, "tokens.txt"), url: `${PARAKEET_URL}/tokens.txt`, bytes: 93_939 },
  decoder: { path: join(PARAKEET_DIR, "decoder.int8.onnx"), url: `${PARAKEET_URL}/decoder.int8.onnx`, bytes: 11_845_275 },
  joiner: { path: join(PARAKEET_DIR, "joiner.int8.onnx"), url: `${PARAKEET_URL}/joiner.int8.onnx`, bytes: 6_355_277 },
  encoder: { path: join(PARAKEET_DIR, "encoder.int8.onnx"), url: `${PARAKEET_URL}/encoder.int8.onnx`, bytes: 652_184_281 },
  vad: { path: join(MODELS_DIR, "silero_vad.onnx"), url: "https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/silero_vad.onnx", bytes: 643_854 },
};

const health = { status: "downloading", progress: 0, message: "Pobieranie modelu Parakeet v3 (~670 MB)…" };
let recognizer;
let decodeQueue = Promise.resolve();

async function downloadModels() {
  mkdirSync(PARAKEET_DIR, { recursive: true });
  const total = Object.values(FILES).reduce((sum, f) => sum + f.bytes, 0);
  let done = 0;
  for (const file of Object.values(FILES)) {
    if (existsSync(file.path)) {
      done += file.bytes;
      continue;
    }
    console.log(`Pobieranie ${file.url}`);
    const response = await fetch(file.url);
    if (!response.ok || !response.body) {
      throw new Error(`${file.url}: HTTP ${response.status}`);
    }
    const body = Readable.fromWeb(response.body);
    body.on("data", (chunk) => {
      done += chunk.length;
      health.progress = Math.min(1, done / total);
    });
    await pipeline(body, createWriteStream(`${file.path}.part`));
    renameSync(`${file.path}.part`, file.path);
  }
  health.progress = 1;
}

function createVad(params) {
  return new sherpa.Vad({
    sileroVad: {
      model: FILES.vad.path,
      threshold: Number(params.get("threshold") ?? 0.5),
      minSilenceDuration: Number(params.get("minSilence") ?? 0.4),
      minSpeechDuration: 0.25,
      maxSpeechDuration: Number(params.get("maxSpeech") ?? 10),
      windowSize: VAD_WINDOW,
    },
    sampleRate: SAMPLE_RATE,
    numThreads: 1,
  }, 60);
}

// Feeds samples in VAD-sized windows and returns finished utterances.
class Segmenter {
  constructor(params) {
    this.vad = createVad(params);
    this.pending = new Float32Array(0);
  }

  feed(samples) {
    const joined = new Float32Array(this.pending.length + samples.length);
    joined.set(this.pending);
    joined.set(samples, this.pending.length);
    let offset = 0;
    for (; offset + VAD_WINDOW <= joined.length; offset += VAD_WINDOW) {
      this.vad.acceptWaveform(joined.subarray(offset, offset + VAD_WINDOW));
    }
    this.pending = joined.slice(offset);
    return this.drain();
  }

  flush() {
    this.vad.flush();
    return this.drain();
  }

  drain() {
    const segments = [];
    while (!this.vad.isEmpty()) {
      // false = copy the samples; the default external buffer points into native memory that pop() frees.
      segments.push(this.vad.front(false).samples);
      this.vad.pop();
    }
    return segments;
  }
}

function toFloat(buffer) {
  const pcm = new Int16Array(new Uint8Array(buffer).buffer, 0, buffer.length >> 1);
  return Float32Array.from(pcm, (s) => s / 32768);
}

// Decodes run one at a time so a burst of utterances doesn't fight over the same CPU threads.
function transcribe(samples) {
  const run = decodeQueue.then(async () => {
    const started = performance.now();
    const stream = recognizer.createStream();
    stream.acceptWaveform({ samples, sampleRate: SAMPLE_RATE });
    const { text } = await recognizer.decodeAsync(stream);
    return { text: text.trim(), audioSeconds: samples.length / SAMPLE_RATE, seconds: (performance.now() - started) / 1000 };
  });
  decodeQueue = run.catch(() => {});
  return run;
}

function sendJson(res, code, payload) {
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8" }).end(JSON.stringify(payload));
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  if (req.method === "GET" && url.pathname === "/health") {
    sendJson(res, 200, health);
    return;
  }
  if (req.method === "POST" && url.pathname === "/transcribe") {
    if (!recognizer) {
      sendJson(res, 503, { error: health.message });
      return;
    }
    const chunks = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }
    try {
      const segmenter = new Segmenter(url.searchParams);
      const utterances = [...segmenter.feed(toFloat(Buffer.concat(chunks))), ...segmenter.flush()];
      const segments = [];
      for (const samples of utterances) {
        segments.push(await transcribe(samples));
      }
      sendJson(res, 200, { segments });
    } catch (error) {
      sendJson(res, 500, { error: error.message });
    }
    return;
  }
  sendJson(res, 404, { error: "not found" });
});

new WebSocketServer({ server, path: "/stream" }).on("connection", (socket, req) => {
  if (!recognizer) {
    socket.close(1013, health.message);
    return;
  }
  const segmenter = new Segmenter(new URL(req.url ?? "/", "http://localhost").searchParams);
  let speaking = false;
  const send = (message) => {
    if (socket.readyState === socket.OPEN) {
      socket.send(JSON.stringify(message));
    }
  };
  const handle = (utterances) => {
    for (const samples of utterances) {
      transcribe(samples)
        .then((result) => send({ type: "text", ...result }))
        .catch((error) => send({ type: "error", message: error.message }));
    }
  };
  socket.on("message", (data, isBinary) => {
    if (!isBinary) {
      return;
    }
    handle(segmenter.feed(toFloat(data)));
    if (segmenter.vad.isDetected() !== speaking) {
      speaking = !speaking;
      send({ type: "speech", speaking });
    }
  });
  // Lets the client end a session without losing the utterance still in progress.
  socket.on("close", () => handle(segmenter.flush()));
});

server.listen(8765, "0.0.0.0", () => console.log("STT na porcie 8765"));

try {
  await downloadModels();
  Object.assign(health, { status: "loading", message: "Ładowanie modelu…" });
  console.log(health.message);
  recognizer = await sherpa.OfflineRecognizer.createAsync({
    featConfig: { sampleRate: SAMPLE_RATE, featureDim: 80 },
    modelConfig: {
      transducer: { encoder: FILES.encoder.path, decoder: FILES.decoder.path, joiner: FILES.joiner.path },
      tokens: FILES.tokens.path,
      numThreads: THREADS,
      provider: "cpu",
      modelType: "nemo_transducer",
    },
  });
  Object.assign(health, { status: "ready", message: "Parakeet TDT 0.6B v3" });
  console.log("Model gotowy");
} catch (error) {
  Object.assign(health, { status: "error", message: `Model: ${error.message}` });
  console.error(error);
}
