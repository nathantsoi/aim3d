# aim3d: High-Performance Parametric CAD/CAM Platform

`aim3d` is a modular, high-performance, and AI-integrable parametric CAD/CAM system. The platform strictly decouples the heavy computational core from the interactive user interface to achieve extreme execution efficiency, remote headless scaling, and differentiable physical simulation.

---

## Architectural Philosophy

1. **Decoupled Headless Core (C++/Rust):** B-rep parsing, parametric trees, topological naming resolution, and CAM path generation operate in isolation, free from UI thread constraints.
2. **Stateless Thin Client (Tauri / Nuxt / WebGPU):** The client renders a 60fps WebGPU scene based on state streams dispatched by the Core. The UI is a pure projection.
3. **Zero-Copy ML Integrations (Tier 3):** Exposes B-rep geometries, displays meshes, and generates toolpaths as flat contiguous memory views (NumPy/PyTorch compatible), bypassing heavy OOP serialization.
4. **Clean-Room RS274 G-code Validation:** Incorporates a strict 100% clean-room parser that validates posted G-code back into canonical path streams.

---

## Component Track Roadmap Mapping

The repository is structured to enable parallelized development across 5 independent tracks:

```
               [Track A: Headless Core]
             (Documents, TNP, Sketch Solver)
                         │
                         ├────────────────────────┐
                         ▼                        ▼
           [Track B: Tauri UI Shell]     [Track C: Two-Tiered API]
          (WebGPU Viewport, Property)     (aim3d & adsk modules)
                         │                        │
                         │                        ▼
                         │               [Track D: CAM Solvers]
                         │             (Clipper2, OpenCAMLib)
                         │                        │
                         └───────────┬────────────┘
                                     ▼
                        [Track E: Simulation & Parser]
                         (RS274)
```

---

## Directory Structure Overview

- `core/`: Pure C++ computational engine. Handles parametric document products, topological naming databases, FFI solvers, G-code interpreters, and toolpath strategies.
- `python/`: Two-Tiered Python API Bindings. Exposes native `aim3d.*` async/tensor modules and legacy Fusion `adsk.*` OOP adapters.
- `ui/`: Tauri desktop app container and Vue/Nuxt.js WebGPU viewport.

---

## Build and Getting Started

### Workspace Setup

To set up the complete development environment, organize your directories as siblings:

```
workspace-dir/
├── aim3d/           # This repository (main project code)
├── opensource/      # Reference open-source projects (OCCT, Clipper2, etc.)
└── wiki/            # Sibling wiki repository for tracking progress and design docs
```

1. **Clone the project and the wiki as siblings**:
   ```bash
   git clone git@github.com:nathantsoi/aim3d.git
   git clone git@github.com:nathantsoi/aim3d-wiki.git wiki
   ```

2. **Check out the reference open-source code**:
   Run the provided checkout script to clone and pin all required reference open-source projects in the sibling `opensource/` directory:
   ```bash
   cd aim3d
   ./scripts/checkout-opensource.sh
   ```

### Prerequisites
- C++17 compiler (GCC, Clang, AppleClang, or MSVC)
- CMake 3.18+
- Python 3.9+
- Node.js 18+ and npm
- Rust toolchain with Cargo
- OpenCASCADE/OCCT for native B-rep import/export work. The wiki selects OCCT as the initial kernel and the monorepo includes source at `../opensource/OCCT`; pass `-DAIM3D_ENABLE_OCCT=ON -DAIM3D_OCCT_DIR=/path/to/occt/package` after OCCT has been configured and built.

### Standard Commands
```bash
cd aim3d
make build
make run
make clean
```

The project is managed through the single top-level commands:

- `make build`: installs dependencies, then builds the C++ core, web frontend, and Tauri desktop shell.
- `make run`: installs dependencies, starts the Vite frontend dev server on `127.0.0.1:1420`, and launches the Tauri shell.
- `make clean`: removes local build artifacts, the local Python virtualenv, dependency folders, and generated caches.

Python dependencies are installed into a repo-local `.venv` so Homebrew/PEP 668 managed Python installations are not modified.

Run tests with:

```bash
make test
```

By default, the core builds without linking OCCT so the scaffold can compile in a clean environment. To require OCCT-backed geometry support:

```bash
make build AIM3D_ENABLE_OCCT=1 AIM3D_OCCT_DIR=/path/to/occt/cmake/package
```

The Python package currently exposes the Tier 1/2 scaffold: modern `aim3d.*` modules and Fusion-compatible `adsk.*` facade modules.

### Microcontroller (MCU) Firmware Setup (STM32)

`aim3d` includes a bare-metal microcontroller controller firmware subproject under [mcu/stm32](mcu/stm32/) designed to run on STM32F103 boards (e.g., Blue Pill). It decodes G-code step segments sent over USART serial using a Klipper-style protocol and drives motor stepper outputs.

To build the firmware:
1. Ensure `arm-none-eabi-gcc` toolchain is installed and on your PATH.
2. Run compile commands:
   ```bash
   cd mcu/stm32
   make
   ```
3. To flash the compiled binary to the board over serial:
   ```bash
   make flash
   ```
   For detailed pin configurations, clock parameters, and hardware safety configurations (E-stop & limits), refer to the [mcu/stm32/README.md](mcu/stm32/README.md).

### Component Commands

The Makefile also exposes component targets for debugging:

```bash
make build-core
make build-frontend
make build-tauri
make test-core
make test-python
```

Use `make deps` directly only when you want to refresh dependencies without building or running the app.

### Performance Profiling (Wasm & C++ Core)

To profile the performance of the WebAssembly-compiled C++ core and the Vue frontend together:

1. **Enable Debug Symbols**: The core's CMake builds are configured to emit DWARF debug symbols (via the `-g` compile and linker flags). Make sure to rebuild the project to apply them:
   ```bash
   make clean && make build
   ```
2. **Launch the Dev Server**: Run the dev server to start the frontend:
   ```bash
   make run
   ```
3. **Use Standalone Chrome (macOS Webview limitation)**: Because Tauri on macOS uses `WKWebView` (Safari's engine) which does not support Chrome extensions, you must profile using a standalone Google Chrome browser.
4. **Install the DWARF Extension**: In Google Chrome, install the [C/C++ DevTools Support (DWARF) Extension](https://chromewebstore.google.com/detail/cc++-devtools-support-dwa/pdcpmagijalfljmkmjngeonclgbbannb).
5. **Enable WebAssembly Debugging**: Open Chrome DevTools, click the gear settings icon, select **Experiments**, and ensure **"WebAssembly Debugging: Enable DWARF support"** is enabled. See the Chrome Developer blog post [Debugging WebAssembly with modern tools](https://developer.chrome.com/docs/devtools/wasm) for more details.
6. **Record a Profile**:
   - Navigate to `http://127.0.0.1:1420` in Chrome.
   - Open Chrome DevTools and switch to the **Performance** tab.
   - Click **Record**, interact with the application (e.g. click the Z+ jog button), wait for the lag/action to complete, and click **Stop**.
   - The generated flamegraph under the main thread will display de-mangled C++ function calls (e.g., `MachineSimulator` methods) directly interwoven with your JavaScript execution stack.

---

## Current Validation Status

- C++ core: `make test-core` is expected to pass from the top-level `aim3d` directory.
- Python: `make deps` installs the editable package and test dependencies before `make test-python`.
- Frontend/Tauri: `make deps` installs Node packages; Cargo dependency resolution requires network access unless crates are already cached.

---

## Roadmap Step A1: Headless Document Core

The first roadmap milestone is Track A, Milestone A1. The implemented scaffold now includes:

- A headless `Application` that owns document lifecycle, active document state, zero-document behavior, and event dispatch.
- A `Document` model that owns Design/CAM products, stable entity IDs, dirty state, file path, imported B-rep body records, and inspection metadata.
- Background geometry task APIs for import and body inspection, with task snapshots and structured event notifications.
- CTest coverage for document lifecycle, body import/inspection, and async geometry task completion.

Raw OCCT handles must remain behind the C++ core facade. Python, CAM, and UI layers should consume aim3d-owned IDs, serialized state, and contiguous buffers rather than kernel-native types.
