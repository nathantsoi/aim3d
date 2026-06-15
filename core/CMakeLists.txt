cmake_minimum_required(VERSION 3.18)

# Core header search paths
include_directories(include)

# Gather source files (including machine_simulator.cpp)
file(GLOB CORE_SOURCES
    src/*.cpp
)

if(EMSCRIPTEN)
    # Define toolchain path modes to allow finding local OCCT
    set(CMAKE_FIND_ROOT_PATH_MODE_PACKAGE BOTH)
    set(CMAKE_FIND_ROOT_PATH_MODE_LIBRARY BOTH)
    set(CMAKE_FIND_ROOT_PATH_MODE_INCLUDE BOTH)

    # Exclude wasm_api.cpp from the static library
    list(REMOVE_ITEM CORE_SOURCES "${CMAKE_CURRENT_SOURCE_DIR}/src/wasm_api.cpp")

    # Build the core library as static
    add_library(aim3d_core STATIC ${CORE_SOURCES})
else()
    # Build a shared library for the native core
    add_library(aim3d_core SHARED ${CORE_SOURCES})
endif()

# Target properties
target_include_directories(aim3d_core PUBLIC
    $<BUILD_INTERFACE:${CMAKE_CURRENT_SOURCE_DIR}/include>
    $<INSTALL_INTERFACE:include>
)

if(AIM3D_ENABLE_OCCT)
    if(AIM3D_OCCT_DIR)
        list(APPEND CMAKE_PREFIX_PATH "${AIM3D_OCCT_DIR}")
    elseif(EXISTS "${CMAKE_SOURCE_DIR}/build/occt-install/lib/cmake/opencascade")
        list(APPEND CMAKE_PREFIX_PATH "${CMAKE_SOURCE_DIR}/build/occt-install/lib/cmake/opencascade")
    elseif(EXISTS "${CMAKE_SOURCE_DIR}/third_party/OCCT")
        message(STATUS "AIM3D_ENABLE_OCCT is ON; run `make build-occt` or pass AIM3D_OCCT_DIR to a configured OCCT package.")
    endif()

    find_package(OpenCASCADE CONFIG REQUIRED)
    target_compile_definitions(aim3d_core PUBLIC AIM3D_HAS_OCCT=1)
    target_include_directories(aim3d_core PUBLIC ${OpenCASCADE_INCLUDE_DIR})
    target_link_libraries(aim3d_core PUBLIC ${OpenCASCADE_LIBRARIES})
else()
    target_compile_definitions(aim3d_core PUBLIC AIM3D_HAS_OCCT=0)
endif()

# Set library properties
if(EMSCRIPTEN)
    # Create the final WASM target executable which compiles wasm_api.cpp and links aim3d_core
    add_executable(aim3d_core_wasm src/wasm_api.cpp)
    target_link_libraries(aim3d_core_wasm PRIVATE aim3d_core)

    # Enable embind
    target_link_options(aim3d_core_wasm PRIVATE --bind)
    # Output properties for WASM module
    set_target_properties(aim3d_core_wasm PROPERTIES
        OUTPUT_NAME "aim3d_core"
        SUFFIX ".js"
        LINK_FLAGS "-s MODULARIZE=1 -s EXPORT_NAME='createAim3dCore' -s ENVIRONMENT=web -s ALLOW_MEMORY_GROWTH=1 -s MAXIMUM_MEMORY=4GB"
        RUNTIME_OUTPUT_DIRECTORY "${CMAKE_SOURCE_DIR}/ui/frontend/public"
    )
else()
    set_target_properties(aim3d_core PROPERTIES
        VERSION ${PROJECT_VERSION}
        SOVERSION 1
    )
endif()

message(STATUS "Core library target aim3d_core configured with ${CORE_SOURCES}")

if(BUILD_TESTING)
    add_executable(aim3d_core_tests
        tests/headless_core_tests.cpp
    )
    target_link_libraries(aim3d_core_tests PRIVATE aim3d_core)
    if(AIM3D_ENABLE_OCCT)
        target_link_libraries(aim3d_core_tests PRIVATE ${OpenCASCADE_LIBRARIES})
    endif()
    add_test(NAME aim3d_core_tests COMMAND aim3d_core_tests)
endif()
