#pragma once

#include <vector>
#include <memory>

namespace aim3d {

struct PocketContourPoint {
    double x;
    double y;
};

// Strict isolation interface to prevent GPL/copyleft infection
class IOffsetGenerator {
public:
    virtual ~IOffsetGenerator() = default;

    virtual std::vector<std::vector<PocketContourPoint>> generateOffsets(
        const std::vector<PocketContourPoint>& boundary,
        double stepover,
        double toolDiameter
    ) = 0;
};

class ClipperOffsetGenerator : public IOffsetGenerator {
public:
    ClipperOffsetGenerator();
    virtual ~ClipperOffsetGenerator() = default;

    virtual std::vector<std::vector<PocketContourPoint>> generateOffsets(
        const std::vector<PocketContourPoint>& boundary,
        double stepover,
        double toolDiameter
    ) override;
};

} // namespace aim3d
