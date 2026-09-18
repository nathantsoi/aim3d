# Controller & Firmware Documentation

aim3d targets an **STM32 microcontroller** as its machine controller. The MCU firmware itself is not part of this repository — it is built and maintained in the sibling [`aic3d`](../../aic3d) project, which owns the STM32F401 ("Black Pill") firmware, its CRC16-framed serial protocol, and an independent safety supervisor for E-stop/limit handling. aim3d is the design/CAM/simulation application; aic3d is the machine controller.

## Architecture

1.  **Python Controller Daemon** (`python/aim3d/daemon.py`): A local HTTP + WebSocket server (`Aim3dCncDaemon`). It receives job/state pushes from Python scripts driving the native core (via `python/aim3d/ui_bridge.py`) and relays them to the Tauri/Vue frontend over a `core://changed` WebSocket channel. The frontend's `ui/frontend/src/services/controllerDaemon.js` talks to it over `http://127.0.0.1:8765` by default (overridable via `AIM3D_BRIDGE_HOST`/`AIM3D_BRIDGE_WS_PORT`).
2.  **Native core compilation stack**: `Document`/`addSolidFeature`/CAM operations compile a job into `CanonicalCamIR` (see [cam.md](cam.md)), which can be exported as G-code or the internal Visual IR.
3.  **STM32 firmware (aic3d)**: Runs the real-time step/dir generation, E-stop, and limit-switch handling. See the `aic3d` project's own documentation for its wire protocol, pin map, and build/flash instructions.

## Current implementation status

**There is currently no wired serial bridge from aim3d to STM32 firmware.** This is an open integration gap, not a hidden feature:

- aim3d previously had a native `SerialHardwareController` (`core/src/hardware_controller.cpp`) that spoke a custom XOR-checksum framing matching a since-removed, aim3d-local STM32F103 firmware prototype. It had zero callers anywhere in the running application and a confirmed struct-size mismatch bug, so it was never a working path. It has been removed along with that prototype firmware.
- aic3d already has a complete, working host-side serial transport (`protocol.py`, `serialhdl.py`, `clocksync.py`, `transport.py`) that speaks its own CRC16-CCITT framed protocol to its firmware.
- To actually run a job on hardware, the controller daemon needs a bridge that either (a) shells out to / imports aic3d's host transport to stream compiled toolpaths to the STM32, or (b) has aic3d expose its transport as a library aim3d's daemon can call. Neither exists yet.

### Building the bridge (next steps)

1. Decide the integration seam: aim3d's daemon importing aic3d's Python host package directly (simplest, if both projects are checked out as siblings per the workspace layout) vs. a small IPC/socket handoff between the two daemons.
2. Convert aim3d's compiled `CanonicalCamIR` motion commands into aic3d's `SEGMENT` message format (absolute X/Y/Z in mm·1e-3, entry/exit feed, segment kind) rather than reintroducing aim3d's own wire format.
3. Wire aim3d's `ARM`/`DISARM`/`FEEDHOLD`/`RESUME`/`ESTOP_RESET` semantics onto aic3d's `CONTROL` message and safety-supervisor state machine (today aic3d's `link.c` only implements `STOP`).
4. Surface aic3d's `STATUS`/`FAULT`/`CLOCKSYNC` telemetry back through the daemon to the UI's machine DRO.

## Setup & Deployment Guide

### 1. Python Controller Daemon

```bash
python python/aim3d/daemon.py
```

Environment variables `AIM3D_BRIDGE_HOST` / `AIM3D_BRIDGE_WS_PORT` override the default `127.0.0.1:8765` bind address.

### 2. STM32 Firmware

Build, flash, and pin-configuration instructions live in the `aic3d` repository, not here. Clone it as a sibling directory (see the top-level `README.md` workspace layout) and follow its own setup guide.
