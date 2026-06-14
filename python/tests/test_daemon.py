import json
import threading
import pytest
from http.server import ThreadingHTTPServer
from urllib import request as urlrequest
from aim3d.daemon import Aim3dCncDaemon

def test_daemon_gcode_simulation_compact_spaceless():
    cnc_daemon = Aim3dCncDaemon()
    server = ThreadingHTTPServer(("127.0.0.1", 0), cnc_daemon.make_handler())
    port = server.socket.getsockname()[1]
    
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    
    try:
        # 1. Post spaceless compact G-code
        gcode_payload = json.dumps({"gcode": "g0x1y1z1"}).encode('utf-8')
        req = urlrequest.Request(
            f"http://127.0.0.1:{port}/program/gcode",
            data=gcode_payload,
            method="POST"
        )
        req.add_header("Content-Type", "application/json")
        with urlrequest.urlopen(req, timeout=5.0) as resp:
            body = json.loads(resp.read().decode('utf-8'))
            assert body["status"] == "success"
            
        # 2. Trigger simulation
        sim_payload = json.dumps({
            "stockSize": [100.0, 100.0, 25.0],
            "tools": [{"id": 1, "diameter_mm": 6.0, "kind": "flat"}]
        }).encode('utf-8')
        req = urlrequest.Request(
            f"http://127.0.0.1:{port}/command/simulate",
            data=sim_payload,
            method="POST"
        )
        req.add_header("Content-Type", "application/json")
        with urlrequest.urlopen(req, timeout=5.0) as resp:
            body = json.loads(resp.read().decode('utf-8'))
            
            assert "simulation" in body
            assert body["simulation"]["status"] == "success"
            solid = body["simulation"]["solid"]
            assert "positions" in solid
            assert "normals" in solid
            assert "indices" in solid
            assert len(solid["positions"]) > 0
    finally:
        server.shutdown()
        server.server_close()
