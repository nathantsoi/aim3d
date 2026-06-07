# CAM Engine Documentation

The aim3d CAM engine is responsible for converting 3D solid models and 2D sketches into machine-executable toolpaths. It supports exporting to both traditional G-Code and our optimized Visual Intermediate Representation (IR).

## Architecture

*   **Operation Generators**: C++ modules that generate specific types of toolpaths (e.g., Pocketing, Contouring, Facing).
*   **Visual IR Compiler**: Converts the generated paths into a hardware-agnostic intermediate representation. This IR is much denser than G-code and contains explicit vector segments and feed rates, removing the need for the controller to parse complex arcs or strings.
*   **G-Code Emitter**: A legacy fallback that formats the internal paths into standard RS-274 G-Code for compatibility with third-party controllers (e.g., GRBL, LinuxCNC).

## Supported Operations

*   **2D Contour**: Follows the perimeter of a selected profile.
*   **2D Pocket**: Clears material inside a closed boundary using offset toolpaths.
*   **Face**: Clears the top surface of the stock to a specified Z-height.
*   **Drill**: Plunge operations at specified points.

## Implementation Gaps & Limitations

Currently, the CAM engine has the following known limitations:

1.  **Missing 3D Surfacing**: There are no 3D Adaptive Clearing or 3D Parallel Finishing toolpaths. The engine assumes 2.5D machining.
2.  **No 4/5-Axis Support**: The engine generates strict 3-axis (XYZ) paths. There is no support for trunnions, rotary axes, or simultaneous 5-axis continuous machining.
3.  **Basic Linking**: Rapid linking moves between operations are basic linear moves to a clearance height. Spline-based smooth linking is not yet implemented, which may lead to jerky machine movements during retracts.
4.  **No Rest Machining**: The system does not yet track the in-process stock dynamically between operations to avoid air-cutting (rest machining).
