#pragma once

#include "aim3d/cam_ir.hpp"
#include <string>
#include <memory>

namespace aim3d {

struct ParserState {
    double currentX = 0.0;
    double currentY = 0.0;
    double currentZ = 0.0;
    double currentFeed = 0.0;
    int activeModalGroup = 0; // e.g. 0 for G0, 1 for G1, etc.
    int activeToolId = 1;
};

class GCodeParser {
public:
    GCodeParser();
    ~GCodeParser();

    // 100% Clean-room parsing API
    std::shared_ptr<CanonicalCamIR> parse(const std::string& gcodeContent);

    ParserState state() const { return m_state; }

private:
    ParserState m_state;
};

} // namespace aim3d
