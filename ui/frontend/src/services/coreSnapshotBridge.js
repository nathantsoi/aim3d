// Read side of the unidirectional flow: subscribes to core-state snapshots
// pushed by the native C++/Rust core (e.g. when a Python script creates a
// document or runs sketch -> rectangle -> extrude) and projects them onto the
// Pinia store. Outside the Tauri runtime (browser dev / Vitest) the event API
// is absent, so this becomes a no-op and the UI keeps its local state.

const CORE_CHANGED_EVENT = 'core://changed';
const DEFAULT_BRIDGE_WS_PORT = 8765;
const RECONNECT_DELAY_MS = 1500;

const tauriListen = () => {
  if (typeof window === 'undefined') return null;
  return window.__TAURI__?.event?.listen || null;
};

const defaultBridgeUrl = () => {
  const port =
    (typeof window !== 'undefined' && window.__AIM3D_BRIDGE_WS_PORT__) || DEFAULT_BRIDGE_WS_PORT;
  return `ws://127.0.0.1:${port}`;
};

const parsePayload = (payload) => {
  if (typeof payload === 'string') {
    try {
      return JSON.parse(payload);
    } catch {
      return null;
    }
  }
  return payload;
};

// Begins listening for core snapshot pushes. Returns an unlisten function.
export const subscribeCoreSnapshots = async (store) => {
  const listen = tauriListen();
  if (!listen) {
    return () => {};
  }

  const unlisten = await listen(CORE_CHANGED_EVENT, (event) => {
    const snapshot = parsePayload(event?.payload);
    if (snapshot) {
      store.loadCoreSnapshot(snapshot);
    }
  });
  return unlisten;
};

// Connects to the live core-state bridge over WebSocket and projects every
// snapshot it receives. This is the interactive transport: run any Python
// script that calls `aim3d.ui_bridge.push_snapshot(doc)` and the GUI updates in
// real time. Auto-reconnects if the broker restarts. No-op when the WebSocket
// API is unavailable (e.g. SSR). Returns a disconnect function.
export const connectCoreSnapshotSocket = (store, url = defaultBridgeUrl(), options = {}) => {
  if (typeof WebSocket === 'undefined') {
    return () => {};
  }

  const reconnectDelayMs = options.reconnectDelayMs ?? RECONNECT_DELAY_MS;
  let socket = null;
  let reconnectTimer = null;
  let stopped = false;

  const connect = () => {
    if (stopped) return;
    socket = new WebSocket(url);

    socket.onmessage = (event) => {
      const snapshot = parsePayload(event?.data);
      if (snapshot) {
        store.loadCoreSnapshot(snapshot);
      }
    };

    socket.onclose = () => {
      socket = null;
      if (!stopped) {
        reconnectTimer = setTimeout(connect, reconnectDelayMs);
      }
    };

    socket.onerror = () => {
      try {
        socket?.close();
      } catch {
        // ignore; onclose schedules the reconnect
      }
    };
  };

  connect();

  return () => {
    stopped = true;
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
    }
    if (socket) {
      try {
        socket.close();
      } catch {
        // ignore
      }
    }
  };
};
