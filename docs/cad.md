# CAD Engine Documentation

The aim3d CAD engine leverages OpenCASCADE Technology (OCCT) under the hood, wrapped by our high-performance C++ Native Core, to provide parametric solid modeling. The Python surface is a two-tier API: the modern `aim3d.*` package, and an `adsk.*` facade that mimics the Fusion 360 scripting API so existing Fusion scripts can run against aim3d with minimal changes.

## Architecture

*   **OpenCASCADE Wrapper**: Exposes OCCT's `BRepAlgoAPI` and `BRepBuilderAPI` to our system.
*   **Parametric Feature Tree**: Features are recorded on a document timeline (`Document::addSolidFeature`, `core/src/document.cpp`). Each feature's native evaluator is responsible for turning parameters into real OCCT geometry.
*   **adsk facade**: `python/adsk/{core,fusion,cam,_state}.py` mirror the Fusion 360 object model (`Sketches`, `ExtrudeFeatures`, `FeatureOperations`, etc.) as a thin layer over the native FFI (`python/aim3d/_native.py`).

## Current implementation status

This section is intentionally specific about what is real geometry versus scaffolding, so contributors don't build on top of a mock by mistake.

| Capability | Status | Where |
|---|---|---|
| Sketch creation, rectangle profile | **Real** — writes through to native `Document::addSketch`/`add_rectangle` | `document.cpp`, `fusion.py:695,971` |
| Circle / line / arc sketch entities | **Facade mock** — stored in Python `_state.py`, never reaches the native `add_sketch_entity` FFI call that already exists and is bound | `fusion.py:747`, `_native.py:81` |
| Sketch constraints (coincident, horizontal/vertical, tangent, etc.) | **Solver is real** (`SketchSolver`, `core/include/aim3d/sketch_solver.hpp`, `core/src/sketch_solver.cpp`, ~640 lines) but the `adsk.fusion.GeometricConstraints` facade never calls it — constraints are stored as inert tuples | `sketch_solver.hpp`, `fusion.py:841` |
| Extrude — rectangle profile | **Real** — `Document::evaluateExtrudeBody` builds an actual `BRepPrimAPI_MakeBox` from the sketch's rectangle bounds | `document.cpp` (`evaluateExtrudeBody`) |
| Extrude — non-rectangular profile (circle, polyline, multi-profile) | **Not implemented** — `evaluateExtrudeBody` only reads the rectangle bounding box; other profile shapes are silently ignored | `document.cpp` |
| Revolve / Sweep / Loft | **Stub evaluator** — `Document::addSolidFeature` records the feature on the timeline but only dispatches real geometry for `SolidFeatureKind::Extrude`; other kinds produce no OCCT shape | `document.cpp` (`addSolidFeature`) |
| Fillet / Chamfer | **Facade mock only** — no native entry point exists at all | `fusion.py:1750` |
| Boolean operations (Join/Cut/Intersect) | **Not wired** — the `operation` parameter is stored on `FeatureState` but no evaluator reads it; every extrude behaves as `NewBody` | `fusion.py:1645` |
| Body topology (face/edge/vertex counts) | **Facade mock** — `ensure_body_topology` always fabricates 6 faces / 12 edges / 8 vertices regardless of the real shape, even though the real OCCT topology is available via `registerBodyTopology` | `_state.py:225`, `document.cpp` (`registerBodyTopology`) |
| Patterns / Joints / Mirror | **Not implemented** | `fusion.py:1309` |

## Implementation plan

Ordered by leverage — each step unblocks the next, and CAM toolpathing (see [cam.md](cam.md)) depends on real solids existing first.

1. **Real extrude from arbitrary sketch profiles.** Replace `evaluateExtrudeBody`'s rectangle-bounding-box shortcut with a pipeline that reads the sketch's actual curve list, builds a closed wire, makes a face, and extrudes it with `BRepPrimAPI_MakePrism`. This is the single highest-leverage change: every downstream CAM operation needs a real solid to operate on.
2. **Wire circle/line/arc sketch entities to the native FFI.** `add_sketch_entity` already exists and is bound in `_native.py:81`; `adsk.fusion.SketchCircles.addByCenterRadius` / `SketchLines.addByTwoPoints` / `SketchArcs.*` just need to call it instead of writing to local Python state only.
3. **Wire sketch constraints to `SketchSolver`.** The solver is fully implemented; `GeometricConstraints.addHorizontal/addVertical/addCoincident/addTangent` need to call `aim3d.core.solve_sketch_2d()` and write the solved positions back onto the sketch's curve endpoints.
4. **Boolean operation dispatch.** Add `BRepAlgoAPI_Fuse/Cut/Common` evaluation in `addSolidFeature`, keyed on the already-plumbed `FeatureOperation` value.
5. **Real body topology exposure.** Add an FFI entry point that reads the topo-naming table (`topo_naming.cpp`) so `ensure_body_topology` reports actual face/edge/vertex counts instead of a fixed box.
6. **Revolve / Sweep / Loft evaluators.** Extend `addSolidFeature` with real OCCT evaluators (`BRepPrimAPI_MakeRevol`, `BRepOffsetAPI_MakePipe`, `BRepOffsetAPI_ThruSections`) once (1)-(3) give a solid non-rectangular profile foundation to build from.
7. **Fillet / Chamfer.** New native entry point using `BRepFilletAPI_MakeFillet`/`MakeChamfer` against real edge selection via entity tokens.
8. **Assembly / patterns / joints.** Lowest priority — defer until single-part modeling above is real, since none of it has geometric meaning without real bodies to relate.

### Known architectural limitations (independent of the above)

1.  **2.5D Focus**: OCCT supports NURBS surfaces and lofting, but the plan above targets prismatic parts first; general free-form surfacing is out of scope until step 6 lands.
2.  **Constraint Solver Scaling**: The current algebraic solver scales poorly with highly complex sketches (>100 constraints). Break complex profiles into multiple simpler sketches.
3.  **Assembly Mode**: No support for multi-part assemblies or joints; the system assumes a single-part workflow until step 8.
