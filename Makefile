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
OCCT_NATIVE_BUILD_DIR ?= $(BUILD_DIR)/occt-native
OCCT_NATIVE_INSTALL_DIR ?= $(BUILD_DIR)/occt-native-install
OCCT_BUILD_JOBS ?= 2
OCCT_TOOLKITS ?= TKernel;TKMath;TKG2d;TKG3d;TKGeomBase;TKBRep;TKGeomAlgo;TKTopAlgo;TKPrim;TKShHealing;TKDE;TKXSBase;TKDESTEP;TKDEIGES;TKDECascade
OCCT_CMAKE_COMMON_ARGS = \
	-DCMAKE_BUILD_TYPE=Release \
	-DCMAKE_EXPORT_NO_PACKAGE_REGISTRY=ON \
	-DBUILD_LIBRARY_TYPE=Static \
	-DBUILD_TOOLKITS="$(OCCT_TOOLKITS)" \
	-DBUILD_MODULE_Visualization=OFF \
	-DBUILD_MODULE_Draw=OFF \
	-DUSE_TK=OFF \
	-DUSE_FREETYPE=OFF \
	-DUSE_FREEIMAGE=OFF \
	-DUSE_VTK=OFF \
	-DUSE_TBB=OFF \
	-DUSE_RAPIDJSON=OFF

# Prefer an explicit AIM3D_OCCT_DIR; otherwise the Emscripten install for WASM builds.
CMAKE_ARGS ?= -DBUILD_TESTING=ON
CMAKE_ARGS += -DAIM3D_ENABLE_OCCT=ON
ifneq ($(AIM3D_OCCT_DIR),)
CMAKE_ARGS += -DAIM3D_OCCT_DIR=$(AIM3D_OCCT_DIR)
else
CMAKE_ARGS += -DAIM3D_OCCT_DIR=$(abspath $(OCCT_INSTALL_DIR)/lib/cmake/opencascade)
endif

# Host OpenCASCADE for native (non-Emscripten) builds. Prefer a locally built
# OCCT 8.x install, then Homebrew. Never fall back to the Emscripten/WASM
# install under build/occt-install (32-bit, unsuitable for host ARM/x86_64).
BREW_OCCT_CMAKE := $(shell for p in /opt/homebrew /usr/local; do \
	if [ -d "$$p/opt/opencascade/lib/cmake/opencascade" ]; then echo "$$p/opt/opencascade/lib/cmake/opencascade"; break; fi; \
	done)
WASM_OCCT_CMAKE := $(abspath $(OCCT_INSTALL_DIR)/lib/cmake/opencascade)
ifneq ($(wildcard $(OCCT_NATIVE_INSTALL_DIR)/lib/cmake/opencascade/OpenCASCADEConfig.cmake),)
NATIVE_OCCT_DIR ?= $(abspath $(OCCT_NATIVE_INSTALL_DIR)/lib/cmake/opencascade)
else ifneq ($(BREW_OCCT_CMAKE),)
NATIVE_OCCT_DIR ?= $(BREW_OCCT_CMAKE)
else ifneq ($(AIM3D_OCCT_DIR),)
ifneq ($(AIM3D_OCCT_DIR),$(WASM_OCCT_CMAKE))
NATIVE_OCCT_DIR ?= $(AIM3D_OCCT_DIR)
endif
endif
ifndef NATIVE_OCCT_DIR
NATIVE_OCCT_DIR :=
endif

.PHONY: help build build-fast clean run deps test test-all test-verbose verbose-test verbose configure build-occt build-occt-native build-core build-core-fast build-native build-frontend build-tauri \
	test-core test-core-verbose test-frontend test-voxelizer test-webgpu test-python test-simulation test-e2e \
	test-coverage test-coverage-frontend test-coverage-python test-coverage-core \
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
	@echo "  make test-e2e       Run the browser e2e pipeline test (gcode -> motion -> WebGPU cutting)"
	@echo "Coverage:"
	@echo "  make test-coverage  Collect coverage across frontend, Python, and C++ core"
	@echo "  make test-coverage-frontend  Frontend vitest coverage (v8) -> ui/frontend/coverage"
	@echo "  make test-coverage-python    Python coverage (coverage.py) -> python/htmlcov"
	@echo "  make test-coverage-core      C++ core coverage (llvm-cov) -> build-coverage/coverage-core"
	@echo ""
	@echo "Hooks & CI:"
	@echo "  make install-hooks  Install the pre-push git hook (runs test-voxelizer before push)"
	@echo ""
	@echo "Optional:"
	@echo "  make build-occt        Build vendored OCCT (Emscripten/WASM) into build/occt-install"
	@echo "  make build-occt-native Build vendored OCCT 8.x for the host into build/occt-native-install"
	@echo "  make build-occt OCCT_BUILD_JOBS=1"
	@echo "  make build AIM3D_OCCT_DIR=/path/to/occt/cmake/package"
	@echo "  Native OCCT: brew install opencascade  (easiest) or make build-occt-native (OCCT 8.x)"

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
		-DCMAKE_INSTALL_PREFIX=$(abspath $(OCCT_INSTALL_DIR)) \
		-DINSTALL_DIR=$(abspath $(OCCT_INSTALL_DIR)) \
		$(OCCT_CMAKE_COMMON_ARGS)"
	bash -c "$(EMSDK_ENV) && emmake $(CMAKE) --build $(OCCT_BUILD_DIR) --target install --parallel $(OCCT_BUILD_JOBS)"

# Host-toolchain OCCT from the vendored 8.x tree. Prefer this over Homebrew when
# you want native builds to match the WASM OCCT major version.
build-occt-native:
	$(CMAKE) -S third_party/OCCT -B $(OCCT_NATIVE_BUILD_DIR) \
		-DCMAKE_INSTALL_PREFIX=$(abspath $(OCCT_NATIVE_INSTALL_DIR)) \
		-DINSTALL_DIR=$(abspath $(OCCT_NATIVE_INSTALL_DIR)) \
		$(OCCT_CMAKE_COMMON_ARGS)
	$(CMAKE) --build $(OCCT_NATIVE_BUILD_DIR) --target install --parallel $(OCCT_BUILD_JOBS)

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
# Enables OCCT when a host-compatible package is available (native 8.x install
# or Homebrew). Falls back to OCCT=OFF only when none is found. The shared
# library is symlinked into build/lib so python/aim3d/_native.py can find it.
NATIVE_BUILD_DIR ?= build-native

build-native:
	@native_args="-DBUILD_TESTING=ON"; \
	if [ -n "$(NATIVE_OCCT_DIR)" ]; then \
		echo "Configuring native build with OCCT ($(NATIVE_OCCT_DIR)) in $(NATIVE_BUILD_DIR)…"; \
		native_args="$$native_args -DAIM3D_ENABLE_OCCT=ON -DAIM3D_OCCT_DIR=$(NATIVE_OCCT_DIR)"; \
	else \
		echo "Configuring native build (OCCT disabled; brew install opencascade or make build-occt-native) in $(NATIVE_BUILD_DIR)…"; \
		native_args="$$native_args -DAIM3D_ENABLE_OCCT=OFF"; \
	fi; \
	if [ ! -f $(NATIVE_BUILD_DIR)/CMakeCache.txt ]; then \
		$(CMAKE) -S . -B $(NATIVE_BUILD_DIR) $$native_args; \
	else \
		$(CMAKE) -S . -B $(NATIVE_BUILD_DIR) $$native_args >/dev/null; \
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

# --- Coverage ---------------------------------------------------------------
# Collects line+branch coverage across the frontend (v8), Python (coverage.py),
# and C++ core (llvm-cov). HTML reports land under ui/frontend/coverage,
# python/htmlcov, and build/coverage-core respectively. Requires the matching
# coverage tooling (@vitest/coverage-v8, pytest-cov, llvm/xcode tooling).
test-coverage: test-coverage-frontend test-coverage-python test-coverage-core

test-coverage-frontend:
	cd ui/frontend && $(NPM) run test:coverage

test-coverage-python: build-native
	@if [ ! -x "$(PYTEST)" ]; then echo "Error: $(PYTEST) not found. Run: make deps"; exit 1; fi
	cd python && ../$(PYTEST) tests --cov=aim3d --cov-branch --cov-report=term-missing --cov-report=html

# Builds the C++ core with coverage instrumentation and runs the gtest binary
# under llvm-cov. Only the sources under core/src are measured. Requires a
# Clang/Xcode toolchain that ships llvm-cov and llvm-profdata.
COVERAGE_BUILD_DIR ?= build-coverage
test-coverage-core:
	bash -c "$(EMSDK_ENV) && emcmake $(CMAKE) -S . -B $(COVERAGE_BUILD_DIR) \
		$(CMAKE_ARGS) -DCMAKE_CXX_FLAGS='-fprofile-instr-generate -fcoverage-mapping -O0 -g' \
		-DCMAKE_EXE_LINKER_FLAGS='-fprofile-instr-generate'"
	bash -c "$(EMSDK_ENV) && emmake $(CMAKE) --build $(COVERAGE_BUILD_DIR)"
	bash -c "$(EMSDK_ENV) && cd $(COVERAGE_BUILD_DIR)/bin && \
		LLVM_PROFILE_FILE=aim3d_core.profraw node aim3d_core_tests.js && \
		xcrun llvm-profdata merge -sparse aim3d_core.profraw -o aim3d_core.profdata && \
		xcrun llvm-cov show -instr-profile=aim3d_core.profdata -format=html \
			$(COVERAGE_BUILD_DIR)/bin/aim3d_core_tests.js $(COVERAGE_BUILD_DIR)/../core/src \
			-o $(COVERAGE_BUILD_DIR)/coverage-core"
	@echo "C++ core coverage report: $(COVERAGE_BUILD_DIR)/coverage-core/index.html"

# The gcode -> motion -> cutting pipeline is now exercised end-to-end in a real
# browser via Playwright (WebGPU voxelizer is the single cutting path). The old
# headless native-mesh LinuxCNC interp test has been removed.
test-simulation: test-e2e

# End-to-end pipeline test: rebuilds the WASM core (so public/aim3d_core.js is
# in sync with C++ changes), starts the Vite dev server, and runs the Playwright
# suite which drives a G-code program through the store and asserts the WebGPU
# voxelizer removed material. Requires `npx playwright install chromium`.
test-e2e: build-core
	@bash scripts/run-e2e.sh

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
		find $(BUILD_DIR) -mindepth 1 -maxdepth 1 ! -name "occt" ! -name "occt-install" ! -name "occt-native" ! -name "occt-native-install" -exec rm -rf {} +; \
	fi
	rm -rf ui/frontend/dist ui/frontend/node_modules ui/node_modules ui/src-tauri/target
	rm -rf ui/frontend/public/aim3d_core.js ui/frontend/public/aim3d_core.wasm
	find . -type d -name __pycache__ -prune -exec rm -rf {} +

clean-all:
	rm -rf $(BUILD_DIR)
	rm -rf ui/frontend/dist ui/frontend/node_modules ui/node_modules ui/src-tauri/target
	rm -rf ui/frontend/public/aim3d_core.js ui/frontend/public/aim3d_core.wasm
	find . -type d -name __pycache__ -prune -exec rm -rf {} +
