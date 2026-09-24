"""Tests for app/server.py.

Verifica il comportamento del mini proxy Anthropic senza avviare un vero
server HTTP: costruiamo il Handler in memoria, gli passiamo file-like
di rfile/wfile e ispezioniamo la risposta scritta su wfile.
"""
from __future__ import annotations

import importlib
import io
import json
import os
import sys
from pathlib import Path
from unittest import mock

import pytest


# Assicura che `app/` sia importabile a prescindere da dove pytest venga
# lanciato (radice del repo oppure dentro `app/`).
APP_DIR = Path(__file__).resolve().parent.parent
REPO_ROOT = APP_DIR.parent
if str(APP_DIR) not in sys.path:
    sys.path.insert(0, str(APP_DIR))


# ---------------------------------------------------------------------------
# Fixtures / helpers
# ---------------------------------------------------------------------------


@pytest.fixture
def server(monkeypatch):
    """Import fresco di server.py con API_KEY controllato dall'env corrente."""
    # Rimuove eventuale import precedente per riesporre lo stato pulito.
    sys.modules.pop("server", None)
    module = importlib.import_module("server")
    return module


class _FakeRequest:
    """Sostituto minimale di un socket per BaseHTTPRequestHandler."""

    def __init__(self, body: bytes):
        # rfile deve contenere SOLO il body: gli header vengono forniti
        # a mano via `handler.headers`, senza passare per handle_one_request.
        self._rfile = io.BytesIO(body)
        self.wfile = io.BytesIO()

    def makefile(self, mode, *_a, **_kw):
        if "r" in mode:
            return self._rfile
        return self.wfile

    def sendall(self, *_a, **_kw):
        pass


def _make_handler(server_module, request_line: str, body: bytes = b"", extra_headers: str = ""):
    """Costruisce un Handler senza avviare un server reale."""
    req = _FakeRequest(body)
    headers_text = f"Content-Length: {len(body)}\r\n{extra_headers}"

    Handler = server_module.Handler
    # Bypass di __init__: costruiamo l'istanza a mano e settiamo solo ciò
    # che serve, così non serve un socket vero.
    handler = Handler.__new__(Handler)
    handler.rfile = req.makefile("rb")
    handler.wfile = req.makefile("wb")
    handler.request = req
    handler.client_address = ("127.0.0.1", 0)
    handler.server = mock.MagicMock()
    handler.command = request_line.split(" ", 1)[0]
    handler.path = request_line.split(" ")[1]
    handler.request_version = "HTTP/1.1"
    handler.requestline = request_line
    handler.raw_requestline = (request_line + "\r\n").encode()
    handler.headers = _parse_headers(headers_text)
    handler.directory = str(server_module.STATIC)
    return handler, req


def _parse_headers(text: str):
    from email.parser import Parser

    return Parser().parsestr(text)


def _read_response(request: _FakeRequest):
    """Estrae status code, headers e body da wfile."""
    raw = request.wfile.getvalue()
    head, _, body = raw.partition(b"\r\n\r\n")
    lines = head.split(b"\r\n")
    status_line = lines[0].decode("iso-8859-1")
    # es. "HTTP/1.0 200 OK"
    parts = status_line.split(" ", 2)
    status = int(parts[1])
    headers = {}
    for line in lines[1:]:
        if b":" in line:
            k, v = line.split(b":", 1)
            headers[k.decode().strip().lower()] = v.decode().strip()
    return status, headers, body


# ---------------------------------------------------------------------------
# Test: import + main()
# ---------------------------------------------------------------------------


def test_env_loading(monkeypatch):
    """server.py deve essere importabile e main() non deve bloccare."""
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    sys.modules.pop("server", None)
    server = importlib.import_module("server")

    assert hasattr(server, "Handler")
    assert hasattr(server, "main")
    assert server.ANTHROPIC_URL.startswith("https://")

    # main() chiama HTTPServer(...).serve_forever(); intercettiamo entrambi.
    with mock.patch.object(server, "HTTPServer") as fake_http:
        instance = mock.MagicMock()
        fake_http.return_value = instance
        server.main()
        fake_http.assert_called_once()
        instance.serve_forever.assert_called_once()


# ---------------------------------------------------------------------------
# Test: mime map
# ---------------------------------------------------------------------------


def test_mime_extensions(server):
    ext = server.Handler.extensions_map
    assert ext[".js"] == "text/javascript; charset=utf-8"
    assert ext[".mjs"] == "text/javascript; charset=utf-8"
    assert ext[".svg"] == "image/svg+xml"


# ---------------------------------------------------------------------------
# Test: GET /agents/*.md
# ---------------------------------------------------------------------------


def test_agents_md_route_hits_repo_file(server):
    """Un file .md realmente presente nella cartella agents/ va servito 200."""
    candidates = list((REPO_ROOT / "agents").glob("*.md"))
    assert candidates, "expected at least one agent .md in repo"
    name = candidates[0].name

    handler, req = _make_handler(server, f"GET /agents/{name} HTTP/1.1")
    handler.do_GET()

    status, headers, body = _read_response(req)
    assert status == 200
    assert "markdown" in headers.get("content-type", "")
    assert len(body) > 0


def test_agents_md_route_missing_returns_404(server):
    handler, req = _make_handler(
        server, "GET /agents/DOES_NOT_EXIST_AGENT.md HTTP/1.1"
    )
    handler.do_GET()

    status, _, body = _read_response(req)
    assert status == 404
    payload = json.loads(body)
    assert "error" in payload


def test_agents_js_not_intercepted(server):
    """/agents/parser.js NON deve entrare nel branch .md — deve andare al
    SimpleHTTPRequestHandler (che ritornerà 404 dalla static dir)."""
    handler, req = _make_handler(server, "GET /agents/parser.js HTTP/1.1")

    # Se venisse intercettato dal branch .md, chiameremmo _json(404,...).
    # Verifichiamo invece che venga chiamato il super().do_GET().
    with mock.patch(
        "http.server.SimpleHTTPRequestHandler.do_GET"
    ) as super_get:
        handler.do_GET()
        super_get.assert_called_once()


# ---------------------------------------------------------------------------
# Test: POST /api/claude
# ---------------------------------------------------------------------------


def test_api_claude_missing_key(monkeypatch):
    """Senza ANTHROPIC_API_KEY deve rispondere 500 e menzionare la chiave."""
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    sys.modules.pop("server", None)
    server = importlib.import_module("server")
    # Forza a stringa vuota anche se dotenv avesse caricato un valore.
    monkeypatch.setattr(server, "API_KEY", "")

    body = json.dumps({"messages": [{"role": "user", "content": "ciao"}]}).encode()
    handler, req = _make_handler(server, "POST /api/claude HTTP/1.1", body=body)
    handler.do_POST()

    status, _, resp = _read_response(req)
    assert status == 500
    payload = json.loads(resp)
    err = payload["error"]
    # server.py mette una stringa; accettiamo anche error.message per compat.
    text = err if isinstance(err, str) else err.get("message", "")
    assert "ANTHROPIC_API_KEY" in text


def test_api_claude_bad_json(monkeypatch, server):
    monkeypatch.setattr(server, "API_KEY", "sk-test")
    handler, req = _make_handler(
        server, "POST /api/claude HTTP/1.1", body=b"not-a-json"
    )
    handler.do_POST()

    status, _, resp = _read_response(req)
    assert status == 400
    payload = json.loads(resp)
    err = payload["error"]
    text = err if isinstance(err, str) else err.get("message", "")
    assert "json" in text.lower() or "bad" in text.lower()


def test_api_claude_wrong_path_404(monkeypatch, server):
    monkeypatch.setattr(server, "API_KEY", "sk-test")
    handler, req = _make_handler(server, "POST /api/other HTTP/1.1")
    handler.do_POST()

    status, _, resp = _read_response(req)
    assert status == 404


def test_api_claude_forwards_body(monkeypatch, server):
    """Con mock di requests.post: verifica che il proxy costruisca il body
    corretto (model / max_tokens / system / messages) e lo forwardi."""
    monkeypatch.setattr(server, "API_KEY", "sk-test-abc")

    fake_response = mock.MagicMock()
    fake_response.status_code = 200
    fake_response.json.return_value = {
        "id": "msg_x",
        "content": [{"type": "text", "text": "ok"}],
    }
    fake_response.text = "{}"

    payload = {
        "model": "claude-opus-4-7",
        "max_tokens": 1024,
        "system": "sei un tutor",
        "messages": [{"role": "user", "content": "spiega TAEG"}],
        "temperature": 0.4,
    }
    body = json.dumps(payload).encode()

    with mock.patch.object(server.requests, "post", return_value=fake_response) as post:
        handler, req = _make_handler(server, "POST /api/claude HTTP/1.1", body=body)
        handler.do_POST()

        assert post.called
        args, kwargs = post.call_args
        assert args[0] == server.ANTHROPIC_URL
        forwarded = kwargs["json"]
        assert forwarded["model"] == "claude-opus-4-7"
        assert forwarded["max_tokens"] == 1024
        assert forwarded["system"] == "sei un tutor"
        assert forwarded["messages"] == payload["messages"]
        assert forwarded["temperature"] == 0.4
        headers = kwargs["headers"]
        assert headers["x-api-key"] == "sk-test-abc"
        assert headers["anthropic-version"] == server.ANTHROPIC_VERSION

    status, _, resp = _read_response(req)
    assert status == 200
    assert json.loads(resp)["id"] == "msg_x"
