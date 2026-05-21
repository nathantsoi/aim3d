cmake_minimum_required(VERSION 3.18)
project(aim3d VERSION 0.1.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Configure output directories for binary and library builds
set(CMAKE_RUNTIME_OUTPUT_DIRECTORY ${CMAKE_BINARY_DIR}/bin)
set(CMAKE_LIBRARY_OUTPUT_DIRECTORY ${CMAKE_BINARY_DIR}/lib)
set(CMAKE_ARCHIVE_OUTPUT_DIRECTORY ${CMAKE_BINARY_DIR}/lib)

# Setup Compiler flags
if(NOT MSVC)
    add_compile_options(-Wall -Wextra -Wpedantic -O3)
else()
    add_compile_options(/W4 /O2 /EHsc)
endif()

message(STATUS "Configuring aim3d in ${CMAKE_CURRENT_SOURCE_DIR}")

# Build Core and Solvers
add_subdirectory(core)

# Target options for building tests
option(BUILD_TESTING "Build unit tests" ON)
if(BUILD_TESTING)
    enable_testing()
    message(STATUS "Unit tests enabled for aim3d_core")
endif()
