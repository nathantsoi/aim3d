#include "aim3d/lightweight_simulator.hpp"
#include <cmath>
#include <algorithm>
#include <unordered_map>

#ifndef M_PI
#define M_PI 3.14159265358979323846
#endif

namespace aim3d {

LightweightSimulator::LightweightSimulator() {}

void LightweightSimulator::initialize(double sizeX, double sizeY, double sizeZ, std::size_t resolutionX, std::size_t resolutionY) {
    m_resX = resolutionX;
    m_resY = resolutionY;
    m_minX = 0.0;
    m_maxX = sizeX;
    m_minY = 0.0;
    m_maxY = sizeY;
    m_minZ = -sizeZ;
    m_maxZ = 0.0;

    m_heightmap.assign(m_resX * m_resY, 0.0f); // Default top height is 0.0
}

void LightweightSimulator::cutLinear(const std::array<double, 3>& start, const std::array<double, 3>& end, double toolRadius, bool isBallEnd) {
    if (m_resX < 2 || m_resY < 2) return;

    double dx = end[0] - start[0];
    double dy = end[1] - start[1];
    double lenSq = dx * dx + dy * dy;
    double stepX = (m_maxX - m_minX) / (m_resX - 1);
    double stepY = (m_maxY - m_minY) / (m_resY - 1);

    if (lenSq < 1e-9) {
        // Point cut
        double minX = end[0] - toolRadius;
        double maxX = end[0] + toolRadius;
        double minY = end[1] - toolRadius;
        double maxY = end[1] + toolRadius;

        std::size_t iMin = std::max<std::size_t>(0, std::max<double>(0.0, std::floor((minX - m_minX) / stepX)));
        std::size_t iMax = std::min<std::size_t>(m_resX - 1, std::min<double>(m_resX - 1, std::ceil((maxX - m_minX) / stepX)));
        std::size_t jMin = std::max<std::size_t>(0, std::max<double>(0.0, std::floor((minY - m_minY) / stepY)));
        std::size_t jMax = std::min<std::size_t>(m_resY - 1, std::min<double>(m_resY - 1, std::ceil((maxY - m_minY) / stepY)));

        for (std::size_t j = jMin; j <= jMax; ++j) {
            double y = m_minY + j * stepY;
            for (std::size_t i = iMin; i <= iMax; ++i) {
                double x = m_minX + i * stepX;
                double d = std::sqrt((x - end[0]) * (x - end[0]) * 1.0 + (y - end[1]) * (y - end[1]) * 1.0);
                if (d < toolRadius) {
                    double cutterZ = isBallEnd ? (end[2] + toolRadius) - std::sqrt(toolRadius * toolRadius - d * d) : end[2];
                    std::size_t idx = i + j * m_resX;
                    m_heightmap[idx] = std::min<float>(m_heightmap[idx], std::max<float>((float)m_minZ, (float)cutterZ));
                }
            }
        }
    } else {
        // Linear sweep cut
        double minX = std::min(start[0], end[0]) - toolRadius;
        double maxX = std::max(start[0], end[0]) + toolRadius;
        double minY = std::min(start[1], end[1]) - toolRadius;
        double maxY = std::max(start[1], end[1]) + toolRadius;

        std::size_t iMin = std::max<std::size_t>(0, std::max<double>(0.0, std::floor((minX - m_minX) / stepX)));
        std::size_t iMax = std::min<std::size_t>(m_resX - 1, std::min<double>(m_resX - 1, std::ceil((maxX - m_minX) / stepX)));
        std::size_t jMin = std::max<std::size_t>(0, std::max<double>(0.0, std::floor((minY - m_minY) / stepY)));
        std::size_t jMax = std::min<std::size_t>(m_resY - 1, std::min<double>(m_resY - 1, std::ceil((maxY - m_minY) / stepY)));

        for (std::size_t j = jMin; j <= jMax; ++j) {
            double y = m_minY + j * stepY;
            for (std::size_t i = iMin; i <= iMax; ++i) {
                double x = m_minX + i * stepX;
                double px = x - start[0];
                double py = y - start[1];
                double t = (px * dx + py * dy) / lenSq;
                t = std::max(0.0, std::min(1.0, t));

                double tx = start[0] + t * dx;
                double ty = start[1] + t * dy;
                double tz = start[2] + t * (end[2] - start[2]);

                double d = std::sqrt((x - tx) * (x - tx) + (y - ty) * (y - ty));
                if (d < toolRadius) {
                    double cutterZ = isBallEnd ? (tz + toolRadius) - std::sqrt(toolRadius * toolRadius - d * d) : tz;
                    std::size_t idx = i + j * m_resX;
                    m_heightmap[idx] = std::min<float>(m_heightmap[idx], std::max<float>((float)m_minZ, (float)cutterZ));
                }
            }
        }
    }
}

void LightweightSimulator::simulate(const ControllerProgram& program) {
    // Collect tools
    std::unordered_map<int, double> toolRadii;
    std::unordered_map<int, bool> toolIsBall;

    // Use G-code and program records to run simulator.
    // Default tool radii are defined as 3.0mm (6.0mm dia).
    std::array<double, 3> currentPos = {0.0, 0.0, 0.0};
    bool hasPosition = false;
    int activeTool = 0;

    for (const auto& record : program.records) {
        activeTool = record.tool;
        double radius = 3.0; // Default
        bool isBall = false;

        // In G-code parser context, we use a default of 3.0mm if tool ID not mapped.
        if (record.type == ControllerRecordType::Rapid) {
            currentPos = record.targetMm;
            hasPosition = true;
        } else if (record.type == ControllerRecordType::LinearFeed) {
            if (hasPosition) {
                cutLinear(currentPos, record.targetMm, radius, isBall);
            }
            currentPos = record.targetMm;
            hasPosition = true;
        } else if (record.type == ControllerRecordType::ArcCW || record.type == ControllerRecordType::ArcCCW) {
            if (hasPosition) {
                // Segment the arc (XY plane is primary for 3-axis mill)
                double startX = currentPos[0];
                double startY = currentPos[1];
                double endX = record.targetMm[0];
                double endY = record.targetMm[1];
                double cx = startX + record.arcCenterOffsetMm[0];
                double cy = startY + record.arcCenterOffsetMm[1];
                double rStart = std::hypot(startX - cx, startY - cy);
                double rEnd = std::hypot(endX - cx, endY - cy);
                double r = (rStart + rEnd) * 0.5;

                if (r > 1e-4) {
                    double startAngle = std::atan2(startY - cy, startX - cx);
                    double endAngle = std::atan2(endY - cy, endX - cx);

                    bool isCW = (record.type == ControllerRecordType::ArcCW);
                    double sweep = endAngle - startAngle;
                    if (isCW) {
                        if (sweep > 0) sweep -= 2.0 * M_PI;
                    } else {
                        if (sweep < 0) sweep += 2.0 * M_PI;
                    }

                    int numSegments = 16;
                    std::array<double, 3> lastPt = currentPos;
                    for (int step = 1; step <= numSegments; ++step) {
                        double ratio = (double)step / numSegments;
                        double angle = startAngle + ratio * sweep;
                        double z = currentPos[2] + ratio * (record.targetMm[2] - currentPos[2]);
                        std::array<double, 3> pt = {
                            cx + r * std::cos(angle),
                            cy + r * std::sin(angle),
                            z
                        };
                        cutLinear(lastPt, pt, radius, isBall);
                        lastPt = pt;
                    }
                } else {
                    cutLinear(currentPos, record.targetMm, radius, isBall);
                }
            }
            currentPos = record.targetMm;
            hasPosition = true;
        }
    }
}

void LightweightSimulator::getMesh(std::vector<float>& positions, std::vector<float>& normals, std::vector<uint32_t>& indices) const {
    if (m_resX < 2 || m_resY < 2) return;

    std::size_t topOffset = 0;
    std::size_t bottomOffset = m_resX * m_resY;
    std::size_t totalVertices = bottomOffset * 2;

    positions.resize(totalVertices * 3);
    normals.resize(totalVertices * 3);

    double stepX = (m_maxX - m_minX) / (m_resX - 1);
    double stepY = (m_maxY - m_minY) / (m_resY - 1);

    // Build Positions and Normals
    for (std::size_t j = 0; j < m_resY; ++j) {
        double y = m_minY + j * stepY;
        for (std::size_t i = 0; i < m_resX; ++i) {
            double x = m_minX + i * stepX;
            std::size_t idx = i + j * m_resX;

            double z = m_heightmap[idx];

            // Top vertex
            positions[(topOffset + idx) * 3 + 0] = (float)x;
            positions[(topOffset + idx) * 3 + 1] = (float)y;
            positions[(topOffset + idx) * 3 + 2] = (float)z;

            // Bottom vertex
            positions[(bottomOffset + idx) * 3 + 0] = (float)x;
            positions[(bottomOffset + idx) * 3 + 1] = (float)y;
            positions[(bottomOffset + idx) * 3 + 2] = (float)m_minZ;

            // Calculate Normal for Top vertex
            float nx = 0.0f, ny = 0.0f, nz = 1.0f;
            if (i > 0 && i < m_resX - 1 && j > 0 && j < m_resY - 1) {
                double dzdx = (m_heightmap[(i + 1) + j * m_resX] - m_heightmap[(i - 1) + j * m_resX]) / (2.0 * stepX);
                double dzdy = (m_heightmap[i + (j + 1) * m_resX] - m_heightmap[i + (j - 1) * m_resX]) / (2.0 * stepY);
                double len = std::sqrt(dzdx * dzdx + dzdy * dzdy + 1.0);
                nx = (float)(-dzdx / len);
                ny = (float)(-dzdy / len);
                nz = (float)(1.0 / len);
            }
            normals[(topOffset + idx) * 3 + 0] = nx;
            normals[(topOffset + idx) * 3 + 1] = ny;
            normals[(topOffset + idx) * 3 + 2] = nz;

            // Bottom normal points down
            normals[(bottomOffset + idx) * 3 + 0] = 0.0f;
            normals[(bottomOffset + idx) * 3 + 1] = 0.0f;
            normals[(bottomOffset + idx) * 3 + 2] = -1.0f;
        }
    }

    // Build Triangles (Indices)
    // 1. Top Surface
    for (std::size_t j = 0; j < m_resY - 1; ++j) {
        for (std::size_t i = 0; i < m_resX - 1; ++i) {
            uint32_t a = i + j * m_resX;
            uint32_t b = (i + 1) + j * m_resX;
            uint32_t c = i + (j + 1) * m_resX;
            uint32_t d = (i + 1) + (j + 1) * m_resX;

            indices.push_back(a);
            indices.push_back(c);
            indices.push_back(b);

            indices.push_back(b);
            indices.push_back(c);
            indices.push_back(d);
        }
    }

    // 2. Bottom Surface
    for (std::size_t j = 0; j < m_resY - 1; ++j) {
        for (std::size_t i = 0; i < m_resX - 1; ++i) {
            uint32_t a = (i + j * m_resX) + bottomOffset;
            uint32_t b = ((i + 1) + j * m_resX) + bottomOffset;
            uint32_t c = (i + (j + 1) * m_resX) + bottomOffset;
            uint32_t d = ((i + 1) + (j + 1) * m_resX) + bottomOffset;

            indices.push_back(a);
            indices.push_back(b);
            indices.push_back(c);

            indices.push_back(b);
            indices.push_back(d);
            indices.push_back(c);
        }
    }

    // 3. Side Walls
    // Boundary 1: j = 0 (Y = minY), i from 0 to resX-2
    for (std::size_t i = 0; i < m_resX - 1; ++i) {
        uint32_t a = i;
        uint32_t b = i + 1;
        uint32_t a_bot = a + bottomOffset;
        uint32_t b_bot = b + bottomOffset;

        indices.push_back(a);
        indices.push_back(a_bot);
        indices.push_back(b);

        indices.push_back(b);
        indices.push_back(a_bot);
        indices.push_back(b_bot);
    }

    // Boundary 2: j = resY-1 (Y = maxY), i from 0 to resX-2
    std::size_t jMaxIdx = m_resY - 1;
    for (std::size_t i = 0; i < m_resX - 1; ++i) {
        uint32_t a = i + jMaxIdx * m_resX;
        uint32_t b = (i + 1) + jMaxIdx * m_resX;
        uint32_t a_bot = a + bottomOffset;
        uint32_t b_bot = b + bottomOffset;

        indices.push_back(a);
        indices.push_back(b);
        indices.push_back(a_bot);

        indices.push_back(b);
        indices.push_back(b_bot);
        indices.push_back(a_bot);
    }

    // Boundary 3: i = 0 (X = minX), j from 0 to resY-2
    for (std::size_t j = 0; j < m_resY - 1; ++j) {
        uint32_t a = j * m_resX;
        uint32_t b = (j + 1) * m_resX;
        uint32_t a_bot = a + bottomOffset;
        uint32_t b_bot = b + bottomOffset;

        indices.push_back(a);
        indices.push_back(b);
        indices.push_back(a_bot);

        indices.push_back(b);
        indices.push_back(b_bot);
        indices.push_back(a_bot);
    }

    // Boundary 4: i = m_resX-1 (X = maxX), j from 0 to resY-2
    std::size_t iMaxIdx = m_resX - 1;
    for (std::size_t j = 0; j < m_resY - 1; ++j) {
        uint32_t a = iMaxIdx + j * m_resX;
        uint32_t b = iMaxIdx + (j + 1) * m_resX;
        uint32_t a_bot = a + bottomOffset;
        uint32_t b_bot = b + bottomOffset;

        indices.push_back(a);
        indices.push_back(a_bot);
        indices.push_back(b);

        indices.push_back(b);
        indices.push_back(a_bot);
        indices.push_back(b_bot);
    }
}

} // namespace aim3d
