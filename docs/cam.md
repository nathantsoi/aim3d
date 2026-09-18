# CAM Engine Documentation

The aim3d CAM engine is responsible for converting 3D solid models and 2D sketches into machine-executable toolpaths. It supports exporting to both traditional G-Code and our optimized Visual Intermediate Representation (IR).

## Architecture

*   **`CanonicalCamIR`** (`core/src/cam_ir.cpp`): A real, working flat-buffer container (`MotionCommand` → zero-copy `double[5]` rows for FFI). This is the format both G-code emission and the Visual IR consume — it is not a stub, it just isn't fed real toolpath data yet (see below).
*   **`ClipperOffsetGenerator`** (`core/src/offset_generator.cpp`): The intended seam for 2D contour/pocket offsetting. Header comments explicitly call out Clipper2 as the target library, isolated behind this interface to avoid GPL/copyleft entanglement in the core.
*   **`OpenCamLibSurfaceDropper`** (`core/src/surface_dropper.cpp`): The intended seam for 3D drop-cutter surfacing, isolated the same way for an eventual OpenCAMLib-equivalent integration.
*   **G-Code Emitter**: Formats `CanonicalCamIR` commands into standard RS-274 G-Code (`aim3d_operation_post_process`, `core/src/c_api.cpp`).

## Current implementation status

1.  **Toolpath generation is hardcoded, not computed.** `ensureDefaultToolpath` (`c_api.cpp`) always emits the same four fixed motion commands (a tool change, a rapid, and two feed moves to fixed X5/Y5 → X10/Y5) regardless of stock geometry, tool diameter, or operation parameters. Every operation — 2D Contour, Pocket, Face, Drill — currently produces this identical path.
2.  **2D offsetting (`ClipperOffsetGenerator::generateOffsets`) is a placeholder.** It does not link Clipper2. It shrinks every input boundary by a flat `× 0.8` scale toward the origin — the code comment literally says "Simulate offsetting." No stepover or tool-diameter math is applied.
3.  **3D drop-cutter (`OpenCamLibSurfaceDropper::dropCutter`) is a placeholder.** It ignores the input surface entirely and projects a fixed inverted-parabola height field (`z = 10 - (x²+y²)×0.05`) — the code comment says "Mock drop cutter computation."
4.  **Post-processing returns a literal hardcoded G-code string** (`aim3d_operation_post_process`, `c_api.cpp`) — five fixed lines every time, independent of the operation handle's contents beyond triggering `ensureDefaultToolpath`.
5.  **The `adsk.cam` facade wraps exactly one native operation** (`Operation`, `python/adsk/cam.py:61`) regardless of the requested operation type or parameters — there is no operation-type dispatch in the native layer (`aim3d_operation_create_default`, `c_api.cpp`, creates a generic empty handle).
6.  **Test coverage does not catch any of this** — `test_fusion_facade.py` only asserts `"G1" in setup.postProcess()`, a substring check the hardcoded string trivially satisfies. No test currently checks that toolpath geometry actually depends on stock/tool/operation parameters.

This all depends on real solids existing first — see the CAD implementation plan in [cad.md](cad.md) (steps 1-3 there are prerequisites for step 1 below).

## Implementation plan

1. **Operation-type dispatch through the FFI.** Add an operation-kind enum/parameter set to `document_add_operation` so 2D Contour / Pocket / Face / Drill become distinct native objects with distinct parameters, instead of the single generic handle from `aim3d_operation_create_default`.
2. **Real 2D offsetting via Clipper2.** Replace the `× 0.8` placeholder in `generateOffsets` with actual polygon offsetting (stepover, tool diameter, multiple passes toward pocket center). This is the algorithmic core of both 2D Contour and 2D Pocket.
3. **Toolpath generation driven by real geometry.** Once (1) and (2) exist and the CAD plan's real-extrude work lands, replace `ensureDefaultToolpath`'s fixed four commands with a generator that walks the actual stock/profile geometry per operation type.
4. **Real G-code emission from `CanonicalCamIR`.** Replace the hardcoded string in `aim3d_operation_post_process` with a proper emitter that walks whatever commands are actually in the IR — `cam_ir.cpp` already provides a working container for this, it just needs real data to walk.
5. **3D surfacing via a drop-cutter algorithm.** Replace the fixed hemisphere in `dropCutter` with real tool-vs-surface Z projection against the input `surfaceVertices`. Lowest priority — only relevant once 2.5D operations (1)-(4) are solid.
6. **Drilling / adaptive clearing.** Net-new; sequence after (1)-(4) since they need the same operation-type dispatch infrastructure.
7. **Strengthen test assertions** as each step lands — replace substring checks (`"G1" in ...`) with assertions that toolpath output actually varies with stock size, tool diameter, and operation parameters, so regressions to mock behavior are caught.

### Known architectural limitations (independent of the above)

1.  **No 4/5-Axis Support**: The engine targets strict 3-axis (XYZ) paths; no rotary axes or simultaneous 5-axis machining is planned in the near term.
2.  **No Rest Machining**: In-process stock is not tracked dynamically between operations to avoid air-cutting.
