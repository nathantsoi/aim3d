#pragma once

#include <string>
#include <vector>
#include <array>
#include <memory>
#include <thread>
#include <mutex>
#include <atomic>
#include <queue>
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

class SerialHardwareController : public HardwareController {
public:
    SerialHardwareController();
    ~SerialHardwareController() override;

    bool connect(const std::string& connectionString) override;
    void disconnect() override;
    bool isConnected() const override;

    bool sendSegment(const SpeSegment& segment) override;
    bool sendCommand(SpeCommand command, const std::array<int32_t, 3>& params = {0,0,0}) override;

    SpeStatusMailbox getStatus() override;
    std::string getType() const override { return "serial"; }

private:
    void readLoop();
    void writeLoop();
    void processIncomingMessage(const std::vector<uint8_t>& message);
    void sendRaw(const std::vector<uint8_t>& bytes);

    std::atomic<bool> m_connected{false};
    std::string m_portName;
    int m_baudRate = 115200;
    int m_fd = -1;

    std::thread m_readThread;
    std::thread m_writeThread;
    std::atomic<bool> m_running{false};

    std::mutex m_statusMutex;
    SpeStatusMailbox m_status;

    std::mutex m_writeMutex;
    std::queue<std::vector<uint8_t>> m_writeQueue;
    std::condition_variable m_writeCv;

    uint32_t m_lastSentSeq = 0;
    uint32_t m_lastAckedSeq = 0;
    
    // Klipper-like messaging components
    struct MsgPacket {
        uint8_t startByte = 0x7E;
        uint32_t seq = 0;
        uint8_t cmdType = 0;
        std::vector<uint8_t> payload;
        uint8_t checksum = 0;
        uint8_t endByte = 0x7F;
    };
    
    std::vector<uint8_t> serializePacket(const MsgPacket& packet);
    bool parsePacket(const std::vector<uint8_t>& bytes, MsgPacket& outPacket);
};

class JetsonHardwareController : public HardwareController {
public:
    JetsonHardwareController() = default;
    ~JetsonHardwareController() override = default;

    bool connect(const std::string& connectionString) override;
    void disconnect() override;
    bool isConnected() const override { return m_connected; }

    bool sendSegment(const SpeSegment& segment) override;
    bool sendCommand(SpeCommand command, const std::array<int32_t, 3>& params = {0,0,0}) override;

    SpeStatusMailbox getStatus() override;
    std::string getType() const override { return "jetson"; }

private:
    bool m_connected = false;
    std::string m_ivcPath;
    SpeStatusMailbox m_status;
    std::mutex m_statusMutex;
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
