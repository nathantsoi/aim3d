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

// connectCoreSnapshotSocket is no longer needed. We run natively in Tauri.
