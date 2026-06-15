let coreModule = null;
let simulatorInstance = null;
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
    simulatorInstance = new coreModule.MachineSimulator();
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
 * Gets the singleton simulator instance.
 */
export function getSimulator() {
  if (!simulatorInstance) throw new Error("WASM not initialized");
  return simulatorInstance;
}

export function getCoreModule() {
  if (!coreModule) throw new Error("WASM not initialized");
  return coreModule;
}
