#include "aim3d/hardware_controller.hpp"
#include <iostream>
#include <chrono>
#include <cstring>

#ifndef __EMSCRIPTEN__
#include <fcntl.h>
#include <unistd.h>
#include <termios.h>
#include <sys/ioctl.h>
#endif

namespace aim3d {

std::unique_ptr<HardwareController> HardwareController::create(const std::string& type) {
    if (type == "serial") {
        return std::make_unique<SerialHardwareController>();
    } else if (type == "jetson") {
        return std::make_unique<JetsonHardwareController>();
    } else if (type == "pi") {
        return std::make_unique<PiHardwareController>();
    }
    return nullptr;
}

// ==========================================
// SerialHardwareController Implementation
// ==========================================

SerialHardwareController::SerialHardwareController() {
    m_status.state = SpeState::Disarmed;
    m_status.heartbeatOk = false;
    m_status.estopActive = false;
    m_status.limitActive = false;
    m_status.watchdogFault = false;
    m_status.queuedSegments = 0;
    m_status.positionSteps = {0, 0, 0};
}

SerialHardwareController::~SerialHardwareController() {
    disconnect();
}

bool SerialHardwareController::connect(const std::string& connectionString) {
    disconnect();
    
    m_portName = connectionString;
    
#ifdef __EMSCRIPTEN__
    std::cerr << "Serial connection not supported in WASM build." << std::endl;
    return false;
#else
    m_fd = ::open(m_portName.c_str(), O_RDWR | O_NOCTTY | O_NDELAY);
    if (m_fd < 0) {
        std::cerr << "Failed to open serial port: " << m_portName << " (errno: " << errno << ")" << std::endl;
        return false;
    }

    // Configure port settings (115200 8N1, Raw mode)
    struct termios options;
    if (::tcgetattr(m_fd, &options) != 0) {
        ::close(m_fd);
        m_fd = -1;
        return false;
    }

    ::cfsetispeed(&options, B115200);
    ::cfsetospeed(&options, B115200);

    options.c_cflag |= (CLOCAL | CREAD);
    options.c_cflag &= ~PARENB;
    options.c_cflag &= ~CSTOPB;
    options.c_cflag &= ~CSIZE;
    options.c_cflag |= CS8;

    // Enable hardware flow control if needed, Klipper RTS reset sequence can toggle this.
    options.c_cflag &= ~CRTSCTS; // Disable HW flow control by default

    options.c_lflag &= ~(ICANON | ECHO | ECHOE | ISIG);
    options.c_oflag &= ~OPOST;
    options.c_iflag &= ~(IXON | IXOFF | IXANY | INLCR | ICRNL | IGNCR);

    options.c_cc[VMIN] = 0;
    options.c_cc[VTIME] = 1; // 100ms read timeout

    if (::tcsetattr(m_fd, TCSANOW, &options) != 0) {
        ::close(m_fd);
        m_fd = -1;
        return false;
    }

    m_connected = true;
    m_running = true;
    
    // Start background threads
    m_readThread = std::thread(&SerialHardwareController::readLoop, this);
    m_writeThread = std::thread(&SerialHardwareController::writeLoop, this);

    // Perform handshake command (Arm status query)
    sendCommand(SpeCommand::Arm);

    return true;
#endif
}

void SerialHardwareController::disconnect() {
    m_running = false;
    m_writeCv.notify_all();

    if (m_readThread.joinable()) {
        m_readThread.join();
    }
    if (m_writeThread.joinable()) {
        m_writeThread.join();
    }

#ifndef __EMSCRIPTEN__
    if (m_fd >= 0) {
        ::close(m_fd);
        m_fd = -1;
    }
#endif
    m_connected = false;
}

bool SerialHardwareController::isConnected() const {
    return m_connected;
}

bool SerialHardwareController::sendSegment(const SpeSegment& segment) {
    if (!m_connected) return false;

    MsgPacket packet;
    packet.seq = ++m_lastSentSeq;
    packet.cmdType = 0x01; // Movement segment
    
    // Pack binary payload
    packet.payload.resize(sizeof(SpeSegment));
    std::memcpy(packet.payload.data(), &segment, sizeof(SpeSegment));

    auto rawBytes = serializePacket(packet);
    
    {
        std::lock_guard<std::mutex> lock(m_writeMutex);
        m_writeQueue.push(rawBytes);
    }
    m_writeCv.notify_one();
    return true;
}

bool SerialHardwareController::sendCommand(SpeCommand command, const std::array<int32_t, 3>& params) {
    if (!m_connected && command != SpeCommand::Arm) return false;

    MsgPacket packet;
    packet.seq = ++m_lastSentSeq;
    packet.cmdType = 0x02; // Immediate command
    
    // Format payload
    packet.payload.push_back(static_cast<uint8_t>(command));
    packet.payload.resize(1 + sizeof(params));
    std::memcpy(packet.payload.data() + 1, params.data(), sizeof(params));

    auto rawBytes = serializePacket(packet);
    
    {
        std::lock_guard<std::mutex> lock(m_writeMutex);
        m_writeQueue.push(rawBytes);
    }
    m_writeCv.notify_one();
    return true;
}

SpeStatusMailbox SerialHardwareController::getStatus() {
    std::lock_guard<std::mutex> lock(m_statusMutex);
    return m_status;
}

void SerialHardwareController::readLoop() {
#ifndef __EMSCRIPTEN__
    std::vector<uint8_t> buffer;
    uint8_t tempBuf[256];
    
    while (m_running) {
        int bytesRead = ::read(m_fd, tempBuf, sizeof(tempBuf));
        if (bytesRead > 0) {
            for (int i = 0; i < bytesRead; ++i) {
                uint8_t b = tempBuf[i];
                buffer.push_back(b);
                
                // Keep checking if buffer ends with packet end byte
                if (b == 0x7F && buffer.size() >= 8) {
                    // Search for start byte
                    auto startIt = std::find(buffer.begin(), buffer.end(), 0x7E);
                    if (startIt != buffer.end()) {
                        std::vector<uint8_t> packetBytes(startIt, buffer.end());
                        MsgPacket pkt;
                        if (parsePacket(packetBytes, pkt)) {
                            processIncomingMessage(pkt.payload);
                            m_lastAckedSeq = pkt.seq;
                        }
                        buffer.erase(buffer.begin(), buffer.end());
                    }
                }
            }
        } else if (bytesRead < 0 && errno != EAGAIN && errno != EWOULDBLOCK) {
            std::cerr << "Serial read error. Disconnecting..." << std::endl;
            m_connected = false;
            break;
        }
        std::this_thread::sleep_for(std::chrono::milliseconds(5));
    }
#endif
}

void SerialHardwareController::writeLoop() {
#ifndef __EMSCRIPTEN__
    while (m_running) {
        std::vector<uint8_t> rawBytes;
        {
            std::unique_lock<std::mutex> lock(m_writeMutex);
            m_writeCv.wait(lock, [this] { return !m_writeQueue.empty() || !m_running; });
            if (!m_running) break;
            rawBytes = std::move(m_writeQueue.front());
            m_writeQueue.pop();
        }

        int totalWritten = 0;
        int size = rawBytes.size();
        while (totalWritten < size && m_running) {
            int written = ::write(m_fd, rawBytes.data() + totalWritten, size - totalWritten);
            if (written < 0) {
                if (errno != EAGAIN && errno != EWOULDBLOCK) {
                    std::cerr << "Serial write error." << std::endl;
                    m_connected = false;
                    break;
                }
            } else {
                totalWritten += written;
            }
        }
    }
#endif
}

void SerialHardwareController::processIncomingMessage(const std::vector<uint8_t>& message) {
    if (message.size() >= sizeof(SpeStatusMailbox)) {
        std::lock_guard<std::mutex> lock(m_statusMutex);
        std::memcpy(&m_status, message.data(), sizeof(SpeStatusMailbox));
    }
}

std::vector<uint8_t> SerialHardwareController::serializePacket(const MsgPacket& packet) {
    std::vector<uint8_t> result;
    result.push_back(packet.startByte);
    
    // Add sequence
    result.push_back(static_cast<uint8_t>((packet.seq >> 24) & 0xFF));
    result.push_back(static_cast<uint8_t>((packet.seq >> 16) & 0xFF));
    result.push_back(static_cast<uint8_t>((packet.seq >> 8) & 0xFF));
    result.push_back(static_cast<uint8_t>(packet.seq & 0xFF));
    
    result.push_back(packet.cmdType);
    
    // Add payload length
    uint16_t len = packet.payload.size();
    result.push_back(static_cast<uint8_t>((len >> 8) & 0xFF));
    result.push_back(static_cast<uint8_t>(len & 0xFF));
    
    // Add payload
    result.insert(result.end(), packet.payload.begin(), packet.payload.end());
    
    // Calculate simple XOR checksum
    uint8_t checksum = 0;
    for (size_t i = 1; i < result.size(); ++i) {
        checksum ^= result[i];
    }
    result.push_back(checksum);
    result.push_back(packet.endByte);
    
    return result;
}

bool SerialHardwareController::parsePacket(const std::vector<uint8_t>& bytes, MsgPacket& outPacket) {
    if (bytes.size() < 10) return false;
    if (bytes.front() != 0x7E || bytes.back() != 0x7F) return false;
    
    outPacket.seq = (bytes[1] << 24) | (bytes[2] << 16) | (bytes[3] << 8) | bytes[4];
    outPacket.cmdType = bytes[5];
    uint16_t len = (bytes[6] << 8) | bytes[7];
    
    if (bytes.size() != static_cast<size_t>(10 + len)) return false;
    
    outPacket.payload.assign(bytes.begin() + 8, bytes.begin() + 8 + len);
    outPacket.checksum = bytes[bytes.size() - 2];
    
    // Verify checksum
    uint8_t computed = 0;
    for (size_t i = 1; i < bytes.size() - 2; ++i) {
        computed ^= bytes[i];
    }
    
    return computed == outPacket.checksum;
}


// ==========================================
// JetsonHardwareController Implementation
// ==========================================

bool JetsonHardwareController::connect(const std::string& connectionString) {
    std::lock_guard<std::mutex> lock(m_statusMutex);
    m_ivcPath = connectionString;
    
    // Connect to Tegra IVC character device
#ifdef __EMSCRIPTEN__
    return false;
#else
    int fd = ::open(m_ivcPath.c_str(), O_RDWR);
    if (fd < 0) {
        std::cerr << "Jetson TEGRA IVC channel not found: " << m_ivcPath << std::endl;
        m_connected = false;
        return false;
    }
    ::close(fd);
    m_connected = true;
    m_status.state = SpeState::Disarmed;
    m_status.heartbeatOk = true;
    return true;
#endif
}

void JetsonHardwareController::disconnect() {
    m_connected = false;
}

bool JetsonHardwareController::sendSegment(const SpeSegment& /*segment*/) {
    if (!m_connected) return false;
    // Implementation would write segment to Tegra IVC mailbox
    return true;
}

bool JetsonHardwareController::sendCommand(SpeCommand command, const std::array<int32_t, 3>& /*params*/) {
    if (!m_connected) return false;
    std::lock_guard<std::mutex> lock(m_statusMutex);
    if (command == SpeCommand::Arm) {
        m_status.state = SpeState::Armed;
    } else if (command == SpeCommand::FeedHold) {
        m_status.state = SpeState::FeedHold;
    } else if (command == SpeCommand::Resume) {
        m_status.state = SpeState::Running;
    }
    return true;
}

SpeStatusMailbox JetsonHardwareController::getStatus() {
    std::lock_guard<std::mutex> lock(m_statusMutex);
    return m_status;
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
