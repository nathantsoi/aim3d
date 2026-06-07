#include "aim3d/controller.hpp"

#include <algorithm>
#include <cmath>
#include <cctype>
#include <cstdlib>
#include <sstream>
#include <utility>

namespace aim3d {
namespace {

constexpr double kInchToMm = 25.4;
constexpr uint32_t kSegmentFlagRapid = 1u << 0;
constexpr uint32_t kSegmentFlagSpindleOn = 1u << 1;
constexpr uint32_t kSegmentFlagCoolantOn = 1u << 2;

std::string trim(const std::string& value) {
    const auto begin = value.find_first_not_of(" \t\r\n");
    if (begin == std::string::npos) {
        return "";
    }
    const auto end = value.find_last_not_of(" \t\r\n");
    return value.substr(begin, end - begin + 1);
}

std::string stripComments(const std::string& line) {
    std::string out;
    bool inParen = false;
    for (char ch : line) {
        if (ch == ';' && !inParen) {
            break;
        }
        if (ch == '(') {
            inParen = true;
            continue;
        }
        if (ch == ')' && inParen) {
            inParen = false;
            continue;
        }
        if (!inParen) {
            out.push_back(ch);
        }
    }
    return trim(out);
}

std::string uppercase(std::string value) {
    std::transform(value.begin(), value.end(), value.begin(), [](unsigned char ch) {
        return static_cast<char>(std::toupper(ch));
    });
    return value;
}

bool parseWord(const std::string& word, char& letter, double& value) {
    if (word.size() < 2 || !std::isalpha(static_cast<unsigned char>(word[0]))) {
        return false;
    }
    letter = static_cast<char>(std::toupper(static_cast<unsigned char>(word[0])));
    char* end = nullptr;
    value = std::strtod(word.c_str() + 1, &end);
    return end != word.c_str() + 1 && *end == '\0';
}

double toMm(double value, UnitMode units) {
    return units == UnitMode::Inches ? value * kInchToMm : value;
}

double feedToMmPerMin(double value, UnitMode units) {
    return toMm(value, units);
}

void addDiagnostic(
    std::vector<ControllerDiagnostic>& diagnostics,
    ControllerDiagnosticSeverity severity,
    std::size_t line,
    std::string code,
    std::string message) {
    diagnostics.push_back(ControllerDiagnostic{severity, line, std::move(code), std::move(message)});
}

bool isError(const ControllerDiagnostic& diagnostic) {
    return diagnostic.severity == ControllerDiagnosticSeverity::Error ||
           diagnostic.severity == ControllerDiagnosticSeverity::Fatal;
}

} // namespace

MachineProfile MachineProfile::defaultThreeAxisMill() {
    MachineProfile profile;
    profile.axes = {
        AxisProfile{"X", -1.0, 300.0, 3000.0, 500.0, 80.0, true},
        AxisProfile{"Y", -1.0, 300.0, 3000.0, 500.0, 80.0, true},
        AxisProfile{"Z", -100.0, 50.0, 1200.0, 350.0, 400.0, true},
    };
    return profile;
}

std::vector<ControllerDiagnostic> MachineProfile::validate() const {
    std::vector<ControllerDiagnostic> diagnostics;
    for (const auto& axis : axes) {
        if (axis.name.empty()) {
            addDiagnostic(diagnostics, ControllerDiagnosticSeverity::Error, 0, "machine.axis.name", "Axis name is required");
        }
        if (axis.minPositionMm >= axis.maxPositionMm) {
            addDiagnostic(diagnostics, ControllerDiagnosticSeverity::Error, 0, "machine.axis.range", axis.name + " axis min must be below max");
        }
        if (axis.maxVelocityMmPerMin <= 0.0) {
            addDiagnostic(diagnostics, ControllerDiagnosticSeverity::Error, 0, "machine.axis.velocity", axis.name + " axis max velocity must be positive");
        }
        if (axis.maxAccelerationMmPerSec2 <= 0.0) {
            addDiagnostic(diagnostics, ControllerDiagnosticSeverity::Error, 0, "machine.axis.acceleration", axis.name + " axis max acceleration must be positive");
        }
        if (axis.stepsPerMm <= 0.0) {
            addDiagnostic(diagnostics, ControllerDiagnosticSeverity::Error, 0, "machine.axis.steps", axis.name + " axis steps/mm must be positive");
        }
    }
    if (maxSegmentDurationSec <= 0.0) {
        addDiagnostic(diagnostics, ControllerDiagnosticSeverity::Error, 0, "machine.segment.duration", "Segment duration must be positive");
    }
    if (stepPulseWidthNs <= 0.0) {
        addDiagnostic(diagnostics, ControllerDiagnosticSeverity::Error, 0, "machine.step.pulse", "Step pulse width must be positive");
    }
    if (!hasEstop) {
        addDiagnostic(diagnostics, ControllerDiagnosticSeverity::Fatal, 0, "machine.estop", "E-stop input is required for hardware execution");
    }
    if (!hasLimitSwitches) {
        addDiagnostic(diagnostics, ControllerDiagnosticSeverity::Warning, 0, "machine.limits", "Limit switches are recommended for hardware execution");
    }
    return diagnostics;
}

bool ControllerProgram::valid() const {
    return std::none_of(diagnostics.begin(), diagnostics.end(), isError);
}

bool LinuxCncCompatParser::isSupportedMCode(int code) {
    switch (code) {
        case 3:
        case 4:
        case 5:
        case 6:
        case 7:
        case 8:
        case 9:
        case 30:
            return true;
        default:
            return false;
    }
}

ControllerProgram LinuxCncCompatParser::parse(const std::string& gcode) const {
    ControllerProgram program;
    ControllerModalState modal;
    int activeMotion = -1;
    bool programEnded = false;

    std::stringstream stream(gcode);
    std::string rawLine;
    std::size_t lineNumber = 0;
    while (std::getline(stream, rawLine)) {
        ++lineNumber;
        const std::string line = uppercase(stripComments(rawLine));
        if (line.empty()) {
            continue;
        }
        if (programEnded) {
            addDiagnostic(program.diagnostics, ControllerDiagnosticSeverity::Error, lineNumber, "gcode.after.end", "Commands after M30 are not executed");
            continue;
        }

        std::stringstream words(line);
        std::string word;
        bool hasCoord = false;
        bool hasArcOffset = false;
        bool hasMotionWord = false;
        bool hasRecord = false;
        bool feedUpdated = false;
        bool spindleUpdated = false;
        bool toolSelected = false;
        bool motionChanged = false;
        ControllerRecord record;
        record.sourceLine = lineNumber;
        record.sourceText = line;
        record.modal = modal;
        record.targetMm = modal.positionMm;
        record.feedRateMmPerMin = modal.feedRateMmPerMin;
        record.spindleRpm = modal.spindleRpm;
        record.tool = modal.activeTool;

        while (words >> word) {
            char letter = '\0';
            double value = 0.0;
            if (!parseWord(word, letter, value)) {
                addDiagnostic(program.diagnostics, ControllerDiagnosticSeverity::Error, lineNumber, "gcode.word", "Malformed word: " + word);
                continue;
            }

            if (letter == 'G') {
                const int code = static_cast<int>(std::llround(value));
                switch (code) {
                    case 0:
                    case 1:
                    case 2:
                    case 3:
                        if (hasMotionWord) {
                            addDiagnostic(program.diagnostics, ControllerDiagnosticSeverity::Error, lineNumber, "gcode.modal.motion", "Multiple motion commands in one block");
                        }
                        activeMotion = code;
                        hasMotionWord = true;
                        motionChanged = true;
                        break;
                    case 17:
                        modal.plane = PlaneMode::XY;
                        record.type = ControllerRecordType::SetPlane;
                        hasRecord = true;
                        break;
                    case 18:
                        modal.plane = PlaneMode::XZ;
                        record.type = ControllerRecordType::SetPlane;
                        hasRecord = true;
                        break;
                    case 19:
                        modal.plane = PlaneMode::YZ;
                        record.type = ControllerRecordType::SetPlane;
                        hasRecord = true;
                        break;
                    case 20:
                        modal.units = UnitMode::Inches;
                        record.type = ControllerRecordType::SetUnits;
                        hasRecord = true;
                        break;
                    case 21:
                        modal.units = UnitMode::Millimeters;
                        record.type = ControllerRecordType::SetUnits;
                        hasRecord = true;
                        break;
                    case 54:
                    case 55:
                    case 56:
                    case 57:
                    case 58:
                    case 59:
                        modal.workOffset = code;
                        record.type = ControllerRecordType::SetWorkOffset;
                        hasRecord = true;
                        break;
                    case 90:
                        modal.absoluteDistance = true;
                        break;
                    case 91:
                        modal.absoluteDistance = false;
                        break;
                    case 94:
                        break;
                    default:
                        addDiagnostic(program.diagnostics, ControllerDiagnosticSeverity::Error, lineNumber, "gcode.unsupported.g", "Unsupported G-code G" + std::to_string(code));
                        break;
                }
            } else if (letter == 'M') {
                const int code = static_cast<int>(std::llround(value));
                if (!isSupportedMCode(code)) {
                    addDiagnostic(program.diagnostics, ControllerDiagnosticSeverity::Error, lineNumber, "gcode.unsupported.m", "Unsupported M-code M" + std::to_string(code));
                    continue;
                }
                switch (code) {
                    case 3:
                    case 4:
                        record.type = ControllerRecordType::SetSpindle;
                        hasRecord = true;
                        break;
                    case 5:
                        modal.spindleRpm = 0.0;
                        record.type = ControllerRecordType::SpindleStop;
                        hasRecord = true;
                        break;
                    case 6:
                        record.type = ControllerRecordType::ChangeTool;
                        hasRecord = true;
                        break;
                    case 7:
                        record.coolant = CoolantMode::Mist;
                        record.type = ControllerRecordType::SetCoolant;
                        hasRecord = true;
                        break;
                    case 8:
                        record.coolant = CoolantMode::Flood;
                        record.type = ControllerRecordType::SetCoolant;
                        hasRecord = true;
                        break;
                    case 9:
                        record.coolant = CoolantMode::Off;
                        record.type = ControllerRecordType::SetCoolant;
                        hasRecord = true;
                        break;
                    case 30:
                        record.type = ControllerRecordType::ProgramEnd;
                        hasRecord = true;
                        programEnded = true;
                        break;
                    default:
                        break;
                }
            } else if (letter == 'X' || letter == 'Y' || letter == 'Z') {
                const std::size_t index = letter == 'X' ? 0 : (letter == 'Y' ? 1 : 2);
                const double mmValue = toMm(value, modal.units);
                record.targetMm[index] = modal.absoluteDistance ? mmValue : modal.positionMm[index] + mmValue;
                hasCoord = true;
            } else if (letter == 'I' || letter == 'J' || letter == 'K') {
                const std::size_t index = letter == 'I' ? 0 : (letter == 'J' ? 1 : 2);
                record.arcCenterOffsetMm[index] = toMm(value, modal.units);
                hasArcOffset = true;
            } else if (letter == 'F') {
                modal.feedRateMmPerMin = feedToMmPerMin(value, modal.units);
                record.feedRateMmPerMin = modal.feedRateMmPerMin;
                record.type = ControllerRecordType::SetFeedRate;
                feedUpdated = true;
                hasRecord = true;
            } else if (letter == 'S') {
                modal.spindleRpm = value;
                record.spindleRpm = modal.spindleRpm;
                record.type = ControllerRecordType::SetSpindle;
                spindleUpdated = true;
                hasRecord = true;
            } else if (letter == 'T') {
                modal.activeTool = static_cast<int>(std::llround(value));
                record.tool = modal.activeTool;
                record.type = ControllerRecordType::ChangeTool;
                toolSelected = true;
                hasRecord = true;
            } else if (letter == 'N') {
                continue;
            } else {
                addDiagnostic(program.diagnostics, ControllerDiagnosticSeverity::Error, lineNumber, "gcode.unsupported.word", "Unsupported word: " + word);
            }
        }

        if (hasCoord || hasArcOffset || motionChanged) {
            if (activeMotion < 0) {
                addDiagnostic(program.diagnostics, ControllerDiagnosticSeverity::Error, lineNumber, "gcode.motion.missing", "Coordinate block has no active motion mode");
                continue;
            }
            switch (activeMotion) {
                case 0:
                    record.type = ControllerRecordType::Rapid;
                    break;
                case 1:
                    record.type = ControllerRecordType::LinearFeed;
                    break;
                case 2:
                    record.type = ControllerRecordType::ArcCW;
                    break;
                case 3:
                    record.type = ControllerRecordType::ArcCCW;
                    break;
                default:
                    break;
            }
            if ((activeMotion == 2 || activeMotion == 3) && !hasArcOffset) {
                addDiagnostic(program.diagnostics, ControllerDiagnosticSeverity::Error, lineNumber, "gcode.arc.center", "Arc moves require I/J/K center offsets in v1");
            }
            if (activeMotion != 0 && modal.feedRateMmPerMin <= 0.0) {
                addDiagnostic(program.diagnostics, ControllerDiagnosticSeverity::Error, lineNumber, "gcode.feed.missing", "Feed motion requires a positive F word before execution");
            }
            record.modal = modal;
            record.feedRateMmPerMin = modal.feedRateMmPerMin;
            record.spindleRpm = modal.spindleRpm;
            record.tool = modal.activeTool;
            modal.positionMm = record.targetMm;
            hasRecord = true;
        } else if (feedUpdated || spindleUpdated || toolSelected) {
            record.modal = modal;
            record.feedRateMmPerMin = modal.feedRateMmPerMin;
            record.spindleRpm = modal.spindleRpm;
            record.tool = modal.activeTool;
        }

        if (hasRecord) {
            record.modal = modal;
            program.records.push_back(record);
        }
    }

    return program;
}

TrajectoryPlanner::TrajectoryPlanner(MachineProfile profile)
    : m_profile(std::move(profile)) {}

std::vector<SpeSegment> TrajectoryPlanner::plan(const ControllerProgram& program, std::vector<ControllerDiagnostic>& diagnostics) const {
    std::vector<SpeSegment> segments;
    const auto profileDiagnostics = m_profile.validate();
    diagnostics.insert(diagnostics.end(), profileDiagnostics.begin(), profileDiagnostics.end());
    if (!program.valid() || std::any_of(profileDiagnostics.begin(), profileDiagnostics.end(), isError)) {
        return segments;
    }

    std::array<double, 3> current = {0.0, 0.0, 0.0};
    for (const auto& record : program.records) {
        if (record.type != ControllerRecordType::Rapid &&
            record.type != ControllerRecordType::LinearFeed &&
            record.type != ControllerRecordType::ArcCW &&
            record.type != ControllerRecordType::ArcCCW) {
            continue;
        }

        bool insideEnvelope = true;
        for (std::size_t i = 0; i < 3; ++i) {
            const auto& axis = m_profile.axes[i];
            if (record.targetMm[i] < axis.minPositionMm || record.targetMm[i] > axis.maxPositionMm) {
                addDiagnostic(diagnostics, ControllerDiagnosticSeverity::Fatal, record.sourceLine, "planner.soft_limit", axis.name + " target exceeds soft limits");
                insideEnvelope = false;
            }
        }
        if (!insideEnvelope) {
            continue;
        }

        std::array<double, 3> deltaMm = {
            record.targetMm[0] - current[0],
            record.targetMm[1] - current[1],
            record.targetMm[2] - current[2],
        };
        const double distanceMm = std::sqrt(deltaMm[0] * deltaMm[0] + deltaMm[1] * deltaMm[1] + deltaMm[2] * deltaMm[2]);
        if (distanceMm <= 1e-9) {
            current = record.targetMm;
            continue;
        }

        double feed = record.type == ControllerRecordType::Rapid ? m_profile.axes[0].maxVelocityMmPerMin : record.feedRateMmPerMin;
        for (std::size_t i = 0; i < 3; ++i) {
            feed = std::min(feed, m_profile.axes[i].maxVelocityMmPerMin);
        }
        if (feed <= 0.0) {
            addDiagnostic(diagnostics, ControllerDiagnosticSeverity::Fatal, record.sourceLine, "planner.feed", "Planned feed must be positive");
            continue;
        }

        const double durationSec = std::max(0.001, distanceMm / (feed / 60.0));
        const std::size_t splitCount = std::max<std::size_t>(1, static_cast<std::size_t>(std::ceil(durationSec / m_profile.maxSegmentDurationSec)));
        for (std::size_t split = 0; split < splitCount; ++split) {
            SpeSegment segment;
            segment.sourceLine = record.sourceLine;
            segment.durationUsec = static_cast<uint32_t>(std::llround((durationSec / splitCount) * 1000000.0));
            if (record.type == ControllerRecordType::Rapid) {
                segment.flags |= kSegmentFlagRapid;
            }
            if (record.modal.spindleRpm > 0.0) {
                segment.flags |= kSegmentFlagSpindleOn;
            }
            if (record.coolant != CoolantMode::Off) {
                segment.flags |= kSegmentFlagCoolantOn;
            }
            for (std::size_t axis = 0; axis < 3; ++axis) {
                const double partStart = static_cast<double>(split) / static_cast<double>(splitCount);
                const double partEnd = static_cast<double>(split + 1) / static_cast<double>(splitCount);
                const double mmStart = current[axis] + deltaMm[axis] * partStart;
                const double mmEnd = current[axis] + deltaMm[axis] * partEnd;
                segment.deltaSteps[axis] = static_cast<int32_t>(std::llround((mmEnd - mmStart) * m_profile.axes[axis].stepsPerMm));
            }
            segments.push_back(segment);
        }
        current = record.targetMm;
    }
    return segments;
}

SpeSegmentRing::SpeSegmentRing(std::size_t capacity)
    : m_capacity(capacity) {}

bool SpeSegmentRing::push(const SpeSegment& segment) {
    if (m_segments.size() >= m_capacity) {
        return false;
    }
    m_segments.push_back(segment);
    return true;
}

bool SpeSegmentRing::pop(SpeSegment& segment) {
    if (m_segments.empty()) {
        return false;
    }
    segment = m_segments.front();
    m_segments.pop_front();
    return true;
}

std::size_t SpeSegmentRing::size() const {
    return m_segments.size();
}

std::size_t SpeSegmentRing::capacity() const {
    return m_capacity;
}

bool SpeSegmentRing::empty() const {
    return m_segments.empty();
}

SpeProtocolEmulator::SpeProtocolEmulator(std::size_t segmentCapacity)
    : m_ring(segmentCapacity) {}

const SpeStatusMailbox& SpeProtocolEmulator::status() const {
    return m_status;
}

SpeStatusMailbox& SpeProtocolEmulator::mutableStatus() {
    return m_status;
}

SpeSegmentRing& SpeProtocolEmulator::ring() {
    return m_ring;
}

void SpeProtocolEmulator::submitCommand(const SpeCommandMailbox& command) {
    if (m_status.state == SpeState::Fault && command.command != SpeCommand::EstopReset) {
        return;
    }
    switch (command.command) {
        case SpeCommand::Arm:
            if (m_status.heartbeatOk && !m_status.estopActive && !m_status.limitActive) {
                m_status.state = SpeState::Armed;
            }
            break;
        case SpeCommand::Disarm:
            m_status.state = SpeState::Disarmed;
            break;
        case SpeCommand::FeedHold:
            if (m_status.state == SpeState::Running) {
                m_status.state = SpeState::FeedHold;
            }
            break;
        case SpeCommand::Resume:
            if (m_status.state == SpeState::FeedHold) {
                m_status.state = SpeState::Running;
            }
            break;
        case SpeCommand::Stop:
            if (m_status.state != SpeState::Fault) {
                m_status.state = SpeState::Armed;
            }
            break;
        case SpeCommand::EstopReset:
            if (!m_status.estopActive && !m_status.limitActive && m_status.heartbeatOk) {
                m_status.watchdogFault = false;
                m_status.state = SpeState::Disarmed;
            }
            break;
        case SpeCommand::Home:
            if (m_status.state == SpeState::Armed) {
                m_status.positionSteps = {0, 0, 0};
            }
            break;
        case SpeCommand::Jog:
            if (m_status.state == SpeState::Armed) {
                for (std::size_t i = 0; i < 3; ++i) {
                    m_status.positionSteps[i] += command.jogSteps[i];
                }
            }
            break;
        case SpeCommand::None:
            break;
    }
}

void SpeProtocolEmulator::hostHeartbeat() {
    m_seenHeartbeat = true;
    m_status.heartbeatOk = true;
}

void SpeProtocolEmulator::tick(bool estopActive, bool limitActive) {
    m_status.estopActive = estopActive;
    m_status.limitActive = limitActive;
    m_status.queuedSegments = m_ring.size();

    if (!m_seenHeartbeat) {
        m_status.heartbeatOk = false;
        m_status.watchdogFault = true;
    }
    m_seenHeartbeat = false;

    if (!m_status.heartbeatOk || m_status.watchdogFault || estopActive || limitActive) {
        m_status.state = SpeState::Fault;
        return;
    }

    if (m_status.state == SpeState::Armed && !m_ring.empty()) {
        m_status.state = SpeState::Running;
    }
    if (m_status.state == SpeState::Running) {
        SpeSegment segment;
        if (m_ring.pop(segment)) {
            for (std::size_t i = 0; i < 3; ++i) {
                m_status.positionSteps[i] += segment.deltaSteps[i];
            }
        }
        if (m_ring.empty()) {
            m_status.state = SpeState::Armed;
        }
    }
    m_status.queuedSegments = m_ring.size();
}

} // namespace aim3d
