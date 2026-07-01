// Read side of the unidirectional flow: subscribes to core-state snapshots
// pushed by the native C++/Rust core (e.g. when a Python script creates a
// document or runs sketch -> rectangle -> extrude) and projects them onto the
// Pinia store. Outside the Tauri runtime (browser dev / Vitest) the event API
// is absent, so this becomes a no-op and the UI keeps its local state.

const CORE_CHANGED_EVENT = 'core://changed';

const tauriListen = () => {
  if (typeof window === 'undefined') return null;
  return window.__TAURI__?.event?.listen || window.__TAURI__?.core?.event?.listen || null;
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
