# Simulation Engine Documentation

The aim3d Simulation Engine provides real-time visual feedback of the subtractive machining process before physical execution. It uses a highly optimized C++ 2.5D heightmap approach.

## Architecture

*   **LightweightSimulator (C++)**: The core engine. It maintains a 2D grid representing the stock material. Each cell in the grid stores the current Z-height of the material at that (X, Y) coordinate.
*   **Tool Profiles**: Defines the geometry of the cutting tool (e.g., Flat Endmill, Ballnose).
*   **Subtraction Kernel**: Iterates along the toolpath segments, projecting the tool profile onto the grid and updating the Z-heights by taking the minimum of the current height and the tool's bottom height.
*   **WebGPU Bridge**: The updated heightmap is efficiently synced to the frontend and rendered as a dynamic mesh using WebGPU.

## Implementation Gaps & Limitations

The heightmap-based approach prioritizes speed and low memory usage, enabling real-time simulation even on low-power devices. However, it introduces significant physical limitations:

1.  **Cannot Represent Undercuts**: Because each (X, Y) point can only have a single Z-height, it is impossible to simulate undercutting tools (like Dovetail or T-Slot cutters) or multi-axis machining that machines the side of a part.
2.  **Vertical Wall Resolution**: The accuracy of steep or vertical walls is strictly limited by the grid resolution (cell size). Small grids will exhibit "stair-stepping" artifacts on vertical curves.
3.  **No Tool Holder Collision**: The simulator currently only tracks the cutting flute volume. It does not check if the non-cutting shank or the spindle collet/holder collides with the stock material.
4.  **No Machine Kinematics**: It only simulates material removal, not the physical machine axes. Therefore, it cannot detect over-travel limit switch hits or axis collisions.
