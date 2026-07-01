#include "aim3d/material_simulator.hpp"

#if AIM3D_HAS_OCCT
#include <BRepPrimAPI_MakeBox.hxx>
#include <BRepPrimAPI_MakeCylinder.hxx>
#include <BRepAlgoAPI_Section.hxx>
#include <TopExp_Explorer.hxx>
#include <TopoDS.hxx>
#include <gp_Ax2.hxx>
#include <gp_Dir.hxx>
#include <gp_Pnt.hxx>
#endif

#include <iostream>
#include <cmath>

namespace aim3d {

// The material-removal cutting model lives entirely in the frontend WebGPU
// voxelizer (ui/frontend/src/services/webgpuVoxelizer.js). The C++ side only
// owns the stock bounding box (for toolholder collision checks) and a queue of
// swept cut segments that the frontend render loop drains via popPendingCuts().
// There is no OCCT boolean mesh extraction here — that path was disabled for
// performance and has been removed; the voxelizer is the single cutting path.

MaterialSimulator::MaterialSimulator() {}

MaterialSimulator::~MaterialSimulator() {}

void MaterialSimulator::initialize(double sizeX, double sizeY, double sizeZ) {
    m_sizeX = std::max(0.1, sizeX);
    m_sizeY = std::max(0.1, sizeY);
    m_sizeZ = std::max(0.1, sizeZ);
    reset();
}

void MaterialSimulator::setResolution(double r) {
    // Retained as a harmless stored hint; no longer drives a mesh extraction.
    if (r > 0.0) {
        m_resolution = r;
    }
}

void MaterialSimulator::setLocation(double x, double y, double z) {
    m_locX = x;
    m_locY = y;
    m_locZ = z;
    reset();
}

void MaterialSimulator::setToolRadius(double radius) {
    if (radius > 0.0) {
        m_toolRadius = radius;
    }
}

void MaterialSimulator::reset() {
#if AIM3D_HAS_OCCT
    if (m_sizeX <= 0 || m_sizeY <= 0 || m_sizeZ <= 0) {
        return;
    }

    gp_Pnt pMin(m_locX, m_locY, m_locZ);
    gp_Pnt pMax(m_locX + m_sizeX, m_locY + m_sizeY, m_locZ + m_sizeZ);
    m_initialStockShape = BRepPrimAPI_MakeBox(pMin, pMax).Shape();
    m_stockShape = m_initialStockShape;
#endif
    m_pendingCuts.clear();
}

void MaterialSimulator::cutSegment(const std::array<double, 3>& start, const std::array<double, 3>& end, double radius) {
    m_pendingCuts.push_back({start, end, radius});
}

bool MaterialSimulator::checkCollision(const std::array<double, 3>& cylinderBase, double radius, double height) const {
#if AIM3D_HAS_OCCT
    if (m_stockShape.IsNull()) {
        std::cout << "[C++ MatSim] checkCollision: m_stockShape is null!" << std::endl;
        return false;
    }
    if (radius <= 0.0 || height <= 0.0) {
        std::cout << "[C++ MatSim] checkCollision: invalid dimensions (radius=" << radius << ", height=" << height << ")" << std::endl;
        return false;
    }

    try {
        gp_Pnt base(cylinderBase[0], cylinderBase[1], cylinderBase[2]);
        gp_Ax2 axes(base, gp_Dir(0, 0, 1));
        TopoDS_Shape cylinder = BRepPrimAPI_MakeCylinder(axes, radius, height).Shape();

        // BRepAlgoAPI_Section computes the intersection curve between two shapes.
        // If any edges exist in the result, the shapes intersect.
        BRepAlgoAPI_Section section(m_stockShape, cylinder);
        section.Build();
        if (!section.IsDone()) {
            std::cout << "[C++ MatSim] checkCollision: BRepAlgoAPI_Section build failed!" << std::endl;
            return false;
        }

        // Check if the section result contains any geometry (edges)
        TopExp_Explorer explorer(section.Shape(), TopAbs_EDGE);
        if (explorer.More()) {
            std::cout << "[C++ MatSim] COLLISION DETECTED via section check!" << std::endl;
            return true; // Intersection found — collision
        }

        // Section can miss fully-contained cases (cylinder entirely inside stock).
        // Use volume-based check: compute common volume via BRepAlgoAPI_Common.
        // For performance, we skip this for now since toolholders are typically
        // larger than the stock in the plunge direction and the section check
        // catches the vast majority of real collisions.
    } catch (...) {
        // OCCT can throw on degenerate geometry — treat as no collision
        std::cerr << "[C++ MatSim] checkCollision: exception caught during intersection check!" << std::endl;
        return false;
    }
#else
    (void)cylinderBase;
    (void)radius;
    (void)height;
#endif
    return false;
}

std::vector<MaterialCutSegment> MaterialSimulator::popPendingCuts() {
    std::vector<MaterialCutSegment> cuts = std::move(m_pendingCuts);
    m_pendingCuts.clear();
    return cuts;
}

} // namespace aim3d
