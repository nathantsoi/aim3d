#pragma once

#include <array>
#include <cstdint>
#include <deque>
#include <string>
#include <vector>
#include <unordered_map>

#include "aim3d/material_simulator.hpp"

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

enum class UnitMode {
    Millimeters,
    Inches
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
    UnitMode nativeUnits = UnitMode::Millimeters;
    std::array<double, 3> homePositionMm = {0.0, 0.0, 50.8};
    bool softLimitsEnabled = true; // When false, soft limit violations are warnings only

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
    GoHome,
    ProgramEnd
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
    bool isMachineCoord = false; // true for G53 moves — work offset NOT applied by planner
    std::array<bool, 3> axisSpecified = {false, false, false};
};

struct ControllerProgram {
    std::vector<ControllerRecord> records;
    std::vector<ControllerDiagnostic> diagnostics;
    std::array<double, 3> startPositionMm = {0.0, 0.0, 0.0};

    bool valid() const;
};

class LinuxCncCompatParser {
public:
    ControllerProgram parse(const std::string& gcode) const;
    ControllerProgram parseWithPosition(const std::string& gcode, double x, double y, double z, std::array<double, 3> homeMm = {0,0,0}) const;

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
    std::vector<SpeSegment> plan(
        const ControllerProgram& program, 
        std::vector<ControllerDiagnostic>& diagnostics,
        const std::unordered_map<int, std::array<double, 3>>& workOffsets = {}
    ) const;

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
    Jog,
    SetTaskMode
};

enum class SpeState {
    Disarmed,
    Armed,
    Running,
    FeedHold,
    Fault
};

enum class SpeTaskMode {
    Manual,
    Mdi,
    Auto
};

struct SpeCommandMailbox {
    SpeCommand command = SpeCommand::None;
    std::array<int32_t, 3> jogSteps = {0, 0, 0};
    SpeTaskMode requestedTaskMode = SpeTaskMode::Manual;
};

struct SpeStatusMailbox {
    SpeTaskMode taskMode = SpeTaskMode::Manual;
    SpeState state = SpeState::Disarmed;
    std::array<int64_t, 3> positionSteps = {0, 0, 0};
    bool heartbeatOk = false;
    bool estopActive = true;
    bool limitActive = false;
    bool watchdogFault = false;
    std::size_t queuedSegments = 0;
    std::size_t activeSourceLine = 0;
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

class MachineController {
public:
    explicit MachineController(MachineProfile profile);

    void setWorkOffset(int code, double x, double y, double z);
    std::array<double, 3> getWorkOffset(int code) const;

    void setToolOffset(int toolId, double zOffset);
    double getToolOffset(int toolId) const;

    void jog(double dx, double dy, double dz);
    
    bool submitMdi(const std::string& gcode);
    
    void tick(double dtSeconds);
    /// Process all deferred material-simulator cuts accumulated during tick().
    /// Call this once after the simulation loop has drained all segments.
    void flushMaterialSimulation();

    std::array<double, 3> getToolPosition() const;
    const MachineProfile& getProfile() const;
    SpeTaskMode getTaskMode() const;
    void setTaskMode(SpeTaskMode mode);
    SpeState getState() const;
    
    std::size_t getQueuedSegments() const;
    void clearPendingSegments();
    std::size_t getActiveSourceLine() const;

    const std::vector<ControllerDiagnostic>& getLastDiagnostics() const;

    MaterialSimulator& materialSimulator();
    const MaterialSimulator& materialSimulator() const;

private:
    MachineProfile m_profile;
    SpeProtocolEmulator m_emulator;
    LinuxCncCompatParser m_parser;
    TrajectoryPlanner m_planner;
    MaterialSimulator m_materialSimulator;

    std::unordered_map<int, std::array<double, 3>> m_workOffsets;
    std::unordered_map<int, double> m_toolOffsets;

    std::deque<SpeSegment> m_plannedSegments;
    double m_timeAccumulator = 0.0;
    std::vector<ControllerDiagnostic> m_lastDiagnostics;

    struct DeferredCut {
        std::array<double, 3> start;
        std::array<double, 3> end;
        double radius;
    };
    std::vector<DeferredCut> m_deferredCuts;
};

} // namespace aim3d
