# aim3d Testing Suite Documentation

This document describes how to build, run, and configure the test suites for the `aim3d` project, with a focus on the simulation and design mesh recording features.

---

## 1. Test Architecture Overview

The `aim3d` project includes tests across its core layers:

1.  **C++ Core Tests**: Google Test (gtest) suite validating parametric documents, B-rep topological naming wrappers, task schedules, and C-API bindings.
2.  **Python Integration Tests**: `pytest` suite verifying Python facade correctness (`aim3d` and `adsk`), websocket communication, daemon behavior, and the Python-to-C++ FFI bindings.
3.  **Simulation & Parser Tests**: `pytest` suite verifying G-code interpreters, interpreter cycles (G81, G84), unit conversion state handling, and the C++ subtractive heightmap simulator.

---

## 2. Running Tests

All tests can be executed from the `aim3d` root directory using the main `Makefile`.

### Standard Test Commands
*   **Run all tests**:
    ```bash
    make test
    ```
    *(Installs dependencies, builds the core with OCCT, and runs C++, Python, and Simulation tests.)*

*   **Run C++ Core Tests only**:
    ```bash
    make test-core
    ```

*   **Run Python Integration Tests only**:
    ```bash
    make test-python
    ```

*   **Run Simulation Tests only**:
    ```bash
    make test-simulation
    ```

### Verbose Mode
For detailed outputs of test runs (including full tracebacks and captures on failure):
```bash
make test-verbose
```
Or target-specific verbose runs:
*   `make test-core-verbose`
*   `make test-python-verbose`
*   `make test-simulation-verbose`

---

## 3. Recording Simulation and Design Meshes (`--record-meshes`)

To assist with visual inspection and debugging of simulated motion and design elements, the Python test suite includes a recording feature that outputs simulated/modeled parts as standard wavefront `.obj` mesh files.

### Enabling Mesh Recording

You can activate mesh recording by passing the `--record-meshes` flag to `pytest`:

```bash
cd python
../.venv/bin/pytest tests --record-meshes
```

### Where Meshes Are Saved

When `--record-meshes` is active, recorded mesh files are saved under:
`aim3d/python/test_artifacts/obj/`

### Recorded Tests

The following tests support mesh recording:

1.  **G-Code Subtractive Simulation (`test_linuxcnc_interp.py`)**:
    *   **Test**: `test_linuxcnc_ngc_file`
    *   **Description**: Simulates the material removal for various test G-code files from LinuxCNC (`good/`, `g81/`, `g84/`).
    *   **Output**: Exports the resulting subtractive heightmap mesh as `test_artifacts/obj/<gcode_basename>.obj` (e.g., `test_artifacts/obj/g17-g98-g81.obj`).

2.  **Lightweight Simulator Check (`test_controller_visual_ir.py`)**:
    *   **Test**: `test_lightweight_simulator_mesh`
    *   **Description**: Verifies a simple metric G-code toolpath simulation mesh.
    *   **Output**: Exports the final simulation mesh to `test_artifacts/obj/test_lightweight_simulator_mesh.obj`.

3.  **B-Rep Design Mesh (`test_c1_native_api.py`)**:
    *   **Test**: `test_native_mesh_and_toolpath_visual_artifacts`
    *   **Description**: Accesses the native core's design B-rep meshes and toolpath coordinates.
    *   **Output**: Exports the underlying model mesh as `test_artifacts/obj/test_native_mesh_and_toolpath_visual_artifacts.obj`.

### Mesh Format Details

The output `.obj` files contain:
-   **Vertices (`v x y z`)**: Calculated coordinates of the solid or heightmap.
-   **Faces (`f v1 v2 v3`)**: 1-indexed triangle index mappings connecting the vertices.

These files can be directly opened in 3D viewing applications (like Blender, MeshLab, or macOS Quick Look) to verify simulation accuracy and detect any geometrical or toolpath compilation anomalies.
