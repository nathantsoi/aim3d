import json
import os
import sys
import hashlib
import base64
import threading
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse
from aim3d.controller import simulate_program_mesh

DEFAULT_HOST = "127.0.0.1"
DEFAULT_PORT = 8765

websocket_lock = threading.Lock()

def get_websocket_accept(sec_key):
    GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"
    sha1 = hashlib.sha1((sec_key + GUID).encode('utf-8'))
    return base64.b64encode(sha1.digest()).decode('utf-8')

def make_websocket_text_frame(message):
    payload = message.encode('utf-8')
    payload_len = len(payload)
    header = bytearray()
    header.append(0x81)  # FIN=1, Opcode=1 (Text)
    if payload_len <= 125:
        header.append(payload_len)
    elif payload_len <= 65535:
        header.append(126)
        header.extend(payload_len.to_bytes(2, 'big'))
    else:
        header.append(127)
        header.extend(payload_len.to_bytes(8, 'big'))
    return bytes(header) + payload

class DaemonState:
    def __init__(self):
        self.gcode = ""
        self.visual_ir = {}

state = DaemonState()

class ControllerDaemonHandler(BaseHTTPRequestHandler):
    active_websockets = []

    def send_cors_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')

    def do_OPTIONS(self):
        self.send_response(200, "ok")
        self.send_cors_headers()
        self.end_headers()

    def handle_websocket(self):
        sec_key = self.headers.get('Sec-WebSocket-Key')
        if not sec_key:
            self.send_error(400, "Missing Sec-WebSocket-Key")
            return
        accept_key = get_websocket_accept(sec_key)
        self.wfile.write(
            (
                "HTTP/1.1 101 Switching Protocols\r\n"
                "Upgrade: websocket\r\n"
                "Connection: Upgrade\r\n"
                f"Sec-WebSocket-Accept: {accept_key}\r\n\r\n"
            ).encode('utf-8')
        )
        sock = self.request
        with websocket_lock:
            ControllerDaemonHandler.active_websockets.append(sock)
        try:
            while True:
                data = sock.recv(1024)
                if not data:
                    break
        except Exception:
            pass
        finally:
            with websocket_lock:
                if sock in ControllerDaemonHandler.active_websockets:
                    ControllerDaemonHandler.active_websockets.remove(sock)

    def do_GET(self):
        if self.headers.get('Upgrade', '').lower() == 'websocket':
            self.handle_websocket()
            return

        parsed_path = urlparse(self.path)
        if parsed_path.path == '/status':
            self.send_response(200)
            self.send_cors_headers()
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({"status": "idle"}).encode('utf-8'))
        else:
            self.send_error(404, "Not Found")

    def do_POST(self):
        parsed_path = urlparse(self.path)
        content_length = int(self.headers.get('Content-Length', 0))
        post_data = self.rfile.read(content_length)
        
        try:
            payload = json.loads(post_data.decode('utf-8')) if post_data else {}
        except json.JSONDecodeError:
            payload = {}

        response_data = {"status": "success"}
        
        if parsed_path.path == '/program/gcode':
            state.gcode = payload.get('gcode', '')
            response_data = {"status": "success", "message": "G-code loaded"}
            
        elif parsed_path.path == '/program/visual-ir':
            state.visual_ir = payload.get('program', {})
            response_data = {"status": "success", "message": "Visual IR loaded"}
            
        elif parsed_path.path == '/command/simulate':
            if not state.gcode:
                response_data = {"simulation": {"status": "error", "error": "No G-code loaded"}}
            else:
                try:
                    stock_size = payload.get('stockSize', [100.0, 100.0, 25.0])
                    tools = payload.get('tools', [{"id": 1, "diameter_mm": 6.0, "kind": "flat"}])
                    
                    print(f"--- Simulation Request ---", file=sys.stderr)
                    print(f"Stock size: {stock_size}", file=sys.stderr)
                    print(f"Tools: {tools}", file=sys.stderr)
                    print(f"G-code length: {len(state.gcode)} characters", file=sys.stderr)
                    print(f"G-code snippet: {repr(state.gcode[:100])}", file=sys.stderr)
                    
                    mesh = simulate_program_mesh(state.gcode, tuple(stock_size), tools)
                    
                    print(f"Simulation SUCCESS: Generated {len(mesh.get('positions', []))//3} vertices", file=sys.stderr)
                    
                    response_data = {
                        "simulation": {
                            "status": "success",
                            "solid": mesh
                        }
                    }
                except Exception as e:
                    import traceback
                    print(f"Simulation ERROR: {e}", file=sys.stderr)
                    traceback.print_exc(file=sys.stderr)
                    response_data = {"simulation": {"status": "error", "error": str(e)}}

        elif parsed_path.path == '/snapshot':
            frame = make_websocket_text_frame(post_data.decode('utf-8'))
            with websocket_lock:
                socks = list(ControllerDaemonHandler.active_websockets)
            for sock in socks:
                try:
                    sock.sendall(frame)
                except Exception:
                    with websocket_lock:
                        if sock in ControllerDaemonHandler.active_websockets:
                            ControllerDaemonHandler.active_websockets.remove(sock)
            response_data = {"status": "success"}
                    
        elif parsed_path.path in ('/command/arm', '/command/start', '/command/pause', '/command/stop', '/command/home'):
            response_data = {"status": "success"}
            
        elif parsed_path.path == '/command/jog':
            response_data = {"status": "success"}
            
        else:
            self.send_error(404, "Not Found")
            return

        self.send_response(200)
        self.send_cors_headers()
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(json.dumps(response_data).encode('utf-8'))

    def log_message(self, format, *args):
        sys.stderr.write("%s - - [%s] %s\n" %
                         (self.address_string(),
                          self.log_date_time_string(),
                          format % args))

class Aim3dCncDaemon:
    def __init__(self):
        self.program = None
        self.state = "idle"

    def handle(self, method, path, payload=None):
        if path == "/program/visual-ir":
            self.program = payload.get("program") if payload else None
            return {"programLoaded": True}
        elif path == "/command/arm":
            self.state = "armed"
            return {"state": "armed"}
        elif path == "/command/start":
            self.state = "running"
            return {"state": "running"}
        elif path == "/command/pause":
            self.state = "feed_hold"
            return {"state": "feed_hold"}
        elif path == "/command/simulate":
            return {"simulation": {"path": "posted-gcode"}}
        return {"status": "success"}

    def make_handler(self):
        return ControllerDaemonHandler

class ControllerClient:
    def __init__(self, base_url, transport):
        self.base_url = base_url
        self.transport = transport

    def request_shape(self, method, path, payload):
        return {
            "method": method,
            "url": f"{self.base_url.rstrip('/')}{path}",
            "json": payload,
        }

    def jog(self, x=0.0, y=0.0, z=0.0):
        payload = {"x": x, "y": y, "z": z}
        return self.transport("POST", "/command/jog", payload)

def run_daemon():
    host = os.environ.get("AIM3D_BRIDGE_HOST", DEFAULT_HOST)
    port = int(os.environ.get("AIM3D_BRIDGE_WS_PORT", DEFAULT_PORT))
    server = HTTPServer((host, port), ControllerDaemonHandler)
    print(f"Starting Controller Daemon on {host}:{port}...", file=sys.stderr)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down...", file=sys.stderr)
        server.server_close()

if __name__ == "__main__":
    run_daemon()
