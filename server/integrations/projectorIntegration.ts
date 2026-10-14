import type { ChannelId } from "../../shared/channelId.ts";
import type { FieldValue, SettingField } from "../../shared/settingField.ts";
import { Integration } from "./integration.ts";

// The fade itself runs in the projector page at display refresh rate; the server only sends the target.
export class ProjectorIntegration extends Integration {
  readonly id = "projector";
  readonly name = "Rzutnik / ekran";
  readonly channel: ChannelId = "light";
  override readonly enabledByDefault = true;
  override readonly settingsFields: SettingField[] = [
    { key: "fadeSeconds", label: "Czas przejścia [s]", kind: "number", default: 3 },
  ];
  override readonly presetFields: SettingField[] = [
    { key: "color", label: "Kolor rzutnika", kind: "color", default: "#000000" },
  ];

  override status(): string {
    const count = this.context.projectorCount();
    return count === 0 ? "brak otwartych ekranów" : `otwarte ekrany: ${count}`;
  }

  async apply(settings: Record<string, FieldValue>): Promise<void> {
    this.context.showOnProjectors(String(settings.color), Number(this.setting("fadeSeconds")));
  }
}
