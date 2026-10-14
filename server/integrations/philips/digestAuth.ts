import { createHash, randomBytes } from "node:crypto";

const md5 = (text: string) => createHash("md5").update(text).digest("hex");

// HTTP Digest (RFC 2617, MD5, qop=auth). The challenge is reused with an increasing nonce count,
// so a colour fade costs one request per frame instead of two.
export class DigestAuth {
  private challenge: Record<string, string> | undefined;
  private nonceCount = 0;

  constructor(private readonly user: string, private readonly password: string) {}

  get ready(): boolean {
    return this.challenge !== undefined;
  }

  setChallenge(header: string): void {
    this.challenge = Object.fromEntries(
      [...header.replace(/^Digest\s+/i, "").matchAll(/(\w+)=(?:"([^"]*)"|([^,\s]*))/g)].map((m) => [m[1], m[2] ?? m[3]]),
    );
    this.nonceCount = 0;
  }

  header(method: string, uri: string): string {
    const c = this.challenge!;
    const ha1 = md5(`${this.user}:${c.realm}:${this.password}`);
    const ha2 = md5(`${method}:${uri}`);
    const fields: Record<string, string> = { username: this.user, realm: c.realm, nonce: c.nonce, uri };
    if (c.qop) {
      const nc = (++this.nonceCount).toString(16).padStart(8, "0");
      const cnonce = randomBytes(8).toString("hex");
      Object.assign(fields, { qop: "auth", nc, cnonce, response: md5(`${ha1}:${c.nonce}:${nc}:${cnonce}:auth:${ha2}`) });
    } else {
      fields.response = md5(`${ha1}:${c.nonce}:${ha2}`);
    }
    if (c.opaque) {
      fields.opaque = c.opaque;
    }
    const unquoted = new Set(["qop", "nc"]);
    return "Digest " + Object.entries(fields).map(([k, v]) => (unquoted.has(k) ? `${k}=${v}` : `${k}="${v}"`)).join(", ");
  }
}
