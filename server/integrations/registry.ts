import type { Integration } from "./integration.ts";
import type { IntegrationContext } from "./integrationContext.ts";
import { AmbilightIntegration } from "./philips/ambilightIntegration.ts";
import { ProjectorIntegration } from "./projectorIntegration.ts";
import { SpotifyIntegration } from "./spotify/spotifyIntegration.ts";

// To add an integration: subclass Integration in its own module and list it here. Panel and config follow.
export const INTEGRATIONS: (new (context: IntegrationContext) => Integration)[] = [
  ProjectorIntegration,
  AmbilightIntegration,
  SpotifyIntegration,
];
