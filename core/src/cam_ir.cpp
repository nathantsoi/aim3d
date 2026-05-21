#include "aim3d/cam_ir.hpp"
#include <iostream>

namespace aim3d {

CanonicalCamIR::CanonicalCamIR() {}
CanonicalCamIR::~CanonicalCamIR() {}

void CanonicalCamIR::addCommand(const MotionCommand& cmd) {
    m_commands.push_back(cmd);
}

void CanonicalCamIR::clear() {
    m_commands.clear();
    m_flatDoubleBuffer.clear();
}

const double* CanonicalCamIR::getDoubleBuffer(size_t& size) const {
    // Flatten commands into flat double array [type_double, x, y, z, feed]
    m_flatDoubleBuffer.clear();
    for (const auto& cmd : m_commands) {
        m_flatDoubleBuffer.push_back(static_cast<double>(cmd.type));
        m_flatDoubleBuffer.push_back(cmd.x);
        m_flatDoubleBuffer.push_back(cmd.y);
        m_flatDoubleBuffer.push_back(cmd.z);
        m_flatDoubleBuffer.push_back(cmd.feedRate);
    }
    size = m_flatDoubleBuffer.size();
    return m_flatDoubleBuffer.data();
}

} // namespace aim3d
