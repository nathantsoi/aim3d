#pragma once

#include <vector>
#include <array>
#include <cstdint>

#ifndef AIM3D_HAS_OCCT
#define AIM3D_HAS_OCCT 1
#endif

#if AIM3D_HAS_OCCT
#include <TopoDS_Shape.hxx>
#endif

namespace aim3d {

struct MaterialCutSegment {
    std::array<double, 3> start;
    std::array<double, 3> end;
    double radius;
};

class MaterialSimulator {
public:
    MaterialSimulator();
    ~MaterialSimulator();

    // Initialize the stock as a box of given dimensions
    void initialize(double sizeX, double sizeY, double sizeZ);

    // Set stock offset (bottom-left-front corner)
    void setLocation(double x, double y, double z);

    // Set the cutting tool radius (used by cutSegment)
    void setToolRadius(double radius);

    // Cut a swept cylinder (representing a tool segment) from the stock
    void cutSegment(const std::array<double, 3>& start, const std::array<double, 3>& end, double radius);

    // Reset back to original stock shape
    void reset();

    // Set the meshing/voxelization resolution (linear deflection)
    void setResolution(double r);

    // Check if a cylinder (e.g. toolholder) intersects the current stock shape.
    // Returns true if there is a collision.
    bool checkCollision(const std::array<double, 3>& cylinderBase, double radius, double height) const;

    // Extract the triangulated mesh
    void updateMesh();

    const std::vector<float>& getPositions() const { return m_positions; }
    const std::vector<float>& getNormals() const { return m_normals; }
    const std::vector<std::uint32_t>& getIndices() const { return m_indices; }

    // Retrieve and clear queued cuts for the frontend WebGPU voxelizer
    std::vector<MaterialCutSegment> popPendingCuts();

private:
#if AIM3D_HAS_OCCT
    TopoDS_Shape m_stockShape;
    TopoDS_Shape m_initialStockShape;
#endif

    double m_sizeX = 100.0;
    double m_sizeY = 100.0;
    double m_sizeZ = 25.0;
    double m_locX = 0.0;
    double m_locY = 0.0;
    double m_locZ = 0.0;
    double m_toolRadius = 3.175; // Default 1/4" endmill
    double m_resolution = 1.0; // Mesh deflection/resolution

    std::vector<float> m_positions;
    std::vector<float> m_normals;
    std::vector<std::uint32_t> m_indices;
    std::vector<MaterialCutSegment> m_pendingCuts;
};

} // namespace aim3d
