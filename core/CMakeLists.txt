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

# Set library properties
set_target_properties(aim3d_core PROPERTIES
    VERSION ${PROJECT_VERSION}
    SOVERSION 1
)

message(STATUS "Core library target aim3d_core configured with ${CORE_SOURCES}")
