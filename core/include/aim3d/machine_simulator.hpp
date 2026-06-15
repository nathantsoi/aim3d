#pragma once

#include <vector>
#include <array>
#include <cstdint>
#include <string>
#include "aim3d/controller.hpp"

namespace aim3d {

class MachineSimulator {
public:
    MachineSimulator();

    void initialize(double sizeX, double sizeY, double sizeZ, std::size_t resolutionX, std::size_t resolutionY);
    void cutLinear(const std::array<double, 3>& start, const std::array<double, 3>& end, double toolRadius, bool isBallEnd);
    void simulate(const std::vector<SpeSegment>& segments, const MachineProfile& profile);
    
    // Step-by-step execution API
    void reset();
    bool simulateStep(const SpeSegment& segment, const MachineProfile& profile);
    void simulateToStep(const std::vector<SpeSegment>& segments, const MachineProfile& profile, std::size_t targetStep);

    void updateMesh();
    void getMesh(std::vector<float>& positions, std::vector<float>& normals, std::vector<uint32_t>& indices) const;

    // Origin/Work Offset and Tool Table Offset dispatch API
    void setWorkOffset(int code, double x, double y, double z);
    std::array<double, 3> getWorkOffset(int code) const;
    void setToolOffset(int toolId, double zOffset);
    double getToolOffset(int toolId) const;

    // Accessors to cached mesh for direct memory viewing (WASM)
    const std::vector<float>& getPositions() const { return m_positions; }
    const std::vector<float>& getNormals() const { return m_normals; }
    const std::vector<uint32_t>& getIndices() const { return m_indices; }

    std::array<double, 3> getToolPosition() const { return m_currentPosMm; }
    std::size_t getCurrentStep() const { return m_currentStepIndex; }

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

    // Offsets storage
    std::unordered_map<int, std::array<double, 3>> m_workOffsets;
    std::unordered_map<int, double> m_toolOffsets;

    // Cached mesh
    std::vector<float> m_positions;
    std::vector<float> m_normals;
    std::vector<uint32_t> m_indices;

    // Execution state
    std::size_t m_currentStepIndex = 0;
    std::array<int64_t, 3> m_currentSteps = {0, 0, 0};
    std::array<double, 3> m_currentPosMm = {0.0, 0.0, 0.0};
    bool m_hasPosition = false;
};

} // namespace aim3d
