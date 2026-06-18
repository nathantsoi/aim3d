let coreModule = null;
let controllerInstance = null;
let parserInstance = null;

/**
 * Initializes the WASM module. Call this on app startup.
 */
export async function initCoreWasm() {
  if (coreModule) return coreModule;

  try {
    console.log("Initializing WASM core from window.createAim3dCore...");
    if (typeof window.createAim3dCore !== 'function') {
      throw new Error("window.createAim3dCore is not defined. Make sure /aim3d_core.js is loaded.");
    }
    
    coreModule = await window.createAim3dCore();
    console.log("WASM module loaded successfully.");

    // Initialize global instances
    const profile = coreModule.MachineProfile.defaultThreeAxisMill();
    controllerInstance = new coreModule.MachineController(profile);
    parserInstance = new coreModule.LinuxCncCompatParser();

    return coreModule;
  } catch (err) {
    console.error("Failed to load WASM core:", err);
    throw err;
  }
}

/**
 * Parses G-code and returns a ControllerProgram reference from WASM.
 */
export function parseGcode(gcodeText) {
  if (!parserInstance) throw new Error("WASM not initialized");
  return parserInstance.parse(gcodeText);
}

/**
 * Gets the singleton controller instance.
 */
export function getController() {
  if (!controllerInstance) throw new Error("WASM not initialized");
  return controllerInstance;
}

export function resetController() {
  if (!coreModule) throw new Error("WASM not initialized");
  const profile = coreModule.MachineProfile.defaultThreeAxisMill();
  controllerInstance = new coreModule.MachineController(profile);
  return controllerInstance;
}

export function getCoreModule() {
  if (!coreModule) throw new Error("WASM not initialized");
  return coreModule;
}

/**
 * Extracts the triangulated mesh from the MaterialSimulator inside the MachineController.
 * Returns { positions, normals, indices } arrays for WebGL rendering.
 */
export function extractMaterialMesh() {
  if (!controllerInstance) return null;
  const matSim = controllerInstance.materialSimulator();
  if (!matSim) return null;

  const positionsView = matSim.getPositions();
  const normalsView = matSim.getNormals();
  const indicesView = matSim.getIndices();

  if (!positionsView || positionsView.length === 0) return null;

  return {
    positions: new Float32Array(positionsView),
    normals: new Float32Array(normalsView),
    indices: new Uint32Array(indicesView)
  };
}

/**
 * Flush deferred material-sim cuts accumulated during tick() calls, then rebuild the mesh.
 * Call this once per animation frame (or after a batch of ticks) to apply OCCT booleans
 * in bulk rather than per-tick.
 */
export function flushMaterialSimulation() {
  if (!controllerInstance) return;
  controllerInstance.flushMaterialSimulation();
  const matSim = controllerInstance.materialSimulator();
  if (matSim) matSim.updateMesh();
}
