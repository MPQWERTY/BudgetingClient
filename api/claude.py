"""Vercel serverless function — proxy verso Anthropic Claude.

Deploy: vercel deploy. Configura ANTHROPIC_API_KEY nelle env var del progetto Vercel.
"""
import json
import os
from http.server import BaseHTTPRequestHandler

import urllib.request
import urllib.error

ANTHROPIC_URL = "https://api.anthropic.com/v1/messages"
ANTHROPIC_VERSION = "2023-06-01"


class handler(BaseHTTPRequestHandler):
    def _json(self, code, payload):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST,OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "content-type")
        self.end_headers()

    def do_POST(self):
        api_key = os.environ.get("ANTHROPIC_API_KEY", "")
        if not api_key:
            self._json(500, {"error": {"message": "ANTHROPIC_API_KEY not configured"}})
            return
        length = int(self.headers.get("Content-Length", 0))
        try:
            payload = json.loads(self.rfile.read(length) or b"{}")
        except json.JSONDecodeError as e:
            self._json(400, {"error": {"message": f"bad json: {e}"}})
            return

        body = {
            "model": payload.get("model", "claude-haiku-4-5-20251001"),
            "max_tokens": payload.get("max_tokens", 2048),
            "system": payload.get("system", ""),
            "messages": payload.get("messages", []),
        }
        if payload.get("temperature") is not None:
            body["temperature"] = payload["temperature"]

        req = urllib.request.Request(
            ANTHROPIC_URL,
            data=json.dumps(body).encode("utf-8"),
            headers={
                "x-api-key": api_key,
                "anthropic-version": ANTHROPIC_VERSION,
                "content-type": "application/json",
            },
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                self._json(resp.status, data)
        except urllib.error.HTTPError as e:
            try:
                data = json.loads(e.read().decode("utf-8"))
            except Exception:
                data = {"error": {"message": str(e)}}
            self._json(e.code, data)
        except Exception as e:
            self._json(502, {"error": {"message": f"upstream: {e}"}})
