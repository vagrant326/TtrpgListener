import { Connection } from "./api/connection.ts";

function rgb(hex: string): number[] {
  return [0, 2, 4].map((i) => parseInt(hex.replace("#", "").slice(i, i + 2), 16));
}

function toHex(channels: number[]): string {
  return "#" + channels.map((c) => Math.round(c).toString(16).padStart(2, "0")).join("");
}

let shown = [0, 0, 0];
let fade: { from: number[]; to: number[]; start: number; duration: number } | undefined;

// Same smoothstep easing as the Ambilight fader, but at display refresh rate.
function frame(now: number): void {
  if (!fade) {
    return;
  }
  const progress = fade.duration <= 0 ? 1 : Math.min(1, (now - fade.start) / fade.duration);
  const eased = progress * progress * (3 - 2 * progress);
  shown = fade.from.map((c, i) => c + (fade!.to[i] - c) * eased);
  document.body.style.background = toHex(shown);
  if (progress < 1) {
    requestAnimationFrame(frame);
  } else {
    fade = undefined;
  }
}

const connection = new Connection("projector");
connection.onProjector((color, fadeSeconds) => {
  const running = fade !== undefined;
  fade = { from: [...shown], to: rgb(color), start: performance.now(), duration: fadeSeconds * 1000 };
  if (!running) {
    requestAnimationFrame(frame);
  }
});

let idleTimer: ReturnType<typeof setTimeout> | undefined;
function wake(): void {
  document.body.classList.remove("idle");
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => document.body.classList.add("idle"), 2500);
}
document.addEventListener("mousemove", wake);
wake();

document.addEventListener("dblclick", () => {
  if (document.fullscreenElement) {
    void document.exitFullscreen();
  } else {
    void document.documentElement.requestFullscreen();
  }
});
