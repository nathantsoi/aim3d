#include "aim3d/hardware_controller.hpp"

namespace aim3d {

std::unique_ptr<HardwareController> HardwareController::create(const std::string& type) {
    if (type == "pi") {
        return std::make_unique<PiHardwareController>();
    }
    return nullptr;
}

// ==========================================
// PiHardwareController Implementation
// ==========================================

bool PiHardwareController::connect(const std::string& /*connectionString*/) {
    std::lock_guard<std::mutex> lock(m_statusMutex);
    m_connected = true;
    m_status.state = SpeState::Disarmed;
    m_status.heartbeatOk = true;
    return true;
}

void PiHardwareController::disconnect() {
    m_connected = false;
}

bool PiHardwareController::sendSegment(const SpeSegment& /*segment*/) {
    return m_connected;
}

bool PiHardwareController::sendCommand(SpeCommand command, const std::array<int32_t, 3>& /*params*/) {
    if (!m_connected) return false;
    std::lock_guard<std::mutex> lock(m_statusMutex);
    if (command == SpeCommand::Arm) {
        m_status.state = SpeState::Armed;
    }
    return true;
}

SpeStatusMailbox PiHardwareController::getStatus() {
    std::lock_guard<std::mutex> lock(m_statusMutex);
    return m_status;
}

} // namespace aim3d
