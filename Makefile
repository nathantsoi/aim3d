SHELL := /bin/sh

CMAKE ?= cmake
CTEST ?= ctest
NPM ?= npm
PYTHON ?= python3
ONLINE := $(shell $(PYTHON) -c "import socket; socket.setdefaulttimeout(1); socket.socket(socket.AF_INET, socket.SOCK_STREAM).connect(('8.8.8.8', 53))" >/dev/null 2>&1 && echo 1 || echo 0)


BUILD_DIR ?= build
VENV_DIR ?= .venv
VENV_PYTHON := $(VENV_DIR)/bin/python
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

.PHONY: help build clean run deps python-venv test test-verbose verbose-test verbose configure build-occt build-core build-frontend build-tauri \
	test-core test-python test-simulation test-core-verbose test-python-verbose test-simulation-verbose run-frontend run-tauri

help:
	@echo "aim3d build commands"
	@echo "  make build          Build the C++ core, frontend, and Tauri app"
	@echo "  make run            Run the frontend dev server and Tauri shell"
	@echo "  make clean          Remove local build artifacts and caches"
	@echo "  make deps           Install Python and Node dependencies"
	@echo "  make test           Run C++, Python, and simulation tests"
	@echo "  make test-verbose   Run tests with full output for failures"
	@echo ""
	@echo "Optional:"
	@echo "  make build-occt     Build vendored OpenCASCADE into build/occt-install"
	@echo "  make build-occt OCCT_BUILD_JOBS=1"
	@echo "  make build AIM3D_OCCT_DIR=/path/to/occt/cmake/package"

build: deps build-core build-frontend build-tauri

python-venv:
	@if [ ! -d "$(VENV_DIR)" ]; then \
		$(PYTHON) -m venv $(VENV_DIR); \
	fi
	@if [ "$(ONLINE)" = "1" ]; then \
		$(VENV_PYTHON) -m pip install --upgrade pip; \
	else \
		echo "Offline: Skipping pip upgrade."; \
	fi

deps:
	@if [ "$(ONLINE)" = "1" ]; then \
		echo "Online: Installing/updating dependencies..."; \
		$(MAKE) python-venv; \
		(cd python && ../$(VENV_PYTHON) -m pip install -e ".[test]"); \
		(cd simulation && ../$(VENV_PYTHON) -m pip install numpy pytest taichi); \
		(cd ui/frontend && $(NPM) install); \
		(cd ui && $(NPM) install); \
	else \
		echo "Offline: Checking if dependencies are already installed..."; \
		if [ -d "$(VENV_DIR)" ] && [ -d "ui/frontend/node_modules" ] && [ -d "ui/node_modules" ]; then \
			echo "Dependencies found. Skipping updates."; \
		else \
			echo "Error: Offline and missing required dependencies."; \
			echo "Please connect to the internet to perform the initial setup."; \
			exit 1; \
		fi; \
	fi

configure:
	$(CMAKE) -S . -B $(BUILD_DIR) $(CMAKE_ARGS)

build-occt:
	$(CMAKE) -S third_party/OCCT -B $(OCCT_BUILD_DIR) \
		-DCMAKE_BUILD_TYPE=Release \
		-DCMAKE_EXPORT_NO_PACKAGE_REGISTRY=ON \
		-DCMAKE_INSTALL_PREFIX=$(abspath $(OCCT_INSTALL_DIR)) \
		-DINSTALL_DIR=$(abspath $(OCCT_INSTALL_DIR)) \
		-DBUILD_LIBRARY_TYPE=Shared \
		-DBUILD_TOOLKITS="$(OCCT_TOOLKITS)" \
		-DBUILD_MODULE_Visualization=OFF \
		-DBUILD_MODULE_Draw=OFF \
		-DUSE_TK=OFF \
		-DUSE_FREETYPE=OFF \
		-DUSE_FREEIMAGE=OFF \
		-DUSE_VTK=OFF \
		-DUSE_TBB=OFF \
		-DUSE_RAPIDJSON=OFF
	$(CMAKE) --build $(OCCT_BUILD_DIR) --target install --parallel $(OCCT_BUILD_JOBS)

build-core: build-occt configure
	$(CMAKE) --build $(BUILD_DIR)

build-frontend:
	cd ui/frontend && $(NPM) run build

build-tauri:
	cd ui && $(NPM) run build

test: deps test-core test-python test-simulation

test-verbose: deps test-core-verbose test-python-verbose test-simulation-verbose

verbose-test: test-verbose

verbose: test-verbose

test-core: build-core
	$(CTEST) --test-dir $(BUILD_DIR) --output-on-failure

test-core-verbose: build-core
	$(CTEST) --test-dir $(BUILD_DIR) --output-on-failure --verbose

test-python: build-core
	cd python && ../$(VENV_PYTHON) -m pytest tests

test-python-verbose: build-core
	cd python && ../$(VENV_PYTHON) -m pytest -vv --tb=long --show-capture=all tests

test-simulation:
	cd simulation && ../$(VENV_PYTHON) -m pytest tests

test-simulation-verbose:
	cd simulation && ../$(VENV_PYTHON) -m pytest -vv --tb=long --show-capture=all tests

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
	rm -rf $(BUILD_DIR)
	rm -rf $(VENV_DIR)
	rm -rf ui/frontend/dist ui/frontend/node_modules ui/node_modules ui/src-tauri/target
	rm -rf python/*.egg-info .pytest_cache python/.pytest_cache simulation/.pytest_cache
	find . -type d -name __pycache__ -prune -exec rm -rf {} +
