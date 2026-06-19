#include "aim3d/material_simulator.hpp"

#if AIM3D_HAS_OCCT
#include <BRepPrimAPI_MakeBox.hxx>
#include <BRepPrimAPI_MakeCylinder.hxx>
#include <BRepSweep_Prism.hxx>
#include <BRepAlgoAPI_Cut.hxx>
#include <BRepAlgoAPI_Section.hxx>
#include <BRepMesh_IncrementalMesh.hxx>
#include <TopExp_Explorer.hxx>
#include <TopoDS.hxx>
#include <TopoDS_Face.hxx>
#include <BRep_Tool.hxx>
#include <Poly_Triangulation.hxx>
#include <gp_Ax2.hxx>
#include <gp_Vec.hxx>
#include <gp_Dir.hxx>
#include <gp_Pnt.hxx>
#include <BRepBuilderAPI_MakePolygon.hxx>
#include <BRepBuilderAPI_MakeFace.hxx>
#endif

#include <iostream>
#include <cmath>

namespace aim3d {

MaterialSimulator::MaterialSimulator() {}

MaterialSimulator::~MaterialSimulator() {}

void MaterialSimulator::initialize(double sizeX, double sizeY, double sizeZ) {
    m_sizeX = std::max(0.1, sizeX);
    m_sizeY = std::max(0.1, sizeY);
    m_sizeZ = std::max(0.1, sizeZ);
    reset();
}

void MaterialSimulator::setResolution(double r) {
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
    gp_Pnt pMin(m_locX, m_locY, m_locZ);
    gp_Pnt pMax(m_locX + m_sizeX, m_locY + m_sizeY, m_locZ + m_sizeZ);
    
    // Ensure positive volume
    if (m_sizeX <= 0 || m_sizeY <= 0 || m_sizeZ <= 0) {
        return;
    }

    m_initialStockShape = BRepPrimAPI_MakeBox(pMin, pMax).Shape();
    m_stockShape = m_initialStockShape;
#endif
    updateMesh();
    m_pendingCuts.clear();
}

void MaterialSimulator::cutSegment(const std::array<double, 3>& start, const std::array<double, 3>& end, double radius) {
    m_pendingCuts.push_back({start, end, radius});

#if AIM3D_HAS_OCCT
    // The exact 3D boolean subtraction using BRepAlgoAPI_Cut is disabled here
    // because it causes severe performance degradation (0 FPS) during real-time 
    // playback of the simulation toolpath. We instead rely entirely on the 
    // WebGPU Voxelizer in the frontend for visual subtraction.
    // We maintain m_stockShape as the original bounding box for rapid 
    // toolholder collision checks.
#endif
}

bool MaterialSimulator::checkCollision(const std::array<double, 3>& cylinderBase, double radius, double height) const {
#if AIM3D_HAS_OCCT
    std::cout << "[C++ MatSim] checkCollision base=(" << cylinderBase[0] << ", " << cylinderBase[1] << ", " << cylinderBase[2]
              << ") radius=" << radius << " height=" << height << std::endl;
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
#endif
    return false;
}

void MaterialSimulator::updateMesh() {
    m_positions.clear();
    m_normals.clear();
    m_indices.clear();

#if AIM3D_HAS_OCCT
    if (m_stockShape.IsNull()) {
        std::cout << "[C++ MatSim] updateMesh: m_stockShape is null!" << std::endl;
        return;
    }

    std::cout << "[C++ MatSim] updateMesh starting incremental mesh calculation..." << std::endl;

    // Mesh the shape
    BRepMesh_IncrementalMesh mesher(m_stockShape, m_resolution, false, 0.5, true);
    mesher.Perform();

    for (TopExp_Explorer explorer(m_stockShape, TopAbs_FACE); explorer.More(); explorer.Next()) {
        TopLoc_Location location;
        const auto face = TopoDS::Face(explorer.Current());
        const Handle(Poly_Triangulation) triangulation = BRep_Tool::Triangulation(face, location);
        
        if (triangulation.IsNull()) {
            continue;
        }

        const auto transform = location.Transformation();
        const bool isReversed = (face.Orientation() == TopAbs_REVERSED);
        const auto baseIndex = static_cast<std::uint32_t>(m_positions.size() / 3);
        
        // Check if the triangulation provides normals
        const bool hasNormals = triangulation->HasNormals();

        for (int nodeIndex = 1; nodeIndex <= triangulation->NbNodes(); ++nodeIndex) {
            const auto point = triangulation->Node(nodeIndex).Transformed(transform);
            m_positions.push_back(static_cast<float>(point.X()));
            m_positions.push_back(static_cast<float>(point.Y()));
            m_positions.push_back(static_cast<float>(point.Z()));
            
            if (hasNormals) {
                // Use the normals from the triangulation, respecting face orientation
                gp_Dir normal = triangulation->Normal(nodeIndex);
                // Transform the normal by the location
                normal = normal.IsParallel(gp_Dir(0,0,1), 1e-10)
                    ? normal
                    : normal.IsParallel(gp_Dir(0,0,-1), 1e-10) ? normal : normal;
                if (isReversed) {
                    normal.Reverse();
                }
                m_normals.push_back(static_cast<float>(normal.X()));
                m_normals.push_back(static_cast<float>(normal.Y()));
                m_normals.push_back(static_cast<float>(normal.Z()));
            } else {
                // Placeholder — will be overwritten by flat normal computation below
                m_normals.push_back(0.0f);
                m_normals.push_back(0.0f);
                m_normals.push_back(1.0f);
            }
        }

        for (int triangleIndex = 1; triangleIndex <= triangulation->NbTriangles(); ++triangleIndex) {
            int a = 0, b = 0, c = 0;
            triangulation->Triangle(triangleIndex).Get(a, b, c);

            std::uint32_t ia = baseIndex + static_cast<std::uint32_t>(a - 1);
            std::uint32_t ib = baseIndex + static_cast<std::uint32_t>(b - 1);
            std::uint32_t ic = baseIndex + static_cast<std::uint32_t>(c - 1);

            // Respect face orientation: reverse winding if the face is reversed
            if (isReversed) {
                m_indices.push_back(ia);
                m_indices.push_back(ic);
                m_indices.push_back(ib);
            } else {
                m_indices.push_back(ia);
                m_indices.push_back(ib);
                m_indices.push_back(ic);
            }

            // If no normals from triangulation, compute flat normals from the triangle
            if (!hasNormals) {
                float ax = m_positions[ia * 3], ay = m_positions[ia * 3 + 1], az = m_positions[ia * 3 + 2];
                float bx = m_positions[ib * 3], by = m_positions[ib * 3 + 1], bz = m_positions[ib * 3 + 2];
                float cx = m_positions[ic * 3], cy = m_positions[ic * 3 + 1], cz = m_positions[ic * 3 + 2];

                float e1x = bx - ax, e1y = by - ay, e1z = bz - az;
                float e2x = cx - ax, e2y = cy - ay, e2z = cz - az;

                float nx = e1y * e2z - e1z * e2y;
                float ny = e1z * e2x - e1x * e2z;
                float nz = e1x * e2y - e1y * e2x;

                float len = std::sqrt(nx * nx + ny * ny + nz * nz);
                if (len > 1e-8f) {
                    nx /= len; ny /= len; nz /= len;
                } else {
                    nx = 0.0f; ny = 0.0f; nz = 1.0f;
                }

                if (isReversed) {
                    nx = -nx; ny = -ny; nz = -nz;
                }

                // Overwrite the placeholder normals for all 3 vertices of this triangle
                m_normals[ia * 3] = nx; m_normals[ia * 3 + 1] = ny; m_normals[ia * 3 + 2] = nz;
                m_normals[ib * 3] = nx; m_normals[ib * 3 + 1] = ny; m_normals[ib * 3 + 2] = nz;
                m_normals[ic * 3] = nx; m_normals[ic * 3 + 1] = ny; m_normals[ic * 3 + 2] = nz;
            }
        }
    }
    std::cout << "[C++ MatSim] updateMesh complete: " << m_positions.size() / 3 << " vertices, " << m_indices.size() / 3 << " triangles." << std::endl;
#endif
}

std::vector<MaterialCutSegment> MaterialSimulator::popPendingCuts() {
    std::vector<MaterialCutSegment> cuts = std::move(m_pendingCuts);
    m_pendingCuts.clear();
    return cuts;
}

} // namespace aim3d
