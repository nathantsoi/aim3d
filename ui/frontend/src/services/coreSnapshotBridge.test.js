import { afterEach, describe, expect, it, vi } from 'vitest';
import { connectCoreSnapshotSocket, subscribeCoreSnapshots } from './coreSnapshotBridge';

const makeStore = () => ({
  loadCoreSnapshot: vi.fn()
});

const snapshot = () => ({
  activeDocumentId: 'doc_2002',
  features: [{ id: 'feat_Extrude_1', type: 'Extrude', value: 10 }],
  viewportScene: { solids: [], toolpaths: [] }
});

// Minimal controllable WebSocket double.
class FakeWebSocket {
  constructor(url) {
    this.url = url;
    this.onmessage = null;
    this.onclose = null;
    this.onerror = null;
    this.closed = false;
    FakeWebSocket.instances.push(this);
  }

  emitMessage(data) {
    this.onmessage?.({ data });
  }

  emitClose() {
    this.onclose?.();
  }

  close() {
    this.closed = true;
  }
}
FakeWebSocket.instances = [];

afterEach(() => {
  FakeWebSocket.instances = [];
  delete window.__TAURI__;
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('coreSnapshotBridge WebSocket client', () => {
  it('projects snapshots received over the socket', () => {
    vi.stubGlobal('WebSocket', FakeWebSocket);
    const store = makeStore();

    const disconnect = connectCoreSnapshotSocket(store, 'ws://127.0.0.1:8765');
    const socket = FakeWebSocket.instances[0];
    expect(socket.url).toBe('ws://127.0.0.1:8765');

    socket.emitMessage(JSON.stringify(snapshot()));

    expect(store.loadCoreSnapshot).toHaveBeenCalledTimes(1);
    expect(store.loadCoreSnapshot.mock.calls[0][0].activeDocumentId).toBe('doc_2002');

    disconnect();
    expect(socket.closed).toBe(true);
  });

  it('ignores malformed payloads without throwing', () => {
    vi.stubGlobal('WebSocket', FakeWebSocket);
    const store = makeStore();

    connectCoreSnapshotSocket(store, 'ws://127.0.0.1:8765');
    FakeWebSocket.instances[0].emitMessage('not json{');

    expect(store.loadCoreSnapshot).not.toHaveBeenCalled();
  });

  it('reconnects after the socket closes', () => {
    vi.useFakeTimers();
    vi.stubGlobal('WebSocket', FakeWebSocket);
    const store = makeStore();

    const disconnect = connectCoreSnapshotSocket(store, 'ws://127.0.0.1:8765', {
      reconnectDelayMs: 100
    });
    expect(FakeWebSocket.instances).toHaveLength(1);

    FakeWebSocket.instances[0].emitClose();
    vi.advanceTimersByTime(120);

    expect(FakeWebSocket.instances).toHaveLength(2);
    FakeWebSocket.instances[1].emitMessage(JSON.stringify(snapshot()));
    expect(store.loadCoreSnapshot).toHaveBeenCalledTimes(1);

    // After disconnect, a close must not schedule another reconnect.
    disconnect();
    FakeWebSocket.instances[1].emitClose();
    vi.advanceTimersByTime(200);
    expect(FakeWebSocket.instances).toHaveLength(2);
  });

  it('is a no-op when the WebSocket API is unavailable', () => {
    vi.stubGlobal('WebSocket', undefined);
    const store = makeStore();
    const disconnect = connectCoreSnapshotSocket(store, 'ws://127.0.0.1:8765');
    expect(typeof disconnect).toBe('function');
    expect(store.loadCoreSnapshot).not.toHaveBeenCalled();
  });
});

describe('coreSnapshotBridge event subscription', () => {
  it('returns a no-op unsubscribe without a Tauri runtime', async () => {
    const store = makeStore();
    const unlisten = await subscribeCoreSnapshots(store);
    expect(typeof unlisten).toBe('function');
    expect(store.loadCoreSnapshot).not.toHaveBeenCalled();
  });
});
