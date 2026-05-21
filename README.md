# aim3d: High-Performance Parametric CAD/CAM Platform

`aim3d` is a modular, high-performance, and AI-integrable parametric CAD/CAM system. The platform strictly decouples the heavy computational core from the interactive user interface to achieve extreme execution efficiency, remote headless scaling, and differentiable physical simulation.

---

## Architectural Philosophy

1. **Decoupled Headless Core (C++/Rust):** B-rep parsing, parametric trees, topological naming resolution, and CAM path generation operate in isolation, free from UI thread constraints.
2. **Stateless Thin Client (Tauri / Nuxt / WebGPU):** The client renders a 60fps WebGPU scene based on state streams dispatched by the Core. The UI is a pure projection.
3. **Zero-Copy ML Integrations (Tier 3):** Exposes B-rep geometries, displays meshes, and generates toolpaths as flat contiguous memory views (NumPy/PyTorch compatible), bypassing heavy OOP serialization.
4. **Clean-Room RS274 G-code Validation:** Incorporates a strict 100% clean-room parser that validates posted G-code back into canonical path streams.
5. **Differentiable Manufacturing Engine (Taichi):** SDF subtraction enables gradient backpropagation for neural toolpath optimizations.

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
                         (RS274, Taichi Sparse SDF)
```

---

## Directory Structure Overview

- `core/`: Pure C++ computational engine. Handles parametric document products, topological naming databases, FFI solvers, G-code interpreters, and toolpath strategies.
- `python/`: Two-Tiered Python API Bindings. Exposes native `aim3d.*` async/tensor modules and legacy Fusion `adsk.*` OOP adapters.
- `simulation/`: Taichi SNode Volumetric SDF simulation models.
- `ui/`: Tauri desktop app container and Vue/Nuxt.js WebGPU viewport.

---

## Build and Getting Started

### Prerequisites
- C++17 Compiler (GCC, Clang, or MSVC)
- CMake 3.18+
- Python 3.9+ (with numpy and taichi)
- Node.js 18+ & Rust (for Tauri frontend)

### Building the Headless Core
```bash
cd core
mkdir build && cd build
cmake ..
make -j$(nproc)
```

### Installing Python Bindings
```bash
cd python
pip install -e .
```
