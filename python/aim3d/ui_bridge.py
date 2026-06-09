"""Producer side of the live UI bridge.

This is the script/sidecar half of the unidirectional flow described in
``wiki/docs/design/architecture-overview.md``: a Python process that mutates the
native core (the source of truth) emits the resulting core-state snapshot so the
running Tauri/Vue client can project it.

Live transport: The script sends an HTTP POST request containing the core state
snapshot to the central daemon (`daemon.py`), which then broadcasts it to the GUI
via WebSocket.

A line-protocol form (``emit_snapshot`` over ``stdout``) is also provided for
the Tauri sidecar pattern; only the transport changes, not the contract.

The UI is never written to directly here: Python and the UI are both clients of
the core, and state flows core -> UI only.
"""

import json
import os
import sys
from urllib import request as urlrequest

# Must match CORE_CHANGED_EVENT in ui/src-tauri/src/main.rs and the event name
# the frontend subscribes to in services/coreSnapshotBridge.js.
CORE_SNAPSHOT_CHANNEL = "core://changed"

# Live HTTP endpoint for the aim3d daemon. Python is the client pushing snapshots;
# the daemon relays them to the webview. Overridable via env.
DEFAULT_BRIDGE_HOST = "127.0.0.1"
DEFAULT_BRIDGE_WS_PORT = 8765
BRIDGE_HOST_ENV = "AIM3D_BRIDGE_HOST"
BRIDGE_WS_PORT_ENV = "AIM3D_BRIDGE_WS_PORT"


def bridge_endpoint(host=None, port=None):
    """Resolve the live daemon endpoint the bridge connects to (env-overridable)."""
    resolved_host = host or os.environ.get(BRIDGE_HOST_ENV, DEFAULT_BRIDGE_HOST)
    resolved_port = int(port or os.environ.get(BRIDGE_WS_PORT_ENV, DEFAULT_BRIDGE_WS_PORT))
    return resolved_host, resolved_port


def push_snapshot(document, host=None, port=None):
    """Push the document's core-state snapshot to the central daemon for broadcast.

    Sends an HTTP POST to the aim3d daemon, which broadcasts the snapshot
    to all active WebSocket clients. Pass an ``aim3d.core.Document`` (or any object
    exposing ``core_state_snapshot``); for the ``adsk`` facade use ``doc._state.native_doc``.
    Returns the JSON sent.
    """
    resolved_host, resolved_port = bridge_endpoint(host, port)
    url = f"http://{resolved_host}:{resolved_port}/snapshot"
    
    snapshot = document.core_state_snapshot()
    payload = json.dumps(snapshot)
    data = payload.encode("utf-8")
    
    req = urlrequest.Request(url, data=data, method="POST")
    req.add_header("Content-Type", "application/json")
    try:
        with urlrequest.urlopen(req, timeout=1.0) as response:
            pass
    except Exception as e:
        print(f"Warning: Failed to push snapshot to {url}: {e}", file=sys.stderr)
        
    return payload


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
