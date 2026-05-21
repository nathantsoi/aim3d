#pragma once

#include <vector>

namespace aim3d {

struct DroppedPoint {
    double x;
    double y;
    double z; // Computed drop cutter height
};

class ISurfaceDropper {
public:
    virtual ~ISurfaceDropper() = default;

    virtual std::vector<DroppedPoint> dropCutter(
        const std::vector<double>& surfaceVertices,
        const std::vector<double>& gridPointsX,
        const std::vector<double>& gridPointsY,
        double toolRadius
    ) = 0;
};

class OpenCamLibSurfaceDropper : public ISurfaceDropper {
public:
    OpenCamLibSurfaceDropper();
    virtual ~OpenCamLibSurfaceDropper() = default;

    virtual std::vector<DroppedPoint> dropCutter(
        const std::vector<double>& surfaceVertices,
        const std::vector<double>& gridPointsX,
        const std::vector<double>& gridPointsY,
        double toolRadius
    ) override;
};

} // namespace aim3d
