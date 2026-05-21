#pragma once

#include <vector>
#include <string>

namespace aim3d {

enum class MotionType {
    Rapid,
    StraightFeed,
    ArcFeedCW,
    ArcFeedCCW,
    ToolChange
};

struct MotionCommand {
    MotionType type;
    double x, y, z;       // Coordinates
    double i, j, k;       // Center offsets for arc commands
    double feedRate;      // Modal feed rate
    int toolId;           // Tool selection ID
};

class CanonicalCamIR {
public:
    CanonicalCamIR();
    ~CanonicalCamIR();

    void addCommand(const MotionCommand& cmd);
    void clear();

    std::vector<MotionCommand> commands() const { return m_commands; }

    // Export raw contiguous float buffer representation for FFI zero-copy numpy loading
    const double* getDoubleBuffer(size_t& size) const;

private:
    std::vector<MotionCommand> m_commands;
    mutable std::vector<double> m_flatDoubleBuffer;
};

} // namespace aim3d
