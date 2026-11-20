#!/usr/bin/env python3
"""Zero-dependency local server for the Selectly web printer app.

Serves static files from public/ and a tiny REST API backed by a flat JSON
file (data/orders.json), so order history survives browser storage clears.
Web Bluetooth requires a secure context (https:// or http://localhost —
file:// does not work), which is why this server exists at all.

Usage: python3 server.py [port]   (default port 3737)
Then open http://localhost:3737 in Chrome.
"""

import base64
import hmac
import json
import mimetypes
import os
import secrets
import sys
import tempfile
import uuid
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse

ROOT = os.path.dirname(os.path.abspath(__file__))
PUBLIC_DIR = os.path.join(ROOT, "public")
DATA_DIR = os.path.join(ROOT, "data")
ORDERS_FILE = os.path.join(DATA_DIR, "orders.json")
AUTH_FILE = os.path.join(ROOT, "auth.json")

DEFAULT_PORT = 3737


def load_or_create_auth():
    """Basic Auth credentials — required once this server is reachable over
    the internet via a tunnel, not just localhost. Auto-generated on first
    run and kept in a gitignored file so they're never committed."""
    if os.path.exists(AUTH_FILE):
        with open(AUTH_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    creds = {"username": "jihoon", "password": secrets.token_urlsafe(9)}
    with open(AUTH_FILE, "w", encoding="utf-8") as f:
        json.dump(creds, f, ensure_ascii=False, indent=2)
    print("=" * 50)
    print("최초 실행: 로그인 정보가 생성되었습니다 (webapp/auth.json에 저장됨)")
    print(f"  아이디: {creds['username']}")
    print(f"  비밀번호: {creds['password']}")
    print("필요하면 webapp/auth.json 파일을 직접 열어서 바꿀 수 있습니다.")
    print("=" * 50)
    return creds


def load_orders():
    if not os.path.exists(ORDERS_FILE):
        return []
    with open(ORDERS_FILE, "r", encoding="utf-8") as f:
        return json.load(f)


def save_orders(orders):
    os.makedirs(DATA_DIR, exist_ok=True)
    fd, tmp_path = tempfile.mkstemp(dir=DATA_DIR, prefix=".orders-", suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(orders, f, ensure_ascii=False, indent=2)
        os.replace(tmp_path, ORDERS_FILE)
    except Exception:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)
        raise


class Handler(BaseHTTPRequestHandler):
    auth_creds = None  # set by main() before serving

    def _check_auth(self):
        header = self.headers.get("Authorization", "")
        if not header.startswith("Basic "):
            return False
        try:
            decoded = base64.b64decode(header[len("Basic "):]).decode("utf-8")
            username, _, password = decoded.partition(":")
        except Exception:
            return False
        return hmac.compare_digest(username, self.auth_creds["username"]) and hmac.compare_digest(
            password, self.auth_creds["password"]
        )

    def _require_auth(self):
        if self._check_auth():
            return True
        body = b"Login required"
        self.send_response(401)
        self.send_header("WWW-Authenticate", 'Basic realm="Selectly"')
        self.send_header("Content-Type", "text/plain; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)
        return False

    def _send_json(self, status, payload):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _send_error_json(self, status, message):
        self._send_json(status, {"error": message})

    def _serve_static(self, path):
        if path == "/":
            path = "/index.html"
        safe_path = os.path.normpath(path).lstrip("/")
        full_path = os.path.join(PUBLIC_DIR, safe_path)
        if not full_path.startswith(PUBLIC_DIR) or not os.path.isfile(full_path):
            self._send_error_json(404, f"not found: {path}")
            return
        content_type, _ = mimetypes.guess_type(full_path)
        content_type = content_type or "application/octet-stream"
        with open(full_path, "rb") as f:
            body = f.read()
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if not self._require_auth():
            return
        parsed = urlparse(self.path)
        if parsed.path == "/api/orders":
            self._send_json(200, load_orders())
            return
        self._serve_static(parsed.path)

    def do_POST(self):
        if not self._require_auth():
            return
        parsed = urlparse(self.path)
        if parsed.path != "/api/orders":
            self._send_error_json(404, "not found")
            return
        length = int(self.headers.get("Content-Length", 0))
        raw = self.rfile.read(length) if length else b"{}"
        try:
            body = json.loads(raw.decode("utf-8"))
        except json.JSONDecodeError:
            self._send_error_json(400, "invalid JSON")
            return

        order = {
            "id": str(uuid.uuid4()),
            "authorName": body.get("authorName", ""),
            "content": body.get("content", ""),
            "amountWon": body.get("amountWon", 0),
            "printedAt": body.get("printedAt") or datetime.now(timezone.utc).isoformat(),
        }
        orders = load_orders()
        orders.append(order)
        save_orders(orders)
        self._send_json(201, order)

    def do_DELETE(self):
        if not self._require_auth():
            return
        parsed = urlparse(self.path)
        prefix = "/api/orders/"
        if not parsed.path.startswith(prefix):
            self._send_error_json(404, "not found")
            return
        order_id = parsed.path[len(prefix):]
        orders = load_orders()
        remaining = [o for o in orders if o.get("id") != order_id]
        if len(remaining) == len(orders):
            self._send_error_json(404, "order not found")
            return
        save_orders(remaining)
        self._send_json(200, {"deleted": order_id})

    def log_message(self, format, *args):
        sys.stderr.write("%s - %s\n" % (self.address_string(), format % args))


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_PORT
    Handler.auth_creds = load_or_create_auth()
    server = ThreadingHTTPServer(("localhost", port), Handler)
    print(f"Selectly web printer running at http://localhost:{port}")
    print("Ctrl+C to stop.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
