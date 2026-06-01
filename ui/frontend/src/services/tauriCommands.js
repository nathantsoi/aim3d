// Thin client for the standalone Tauri IPC commands exposed by src-tauri/src/main.rs.
// Each command maps to a tested backend capability. Outside the Tauri runtime
// (browser dev/Vitest) window.__TAURI__ is absent, so we resolve a deterministic
// mock result instead of throwing, mirroring the fallback in coreGateway.js.

const tauriInvoke = () => {
  if (typeof window === 'undefined') return null;
  return window.__TAURI__?.tauri?.invoke || window.__TAURI__?.invoke || null;
};

export const invokeCommand = async (name, args = {}) => {
  const invoke = tauriInvoke();

  if (!invoke) {
    console.debug('[ribbon] no Tauri runtime; skipping command', name, args);
    return {
      status: 'mock',
      message: `Mock invocation of ${name}`,
      data: { mock: true, command: name, args }
    };
  }

  const response = await invoke(name, args);
  let data = response?.data ?? null;
  if (typeof data === 'string') {
    try {
      data = JSON.parse(data);
    } catch {
      // Leave non-JSON payloads as the original string.
    }
  }
  return {
    status: response?.status ?? 'success',
    message: response?.message ?? '',
    data
  };
};

export const solveSketch2d = (pointsJson = '[]', constraintsJson = '[]') =>
  invokeCommand('solve_2d_sketch', { pointsJson, constraintsJson });

export const generateToolpath = (operationId) =>
  invokeCommand('generate_toolpath', { operationId });

export const runSimulation = (gcode = '') => invokeCommand('run_simulation', { gcode });

export const recomputeDocument = () => invokeCommand('recompute_document', {});

export const postProcess = (setupId) => invokeCommand('post_process', { setupId });

// Route a core-state snapshot through the core boundary, returning the merged
// UI state (request/response form of the projection).
export const applyCoreState = (snapshotJson, stateJson) =>
  invokeCommand('apply_core_state', { snapshotJson, stateJson });

// Broadcast a core-state snapshot to all windows as a `core://changed` event.
export const pushCoreSnapshot = (snapshotJson) =>
  invokeCommand('push_core_snapshot', { snapshotJson });
