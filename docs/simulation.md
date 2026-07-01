# Simulation Engine Documentation

The aim3d Simulation Engine provides real-time visual feedback of the subtractive machining process before physical execution. There is a **single** gcode → motion → cutting pipeline, and it runs entirely in the frontend: the WASM-compiled C++ core produces motion and the WebGPU voxelizer performs the material removal.

## Architecture & Lifecycle

The pipeline spans the C++ WebAssembly backend and the WebGPU-accelerated frontend, with no headless/secondary cutting path:

1.  **Program load**: The user loads a G-code program in the machine workspace (Auto/MDI) and configures stock dimensions, location, tool diameter, and simulation resolution.
2.  **Parsing & planning**: `MachineController::submitMdi` parses the G-code with the clean-room `LinuxCncCompatParser` and the `TrajectoryPlanner` generates discrete, acceleration-limited movement segments (`SpeSegment`s) with junction-velocity lookahead.
3.  **Backend execution**: The frontend tick loop (`MachineController::tick`, driven by `requestAnimationFrame`) advances the `SpeProtocolEmulator`. As the tool moves, each position delta is pushed as a swept cut segment (machine coordinates) onto the `MaterialSimulator` pending-cut queue.
4.  **Frontend polling**: The `Viewport.vue` render loop polls the WASM backend for new pending cuts each frame via `popPendingCuts()`.
5.  **Compute shader voxelization**: `webgpuVoxelizer.js` consumes the cut segments:
    *   It maintains a 3D grid of signed distance field (SDF) values on the GPU.
    *   A compute shader evaluates a capsule SDF for the tool's movement across the segment.
    *   Material subtraction is performed in parallel by taking the maximum of the current voxel density and the negative cut SDF.
6.  **Mesh extraction**: After cuts are applied, a GPU Marching Cubes pass extracts a triangular mesh from the density grid; the vertex/index buffers stay on the GPU.
7.  **Rendering**: `webgpuRenderer.js` draws the generated mesh directly, providing smooth visualization. The uncut stock box is hidden once the voxelizer has a cut mesh.

The C++ `MaterialSimulator` now owns only the stock bounding box (used for toolholder collision checks) and the pending-cut queue. The previous OCCT `BRepAlgoAPI_Cut` boolean mesh-extraction path has been removed — it was disabled for performance (0 FPS during real-time playback) and the WebGPU voxelizer is the sole cutting path.

## Toolholder collision

Toolholder-stock collision is checked (throttled to ~4 Hz) via `MaterialSimulator::checkCollision`, an OCCT `BRepAlgoAPI_Section` test of a toolholder cylinder against the stock bounding box. This is a collision check, not a material-removal path, and OCCT remains linked for the WASM build.

## Implementation Gaps & Limitations

1.  **Voxel Aliasing**: Because the material is represented by a discrete 3D grid of voxels, curved surfaces may exhibit minor aliasing ("stair-stepping") depending on the chosen simulation quality resolution.
2.  **Exact Collisions**: For performance, the toolholder collision uses the original stock bounding box rather than the actively machined geometry.
3.  **No Machine Kinematics**: It simulates material removal, not physical machine axes; it cannot detect over-travel limit-switch hits or multi-axis component collisions.
4.  **Forward-only preview**: The WebGPU voxelizer is cumulative and forward-only; stepping the simulation backward rewinds the tool position/active line but does not reverse the cut preview.

## Testing the pipeline

The end-to-end pipeline is covered by a Playwright test (`ui/frontend/e2e/simulator.pipeline.test.js`, run via `make test-e2e`) that loads the app in headless Chromium, drives a real G-code program through the store, and asserts the WebGPU voxelizer produced a cut mesh and removed material (`vertexCount > 0`, `volumeRemoved > 0`). The SDF math and WGSL shaders are separately covered by `make test-voxelizer` and `make test-webgpu`.
