#!/usr/bin/env python3
"""
Local server for Sakura — Discord webhook tool.

Serves the UI and proxies requests to Discord so nothing touches a third-party
server. Only localhost ↔ Discord.
"""

from __future__ import annotations

import json
import re
import sys
import webbrowser
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parent
DISCORD = "https://discord.com/api"
WEBHOOK_URL_RE = re.compile(
    r"^https?://(?:discord(?:app)?\.com|discord\.com)/api/webhooks/(\d+)/([\w-]+)/?$",
    re.IGNORECASE,
)
PORT = 8765


def discord_request(method: str, path: str, body: dict | None = None) -> tuple[int, bytes]:
    url = f"{DISCORD}{path}"
    data = None
    headers = {"User-Agent": "Sakura-Webhook-Tool/1.0"}

    if body is not None:
        data = json.dumps(body).encode("utf-8")
        headers["Content-Type"] = "application/json"

    request = Request(url, data=data, method=method, headers=headers)

    try:
        with urlopen(request, timeout=20) as response:
            payload = response.read()
            return response.status, payload
    except HTTPError as error:
        payload = error.read()
        if not payload:
            payload = json.dumps({"error": f"Discord API error: HTTP {error.code}"}).encode()
        return error.code, payload
    except URLError as error:
        return 502, json.dumps({"error": f"Network error: {error.reason}"}).encode()


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt: str, *args) -> None:
        sys.stderr.write(f"[sakura] {self.address_string()} - {fmt % args}\n")

    def send_json(self, status: int, payload: bytes) -> None:
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(payload)

    def send_file(self, path: Path, content_type: str) -> None:
        if not path.is_file():
            self.send_error(HTTPStatus.NOT_FOUND)
            return
        data = path.read_bytes()
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_OPTIONS(self) -> None:
        self.send_response(HTTPStatus.NO_CONTENT)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self) -> None:
        path = self.path.split("?", 1)[0]

        if path.startswith("/api/webhook/"):
            parts = path.strip("/").split("/")
            if len(parts) >= 4:
                webhook_id, token = parts[2], parts[3]
                status, payload = discord_request("GET", f"/webhooks/{webhook_id}/{token}")
                self.send_json(status, payload or b"{}")
                return
            self.send_json(400, b'{"error":"Invalid webhook path"}')
            return

        files = {
            "/": ("index.html", "text/html; charset=utf-8"),
            "/index.html": ("index.html", "text/html; charset=utf-8"),
            "/styles.css": ("styles.css", "text/css; charset=utf-8"),
            "/app.js": ("app.js", "application/javascript; charset=utf-8"),
            "/sakura.js": ("sakura.js", "application/javascript; charset=utf-8"),
            "/assets/sakura-tree.jpg": ("assets/sakura-tree.jpg", "image/jpeg"),
        }

        if path in files:
            name, ctype = files[path]
            self.send_file(ROOT / name, ctype)
            return

        self.send_error(HTTPStatus.NOT_FOUND)

    def do_DELETE(self) -> None:
        path = self.path.split("?", 1)[0]
        if not path.startswith("/api/webhook/"):
            self.send_error(HTTPStatus.NOT_FOUND)
            return

        parts = path.strip("/").split("/")
        if len(parts) < 4:
            self.send_json(400, b'{"error":"Invalid webhook path"}')
            return

        webhook_id, token = parts[2], parts[3]
        status, payload = discord_request("DELETE", f"/webhooks/{webhook_id}/{token}")
        self.send_json(status, payload or b"{}")

    def do_PATCH(self) -> None:
        self._proxy_webhook("PATCH")

    def do_POST(self) -> None:
        path = self.path.split("?", 1)[0]
        if "/messages" in path:
            self._proxy_messages()
            return
        self._proxy_webhook("POST")

    def _read_json(self) -> dict:
        length = int(self.headers.get("Content-Length", 0))
        if length <= 0:
            return {}
        raw = self.rfile.read(length)
        return json.loads(raw.decode("utf-8"))

    def _proxy_webhook(self, method: str) -> None:
        path = self.path.split("?", 1)[0]
        if not path.startswith("/api/webhook/"):
            self.send_error(HTTPStatus.NOT_FOUND)
            return

        parts = path.strip("/").split("/")
        if len(parts) < 4:
            self.send_json(400, b'{"error":"Invalid webhook path"}')
            return

        webhook_id, token = parts[2], parts[3]
        body = self._read_json() if method in {"PATCH", "POST"} else None
        status, payload = discord_request("PATCH" if method == "PATCH" else method,
                                          f"/webhooks/{webhook_id}/{token}", body)
        self.send_json(status, payload or b"{}")

    def _proxy_messages(self) -> None:
        path = self.path.split("?", 1)[0]
        parts = path.strip("/").split("/")
        if len(parts) < 5:
            self.send_json(400, b'{"error":"Invalid message path"}')
            return

        webhook_id, token = parts[2], parts[3]
        body = self._read_json()
        status, payload = discord_request(
            "POST", f"/webhooks/{webhook_id}/{token}", body
        )
        self.send_json(status, payload or b"{}")


def main() -> int:
    server = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    url = f"http://127.0.0.1:{PORT}/"
    print(f"Sakura running at {url}")
    print("Press Ctrl+C to stop.")
    webbrowser.open(url)

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")
    finally:
        server.server_close()

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
