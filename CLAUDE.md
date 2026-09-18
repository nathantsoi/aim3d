# aim3d

Parametric CAD/CAM platform: C++ core (OCCT B-rep) + Tauri/Vue/WebGPU frontend + a two-tier Python API (`aim3d.*` modern, `adsk.*` Fusion 360 compatibility facade).

## Workspace layout

This repo is one of several sibling directories under a shared workspace root:

- `aim3d/` (this repo): all application code and features.
- `aic3d/`: the STM32 machine-controller firmware and its host-side transport. aim3d does not vendor MCU firmware — the machine controller target is STM32, and that firmware lives entirely in `aic3d`. See `docs/controller.md` for the current (unwired) integration boundary between the two projects.
- `opensource/`: reference implementations (OCCT, Clipper2, etc.) — consult for API usage and conventions, don't vendor code from them into aim3d beyond the pinned `third_party/OCCT` submodule.
- `wiki/`: cross-project planning and progress tracking, sibling to this repo.

Code changes go in `aim3d/`. Implementation documentation goes in `aim3d/docs/`. Cross-project planning and progress tracking goes in the sibling `wiki/`.

## Build & test

- Always build with OCCT enabled — `make build` (and `make test-core`) already default `AIM3D_ENABLE_OCCT=ON`; don't disable it.
- `make build` / `make run` / `make test` / `make clean` are the top-level entry points; see `README.md` for the full command reference and `docs/testing.md` for the test architecture.
- Full dev environment (daemon + frontend + Tauri + live test watchers) runs via `tmuxinator start aim3d` using `tmux/.tmuxinator.yaml`.

## Current known gaps (see docs/cad.md and docs/cam.md for the implementation plan)

Most of the `adsk.*` facade's CAD modeling and CAM toolpathing surface is currently pure-Python mock/scaffolding rather than real geometry — only rectangle-profile sketch + extrude is backed by real OCCT solids today. Don't assume a passing `adsk` facade test means the underlying geometry is real; check whether it calls into the native FFI or just manipulates local Python state.
