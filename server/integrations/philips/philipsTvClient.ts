import { createHmac, randomBytes } from "node:crypto";
import { Agent, request } from "node:https";
import { DigestAuth } from "./digestAuth.ts";

// Philips JointSpace API on Android TVs (2016+): HTTPS with a self-signed cert and digest auth obtained
// through PIN pairing. The shared HMAC key is the one used by the Philips TV remote app (see pylips).
const PAIRING_SECRET = Buffer.from(
  "ZmVay1EQVFOaZhwQ4Kv81ypLAZNczV9sG4KkseXWn1NEk6cXmPKO/MCa9sryslvLCFMnNe4Z4CPXzToowvhHvA==",
  "base64",
);
// Reused so fades don't pay a TLS handshake per frame.
const agent = new Agent({ keepAlive: true, rejectUnauthorized: false });

interface TvResponse {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: string;
}

function rgbToHsv(hex: string): [number, number, number] {
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.replace("#", "").slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const delta = max - Math.min(r, g, b);
  let hue = 0;
  if (delta > 0) {
    if (max === r) {
      hue = ((g - b) / delta + 6) % 6;
    } else if (max === g) {
      hue = (b - r) / delta + 2;
    } else {
      hue = (r - g) / delta + 4;
    }
  }
  return [hue / 6, max === 0 ? 0 : delta / max, max];
}

export class PhilipsTvClient {
  readonly deviceId: string;
  authKey: string;
  private pendingTimestamp: unknown;
  private digest: DigestAuth;

  constructor(readonly ip: string, deviceId = "", authKey = "") {
    this.deviceId = deviceId || randomBytes(8).toString("hex");
    this.authKey = authKey;
    this.digest = new DigestAuth(this.deviceId, this.authKey);
  }

  async requestPairing(): Promise<void> {
    const response = await this.send("POST", "pair/request", { device: this.device(), scope: ["read", "write", "control"] }, false);
    const data = JSON.parse(response.body);
    if (data.error_id !== "SUCCESS") {
      throw new Error(`TV odrzucił parowanie: ${response.body}`);
    }
    this.authKey = data.auth_key;
    this.digest = new DigestAuth(this.deviceId, this.authKey);
    this.pendingTimestamp = data.timestamp;
  }

  async grantPairing(pin: string): Promise<void> {
    const signature = createHmac("sha1", PAIRING_SECRET).update(`${this.pendingTimestamp}${pin}`).digest("hex");
    await this.send("POST", "pair/grant", {
      auth: {
        auth_AppId: "1",
        pin,
        auth_timestamp: this.pendingTimestamp,
        auth_signature: Buffer.from(signature).toString("base64"),
      },
      device: this.device(),
    }, true);
  }

  async setColor(hex: string): Promise<void> {
    const [hue, saturation, brightness] = rgbToHsv(hex);
    await this.send("POST", "ambilight/currentconfiguration", {
      styleName: "FOLLOW_COLOR",
      isExpert: true,
      algorithm: "MANUAL_HUE",
      colorSettings: {
        color: { hue: Math.round(hue * 255), saturation: Math.round(saturation * 255), brightness: Math.round(brightness * 255) },
        colorDelta: { hue: 0, saturation: 0, brightness: 0 },
        speed: 255,
      },
    }, true);
  }

  private device(): Record<string, string> {
    return {
      device_name: "TtrpgListener",
      device_os: "Android",
      app_name: "TtrpgListener",
      type: "native",
      app_id: "app.ttrpglistener",
      id: this.deviceId,
    };
  }

  private async send(method: string, path: string, payload: unknown, authenticated: boolean): Promise<TvResponse> {
    const uri = `/6/${path}`;
    const body = JSON.stringify(payload);
    let response = await this.raw(method, uri, body, authenticated && this.digest.ready ? this.digest.header(method, uri) : undefined);
    if (response.status === 401 && authenticated) {
      this.digest.setChallenge(String(response.headers["www-authenticate"] ?? ""));
      response = await this.raw(method, uri, body, this.digest.header(method, uri));
    }
    if (response.status >= 400) {
      throw new Error(`TV: HTTP ${response.status} ${response.body.slice(0, 200)}`);
    }
    return response;
  }

  private raw(method: string, uri: string, body: string, authorization?: string): Promise<TvResponse> {
    return new Promise((resolve, reject) => {
      const req = request({
        host: this.ip,
        port: 1926,
        path: uri,
        method,
        agent,
        timeout: 5000,
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
          ...(authorization ? { Authorization: authorization } : {}),
        },
      }, (res) => {
        let text = "";
        res.setEncoding("utf-8");
        res.on("data", (chunk: string) => {
          text += chunk;
        });
        res.on("end", () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body: text }));
      });
      req.on("timeout", () => req.destroy(new Error("TV nie odpowiada (timeout 5 s)")));
      req.on("error", reject);
      req.end(body);
    });
  }
}
