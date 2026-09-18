cmake_minimum_required(VERSION 3.18)

# Core header search paths
include_directories(include)

# Gather source files (including machine_simulator.cpp)
file(GLOB CORE_SOURCES
    src/*.cpp
)

if(EMSCRIPTEN)
    # Enable exception catching for Emscripten
    add_compile_options(-sDISABLE_EXCEPTION_CATCHING=0)
    add_link_options(-sDISABLE_EXCEPTION_CATCHING=0)

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
    # The Emscripten OCCT install under build/occt-install is 32-bit WASM and is
    # unsuitable for native host toolchains (e.g. arm64 macOS). Keep search paths
    # separate so native builds never pick it up by accident.
    set(_aim3d_occt_hints)
    if(AIM3D_OCCT_DIR)
        list(APPEND _aim3d_occt_hints "${AIM3D_OCCT_DIR}")
    endif()
    if(EMSCRIPTEN)
        if(EXISTS "${CMAKE_SOURCE_DIR}/build/occt-install/lib/cmake/opencascade")
            list(APPEND _aim3d_occt_hints
                "${CMAKE_SOURCE_DIR}/build/occt-install/lib/cmake/opencascade")
        endif()
    else()
        if(EXISTS "${CMAKE_SOURCE_DIR}/build/occt-native-install/lib/cmake/opencascade")
            list(APPEND _aim3d_occt_hints
                "${CMAKE_SOURCE_DIR}/build/occt-native-install/lib/cmake/opencascade")
        endif()
        # Homebrew OpenCASCADE (arm64/x86_64 bottles) — easiest host path.
        foreach(_brew_prefix /opt/homebrew /usr/local)
            if(EXISTS "${_brew_prefix}/opt/opencascade/lib/cmake/opencascade")
                list(APPEND _aim3d_occt_hints
                    "${_brew_prefix}/opt/opencascade/lib/cmake/opencascade")
            endif()
        endforeach()
    endif()
    if(_aim3d_occt_hints)
        list(APPEND CMAKE_PREFIX_PATH ${_aim3d_occt_hints})
    elseif(EXISTS "${CMAKE_SOURCE_DIR}/third_party/OCCT")
        if(EMSCRIPTEN)
            message(STATUS "AIM3D_ENABLE_OCCT is ON; run `make build-occt` or pass AIM3D_OCCT_DIR.")
        else()
            message(STATUS "AIM3D_ENABLE_OCCT is ON; install host OpenCASCADE (e.g. `brew install opencascade`), run `make build-occt-native`, or pass AIM3D_OCCT_DIR.")
        endif()
    endif()

    find_package(OpenCASCADE CONFIG REQUIRED)
    message(STATUS "Using OpenCASCADE ${OpenCASCADE_VERSION} from ${OpenCASCADE_DIR}")
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
        LINK_FLAGS "-g -s MODULARIZE=1 -s EXPORT_NAME='createAim3dCore' -s ENVIRONMENT=web -s ALLOW_MEMORY_GROWTH=1 -s MAXIMUM_MEMORY=4GB"
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
    # Provide path to the nc/ fixture directory so tests can load real CAM programs
    target_compile_definitions(aim3d_core_tests PRIVATE
        AIM3D_NC_DIR="${CMAKE_CURRENT_SOURCE_DIR}/nc"
    )
    if(EMSCRIPTEN)
        target_link_options(aim3d_core_tests PRIVATE "-sNODERAWFS=1" "-sALLOW_MEMORY_GROWTH=1")
    endif()
    # Copy nc/ files next to the test binary so ctest finds them via relative path
    file(GLOB NC_FILES "${CMAKE_CURRENT_SOURCE_DIR}/nc/*.nc")
    foreach(NC_FILE ${NC_FILES})
        get_filename_component(NC_FILENAME "${NC_FILE}" NAME)
        configure_file("${NC_FILE}" "${CMAKE_CURRENT_BINARY_DIR}/nc/${NC_FILENAME}" COPYONLY)
    endforeach()
    add_test(NAME aim3d_core_tests COMMAND aim3d_core_tests
             WORKING_DIRECTORY "${CMAKE_CURRENT_BINARY_DIR}")
endif()
