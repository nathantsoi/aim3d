#ifdef __EMSCRIPTEN__
#include <emscripten/bind.h>
#include <emscripten/val.h>
#include "aim3d/machine_simulator.hpp"
#include "aim3d/controller.hpp"

using namespace emscripten;
using namespace aim3d;

// Helper to create and configure a MachineProfile
MachineProfile createMachineProfile(double maxVel, double maxAccel, double segmentDuration) {
    MachineProfile profile = MachineProfile::defaultThreeAxisMill();
    for (auto& axis : profile.axes) {
        axis.maxVelocityMmPerMin = maxVel;
        axis.maxAccelerationMmPerSec2 = maxAccel;
    }
    profile.maxSegmentDurationSec = segmentDuration;
    return profile;
}

// Helper to plan trajectory and discard diagnostics for now
std::vector<SpeSegment> planTrajectory(const TrajectoryPlanner& planner, const ControllerProgram& program) {
    std::vector<ControllerDiagnostic> diagnostics;
    return planner.plan(program, diagnostics);
}

// Wrapper for getPositions to return a typed array view
val getPositionsView(const MachineSimulator& sim) {
    const auto& pos = sim.getPositions();
    if (pos.empty()) return val::null();
    return val(typed_memory_view(pos.size(), pos.data()));
}

val getNormalsView(const MachineSimulator& sim) {
    const auto& norm = sim.getNormals();
    if (norm.empty()) return val::null();
    return val(typed_memory_view(norm.size(), norm.data()));
}

val getIndicesView(const MachineSimulator& sim) {
    const auto& idx = sim.getIndices();
    if (idx.empty()) return val::null();
    return val(typed_memory_view(idx.size(), idx.data()));
}

val getToolPositionJS(const MachineSimulator& sim) {
    auto pos = sim.getToolPosition();
    val arr = val::array();
    arr.set(0, pos[0]);
    arr.set(1, pos[1]);
    arr.set(2, pos[2]);
    return arr;
}

val getWorkOffsetJS(const MachineSimulator& sim, int code) {
    auto pos = sim.getWorkOffset(code);
    val arr = val::array();
    arr.set(0, pos[0]);
    arr.set(1, pos[1]);
    arr.set(2, pos[2]);
    return arr;
}

EMSCRIPTEN_BINDINGS(aim3d_core) {
    class_<ControllerProgram>("ControllerProgram")
        .constructor<>()
        .function("valid", &ControllerProgram::valid);

    class_<LinuxCncCompatParser>("LinuxCncCompatParser")
        .constructor<>()
        .function("parse", &LinuxCncCompatParser::parse);

    class_<MachineProfile>("MachineProfile")
        .constructor<>();
        
    function("createMachineProfile", &createMachineProfile);

    class_<SpeSegment>("SpeSegment")
        .constructor<>();
        
    register_vector<SpeSegment>("VectorSpeSegment");

    class_<TrajectoryPlanner>("TrajectoryPlanner")
        .constructor<MachineProfile>()
        .function("plan", &planTrajectory);

    class_<MachineSimulator>("MachineSimulator")
        .constructor<>()
        .function("initialize", &MachineSimulator::initialize)
        .function("simulate", &MachineSimulator::simulate)
        .function("reset", &MachineSimulator::reset)
        .function("simulateStep", &MachineSimulator::simulateStep)
        .function("simulateToStep", &MachineSimulator::simulateToStep)
        .function("updateMesh", &MachineSimulator::updateMesh)
        .function("getPositions", &getPositionsView)
        .function("getNormals", &getNormalsView)
        .function("getIndices", &getIndicesView)
        .function("getToolPosition", &getToolPositionJS)
        .function("getCurrentStep", &MachineSimulator::getCurrentStep)
        .function("setWorkOffset", &MachineSimulator::setWorkOffset)
        .function("getWorkOffset", &getWorkOffsetJS)
        .function("setToolOffset", &MachineSimulator::setToolOffset)
        .function("getToolOffset", &MachineSimulator::getToolOffset);
}
#endif
