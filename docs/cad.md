# CAD Engine Documentation

The aim3d CAD engine leverages OpenCASCADE Technology (OCCT) under the hood, wrapped by our high-performance C++ Native Core, to provide parametric solid modeling.

## Architecture

*   **OpenCASCADE Wrapper**: Exposes OCCT's `BRepAlgoAPI` and `BRepBuilderAPI` to our system.
*   **Parametric Feature Tree**: Edits made in the UI update an internal dependency graph. If a sketch is modified, dependent extrusions and subsequent CAM operations are automatically recalculated.

## Sketching & Constraints

The 2D sketcher supports basic geometric entities:
*   Lines
*   Arcs
*   Circles

Constraints are solved using a lightweight algebraic solver. Supported constraints:
*   Coincidence
*   Distance / Length
*   Horizontal / Vertical
*   Parallel / Perpendicular

## Implementation Gaps & Limitations

Currently, the CAD engine has the following known limitations:

1.  **2.5D Focus**: The engine is heavily optimized for prismatic (2.5D) parts. While OCCT supports complex NURBS surfaces and lofting, these are not currently exposed in the aim3d UI or API.
2.  **Constraint Solver Scaling**: The current algebraic solver scales poorly with highly complex sketches (>100 constraints). It is recommended to break complex profiles into multiple simpler sketches.
3.  **Fillets and Chamfers**: 3D filleting and chamfering operations occasionally fail on complex topological vertices due to OCCT's strict manifold requirements.
4.  **Assembly Mode**: There is no support for multi-part assemblies or joints; the system currently assumes a single-part workflow.
