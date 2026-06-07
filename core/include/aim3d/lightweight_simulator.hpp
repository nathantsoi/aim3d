#pragma once

#include <vector>
#include <array>
#include <cstdint>
#include <string>
#include "aim3d/controller.hpp"

namespace aim3d {

class LightweightSimulator {
public:
    LightweightSimulator();

    void initialize(double sizeX, double sizeY, double sizeZ, std::size_t resolutionX, std::size_t resolutionY);
    void cutLinear(const std::array<double, 3>& start, const std::array<double, 3>& end, double toolRadius, bool isBallEnd);
    void simulate(const ControllerProgram& program);
    void getMesh(std::vector<float>& positions, std::vector<float>& normals, std::vector<uint32_t>& indices) const;

    // Direct accessors for testing
    std::size_t resolutionX() const { return m_resX; }
    std::size_t resolutionY() const { return m_resY; }
    const std::vector<float>& heightmap() const { return m_heightmap; }

private:
    std::size_t m_resX = 0;
    std::size_t m_resY = 0;
    double m_minX = 0.0;
    double m_maxX = 0.0;
    double m_minY = 0.0;
    double m_maxY = 0.0;
    double m_minZ = 0.0;
    double m_maxZ = 0.0;

    std::vector<float> m_heightmap;
};

} // namespace aim3d
