import type { IntegrationActionInfo } from "../../../shared/appState.ts";
import type { ChannelId } from "../../../shared/channelId.ts";
import type { ActionResult } from "../../../shared/messages.ts";
import type { FieldValue, SettingField } from "../../../shared/settingField.ts";
import { ColorFader } from "../colorFader.ts";
import { Integration } from "../integration.ts";
import type { IntegrationContext } from "../integrationContext.ts";
import { PhilipsTvClient } from "./philipsTvClient.ts";

// Every frame is an HTTPS request to the TV, so keep the rate modest.
const FADE_FPS = 6;

export class AmbilightIntegration extends Integration {
  readonly id = "ambilight";
  readonly name = "Philips Ambilight";
  readonly channel: ChannelId = "light";
  override readonly settingsFields: SettingField[] = [
    { key: "ip", label: "IP telewizora", kind: "text", default: "" },
    { key: "fadeSeconds", label: "Czas przejścia [s]", kind: "number", default: 3 },
  ];
  override readonly presetFields: SettingField[] = [
    { key: "color", label: "Kolor Ambilight", kind: "color", default: "#ffffff" },
  ];
  private tv: PhilipsTvClient | undefined;
  private pairing: PhilipsTvClient | undefined;
  private readonly fader: ColorFader;

  constructor(context: IntegrationContext) {
    super(context);
    this.fader = new ColorFader((color) => this.client().setColor(color), FADE_FPS, (e) => context.log(`błąd: ${e.message}`));
  }

  override status(): string {
    if (this.pairing) {
      return "czeka na PIN";
    }
    return this.context.secrets().authKey ? "sparowany" : "niesparowany";
  }

  override actions(): IntegrationActionInfo[] {
    return this.pairing
      ? [{ id: "pin", label: "Potwierdź PIN", input: "PIN z ekranu telewizora" }, { id: "pair", label: "Paruj ponownie" }]
      : [{ id: "pair", label: "Paruj" }];
  }

  override async runAction(actionId: string, input?: string): Promise<ActionResult | void> {
    if (actionId === "pair") {
      const ip = this.setting<string>("ip");
      if (!ip) {
        throw new Error("najpierw wpisz IP telewizora");
      }
      const tv = new PhilipsTvClient(ip);
      await tv.requestPairing();
      this.pairing = tv;
      this.context.changed();
      return { message: "Na telewizorze pojawił się PIN — wpisz go i potwierdź." };
    }
    if (actionId === "pin" && this.pairing && input) {
      await this.pairing.grantPairing(input.trim());
      this.context.updateSecrets({ deviceId: this.pairing.deviceId, authKey: this.pairing.authKey });
      this.pairing = undefined;
      this.context.changed();
      this.context.log("sparowano");
      return { message: "Sparowano z telewizorem." };
    }
  }

  async apply(settings: Record<string, FieldValue>): Promise<void> {
    if (!this.setting("ip") || !this.context.secrets().authKey) {
      throw new Error("TV niesparowany");
    }
    this.fader.fadeTo(String(settings.color), Number(this.setting("fadeSeconds")));
  }

  private client(): PhilipsTvClient {
    const ip = this.setting<string>("ip");
    const { deviceId = "", authKey = "" } = this.context.secrets() as { deviceId?: string; authKey?: string };
    if (!this.tv || this.tv.ip !== ip || this.tv.deviceId !== deviceId || this.tv.authKey !== authKey) {
      this.tv = new PhilipsTvClient(ip, deviceId, authKey);
    }
    return this.tv;
  }
}
