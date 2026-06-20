# aim3d Testing Suite Documentation

This document describes how to build, run, and configure the test suites for the `aim3d` project, with a focus on the simulation and design mesh recording features.

---

## 1. Test Architecture Overview

The `aim3d` project includes tests across its core layers:

1.  **C++ Core Tests**: Google Test (gtest) suite validating parametric documents, B-rep topological naming wrappers, task schedules, and C-API bindings.
2.  **Python Integration Tests**: `pytest` suite verifying Python facade correctness (`aim3d` and `adsk`), websocket communication, daemon behavior, and the Python-to-C++ FFI bindings.
3.  **Simulation & Parser Tests**: `pytest` suite verifying G-code interpreters, interpreter cycles (G81, G84), unit conversion state handling, and the C++ subtractive heightmap simulator.
4.  **Frontend Vitest Suite**: `vitest` (jsdom/node) tests for Vue components, services, and the Pinia store.
5.  **WebGPU Voxelizer Tests**: `vitest` tests validating the SDF cutting model that moved from the C++ material simulator (OCCT boolean subtraction) into `webgpuVoxelizer.js`. Three layers: a pure-JS reference + IoU tests (no GPU), a WGSL parity guard (no GPU), and a real-shader test (headless Chromium + WebGPU).

---

## 2. Running Tests

All tests can be executed from the `aim3d` root directory using the main `Makefile`.

### Standard Test Commands

- **Run all test suites** (C++ core, frontend, and Python):

  ```bash
  make test-all
  ```

  Sequentially builds and runs the C++ core tests, frontend Vitest tests, and Python integration tests.

- **Run C++ core tests** (the default `make test` target):

  ```bash
  make test
  ```

  Builds the core with OCCT (Emscripten) and runs the gtest suite via ctest.

- **Run C++ Core Tests only**:

  ```bash
  make test-core
  ```

- **Run the full frontend vitest suite** (Vue components, services, store — jsdom/node):

  ```bash
  make test-frontend
  ```

- **Run Python Integration Tests only** (needs a native core build + `.venv`):

  ```bash
  make test-python
  ```

- **Run Simulation Tests only** (G-code interpreter + subtractive heightmap):

  ```bash
  make test-simulation
  ```

### Verbose Mode

For detailed outputs of test runs (including full tracebacks and captures on failure):

```bash
make test-verbose
```

Or target-specific verbose runs:

- `make test-core-verbose` — runs the Emscripten test binary directly via `node build/bin/aim3d_core_tests.js`
- Python/simulation verbosity: `cd python && ../.venv/bin/pytest tests -v` (or `pytest tests/test_linuxcnc_interp.py -v`)

### Continuous Integration (GitHub Actions)

[`.github/workflows/ci.yml`](../.github/workflows/ci.yml) runs two jobs on every push and pull request:

- **`frontend-tests`** (fast, no GPU) — `npm ci` → `make test-voxelizer` → `make test-webgpu` (skips cleanly if the runner has no WebGPU backend). Caches npm deps and Playwright browsers.
- **`core-tests`** (slower, first run builds OpenCASCADE via Emscripten) — `make test-core` (full C++ gtest suite). Caches the emsdk, OCCT build, and core build; checks out the `third_party/OCCT` submodule.

Both jobs must pass for a PR to merge. Cancel-in-progress is enabled per ref.

### Pre-push Git Hook

`make install-hooks` configures `core.hooksPath = .githooks` so a `pre-push` hook runs the fast, GPU-free voxelizer tests (`make test-voxelizer`) before every push. It completes in well under a second and only blocks the push on SDF/parity failures. Bypass with `git push --no-verify` or `AIM3D_SKIP_TESTS=1 git push`. The heavier C++ and real-shader WebGPU tests run in CI, not the hook, to keep pushes fast.

### WebGPU Voxelizer Tests (cutting model)

The material-removal cutting model lives in `ui/frontend/src/services/webgpuVoxelizer.js` (WGSL compute shaders: `sdBox` stock init + `sdSweptTool` swept-endmill cuts + marching-cubes meshing). Three test files cover it:

- **`make test-voxelizer`** — runs the two GPU-free tests:
  - `src/services/voxelSdf.iou.test.js` — pure-JS reference (`voxelSdf.js`) tested against analytic ground truth via intersection-over-union (IoU): empty stock, single plunge, facing pass, overlapping passes, radius-zero, out-of-stock, stock offset, and grid-layout conventions.
  - `src/services/webgpuVoxelizer.parity.test.js` — text-level guard that the WGSL `sdBox`/`sdSweptTool`/grid-layout in `webgpuVoxelizer.js` match `voxelSdf.js`, and that marching-cubes tables are vendored (no runtime `fetch`).
- **`make test-webgpu`** — runs `src/services/webgpuVoxelizer.webgpu.test.js`, which launches headless Chromium with WebGPU (`--enable-unsafe-webgpu --use-angle=metal`), runs the **real** compute shaders, reads the GPU density grid back via `readGrid()`, and asserts IoU >= 0.999 (empty stock) and >= 0.97 (after cuts) against `voxelSdf.computeDensityGrid()`. Requires `playwright` + `npx playwright install chromium`; skips cleanly (not fails) when WebGPU is unavailable.

The JS reference (`voxelSdf.js`) is the single source of truth for the cutting math; the WGSL must mirror it; the real-shader test proves they agree on the GPU. Vendored marching-cubes tables (`marchingCubesTables.js`) remove the runtime network `fetch`.

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
    - **Test**: `test_linuxcnc_ngc_file`
    - **Description**: Simulates the material removal for various test G-code files from LinuxCNC (`good/`, `g81/`, `g84/`).
    - **Output**: Exports the resulting subtractive heightmap mesh as `test_artifacts/obj/<gcode_basename>.obj` (e.g., `test_artifacts/obj/g17-g98-g81.obj`).

2.  **Lightweight Simulator Check (`test_controller_visual_ir.py`)**:
    - **Test**: `test_lightweight_simulator_mesh`
    - **Description**: Verifies a simple metric G-code toolpath simulation mesh.
    - **Output**: Exports the final simulation mesh to `test_artifacts/obj/test_lightweight_simulator_mesh.obj`.

3.  **B-Rep Design Mesh (`test_c1_native_api.py`)**:
    - **Test**: `test_native_mesh_and_toolpath_visual_artifacts`
    - **Description**: Accesses the native core's design B-rep meshes and toolpath coordinates.
    - **Output**: Exports the underlying model mesh as `test_artifacts/obj/test_native_mesh_and_toolpath_visual_artifacts.obj`.

### Mesh Format Details

The output `.obj` files contain:

- **Vertices (`v x y z`)**: Calculated coordinates of the solid or heightmap.
- **Faces (`f v1 v2 v3`)**: 1-indexed triangle index mappings connecting the vertices.

These files can be directly opened in 3D viewing applications (like Blender, MeshLab, or macOS Quick Look) to verify simulation accuracy and detect any geometrical or toolpath compilation anomalies.
