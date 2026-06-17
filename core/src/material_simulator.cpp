#include "aim3d/material_simulator.hpp"

#if AIM3D_HAS_OCCT
#include <BRepPrimAPI_MakeBox.hxx>
#include <BRepPrimAPI_MakeCylinder.hxx>
#include <BRepSweep_Prism.hxx>
#include <BRepAlgoAPI_Cut.hxx>
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
#endif

#include <iostream>
#include <cmath>

namespace aim3d {

MaterialSimulator::MaterialSimulator() {}

MaterialSimulator::~MaterialSimulator() {}

void MaterialSimulator::initialize(double sizeX, double sizeY, double sizeZ) {
    m_sizeX = sizeX;
    m_sizeY = sizeY;
    m_sizeZ = sizeZ;
    reset();
}

void MaterialSimulator::setLocation(double x, double y, double z) {
    m_locX = x;
    m_locY = y;
    m_locZ = z;
    reset();
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
}

void MaterialSimulator::cutSegment(const std::array<double, 3>& start, const std::array<double, 3>& end, double radius) {
#if AIM3D_HAS_OCCT
    if (m_stockShape.IsNull() || radius <= 0.0) {
        return;
    }

    gp_Pnt pA(start[0], start[1], start[2]);
    gp_Pnt pB(end[0], end[1], end[2]);
    gp_Vec delta(pA, pB);
    
    double dist = delta.Magnitude();
    
    // The tool is modeled as a vertical cylinder pointing upwards (+Z)
    // Height of tool must be large enough to clear the stock
    double toolHeight = m_sizeZ * 2.0 + 10.0;
    
    gp_Ax2 axes(pA, gp_Dir(0, 0, 1));
    TopoDS_Shape toolShape = BRepPrimAPI_MakeCylinder(axes, radius, toolHeight).Shape();
    
    TopoDS_Shape toolSweptVolume;
    if (dist > 1e-6) {
        // Sweep the tool along the segment vector
        toolSweptVolume = BRepSweep_Prism(toolShape, delta).Shape();
    } else {
        toolSweptVolume = toolShape;
    }
    
    // Perform the cut
    BRepAlgoAPI_Cut cut(m_stockShape, toolSweptVolume);
    cut.Build();
    
    if (cut.IsDone() && !cut.Shape().IsNull()) {
        m_stockShape = cut.Shape();
    }
#endif
}

void MaterialSimulator::updateMesh() {
    m_positions.clear();
    m_normals.clear();
    m_indices.clear();

#if AIM3D_HAS_OCCT
    if (m_stockShape.IsNull()) {
        return;
    }

    // Mesh the shape
    BRepMesh_IncrementalMesh mesher(m_stockShape, 0.5, false, 0.5, true);
    mesher.Perform();

    for (TopExp_Explorer explorer(m_stockShape, TopAbs_FACE); explorer.More(); explorer.Next()) {
        TopLoc_Location location;
        const auto face = TopoDS::Face(explorer.Current());
        const Handle(Poly_Triangulation) triangulation = BRep_Tool::Triangulation(face, location);
        
        if (triangulation.IsNull()) {
            continue;
        }

        const auto transform = location.Transformation();
        const auto baseIndex = static_cast<std::uint32_t>(m_positions.size() / 3);
        
        for (int nodeIndex = 1; nodeIndex <= triangulation->NbNodes(); ++nodeIndex) {
            const auto point = triangulation->Node(nodeIndex).Transformed(transform);
            m_positions.push_back(static_cast<float>(point.X()));
            m_positions.push_back(static_cast<float>(point.Y()));
            m_positions.push_back(static_cast<float>(point.Z()));
            
            // Simplified normals for now, the UI might recalculate them or we can just send up
            m_normals.push_back(0.0f);
            m_normals.push_back(0.0f);
            m_normals.push_back(1.0f);
        }

        for (int triangleIndex = 1; triangleIndex <= triangulation->NbTriangles(); ++triangleIndex) {
            int a = 0, b = 0, c = 0;
            triangulation->Triangle(triangleIndex).Get(a, b, c);
            m_indices.push_back(baseIndex + static_cast<std::uint32_t>(a - 1));
            m_indices.push_back(baseIndex + static_cast<std::uint32_t>(b - 1));
            m_indices.push_back(baseIndex + static_cast<std::uint32_t>(c - 1));
        }
    }
#endif
}

} // namespace aim3d
