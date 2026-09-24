"""Budget Storyteller — mini server.

Serve i file statici in `static/` e fa da proxy verso Anthropic per
nascondere la API key al browser. Un solo file, zero dipendenze pesanti.

Avvio:
    pip install -r requirements.txt
    cp .env.example .env  # inserisci ANTHROPIC_API_KEY
    python server.py
    # open http://localhost:8000
"""
from __future__ import annotations

import json
import os
import sys
from http.server import HTTPServer, SimpleHTTPRequestHandler
from pathlib import Path

import requests
from dotenv import load_dotenv

ROOT = Path(__file__).parent
STATIC = ROOT / "static"
AGENTS = ROOT.parent / "agents"

load_dotenv(ROOT / ".env")
API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
ANTHROPIC_URL = "https://api.anthropic.com/v1/messages"
ANTHROPIC_VERSION = "2023-06-01"
DEFAULT_TIMEOUT = 60


class Handler(SimpleHTTPRequestHandler):
    extensions_map = {
        **SimpleHTTPRequestHandler.extensions_map,
        ".js": "text/javascript; charset=utf-8",
        ".mjs": "text/javascript; charset=utf-8",
        ".css": "text/css; charset=utf-8",
        ".html": "text/html; charset=utf-8",
        ".json": "application/json; charset=utf-8",
        ".svg": "image/svg+xml",
    }

    def __init__(self, *a, **kw):
        super().__init__(*a, directory=str(STATIC), **kw)

    def log_message(self, fmt, *args):  # quieter logs
        sys.stderr.write("[server] " + fmt % args + "\n")

    def _json(self, code: int, payload: dict):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        path_no_qs = self.path.split("?", 1)[0]

        # /agents/*.md
        if path_no_qs.startswith("/agents/") and path_no_qs.endswith(".md"):
            rel = path_no_qs.lstrip("/")
            target = ROOT.parent / rel
            if target.is_file():
                self.send_response(200)
                self.send_header("Content-Type", "text/markdown; charset=utf-8")
                data = target.read_bytes()
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)
                return
            self._json(404, {"error": "not found"})
            return

        # /presentation/* -> serve dal repo root
        if path_no_qs.startswith("/presentation/") or path_no_qs == "/presentation":
            rel = path_no_qs.lstrip("/") or "presentation/"
            if rel.endswith("/"):
                rel += "index.html"
            target = ROOT.parent / rel
            if target.is_file():
                ext = "." + target.name.rsplit(".", 1)[-1].lower()
                mime = {".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
                        ".js": "text/javascript; charset=utf-8", ".svg": "image/svg+xml",
                        ".png": "image/png", ".jpg": "image/jpeg", ".md": "text/markdown; charset=utf-8"}.get(ext, "application/octet-stream")
                self.send_response(200)
                self.send_header("Content-Type", mime)
                data = target.read_bytes()
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)
                return
            self._json(404, {"error": "presentation file not found"})
            return

        return super().do_GET()

    def do_POST(self):
        if self.path != "/api/claude":
            self._json(404, {"error": "not found"})
            return
        if not API_KEY:
            self._json(500, {"error": "ANTHROPIC_API_KEY non configurata in .env"})
            return
        length = int(self.headers.get("Content-Length", 0))
        try:
            payload = json.loads(self.rfile.read(length) or b"{}")
        except json.JSONDecodeError as e:
            self._json(400, {"error": f"bad json: {e}"})
            return

        body = {
            "model": payload.get("model", "claude-haiku-4-5-20251001"),
            "max_tokens": payload.get("max_tokens", 2048),
            "system": payload.get("system", ""),
            "messages": payload.get("messages", []),
        }
        if payload.get("temperature") is not None:
            body["temperature"] = payload["temperature"]

        try:
            r = requests.post(
                ANTHROPIC_URL,
                headers={
                    "x-api-key": API_KEY,
                    "anthropic-version": ANTHROPIC_VERSION,
                    "content-type": "application/json",
                },
                json=body,
                timeout=DEFAULT_TIMEOUT,
            )
            try:
                data = r.json()
            except (json.JSONDecodeError, ValueError):
                data = {"error": {"message": r.text[:500] or f"HTTP {r.status_code}"}}
            self._json(r.status_code, data)
        except requests.RequestException as e:
            self._json(502, {"error": {"message": f"upstream: {e}"}})


def main():
    port = int(os.getenv("PORT", "8000"))
    if not API_KEY:
        print("[warn] ANTHROPIC_API_KEY mancante in .env - il proxy rispondera' 500.")
    print(f"[server] Budget Storyteller su http://localhost:{port}")
    HTTPServer(("0.0.0.0", port), Handler).serve_forever()


if __name__ == "__main__":
    main()
