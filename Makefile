SHELL := /bin/sh

CMAKE ?= cmake
CTEST ?= ctest
PYTHON ?= python3
NPM ?= npm
ONLINE := $(shell $(PYTHON) -c "import socket; socket.setdefaulttimeout(1); socket.socket(socket.AF_INET, socket.SOCK_STREAM).connect(('8.8.8.8', 53))" >/dev/null 2>&1 && echo 1 || echo 0)


BUILD_DIR ?= build
EMSDK_DIR ?= .emsdk
EMSDK_ENV ?= source $(EMSDK_DIR)/emsdk_env.sh
FRONTEND_PORT ?= 1420
FRONTEND_HOST ?= 127.0.0.1
OCCT_BUILD_DIR ?= $(BUILD_DIR)/occt
OCCT_INSTALL_DIR ?= $(BUILD_DIR)/occt-install
OCCT_BUILD_JOBS ?= 2
OCCT_TOOLKITS ?= TKernel;TKMath;TKG2d;TKG3d;TKGeomBase;TKBRep;TKGeomAlgo;TKTopAlgo;TKPrim;TKShHealing;TKDE;TKXSBase;TKDESTEP;TKDEIGES;TKDECascade

CMAKE_ARGS ?= -DBUILD_TESTING=ON
CMAKE_ARGS += -DAIM3D_ENABLE_OCCT=ON
ifneq ($(AIM3D_OCCT_DIR),)
CMAKE_ARGS += -DAIM3D_OCCT_DIR=$(AIM3D_OCCT_DIR)
else
CMAKE_ARGS += -DAIM3D_OCCT_DIR=$(abspath $(OCCT_INSTALL_DIR)/lib/cmake/opencascade)
endif

.PHONY: help build build-fast clean run deps test test-all test-verbose verbose-test verbose configure build-occt build-core build-core-fast build-native build-frontend build-tauri \
	test-core test-core-verbose test-frontend test-voxelizer test-webgpu test-python test-simulation \
	run-frontend run-tauri emsdk install-hooks

help:
	@echo "aim3d build commands"
	@echo "  make build          Build the C++ core, frontend, and Tauri app"
	@echo "  make build-fast     Build only changes to aim3d core, frontend, and Tauri (skips OCCT)"
	@echo "  make run            Run the frontend dev server and Tauri shell"
	@echo "  make clean          Remove local build artifacts and caches"
	@echo "  make deps           Install Emscripten and Node dependencies"
	@echo "Testing:"
	@echo "  make test-all       Run all test suites (C++ core, frontend, and Python)"
	@echo "  make test           Run the C++ core tests (Emscripten + ctest)"
	@echo "  make test-verbose   Run C++ tests with full output for failures"
	@echo "  make test-frontend  Run the full frontend vitest suite (jsdom/node)"
	@echo "  make test-voxelizer Run the JS SDF/IoU + WGSL parity tests (no GPU, fast)"
	@echo "  make test-webgpu    Run the real-shader WebGPU voxelizer test (headless Chrome)"
	@echo "  make test-python    Run the Python integration tests (needs a native core build)"
	@echo "  make test-simulation Run the G-code/simulation Python tests (needs a native core build)"
	@echo ""
	@echo "Hooks & CI:"
	@echo "  make install-hooks  Install the pre-push git hook (runs test-voxelizer before push)"
	@echo ""
	@echo "Optional:"
	@echo "  make build-occt     Build vendored OpenCASCADE into build/occt-install"
	@echo "  make build-occt OCCT_BUILD_JOBS=1"
	@echo "  make build AIM3D_OCCT_DIR=/path/to/occt/cmake/package"

build: deps build-core build-frontend build-tauri

build-fast: build-core-fast build-frontend build-tauri


emsdk:
	@if [ ! -d "$(EMSDK_DIR)" ]; then \
		git clone https://github.com/emscripten-core/emsdk.git $(EMSDK_DIR); \
		cd $(EMSDK_DIR) && ./emsdk install latest && ./emsdk activate latest; \
	fi

deps: emsdk
	@if [ "$(ONLINE)" = "1" ]; then \
		echo "Online: Installing/updating dependencies..."; \
		(cd ui/frontend && $(NPM) install); \
		(cd ui && $(NPM) install); \
	else \
		echo "Offline: Checking if dependencies are already installed..."; \
		if [ -d "ui/frontend/node_modules" ] && [ -d "ui/node_modules" ] && [ -d "$(EMSDK_DIR)" ]; then \
			echo "Dependencies found. Skipping updates."; \
		else \
			echo "Error: Offline and missing required dependencies."; \
			echo "Please connect to the internet to perform the initial setup."; \
			exit 1; \
		fi; \
	fi

configure:
	bash -c "$(EMSDK_ENV) && emcmake $(CMAKE) -S . -B $(BUILD_DIR) $(CMAKE_ARGS)"

build-occt:
	bash -c "$(EMSDK_ENV) && emcmake $(CMAKE) -S third_party/OCCT -B $(OCCT_BUILD_DIR) \
		-DCMAKE_BUILD_TYPE=Release \
		-DCMAKE_EXPORT_NO_PACKAGE_REGISTRY=ON \
		-DCMAKE_INSTALL_PREFIX=$(abspath $(OCCT_INSTALL_DIR)) \
		-DINSTALL_DIR=$(abspath $(OCCT_INSTALL_DIR)) \
		-DBUILD_LIBRARY_TYPE=Static \
		-DBUILD_TOOLKITS=\"$(OCCT_TOOLKITS)\" \
		-DBUILD_MODULE_Visualization=OFF \
		-DBUILD_MODULE_Draw=OFF \
		-DUSE_TK=OFF \
		-DUSE_FREETYPE=OFF \
		-DUSE_FREEIMAGE=OFF \
		-DUSE_VTK=OFF \
		-DUSE_TBB=OFF \
		-DUSE_RAPIDJSON=OFF"
	bash -c "$(EMSDK_ENV) && emmake $(CMAKE) --build $(OCCT_BUILD_DIR) --target install --parallel $(OCCT_BUILD_JOBS)"

build-core: build-occt configure
	bash -c "$(EMSDK_ENV) && emmake $(CMAKE) --build $(BUILD_DIR)"

build-core-fast:
	bash -c "$(EMSDK_ENV) && emmake $(CMAKE) --build $(BUILD_DIR)"

build-frontend:
	cd ui/frontend && $(NPM) run build

build-tauri:
	cd ui && $(NPM) run build

test: deps test-core

test-all: test-core test-frontend test-python

test-verbose: deps test-core-verbose

verbose-test: test-verbose

verbose: test-verbose

test-core: build-core
	$(CTEST) --test-dir $(BUILD_DIR) --output-on-failure

test-core-verbose: build-core
	bash -c "$(EMSDK_ENV) && cd $(BUILD_DIR)/bin && node aim3d_core_tests.js"

test-voxelizer:
	cd ui/frontend && $(NPM) run test:voxelizer

test-webgpu:
	cd ui/frontend && $(NPM) run test:webgpu

test-frontend:
	cd ui/frontend && $(NPM) run test

# Build the native (non-Emscripten) core library for Python ctypes FFI.
# Uses the host compiler with OCCT disabled so it builds without the OCCT
# dependency. Only the library target is built (the native test binary needs
# extra headers; the Emscripten build covers C++ tests). The shared library is
# symlinked into build/lib so python/aim3d/_native.py can find it.
NATIVE_BUILD_DIR ?= build-noocct

build-native:
	@if [ ! -f $(NATIVE_BUILD_DIR)/CMakeCache.txt ]; then \
		echo "Configuring native build (OCCT disabled) in $(NATIVE_BUILD_DIR)…"; \
		$(CMAKE) -S . -B $(NATIVE_BUILD_DIR) -DBUILD_TESTING=ON -DAIM3D_ENABLE_OCCT=OFF; \
	fi
	@echo "Building native libaim3d_core…"
	$(CMAKE) --build $(NATIVE_BUILD_DIR) --target aim3d_core
	@mkdir -p $(BUILD_DIR)/lib
	@# Symlink the native shared library into build/lib so python/aim3d/_native.py finds it.
	@lib="$$(ls $(NATIVE_BUILD_DIR)/lib/libaim3d_core.dylib $(NATIVE_BUILD_DIR)/lib/libaim3d_core.so 2>/dev/null | head -1)"; \
	if [ -n "$$lib" ]; then \
		ln -sf "../../$(NATIVE_BUILD_DIR)/lib/$$(basename $$lib)" $(BUILD_DIR)/lib/$$(basename $$lib); \
		echo "Symlinked $$(basename $$lib) into $(BUILD_DIR)/lib for Python ctypes FFI"; \
	else \
		echo "Warning: native libaim3d_core not found in $(NATIVE_BUILD_DIR)/lib"; \
	fi

# Python integration tests require the native core library (ctypes FFI) and the
# repo-local .venv. build-native is a prerequisite.
PYTEST ?= .venv/bin/pytest

test-python: build-native
	@if [ ! -x "$(PYTEST)" ]; then echo "Error: $(PYTEST) not found. Run: make deps  (or: python3 -m venv .venv && .venv/bin/pip install -e python)"; exit 1; fi
	cd python && ../$(PYTEST) tests

test-simulation: build-native
	@if [ ! -x "$(PYTEST)" ]; then echo "Error: $(PYTEST) not found. Run: make deps  (or: python3 -m venv .venv && .venv/bin/pip install -e python)"; exit 1; fi
	cd python && ../$(PYTEST) tests/test_linuxcnc_interp.py tests/test_controller_visual_ir.py

# Install the project's git hooks (see .githooks/pre-push). Sets core.hooksPath
# so git uses .githooks/ instead of .git/hooks/. Bypass a push with --no-verify
# or AIM3D_SKIP_TESTS=1.
install-hooks:
	@git config core.hooksPath .githooks
	@chmod +x .githooks/pre-push 2>/dev/null || true
	@echo "Git hooks installed (core.hooksPath = .githooks)."
	@echo "  pre-push: runs 'make test-voxelizer' (fast, GPU-free) before every push."
	@echo "  Bypass with: git push --no-verify  or  AIM3D_SKIP_TESTS=1 git push"

run: deps run-tauri

run-frontend:
	cd ui/frontend && $(NPM) run dev -- --host $(FRONTEND_HOST) --port $(FRONTEND_PORT)

run-tauri:
	@set -e; \
	cd ui/frontend; \
	$(NPM) run dev -- --host $(FRONTEND_HOST) --port $(FRONTEND_PORT) & \
	frontend_pid=$$!; \
	trap 'kill $$frontend_pid 2>/dev/null || true' EXIT INT TERM; \
	cd ../; \
	$(NPM) run dev

clean:
	@if [ -d "$(BUILD_DIR)" ]; then \
		find $(BUILD_DIR) -mindepth 1 -maxdepth 1 ! -name "occt" ! -name "occt-install" -exec rm -rf {} +; \
	fi
	rm -rf ui/frontend/dist ui/frontend/node_modules ui/node_modules ui/src-tauri/target
	rm -rf ui/frontend/public/aim3d_core.js ui/frontend/public/aim3d_core.wasm
	find . -type d -name __pycache__ -prune -exec rm -rf {} +

clean-all:
	rm -rf $(BUILD_DIR)
	rm -rf ui/frontend/dist ui/frontend/node_modules ui/node_modules ui/src-tauri/target
	rm -rf ui/frontend/public/aim3d_core.js ui/frontend/public/aim3d_core.wasm
	find . -type d -name __pycache__ -prune -exec rm -rf {} +
