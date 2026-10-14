// Resamples the microphone from the context rate to 16 kHz (linear interpolation; speech has nothing above
// 8 kHz worth keeping), batches 100 ms, converts it to PCM16 and reports the block's RMS for the level meter.
const TARGET_RATE = 16000;
const BLOCK = 1600;

class MicCapture extends AudioWorkletProcessor {
  constructor() {
    super();
    this.step = sampleRate / TARGET_RATE;
    this.position = 0;
    this.buffer = new Int16Array(BLOCK);
    this.filled = 0;
    this.sumSquares = 0;
  }

  process(inputs) {
    const channel = inputs[0]?.[0];
    if (!channel) {
      return true;
    }
    // position is in input samples, relative to the start of this render quantum.
    while (this.position < channel.length) {
      const index = Math.floor(this.position);
      const fraction = this.position - index;
      const a = channel[index];
      const b = channel[Math.min(index + 1, channel.length - 1)];
      this.push(a + (b - a) * fraction);
      this.position += this.step;
    }
    this.position -= channel.length;
    return true;
  }

  push(value) {
    const sample = Math.max(-1, Math.min(1, value));
    this.sumSquares += sample * sample;
    this.buffer[this.filled++] = sample * 32767;
    if (this.filled === BLOCK) {
      this.port.postMessage({ pcm: this.buffer, rms: Math.sqrt(this.sumSquares / BLOCK) }, [this.buffer.buffer]);
      this.buffer = new Int16Array(BLOCK);
      this.filled = 0;
      this.sumSquares = 0;
    }
  }
}

registerProcessor("mic-capture", MicCapture);
