import type { IntegrationActionInfo } from "../../../shared/appState.ts";
import type { ChannelId } from "../../../shared/channelId.ts";
import type { ActionResult } from "../../../shared/messages.ts";
import type { FieldValue, SettingField } from "../../../shared/settingField.ts";
import { Integration } from "../integration.ts";
import type { IntegrationContext } from "../integrationContext.ts";
import { SpotifyApi } from "./spotifyApi.ts";

interface Device {
  id: string;
  name: string;
  type: string;
  is_active: boolean;
}

function toContextUri(link: string): string {
  const match = link.match(/(playlist|album)[/:]([A-Za-z0-9]+)/);
  return match ? `spotify:${match[1]}:${match[2]}` : link;
}

export class SpotifyIntegration extends Integration {
  readonly id = "spotify";
  readonly name = "Spotify (Premium)";
  readonly channel: ChannelId = "music";
  override readonly settingsFields: SettingField[] = [
    { key: "clientId", label: "Client ID", kind: "text", default: "", hint: "developer.spotify.com → Create app" },
    { key: "device", label: "Urządzenie", kind: "text", default: "", hint: "fragment nazwy; puste = aktywne" },
  ];
  override readonly presetFields: SettingField[] = [
    { key: "playlist", label: "Playlista (link lub URI)", kind: "text", default: "" },
    {
      key: "start",
      label: "Start",
      kind: "choice",
      default: "random",
      options: [
        { value: "random", label: "od losowego utworu" },
        { value: "beginning", label: "od początku" },
      ],
    },
    { key: "shuffle", label: "Tasowanie", kind: "boolean", default: true },
  ];
  override readonly routes = {
    "/callback": async (url: URL) => {
      await this.api.completeLogin(url);
      await this.loadUser();
      return `Połączono ze Spotify jako ${this.user}. Możesz zamknąć tę kartę.`;
    },
  };
  private readonly api: SpotifyApi;
  private user = "";
  private lastUri = "";

  constructor(context: IntegrationContext) {
    super(context);
    this.api = new SpotifyApi(
      () => this.setting<string>("clientId"),
      () => context.secrets(),
      (tokens) => context.updateSecrets({ ...tokens }),
    );
  }

  override start(): void {
    if (this.api.connected) {
      this.loadUser().catch((e) => this.context.log(`nie udało się odświeżyć połączenia: ${e.message}`));
    }
  }

  override status(): string {
    if (this.user) {
      return `połączone: ${this.user}`;
    }
    return this.api.connected ? "połączone" : "niepołączone";
  }

  override actions(): IntegrationActionInfo[] {
    return [
      { id: "connect", label: this.api.connected ? "Połącz ponownie" : "Połącz" },
      { id: "devices", label: "Pokaż urządzenia" },
      { id: "pause", label: "Pauza" },
    ];
  }

  override async runAction(actionId: string): Promise<ActionResult | void> {
    if (actionId === "connect") {
      return { openUrl: this.api.beginLogin(), message: "Zaloguj się w otwartej karcie." };
    }
    if (actionId === "devices") {
      const devices = await this.devices();
      const summary = devices.map((d) => `${d.name} (${d.type}${d.is_active ? ", aktywne" : ""})`).join(", ");
      return { message: summary || "Brak urządzeń — uruchom aplikację Spotify." };
    }
    if (actionId === "pause") {
      await this.api.request("PUT", "/me/player/pause");
      // Otherwise the next preset with the same playlist would be skipped as "already playing".
      this.lastUri = "";
      this.context.log("pauza");
    }
  }

  async apply(settings: Record<string, FieldValue>): Promise<void> {
    const link = String(settings.playlist).trim();
    if (!link) {
      return;
    }
    const uri = toContextUri(link);
    if (uri === this.lastUri) {
      this.context.log("ta sama playlista co obecna — bez zmian");
      return;
    }
    const device = await this.pickDevice();
    const query = `device_id=${encodeURIComponent(device.id)}`;
    const shuffle = Boolean(settings.shuffle);
    const position = settings.start === "random" ? await this.randomPosition(uri) : 0;

    // Passing device_id also transfers playback there if another device was active.
    await this.api.request("PUT", `/me/player/play?${query}`, {
      context_uri: uri,
      ...(position !== undefined ? { offset: { position } } : {}),
    });
    if (position === undefined) {
      // Track count unknown: let Spotify's shuffle pick the first track instead.
      await this.api.request("PUT", `/me/player/shuffle?state=true&${query}`);
      await this.api.request("POST", `/me/player/next?${query}`);
    }
    // Set after starting, so the chosen first track stays and only the rest of the queue is (un)shuffled.
    await this.api.request("PUT", `/me/player/shuffle?state=${shuffle}&${query}`);
    this.lastUri = uri;
    const from = position === undefined ? "losowo" : `od utworu ${position + 1}`;
    this.context.log(`gra ${uri} ${from}${shuffle ? ", tasowanie" : ""} na „${device.name}”`);
  }

  private async randomPosition(uri: string): Promise<number | undefined> {
    const [, kind, id] = uri.split(":");
    try {
      if (kind === "playlist") {
        const playlist = await this.api.request<{ tracks?: { total: number }; items?: { total: number } }>("GET", `/playlists/${id}`);
        const total = playlist?.tracks?.total ?? playlist?.items?.total;
        return total ? Math.floor(Math.random() * total) : undefined;
      }
      if (kind === "album") {
        const album = await this.api.request<{ total_tracks: number }>("GET", `/albums/${id}`);
        return album?.total_tracks ? Math.floor(Math.random() * album.total_tracks) : undefined;
      }
    } catch (error) {
      this.context.log(`nie udało się pobrać liczby utworów (${(error as Error).message})`);
    }
    return undefined;
  }

  private async devices(): Promise<Device[]> {
    return (await this.api.request<{ devices: Device[] }>("GET", "/me/player/devices"))?.devices ?? [];
  }

  private async pickDevice(): Promise<Device> {
    const devices = await this.devices();
    if (devices.length === 0) {
      throw new Error("brak urządzeń — uruchom aplikację Spotify");
    }
    const wanted = this.setting<string>("device").toLowerCase();
    return (wanted && devices.find((d) => d.name.toLowerCase().includes(wanted)))
      || devices.find((d) => d.is_active)
      || devices[0];
  }

  private async loadUser(): Promise<void> {
    this.user = (await this.api.request<{ display_name: string }>("GET", "/me"))?.display_name ?? "";
    this.context.changed();
  }
}
