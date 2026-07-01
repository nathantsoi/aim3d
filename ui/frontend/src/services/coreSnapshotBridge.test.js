import { afterEach, describe, expect, it, vi } from 'vitest';
import { subscribeCoreSnapshots } from './coreSnapshotBridge';

const makeStore = () => ({
  loadCoreSnapshot: vi.fn()
});

afterEach(() => {
  delete window.__TAURI__;
  vi.restoreAllMocks();
});

// The WebSocket `connectCoreSnapshotSocket` client was removed when the app
// moved to Tauri's native event bus (commit 7422869). Snapshot projection now
// flows through `subscribeCoreSnapshots`, which subscribes to the Tauri
// `core://changed` event. These tests cover that live path; the removed
// WebSocket transport is intentionally not covered here.
describe('coreSnapshotBridge event subscription', () => {
  it('returns a no-op unsubscribe without a Tauri runtime', async () => {
    const store = makeStore();
    const unlisten = await subscribeCoreSnapshots(store);
    expect(typeof unlisten).toBe('function');
    expect(store.loadCoreSnapshot).not.toHaveBeenCalled();
  });

  it('projects snapshots delivered through the Tauri event listener', async () => {
    const listeners = [];
    window.__TAURI__ = {
      event: {
        listen: vi.fn(async (_event, handler) => {
          listeners.push(handler);
          return () => {};
        })
      }
    };

    const store = makeStore();
    const unlisten = await subscribeCoreSnapshots(store);
    expect(typeof unlisten).toBe('function');
    expect(window.__TAURI__.event.listen).toHaveBeenCalledWith('core://changed', expect.any(Function));

    const snapshot = {
      activeDocumentId: 'doc_2002',
      features: [{ id: 'feat_Extrude_1', type: 'Extrude', value: 10 }],
      viewportScene: { solids: [], toolpaths: [] }
    };
    listeners[0]({ payload: snapshot });
    expect(store.loadCoreSnapshot).toHaveBeenCalledTimes(1);
    expect(store.loadCoreSnapshot.mock.calls[0][0].activeDocumentId).toBe('doc_2002');
  });

  it('ignores malformed payloads without throwing', async () => {
    const listeners = [];
    window.__TAURI__ = {
      event: {
        listen: vi.fn(async (_event, handler) => {
          listeners.push(handler);
          return () => {};
        })
      }
    };

    const store = makeStore();
    await subscribeCoreSnapshots(store);
    expect(() => listeners[0]({ payload: 'not json{' })).not.toThrow();
    expect(store.loadCoreSnapshot).not.toHaveBeenCalled();
  });
});
