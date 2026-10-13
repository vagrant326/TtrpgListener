import base64
import colorsys
import hashlib
import hmac
import secrets
import string

import requests
import urllib3
from requests.auth import HTTPDigestAuth

# Philips JointSpace API on Android TVs (2016+): HTTPS with a self-signed cert and digest auth
# obtained through PIN pairing. The shared HMAC key is the one used by the Philips TV remote app (see pylips).
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
_PAIRING_SECRET = base64.b64decode(
    "ZmVay1EQVFOaZhwQ4Kv81ypLAZNczV9sG4KkseXWn1NEk6cXmPKO/MCa9sryslvLCFMnNe4Z4CPXzToowvhHvA=="
)


class PhilipsTvClient:
    def __init__(self, ip: str, device_id: str = "", auth_key: str = ""):
        self.ip = ip
        self._base = f"https://{ip}:1926/6/"
        self.device_id = device_id or "".join(secrets.choice(string.ascii_letters + string.digits) for _ in range(16))
        self.auth_key = auth_key
        self._pending_timestamp = None
        # Reused so fades don't pay a TLS handshake per frame.
        self._http = requests.Session()
        self._http.verify = False

    def _device(self) -> dict:
        return {"device_name": "TtrpgListener", "device_os": "Android", "app_name": "TtrpgListener",
                "type": "native", "app_id": "app.ttrpglistener", "id": self.device_id}

    def _auth(self) -> HTTPDigestAuth:
        return HTTPDigestAuth(self.device_id, self.auth_key)

    def request_pairing(self) -> None:
        response = self._http.post(self._base + "pair/request", timeout=5,
                                   json={"device": self._device(), "scope": ["read", "write", "control"]})
        response.raise_for_status()
        data = response.json()
        if data.get("error_id") != "SUCCESS":
            raise RuntimeError(f"TV odrzucił parowanie: {data}")
        self.auth_key = data["auth_key"]
        self._pending_timestamp = data["timestamp"]

    def grant_pairing(self, pin: str) -> None:
        signature = hmac.new(_PAIRING_SECRET, f"{self._pending_timestamp}{pin}".encode(), hashlib.sha1).hexdigest()
        grant = {
            "auth": {"auth_AppId": "1", "pin": pin, "auth_timestamp": self._pending_timestamp,
                     "auth_signature": base64.b64encode(signature.encode()).decode()},
            "device": self._device(),
        }
        response = self._http.post(self._base + "pair/grant", json=grant, auth=self._auth(), timeout=5)
        response.raise_for_status()

    def set_color(self, hex_color: str) -> None:
        r, g, b = (int(hex_color.lstrip("#")[i:i + 2], 16) / 255 for i in (0, 2, 4))
        hue, saturation, brightness = colorsys.rgb_to_hsv(r, g, b)
        config = {
            "styleName": "FOLLOW_COLOR",
            "isExpert": True,
            "algorithm": "MANUAL_HUE",
            "colorSettings": {
                "color": {"hue": round(hue * 255), "saturation": round(saturation * 255),
                          "brightness": round(brightness * 255)},
                "colorDelta": {"hue": 0, "saturation": 0, "brightness": 0},
                "speed": 255,
            },
        }
        response = self._http.post(self._base + "ambilight/currentconfiguration", json=config,
                                   auth=self._auth(), timeout=5)
        response.raise_for_status()
