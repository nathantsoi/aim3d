import json
import os
import sys
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse
from aim3d.controller import simulate_program_mesh

DEFAULT_HOST = "127.0.0.1"
DEFAULT_PORT = 8765

class DaemonState:
    def __init__(self):
        self.gcode = ""
        self.visual_ir = {}

state = DaemonState()

class ControllerDaemonHandler(BaseHTTPRequestHandler):
    def send_cors_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')

    def do_OPTIONS(self):
        self.send_response(200, "ok")
        self.send_cors_headers()
        self.end_headers()

    def do_GET(self):
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
                    
                    mesh = simulate_program_mesh(state.gcode, tuple(stock_size), tools)
                    response_data = {
                        "simulation": {
                            "status": "success",
                            "solid": mesh
                        }
                    }
                except Exception as e:
                    response_data = {"simulation": {"status": "error", "error": str(e)}}
                    
        elif parsed_path.path in ('/command/arm', '/command/start', '/command/pause', '/command/stop', '/command/home'):
            # Mock successful execution
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
        # Suppress logging for cleaner output, or log to stderr
        sys.stderr.write("%s - - [%s] %s\n" %
                         (self.address_string(),
                          self.log_date_time_string(),
                          format % args))

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
