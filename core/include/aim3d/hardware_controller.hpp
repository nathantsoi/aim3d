#pragma once

#include <string>
#include <array>
#include <memory>
#include <mutex>
#include "aim3d/controller.hpp"

namespace aim3d {

class HardwareController {
public:
    virtual ~HardwareController() = default;

    virtual bool connect(const std::string& connectionString) = 0;
    virtual void disconnect() = 0;
    virtual bool isConnected() const = 0;

    // Send path segment to MCU queue
    virtual bool sendSegment(const SpeSegment& segment) = 0;

    // Send immediate commands (Arm, Disarm, Estop, Home, Jog)
    virtual bool sendCommand(SpeCommand command, const std::array<int32_t, 3>& params = {0,0,0}) = 0;

    // Retrieve current MCU status (State, position, error flags)
    virtual SpeStatusMailbox getStatus() = 0;

    virtual std::string getType() const = 0;

    // Factory method
    static std::unique_ptr<HardwareController> create(const std::string& type);
};

class PiHardwareController : public HardwareController {
public:
    PiHardwareController() = default;
    ~PiHardwareController() override = default;

    bool connect(const std::string& connectionString) override;
    void disconnect() override;
    bool isConnected() const override { return m_connected; }

    bool sendSegment(const SpeSegment& segment) override;
    bool sendCommand(SpeCommand command, const std::array<int32_t, 3>& params = {0,0,0}) override;

    SpeStatusMailbox getStatus() override;
    std::string getType() const override { return "pi"; }

private:
    bool m_connected = false;
    SpeStatusMailbox m_status;
    std::mutex m_statusMutex;
};

} // namespace aim3d
