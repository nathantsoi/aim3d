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

class MaterialSimulator {
public:
    MaterialSimulator();
    ~MaterialSimulator();

    // Initialize the stock as a box of given dimensions
    void initialize(double sizeX, double sizeY, double sizeZ);

    // Set stock offset (bottom-left-front corner)
    void setLocation(double x, double y, double z);

    // Cut a swept cylinder (representing a tool segment) from the stock
    void cutSegment(const std::array<double, 3>& start, const std::array<double, 3>& end, double radius);

    // Reset back to original stock shape
    void reset();

    // Extract the triangulated mesh
    void updateMesh();

    const std::vector<float>& getPositions() const { return m_positions; }
    const std::vector<float>& getNormals() const { return m_normals; }
    const std::vector<std::uint32_t>& getIndices() const { return m_indices; }

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

    std::vector<float> m_positions;
    std::vector<float> m_normals;
    std::vector<std::uint32_t> m_indices;
};

} // namespace aim3d
