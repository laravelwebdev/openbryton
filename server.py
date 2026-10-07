"""
Python Dev Server untuk OpenBryton
Melayani static files + proxy API endpoints:
  POST /api/bryton-login  → DDP login ke Bryton Active
  POST /api/bryton-share  → Upload FIT ke Bryton Active
"""
import http.server, json, hashlib, ssl, threading, time, random, string, sys, subprocess, os, urllib.request, urllib.error
from urllib.parse import urlparse, parse_qs

PORT = 8080
ROOT = os.path.dirname(os.path.abspath(__file__))

# Install websocket-client jika belum ada
try:
    import websocket
except ImportError:
    print("[SETUP] Installing websocket-client...")
    subprocess.check_call([sys.executable, "-m", "pip", "install", "websocket-client", "-q"])
    import websocket

# ─────────────────────────────────────────────
# DDP Login ke Bryton Active
# ─────────────────────────────────────────────
def ddp_login_bryton(email, password):
    password_hash = hashlib.sha256(password.encode('utf-8')).hexdigest()
    result = {"done": False, "data": None}
    server_id = str(random.randint(0, 999)).zfill(3)
    session_id = ''.join(random.choices(string.ascii_lowercase + string.digits, k=8))
    url = f"wss://active.brytonsport.com/sockjs/{server_id}/{session_id}/websocket"

    msg_id = [1]
    login_id = [None]

    def on_open(ws):
        pass  # tunggu SockJS open frame

    def on_message(ws, raw):
        if isinstance(raw, bytes):
            raw = raw.decode('utf-8')
        if raw == 'o':
            connect_msg = json.dumps({"msg": "connect", "version": "1", "support": ["1"]})
            ws.send(json.dumps([connect_msg]))
            return
        elif raw == 'h':
            return
        elif raw.startswith('a['):
            try:
                arr = json.loads(raw[1:])
                raw = arr[0]
            except:
                return
        elif raw.startswith('c['):
            result["done"] = True
            return
        try:
            msg = json.loads(raw)
        except:
            return

        if msg.get("msg") == "connected":
            lid = str(msg_id[0]); msg_id[0] += 1
            login_id[0] = lid
            login_payload = json.dumps({
                "msg": "method", "method": "login", "id": lid,
                "params": [{"user": {"email": email},
                            "password": {"digest": password_hash, "algorithm": "sha-256"}}]
            })
            ws.send(json.dumps([login_payload]))

        elif msg.get("msg") == "result" and msg.get("id") == login_id[0]:
            if msg.get("error"):
                result["data"] = {"error": msg["error"].get("reason", "Login failed")}
            else:
                result["data"] = msg["result"]
            result["done"] = True
            ws.close()

    def on_error(ws, error):
        result["data"] = {"error": str(error)}
        result["done"] = True

    def on_close(ws, *args):
        result["done"] = True

    ws_app = websocket.WebSocketApp(
        url, on_open=on_open, on_message=on_message,
        on_error=on_error, on_close=on_close,
        header={"Origin": "https://active.brytonsport.com",
                "User-Agent": "Mozilla/5.0"}
    )
    t = threading.Thread(target=lambda: ws_app.run_forever(
        sslopt={"cert_reqs": ssl.CERT_NONE}, ping_interval=0
    ))
    t.daemon = True
    t.start()
    for _ in range(50):
        if result["done"]: break
        time.sleep(0.5)
    else:
        ws_app.close()
        return {"error": "Timeout waiting for Bryton server"}
    return result["data"] or {"error": "No response"}

# ─────────────────────────────────────────────
# Upload FIT ke Bryton Active
# ─────────────────────────────────────────────
def share_to_bryton(user_id, route_name, fit_bytes):
    import http.client
    boundary = "----WebKitFormBoundary" + ''.join(random.choices(string.ascii_letters, k=16))
    CRLF = "\r\n"
    filename = route_name.replace(" ", "_") + ".fit"
    header  = f"--{boundary}{CRLF}"
    header += f'Content-Disposition: form-data; name="name"{CRLF}{CRLF}'
    header += f'{route_name}{CRLF}'
    header += f"--{boundary}{CRLF}"
    header += f'Content-Disposition: form-data; name="file"; filename="{filename}"{CRLF}'
    header += f"Content-Type: application/octet-stream{CRLF}{CRLF}"
    footer  = f"{CRLF}--{boundary}--{CRLF}"
    body = header.encode() + fit_bytes + footer.encode()
    conn = http.client.HTTPSConnection("active.brytonsport.com", timeout=30,
        context=ssl.create_default_context())
    conn.request("POST", f"/route/upload/{user_id}", body=body, headers={
        "Content-Type": f"multipart/form-data; boundary={boundary}",
        "Content-Length": str(len(body)),
        "Origin": "https://active.brytonsport.com",
        "Referer": "https://active.brytonsport.com/",
        "User-Agent": "Mozilla/5.0"
    })
    resp = conn.getresponse()
    resp_body = resp.read().decode("utf-8", errors="replace")
    return resp.status, resp_body

# ─────────────────────────────────────────────
# Request Handler
# ─────────────────────────────────────────────
MIME = {
    ".html": "text/html; charset=utf-8",
    ".js":   "application/javascript; charset=utf-8",
    ".css":  "text/css; charset=utf-8",
    ".json": "application/json",
    ".png":  "image/png",
    ".ico":  "image/x-icon",
    ".svg":  "image/svg+xml",
    ".fit":  "application/octet-stream",
    ".zip":  "application/zip",
}

class Handler(http.server.BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        print(f"  {self.command} {self.path} → {args[1] if len(args)>1 else ''}")

    def send_json(self, code, obj):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self):
        path = urlparse(self.path).path
        if path == "/" or path == "":
            path = "/index.html"
        filepath = os.path.join(ROOT, path.lstrip("/").replace("/", os.sep))
        if os.path.isfile(filepath):
            ext = os.path.splitext(filepath)[1].lower()
            mime = MIME.get(ext, "application/octet-stream")
            with open(filepath, "rb") as f:
                data = f.read()
            self.send_response(200)
            self.send_header("Content-Type", mime)
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)
        else:
            # SPA fallback
            index = os.path.join(ROOT, "index.html")
            if os.path.isfile(index):
                with open(index, "rb") as f:
                    data = f.read()
                self.send_response(200)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)
            else:
                self.send_json(404, {"error": "Not found"})

    def do_POST(self):
        path = urlparse(self.path).path
        length = int(self.headers.get("Content-Length", 0))
        body_bytes = self.rfile.read(length) if length else b""

        # ── /api/bryton-login ──────────────────────────────────
        if path == "/api/bryton-login":
            try:
                payload = json.loads(body_bytes)
                email = payload.get("email", "").strip()
                password = payload.get("password", "")
                if not email or not password:
                    return self.send_json(400, {"error": "email and password required"})
                print(f"\n[API] bryton-login: {email}")
                data = ddp_login_bryton(email, password)
                if "error" in data:
                    return self.send_json(401, data)
                return self.send_json(200, data)
            except Exception as e:
                return self.send_json(500, {"error": str(e)})

        # ── /api/bryton-share ──────────────────────────────────
        elif path == "/api/bryton-share":
            qs = parse_qs(urlparse(self.path).query)
            user_id = (qs.get("userId") or qs.get("userid") or [""])[0]
            route_name = (qs.get("name") or ["BrytonRoute"])[0]
            if not user_id:
                return self.send_json(400, {"error": "userId required"})
            print(f"\n[API] bryton-share: userId={user_id}, name={route_name}, size={len(body_bytes)} bytes")
            try:
                status, resp_body = share_to_bryton(user_id, route_name, body_bytes)
                print(f"[API] Bryton response: {status} — {resp_body[:200]}")
                if 200 <= status < 300:
                    try:
                        parsed = json.loads(resp_body)
                    except:
                        parsed = {"raw": resp_body}
                    return self.send_json(200, {"success": True, "status": status, "data": parsed})
                else:
                    return self.send_json(status, {"success": False, "status": status, "body": resp_body[:500]})
            except Exception as e:
                return self.send_json(500, {"error": str(e)})

        # ── /api/upload (deprecated) ──────────────────────────
        elif path == "/api/upload":
            return self.send_json(410, {"error": "Deprecated. Use /api/bryton-share"})

        else:
            return self.send_json(404, {"error": f"API not found: {path}"})

# ─────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────
if __name__ == "__main__":
    os.chdir(ROOT)
    server = http.server.ThreadingHTTPServer(("0.0.0.0", PORT), Handler)
    print("=" * 55)
    print(f"  OpenBryton Dev Server (Python)")
    print(f"  http://localhost:{PORT}")
    print(f"  Root: {ROOT}")
    print(f"  APIs: /api/bryton-login  /api/bryton-share")
    print("=" * 55)
    print("  Ctrl+C untuk berhenti\n")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n[STOP] Server dihentikan.")
