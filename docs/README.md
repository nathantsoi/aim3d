# aim3d System Documentation

Welcome to the aim3d documentation suite. aim3d is an integrated 3D CAD, CAM, and CNC Control platform designed for modern, high-performance manufacturing environments, specifically targeting NVIDIA Jetson Orin Nano for edge-compute real-time execution.

## System Architecture

aim3d uses a unidirectional data flow and a modular architecture, splitting responsibilities between a high-performance native core, a Python orchestrator/daemon, and a modern web frontend.

### Component Overview

1. **Native Core (C++)**: Handles heavy computational lifting including the OpenCASCADE CAD wrapper, Visual IR compilation, path generation, and the lightweight 2.5D heightmap simulator.
2. **Orchestrator Daemon (Python)**: Provides the REST API backend, manages the `ControllerSession`, interfaces with the Native Core via C-FFI (ctypes), and communicates with the Jetson SPE firmware via the HAL.
3. **Frontend UI (Tauri / Vue / Pinia / WebGPU)**: Provides the user interface. It communicates via REST API to the daemon and visualizes state using a highly optimized WebGPU renderer.
4. **SPE Firmware (C)**: Bare-metal Cortex-R5 execution on the NVIDIA Jetson Orin Nano. Handles real-time Step/Dir generation, E-stop, and hardware interfacing.

### Component Guides

For detailed information on using, evaluating, and developing each part of the system, refer to the following sub-guides:

*   **[User Guide & End-to-End Workflow](user_guide.md)**: A complete walkthrough of navigating the UI, designing a part, generating toolpaths, simulating, and running it on a CNC.
*   **[CAD Engine](cad.md)**: Details on sketching, constraints, 3D modeling, and the OpenCASCADE wrapper.
*   **[CAM Engine](cam.md)**: Details on the Visual IR (Intermediate Representation) and toolpath generation algorithms.
*   **[Simulation Engine](simulation.md)**: Details on the lightweight C++ 2.5D subtractive simulator and its API.
*   **[Controller & Firmware](controller.md)**: Details on the Python REST daemon, Jetson SPE integration, and deploying to hardware.

## Quick Start

To build and run the development environment locally:

```bash
cd aim3d
make build
make run
```
