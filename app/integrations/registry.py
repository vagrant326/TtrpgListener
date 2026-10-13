from app.integrations.integration import Integration
from app.integrations.philips_ambilight import PhilipsAmbilightIntegration
from app.integrations.projector import ProjectorIntegration
from app.integrations.spotify import SpotifyIntegration

# To add an integration: subclass Integration in its own module and list it here. UI and config follow.
INTEGRATIONS: list[type[Integration]] = [
    ProjectorIntegration,
    PhilipsAmbilightIntegration,
    SpotifyIntegration,
]
