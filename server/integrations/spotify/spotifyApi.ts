import { createHash, randomBytes } from "node:crypto";

// Must match a Redirect URI registered in the Spotify developer dashboard; the app listens on this port.
export const REDIRECT_URI = "http://127.0.0.1:8888/callback";
const SCOPE = "user-modify-playback-state user-read-playback-state playlist-read-private";
const API = "https://api.spotify.com/v1";

interface Tokens {
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number;
}

export class SpotifyApi {
  private login: { verifier: string; state: string } | undefined;

  constructor(
    private readonly clientId: () => string,
    private readonly tokens: () => Tokens,
    private readonly saveTokens: (tokens: Tokens) => void,
  ) {}

  get connected(): boolean {
    return Boolean(this.tokens().refreshToken);
  }

  beginLogin(): string {
    const verifier = randomBytes(48).toString("base64url");
    const state = randomBytes(12).toString("base64url");
    this.login = { verifier, state };
    const params = new URLSearchParams({
      client_id: this.requireClientId(),
      response_type: "code",
      redirect_uri: REDIRECT_URI,
      scope: SCOPE,
      state,
      code_challenge_method: "S256",
      code_challenge: createHash("sha256").update(verifier).digest("base64url"),
    });
    return `https://accounts.spotify.com/authorize?${params}`;
  }

  async completeLogin(url: URL): Promise<void> {
    const code = url.searchParams.get("code");
    if (!this.login || !code || url.searchParams.get("state") !== this.login.state) {
      throw new Error(url.searchParams.get("error") ?? "nieoczekiwane przekierowanie — zacznij od „Połącz” w aplikacji");
    }
    const verifier = this.login.verifier;
    this.login = undefined;
    await this.token({ grant_type: "authorization_code", code, redirect_uri: REDIRECT_URI, code_verifier: verifier });
  }

  async request<T>(method: string, path: string, body?: unknown): Promise<T | undefined> {
    const response = await fetch(`${API}${path}`, {
      method,
      headers: { Authorization: `Bearer ${await this.accessToken()}`, ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await response.text();
    if (!response.ok) {
      let message = text;
      try {
        message = JSON.parse(text).error?.message ?? text;
      } catch {
        // Not JSON; keep the raw text.
      }
      throw new Error(`Spotify ${response.status}: ${message}`);
    }
    return text ? (JSON.parse(text) as T) : undefined;
  }

  private async accessToken(): Promise<string> {
    const tokens = this.tokens();
    if (!tokens.refreshToken) {
      throw new Error("Spotify niepołączone — kliknij „Połącz” w Integracjach");
    }
    if (!tokens.accessToken || (tokens.expiresAt ?? 0) < Date.now() + 60_000) {
      await this.token({ grant_type: "refresh_token", refresh_token: tokens.refreshToken });
    }
    return this.tokens().accessToken!;
  }

  private async token(params: Record<string, string>): Promise<void> {
    const response = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ ...params, client_id: this.requireClientId() }),
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(`logowanie Spotify: ${data.error_description ?? data.error ?? response.status}`);
    }
    this.saveTokens({
      accessToken: data.access_token,
      // Spotify may or may not rotate the refresh token.
      refreshToken: data.refresh_token ?? this.tokens().refreshToken,
      expiresAt: Date.now() + data.expires_in * 1000,
    });
  }

  private requireClientId(): string {
    const clientId = this.clientId();
    if (!clientId) {
      throw new Error("brak Client ID");
    }
    return clientId;
  }
}
