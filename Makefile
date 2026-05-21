SHELL := /bin/sh

CMAKE ?= cmake
CTEST ?= ctest
NPM ?= npm
PYTHON ?= python3

BUILD_DIR ?= build
VENV_DIR ?= .venv
VENV_PYTHON := $(VENV_DIR)/bin/python
FRONTEND_PORT ?= 1420
FRONTEND_HOST ?= 127.0.0.1

CMAKE_ARGS ?= -DBUILD_TESTING=ON
ifeq ($(AIM3D_ENABLE_OCCT),1)
CMAKE_ARGS += -DAIM3D_ENABLE_OCCT=ON
endif
ifneq ($(AIM3D_OCCT_DIR),)
CMAKE_ARGS += -DAIM3D_OCCT_DIR=$(AIM3D_OCCT_DIR)
endif

.PHONY: help build clean run deps python-venv test configure build-core build-frontend build-tauri \
	test-core test-python test-simulation run-frontend run-tauri

help:
	@echo "aim3d build commands"
	@echo "  make build          Build the C++ core, frontend, and Tauri app"
	@echo "  make run            Run the frontend dev server and Tauri shell"
	@echo "  make clean          Remove local build artifacts and caches"
	@echo "  make deps           Install Python and Node dependencies"
	@echo "  make test           Run C++, Python, and simulation tests"
	@echo ""
	@echo "Optional:"
	@echo "  make build AIM3D_ENABLE_OCCT=1 AIM3D_OCCT_DIR=/path/to/occt/package"

build: deps build-core build-frontend build-tauri

python-venv:
	$(PYTHON) -m venv $(VENV_DIR)
	$(VENV_PYTHON) -m pip install --upgrade pip

deps: python-venv
	cd python && ../$(VENV_PYTHON) -m pip install -e ".[test]"
	cd simulation && ../$(VENV_PYTHON) -m pip install numpy pytest taichi
	cd ui/frontend && $(NPM) install
	cd ui && $(NPM) install

configure:
	$(CMAKE) -S . -B $(BUILD_DIR) $(CMAKE_ARGS)

build-core: configure
	$(CMAKE) --build $(BUILD_DIR)

build-frontend:
	cd ui/frontend && $(NPM) run build

build-tauri:
	cd ui && $(NPM) run build

test: deps test-core test-python test-simulation

test-core: build-core
	$(CTEST) --test-dir $(BUILD_DIR) --output-on-failure

test-python:
	cd python && ../$(VENV_PYTHON) -m pytest tests

test-simulation:
	cd simulation && ../$(VENV_PYTHON) -m pytest tests

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
