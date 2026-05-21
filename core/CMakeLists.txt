cmake_minimum_required(VERSION 3.18)

# Core header search paths
include_directories(include)

# Gather source files
file(GLOB CORE_SOURCES
    src/*.cpp
)

# Build a shared library for the headless core
add_library(aim3d_core SHARED ${CORE_SOURCES})

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
    target_link_libraries(aim3d_core PRIVATE ${OpenCASCADE_LIBRARIES})
else()
    target_compile_definitions(aim3d_core PUBLIC AIM3D_HAS_OCCT=0)
endif()

# Set library properties
set_target_properties(aim3d_core PROPERTIES
    VERSION ${PROJECT_VERSION}
    SOVERSION 1
)

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
