export interface MicOptions {
  deviceId: string;
  noiseSuppression: boolean;
  autoGainControl: boolean;
}

export const SAMPLE_RATE = 16000;

export class MicCapture {
  private context: AudioContext | undefined;
  private stream: MediaStream | undefined;

  static get supported(): boolean {
    // getUserMedia only exists in secure contexts (https or localhost).
    return Boolean(navigator.mediaDevices?.getUserMedia);
  }

  static async devices(): Promise<MediaDeviceInfo[]> {
    if (!MicCapture.supported) {
      return [];
    }
    return (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === "audioinput");
  }

  async start(options: MicOptions, onBlock: (pcm: Int16Array, rms: number) => void): Promise<void> {
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        deviceId: options.deviceId ? { exact: options.deviceId } : undefined,
        channelCount: 1,
        echoCancellation: false,
        noiseSuppression: options.noiseSuppression,
        autoGainControl: options.autoGainControl,
      },
    });
    this.context = new AudioContext();
    await this.context.audioWorklet.addModule("/mic-worklet.js");
    const node = new AudioWorkletNode(this.context, "mic-capture");
    node.port.onmessage = (event: MessageEvent<{ pcm: Int16Array; rms: number }>) => onBlock(event.data.pcm, event.data.rms);
    this.context.createMediaStreamSource(this.stream).connect(node);
  }

  stop(): void {
    this.stream?.getTracks().forEach((track) => track.stop());
    void this.context?.close();
    this.stream = undefined;
    this.context = undefined;
  }
}

// Decodes any audio file the browser can play and resamples it to 16 kHz mono PCM16 for the server.
export async function decodeToPcm(file: File): Promise<Int16Array> {
  const decoded = await new AudioContext().decodeAudioData(await file.arrayBuffer());
  const offline = new OfflineAudioContext(1, Math.ceil(decoded.duration * SAMPLE_RATE), SAMPLE_RATE);
  const source = offline.createBufferSource();
  source.buffer = decoded;
  source.connect(offline.destination);
  source.start();
  const samples = (await offline.startRendering()).getChannelData(0);
  const pcm = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    pcm[i] = Math.max(-1, Math.min(1, samples[i])) * 32767;
  }
  return pcm;
}
