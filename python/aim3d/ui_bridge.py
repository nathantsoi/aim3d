"""Producer side of the live UI bridge.

This is the script/sidecar half of the unidirectional flow described in
``wiki/docs/design/architecture-overview.md``: a Python process that mutates the
native core (the source of truth) emits the resulting core-state snapshot so the
running Tauri/Vue client can project it.

Live transport: this process hosts a small WebSocket server (``serve`` /
``LiveServer``) that the running Tauri/Vue GUI connects to directly. Each
``push_snapshot`` broadcasts the latest core-state snapshot to every connected
GUI, which projects it. The browser can only be a WebSocket client, so the
server lives here, on the producer side.

A line-protocol form (``emit_snapshot`` over ``stdout``) is also provided for
the Tauri sidecar pattern; only the transport changes, not the contract.

The UI is never written to directly here: Python and the UI are both clients of
the core, and state flows core -> UI only.
"""

import base64
import hashlib
import json
import os
import socket
import struct
import sys
import threading

# Must match CORE_CHANGED_EVENT in ui/src-tauri/src/main.rs and the event name
# the frontend subscribes to in services/coreSnapshotBridge.js.
CORE_SNAPSHOT_CHANNEL = "core://changed"

# Live WebSocket endpoint the GUI connects to. Python is the server; the
# webview is the client (browsers can only be WebSocket clients, so the
# long-lived stable endpoint lives here). Overridable via env.
DEFAULT_BRIDGE_HOST = "127.0.0.1"
DEFAULT_BRIDGE_WS_PORT = 8765
BRIDGE_HOST_ENV = "AIM3D_BRIDGE_HOST"
BRIDGE_WS_PORT_ENV = "AIM3D_BRIDGE_WS_PORT"

# RFC 6455 magic GUID for the Sec-WebSocket-Accept handshake.
_WS_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"


def bridge_endpoint(host=None, port=None):
    """Resolve the live WebSocket endpoint the GUI connects to (env-overridable)."""
    resolved_host = host or os.environ.get(BRIDGE_HOST_ENV, DEFAULT_BRIDGE_HOST)
    resolved_port = int(port or os.environ.get(BRIDGE_WS_PORT_ENV, DEFAULT_BRIDGE_WS_PORT))
    return resolved_host, resolved_port


def _ws_accept_key(client_key):
    digest = hashlib.sha1((client_key + _WS_GUID).encode("ascii")).digest()
    return base64.b64encode(digest).decode("ascii")


def _ws_handshake(conn):
    """Complete the server side of the RFC 6455 opening handshake."""
    data = b""
    while b"\r\n\r\n" not in data:
        chunk = conn.recv(4096)
        if not chunk:
            return False
        data += chunk
        if len(data) > 65536:
            return False
    key = None
    for line in data.split(b"\r\n"):
        if line.lower().startswith(b"sec-websocket-key:"):
            key = line.split(b":", 1)[1].strip().decode("ascii")
            break
    if not key:
        return False
    response = (
        "HTTP/1.1 101 Switching Protocols\r\n"
        "Upgrade: websocket\r\n"
        "Connection: Upgrade\r\n"
        f"Sec-WebSocket-Accept: {_ws_accept_key(key)}\r\n\r\n"
    )
    conn.sendall(response.encode("ascii"))
    return True


def _ws_text_frame(payload_bytes):
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


class LiveServer:
    """A minimal WebSocket server that the GUI connects to for live snapshots.

    Runs an accept loop on a daemon thread. ``push`` broadcasts a snapshot to
    every connected GUI and caches it as the latest, so a GUI that connects
    later immediately receives the current model. Uses only the standard
    library -- no external WebSocket dependency.
    """

    def __init__(self, host, port):
        self.host = host
        self.port = port
        self._clients = set()
        self._lock = threading.Lock()
        self._latest_frame = None
        self._closed = False

        self._socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        self._socket.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        self._socket.bind((host, port))
        # If port was 0, capture the OS-assigned port.
        self.port = self._socket.getsockname()[1]
        self._socket.listen(16)
        self._thread = threading.Thread(target=self._accept_loop, daemon=True)
        self._thread.start()

    def _accept_loop(self):
        while not self._closed:
            try:
                conn, _ = self._socket.accept()
            except OSError:
                break
            threading.Thread(target=self._handle_client, args=(conn,), daemon=True).start()

    def _handle_client(self, conn):
        try:
            if not _ws_handshake(conn):
                conn.close()
                return
        except OSError:
            conn.close()
            return

        with self._lock:
            self._clients.add(conn)
            latest = self._latest_frame
        if latest is not None:
            try:
                conn.sendall(latest)
            except OSError:
                self._drop(conn)
                return

        # We only push; just keep the socket and detect the client closing.
        try:
            while not self._closed:
                if not conn.recv(4096):
                    break
        except OSError:
            pass
        self._drop(conn)

    def _drop(self, conn):
        with self._lock:
            self._clients.discard(conn)
        try:
            conn.close()
        except OSError:
            pass

    def push(self, document):
        """Broadcast a document's core-state snapshot to all connected GUIs."""
        payload = json.dumps(document.core_state_snapshot())
        frame = _ws_text_frame(payload.encode("utf-8"))
        with self._lock:
            self._latest_frame = frame
            clients = list(self._clients)
        for conn in clients:
            try:
                conn.sendall(frame)
            except OSError:
                self._drop(conn)
        return payload

    @property
    def client_count(self):
        with self._lock:
            return len(self._clients)

    def wait_forever(self):
        """Block until interrupted, keeping the server (and GUI link) alive."""
        try:
            while not self._closed:
                self._thread.join(timeout=0.5)
                if not self._thread.is_alive():
                    break
                threading.Event().wait(0.5)
        except KeyboardInterrupt:
            pass
        finally:
            self.close()

    def close(self):
        self._closed = True
        try:
            self._socket.close()
        except OSError:
            pass
        with self._lock:
            clients = list(self._clients)
            self._clients.clear()
        for conn in clients:
            try:
                conn.close()
            except OSError:
                pass


_server = None
_server_lock = threading.Lock()


def serve(host=None, port=None):
    """Start (once) and return the live WebSocket server for this process.

    Idempotent: repeated calls return the same server. The GUI connects to it
    and receives every pushed snapshot, so just keep the process alive (e.g.
    ``serve().wait_forever()``) to keep the model live in the GUI.
    """
    global _server
    resolved_host, resolved_port = bridge_endpoint(host, port)
    with _server_lock:
        if _server is None or _server._closed:
            _server = LiveServer(resolved_host, resolved_port)
    return _server


def push_snapshot(document, host=None, port=None):
    """Push the document's core-state snapshot to every connected GUI.

    Lazily starts this process's WebSocket server (see ``serve``) and broadcasts
    the snapshot. Pass an ``aim3d.core.Document`` (or any object exposing
    ``core_state_snapshot``); for the ``adsk`` facade use ``doc._state.native_doc``.
    Returns the JSON sent.
    """
    return serve(host, port).push(document)


def snapshot_message(document):
    """Build the line-protocol message carrying a document's core-state snapshot."""
    return {
        "channel": CORE_SNAPSHOT_CHANNEL,
        "snapshot": document.core_state_snapshot(),
    }


def emit_snapshot(document, stream=None):
    """Serialize the document's core-state snapshot as one JSON line.

    Returns the emitted line (without the trailing newline) so callers/tests can
    assert on it. Pass any writable text stream; defaults to ``sys.stdout``.
    """
    stream = sys.stdout if stream is None else stream
    line = json.dumps(snapshot_message(document))
    stream.write(line + "\n")
    stream.flush()
    return line
