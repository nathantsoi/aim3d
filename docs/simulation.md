# Simulation Engine Documentation

The aim3d Simulation Engine provides real-time visual feedback of the subtractive machining process before physical execution. It uses a highly optimized WebGPU Compute Shader voxelization approach for real-time mesh subtraction and visualization.

## Architecture & Lifecycle

The simulation lifecycle spans both the C++ WebAssembly backend and the WebGPU-accelerated frontend:

1.  **Configuration**: The user defines the stock dimensions, location, and simulation quality (voxel resolution) via the GUI Setup panel.
2.  **Toolpath Generation**: When a program is executed, the C++ `MachineController` parses the G-code and the `Planner` generates discrete movement segments.
3.  **Backend Synchronization**: As the machine moves, the C++ `MaterialSimulator` intercepts the cut segments. It performs high-level bounding-box toolholder collision checks against the original stock volume and pushes the cut segment geometry to a `pendingCuts` queue.
4.  **Frontend Polling**: The frontend Vue application (`Viewport.vue`) continually polls the WASM backend for new pending cuts during the render loop.
5.  **Compute Shader Voxelization**: The `webgpuVoxelizer.js` consumes the new cut segments:
    *   It maintains a 3D grid of signed distance field (SDF) values on the GPU.
    *   A compute shader evaluates a capsule SDF for the tool's movement across the segment.
    *   Material subtraction is performed efficiently in parallel by taking the maximum of the current voxel density and the negative cut SDF.
6.  **Mesh Extraction**: After cuts are applied, a GPU-accelerated Marching Cubes algorithm extracts a triangular mesh from the density grid.
7.  **Rendering**: The generated vertex and index buffers remain on the GPU and are drawn directly by the `webgpuRenderer.js`, providing smooth 60fps visualization.

## Transition from OpenCASCADE / Heightmaps

Previously, the simulator experimented with a C++ 2.5D heightmap and later an exact 3D boolean approach using OpenCASCADE (`BRepAlgoAPI_Cut`). 
The OpenCASCADE approach, while mathematically precise, proved to be too slow (0 FPS) for real-time interactive simulation during toolpath playback. The architecture was thus shifted to the WebGPU voxelization engine, offloading the heavy geometric subtractions to the parallel processing power of the user's graphics card.

## Implementation Gaps & Limitations

1.  **Voxel Aliasing**: Because the material is represented by a discrete 3D grid of voxels, curved surfaces may exhibit minor aliasing ("stair-stepping") depending on the chosen simulation quality resolution.
2.  **Exact Collisions**: For performance reasons, the C++ backend currently uses a bounding-box approximation of the un-machined stock for toolholder collision detection, rather than the actively machined geometry.
3.  **No Machine Kinematics**: It only simulates material removal, not the physical machine axes. Therefore, it cannot detect over-travel limit switch hits or complex multi-axis machine component collisions.
