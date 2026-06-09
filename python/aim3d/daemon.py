from __future__ import annotations

import json
import base64
import hashlib
import struct
import threading
from dataclasses import dataclass, field
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any, Callable, Dict, Mapping, Optional, Sequence
from urllib import request as urlrequest

from .controller import compile_visual_ir_to_gcode, validate_visual_ir

# RFC 6455 magic GUID for the Sec-WebSocket-Accept handshake.
_WS_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"

def _ws_accept_key(client_key: str) -> str:
    digest = hashlib.sha1((client_key + _WS_GUID).encode("ascii")).digest()
    return base64.b64encode(digest).decode("ascii")

def _ws_text_frame(payload_bytes: bytes) -> bytes:
    """Encode bytes as a single unmasked (server->client) text frame."""
    header = bytearray([0x81])  # FIN + opcode 0x1 (text)
    length = len(payload_bytes)
    if length < 126:
        header.append(length)
    elif length < 65536:
        header.append(126)
        header += struct.pack(">H", length)
    else:
        header.append(127)
        header += struct.pack(">Q", length)
    return bytes(header) + payload_bytes


@dataclass
class ControllerSession:
    state: str = "disarmed"
    loaded_gcode: str = ""
    diagnostics: list[str] = field(default_factory=list)
    loaded_document: Optional[Mapping[str, Any]] = None

    def load_gcode(self, gcode: str) -> Dict[str, Any]:
        self.loaded_gcode = gcode
        self.diagnostics = []
        self.loaded_document = None
        return self.status()

    def load_visual_ir(self, document: Mapping[str, Any]) -> Dict[str, Any]:
        errors = validate_visual_ir(document)
        if errors:
            self.diagnostics = errors
            self.loaded_gcode = ""
            self.loaded_document = None
            return self.status()
        self.loaded_gcode = compile_visual_ir_to_gcode(document)
        self.diagnostics = []
        self.loaded_document = document
        return self.status()

    def command(self, name: str, payload: Optional[Mapping[str, Any]] = None) -> Dict[str, Any]:
        payload = payload or {}
        if name == "validate":
            if not self.loaded_gcode:
                self.diagnostics = ["no program loaded"]
            return self.status()
        if name == "simulate":
            stock_size = (100.0, 100.0, 25.0)
            tools = []
            resolution = payload.get("resolution", 256)

            if self.loaded_document:
                stock_size = self.loaded_document.get("stock", {}).get("size_mm", stock_size)
                tools = self.loaded_document.get("toolLibrary", {}).get("tools", [])

            if "stock" in payload:
                stock_size = payload["stock"].get("size_mm", stock_size)
            if "tools" in payload:
                tools = payload["tools"]

            if not self.loaded_gcode:
                return {**self.status(), "simulation": {"status": "failed", "error": "no program loaded"}}

            try:
                from .controller import simulate_program_mesh
                mesh = simulate_program_mesh(
                    gcode=self.loaded_gcode,
                    stock_size=stock_size,
                    tools=tools,
                    resolution=resolution
                )
                return {
                    **self.status(),
                    "simulation": {
                        "status": "success",
                        "solid": mesh
                    }
                }
            except Exception as e:
                return {
                    **self.status(),
                    "simulation": {
                        "status": "failed",
                        "error": str(e)
                    }
                }
        if name == "arm":
            if self.loaded_gcode and not self.diagnostics:
                self.state = "armed"
            else:
                self.diagnostics = self.diagnostics or ["cannot arm without a valid loaded program"]
            return self.status()
        if name == "start":
            if self.state == "armed":
                self.state = "running"
            else:
                self.diagnostics = ["controller must be armed before start"]
            return self.status()
        if name == "pause":
            if self.state == "running":
                self.state = "feed_hold"
            return self.status()
        if name == "stop":
            self.state = "armed" if self.loaded_gcode and not self.diagnostics else "disarmed"
            return self.status()
        if name == "jog":
            return {**self.status(), "jog": dict(payload)}
        if name == "home":
            return {**self.status(), "homed": True}
        if name == "estop-reset":
            self.state = "disarmed"
            return self.status()
        raise ValueError(f"unsupported controller command: {name}")

    def status(self) -> Dict[str, Any]:
        return {
            "state": self.state,
            "programLoaded": bool(self.loaded_gcode),
            "diagnostics": list(self.diagnostics),
        }


class Aim3dCncDaemon:
    def __init__(self, session: Optional[ControllerSession] = None):
        self.session = session or ControllerSession()
        self._ws_clients = set()
        self._ws_lock = threading.Lock()
        self._latest_snapshot_frame: Optional[bytes] = None

    def push_snapshot_frame(self, frame: bytes) -> None:
        with self._ws_lock:
            self._latest_snapshot_frame = frame
            clients = list(self._ws_clients)
        for conn in clients:
            try:
                conn.sendall(frame)
            except OSError:
                self._drop_ws_client(conn)

    def register_ws_client(self, conn) -> None:
        with self._ws_lock:
            self._ws_clients.add(conn)
            latest = self._latest_snapshot_frame
        if latest is not None:
            try:
                conn.sendall(latest)
            except OSError:
                self._drop_ws_client(conn)

    def _drop_ws_client(self, conn) -> None:
        with self._ws_lock:
            self._ws_clients.discard(conn)

    def handle(self, method: str, path: str, payload: Optional[Mapping[str, Any]] = None) -> Dict[str, Any]:
        payload = payload or {}
        if method == "GET" and path == "/status":
            return self.session.status()
        if method != "POST":
            raise ValueError(f"unsupported method/path: {method} {path}")
        if path == "/snapshot":
            frame = _ws_text_frame(json.dumps(payload).encode("utf-8"))
            self.push_snapshot_frame(frame)
            return {"status": "ok", "clients": len(self._ws_clients)}
        if path == "/program/gcode":
            return self.session.load_gcode(str(payload.get("gcode", "")))
        if path == "/program/visual-ir":
            return self.session.load_visual_ir(payload.get("program", {}))
        if path.startswith("/command/"):
            return self.session.command(path.rsplit("/", 1)[-1], payload)
        raise ValueError(f"unsupported path: {path}")

    def make_handler(self) -> type[BaseHTTPRequestHandler]:
        daemon = self

        class Handler(BaseHTTPRequestHandler):
            def do_GET(self) -> None:
                if self.headers.get("Upgrade", "").lower() == "websocket":
                    key = self.headers.get("Sec-WebSocket-Key")
                    if not key:
                        self.send_error(400, "Missing Sec-WebSocket-Key")
                        return
                    
                    response = (
                        "HTTP/1.1 101 Switching Protocols\r\n"
                        "Upgrade: websocket\r\n"
                        "Connection: Upgrade\r\n"
                        f"Sec-WebSocket-Accept: {_ws_accept_key(key)}\r\n\r\n"
                    )
                    self.connection.sendall(response.encode("ascii"))
                    daemon.register_ws_client(self.connection)
                    try:
                        while True:
                            if not self.connection.recv(4096):
                                break
                    except OSError:
                        pass
                    finally:
                        daemon._drop_ws_client(self.connection)
                    return

                self._respond(daemon.handle("GET", self.path))

            def do_POST(self) -> None:
                raw = self.rfile.read(int(self.headers.get("Content-Length", "0") or "0"))
                payload = json.loads(raw.decode("utf-8")) if raw else {}
                self._respond(daemon.handle("POST", self.path, payload))

            def _respond(self, body: Mapping[str, Any]) -> None:
                data = json.dumps(body).encode("utf-8")
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)

            def log_message(self, format: str, *args: Any) -> None:
                return

        return Handler

    def serve(self, host: str = "127.0.0.1", port: int = 8765) -> ThreadingHTTPServer:
        server = ThreadingHTTPServer((host, port), self.make_handler())
        server.serve_forever()
        return server


class ControllerClient:
    def __init__(self, base_url: str = "http://127.0.0.1:8765", transport: Optional[Callable[[str, str, Mapping[str, Any]], Mapping[str, Any]]] = None):
        self.base_url = base_url.rstrip("/")
        self.transport = transport

    def request_shape(self, method: str, path: str, payload: Optional[Mapping[str, Any]] = None) -> Dict[str, Any]:
        return {"method": method, "url": f"{self.base_url}{path}", "json": dict(payload or {})}

    def _request(self, method: str, path: str, payload: Optional[Mapping[str, Any]] = None) -> Mapping[str, Any]:
        payload = payload or {}
        if self.transport:
            return self.transport(method, path, payload)
        shape = self.request_shape(method, path, payload)
        data = json.dumps(shape["json"]).encode("utf-8") if method != "GET" else None
        req = urlrequest.Request(shape["url"], data=data, method=method)
        if data is not None:
            req.add_header("Content-Type", "application/json")
        with urlrequest.urlopen(req, timeout=5) as response:
            return json.loads(response.read().decode("utf-8"))

    def status(self) -> Mapping[str, Any]:
        return self._request("GET", "/status")

    def load_gcode(self, gcode: str) -> Mapping[str, Any]:
        return self._request("POST", "/program/gcode", {"gcode": gcode})

    def load_visual_ir(self, program: Mapping[str, Any]) -> Mapping[str, Any]:
        return self._request("POST", "/program/visual-ir", {"program": program})

    def validate(self) -> Mapping[str, Any]:
        return self._request("POST", "/command/validate")

    def simulate(self, resolution: int = 256, stock: Optional[Mapping[str, Any]] = None, tools: Optional[Sequence[Mapping[str, Any]]] = None) -> Mapping[str, Any]:
        payload = {"resolution": resolution}
        if stock:
            payload["stock"] = stock
        if tools:
            payload["tools"] = tools
        return self._request("POST", "/command/simulate", payload)

    def arm(self) -> Mapping[str, Any]:
        return self._request("POST", "/command/arm")

    def start(self) -> Mapping[str, Any]:
        return self._request("POST", "/command/start")

    def pause(self) -> Mapping[str, Any]:
        return self._request("POST", "/command/pause")

    def stop(self) -> Mapping[str, Any]:
        return self._request("POST", "/command/stop")

    def jog(self, x: float = 0.0, y: float = 0.0, z: float = 0.0) -> Mapping[str, Any]:
        return self._request("POST", "/command/jog", {"x": x, "y": y, "z": z})

    def home(self) -> Mapping[str, Any]:
        return self._request("POST", "/command/home")

    def estop_reset(self) -> Mapping[str, Any]:
        return self._request("POST", "/command/estop-reset")


def main() -> None:
    Aim3dCncDaemon().serve()


if __name__ == "__main__":
    main()
