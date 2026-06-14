#pragma once

#include <array>
#include <cstdint>
#include <deque>
#include <string>
#include <vector>

namespace aim3d {

enum class ControllerDiagnosticSeverity {
    Info,
    Warning,
    Error,
    Fatal
};

struct ControllerDiagnostic {
    ControllerDiagnosticSeverity severity = ControllerDiagnosticSeverity::Info;
    std::size_t line = 0;
    std::string code;
    std::string message;
};

struct AxisProfile {
    std::string name;
    double minPositionMm = 0.0;
    double maxPositionMm = 0.0;
    double maxVelocityMmPerMin = 0.0;
    double maxAccelerationMmPerSec2 = 0.0;
    double stepsPerMm = 0.0;
    bool homingRequired = true;
};

struct MachineProfile {
    std::string id = "jetson-orin-nano-spe-mill";
    std::array<AxisProfile, 3> axes;
    double maxSegmentDurationSec = 0.025;
    double stepPulseWidthNs = 2500.0;
    bool hasSpindle = true;
    bool hasCoolant = true;
    bool hasProbe = true;
    bool hasLimitSwitches = true;
    bool hasEstop = true;

    static MachineProfile defaultThreeAxisMill();
    std::vector<ControllerDiagnostic> validate() const;
};

enum class ControllerRecordType {
    Rapid,
    LinearFeed,
    ArcCW,
    ArcCCW,
    SetUnits,
    SetPlane,
    SetWorkOffset,
    SetFeedRate,
    SetSpindle,
    SpindleStop,
    SetCoolant,
    ChangeTool,
    ProgramEnd
};

enum class UnitMode {
    Millimeters,
    Inches
};

enum class PlaneMode {
    XY,
    XZ,
    YZ
};

enum class CoolantMode {
    Off,
    Mist,
    Flood
};

struct ControllerModalState {
    UnitMode units = UnitMode::Millimeters;
    PlaneMode plane = PlaneMode::XY;
    int workOffset = 54;
    bool absoluteDistance = true;
    double feedRateMmPerMin = 0.0;
    double spindleRpm = 0.0;
    int activeTool = 0;
    std::array<double, 3> positionMm = {0.0, 0.0, 0.0};
    bool retractToOldZ = true;
};

struct ControllerRecord {
    ControllerRecordType type = ControllerRecordType::Rapid;
    std::size_t sourceLine = 0;
    std::string sourceText;
    ControllerModalState modal;
    std::array<double, 3> targetMm = {0.0, 0.0, 0.0};
    std::array<double, 3> arcCenterOffsetMm = {0.0, 0.0, 0.0};
    double feedRateMmPerMin = 0.0;
    double spindleRpm = 0.0;
    int tool = 0;
    CoolantMode coolant = CoolantMode::Off;
};

struct ControllerProgram {
    std::vector<ControllerRecord> records;
    std::vector<ControllerDiagnostic> diagnostics;

    bool valid() const;
};

class LinuxCncCompatParser {
public:
    ControllerProgram parse(const std::string& gcode) const;

private:
    static bool isSupportedMCode(int code);
};

struct SpeSegment {
    std::array<int32_t, 3> deltaSteps = {0, 0, 0};
    uint32_t durationUsec = 0;
    uint32_t flags = 0;
    std::size_t sourceLine = 0;
};

class TrajectoryPlanner {
public:
    explicit TrajectoryPlanner(MachineProfile profile);
    std::vector<SpeSegment> plan(const ControllerProgram& program, std::vector<ControllerDiagnostic>& diagnostics) const;

private:
    MachineProfile m_profile;
};

enum class SpeCommand {
    None,
    Arm,
    Disarm,
    FeedHold,
    Resume,
    Stop,
    EstopReset,
    Home,
    Jog
};

enum class SpeState {
    Disarmed,
    Armed,
    Running,
    FeedHold,
    Fault
};

struct SpeCommandMailbox {
    SpeCommand command = SpeCommand::None;
    std::array<int32_t, 3> jogSteps = {0, 0, 0};
};

struct SpeStatusMailbox {
    SpeState state = SpeState::Disarmed;
    std::array<int64_t, 3> positionSteps = {0, 0, 0};
    bool heartbeatOk = false;
    bool estopActive = true;
    bool limitActive = false;
    bool watchdogFault = false;
    std::size_t queuedSegments = 0;
};

class SpeSegmentRing {
public:
    explicit SpeSegmentRing(std::size_t capacity);

    bool push(const SpeSegment& segment);
    bool pop(SpeSegment& segment);
    std::size_t size() const;
    std::size_t capacity() const;
    bool empty() const;

private:
    std::size_t m_capacity;
    std::deque<SpeSegment> m_segments;
};

class SpeProtocolEmulator {
public:
    explicit SpeProtocolEmulator(std::size_t segmentCapacity = 256);

    const SpeStatusMailbox& status() const;
    SpeStatusMailbox& mutableStatus();
    SpeSegmentRing& ring();

    void submitCommand(const SpeCommandMailbox& command);
    void hostHeartbeat();
    void tick(bool estopActive, bool limitActive);

private:
    SpeStatusMailbox m_status;
    SpeSegmentRing m_ring;
    bool m_seenHeartbeat = false;
};

} // namespace aim3d
