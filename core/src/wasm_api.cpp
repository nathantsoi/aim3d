#ifdef __EMSCRIPTEN__
#include <emscripten/bind.h>
#include <emscripten/val.h>
#include "aim3d/controller.hpp"

using namespace emscripten;
using namespace aim3d;

// Helper to plan trajectory and discard diagnostics for now
std::vector<SpeSegment> planTrajectory(const TrajectoryPlanner& planner, const ControllerProgram& program) {
    std::vector<ControllerDiagnostic> diagnostics;
    return planner.plan(program, diagnostics);
}

EMSCRIPTEN_BINDINGS(aim3d_core) {
    enum_<ControllerDiagnosticSeverity>("ControllerDiagnosticSeverity")
        .value("Info",    ControllerDiagnosticSeverity::Info)
        .value("Warning", ControllerDiagnosticSeverity::Warning)
        .value("Error",   ControllerDiagnosticSeverity::Error)
        .value("Fatal",   ControllerDiagnosticSeverity::Fatal);

    class_<ControllerDiagnostic>("ControllerDiagnostic")
        .constructor<>()
        .property("severity", &ControllerDiagnostic::severity)
        .property("line",     &ControllerDiagnostic::line)
        .property("code",     &ControllerDiagnostic::code)
        .property("message",  &ControllerDiagnostic::message);

    register_vector<ControllerDiagnostic>("VectorControllerDiagnostic");

    enum_<SpeTaskMode>("SpeTaskMode")
        .value("Manual", SpeTaskMode::Manual)
        .value("Mdi", SpeTaskMode::Mdi)
        .value("Auto", SpeTaskMode::Auto);

    enum_<SpeState>("SpeState")
        .value("Disarmed", SpeState::Disarmed)
        .value("Armed", SpeState::Armed)
        .value("Running", SpeState::Running)
        .value("FeedHold", SpeState::FeedHold)
        .value("Fault", SpeState::Fault);

    class_<ControllerProgram>("ControllerProgram")
        .constructor<>()
        .function("valid", &ControllerProgram::valid);

    class_<LinuxCncCompatParser>("LinuxCncCompatParser")
        .constructor<>()
        .function("parse", &LinuxCncCompatParser::parse)
        .function("parseWithPosition", &LinuxCncCompatParser::parseWithPosition);

    enum_<UnitMode>("UnitMode")
        .value("Millimeters", UnitMode::Millimeters)
        .value("Inches", UnitMode::Inches);

    class_<AxisProfile>("AxisProfile")
        .constructor<>()
        .property("name", &AxisProfile::name)
        .property("minPositionMm", &AxisProfile::minPositionMm)
        .property("maxPositionMm", &AxisProfile::maxPositionMm)
        .property("maxVelocityMmPerMin", &AxisProfile::maxVelocityMmPerMin)
        .property("maxAccelerationMmPerSec2", &AxisProfile::maxAccelerationMmPerSec2)
        .property("stepsPerMm", &AxisProfile::stepsPerMm)
        .property("homingRequired", &AxisProfile::homingRequired);

    class_<MachineProfile>("MachineProfile")
        .constructor<>()
        .property("nativeUnits", &MachineProfile::nativeUnits)
        .property("maxSegmentDurationSec", &MachineProfile::maxSegmentDurationSec)
        .property("stepPulseWidthNs", &MachineProfile::stepPulseWidthNs)
        .property("hasSpindle", &MachineProfile::hasSpindle)
        .property("hasCoolant", &MachineProfile::hasCoolant)
        .property("hasProbe", &MachineProfile::hasProbe)
        .property("hasLimitSwitches", &MachineProfile::hasLimitSwitches)
        .property("hasEstop", &MachineProfile::hasEstop)
        .property("softLimitsEnabled", &MachineProfile::softLimitsEnabled)
        .function("getAxis", optional_override([](MachineProfile& self, int index) -> AxisProfile {
            if (index >= 0 && index < 3) return self.axes[index];
            return AxisProfile();
        }))
        .function("setAxis", optional_override([](MachineProfile& self, int index, const AxisProfile& axis) {
            if (index >= 0 && index < 3) self.axes[index] = axis;
        }))
        .function("getHomePosition", optional_override([](MachineProfile& self, int index) -> double {
            if (index >= 0 && index < 3) return self.homePositionMm[index];
            return 0.0;
        }))
        .function("setHomePosition", optional_override([](MachineProfile& self, int index, double value) {
            if (index >= 0 && index < 3) self.homePositionMm[index] = value;
        }))
        .class_function("defaultThreeAxisMill", &MachineProfile::defaultThreeAxisMill);

    class_<SpeSegment>("SpeSegment")
        .constructor<>()
        .property("durationUsec", &SpeSegment::durationUsec)
        .function("getDeltaX", optional_override([](SpeSegment& s) { return s.deltaSteps[0]; }))
        .function("getDeltaY", optional_override([](SpeSegment& s) { return s.deltaSteps[1]; }))
        .function("getDeltaZ", optional_override([](SpeSegment& s) { return s.deltaSteps[2]; }));
        
    register_vector<SpeSegment>("VectorSpeSegment");

    class_<TrajectoryPlanner>("TrajectoryPlanner")
        .constructor<MachineProfile>()
        .function("plan", &planTrajectory);

    class_<MachineController>("MachineController")
        .constructor<MachineProfile>()
        .function("tick", &MachineController::tick)
        .function("jog", &MachineController::jog)
        .function("submitMdi", &MachineController::submitMdi)
        .function("getToolPosition", optional_override([](MachineController& self) {
            std::array<double, 3> pos = self.getToolPosition();
            return val::array(std::vector<double>(pos.begin(), pos.end()));
        }))
        .function("getTaskMode", &MachineController::getTaskMode)
        .function("setTaskMode", &MachineController::setTaskMode)
        .function("getState", &MachineController::getState)
        .function("getQueuedSegments", &MachineController::getQueuedSegments)
        .function("clearPendingSegments", &MachineController::clearPendingSegments)
        .function("getActiveSourceLine", &MachineController::getActiveSourceLine)
        .function("setWorkOffset", &MachineController::setWorkOffset)
        .function("getWorkOffset", optional_override([](MachineController& self, int code) {
            std::array<double, 3> offset = self.getWorkOffset(code);
            return val::array(std::vector<double>(offset.begin(), offset.end()));
        }))
        .function("setToolOffset", &MachineController::setToolOffset)
        .function("getToolOffset", &MachineController::getToolOffset)
        .function("getProfile", optional_override([](MachineController& self) -> MachineProfile {
            return self.getProfile();
        }))
        .function("getLastDiagnostics", optional_override([](MachineController& self) {
            const auto& diags = self.getLastDiagnostics();
            auto arr = val::array();
            for (std::size_t i = 0; i < diags.size(); ++i) {
                const auto& d = diags[i];
                auto obj = val::object();
                std::string sev;
                switch (d.severity) {
                    case ControllerDiagnosticSeverity::Info:    sev = "info";    break;
                    case ControllerDiagnosticSeverity::Warning: sev = "warning"; break;
                    case ControllerDiagnosticSeverity::Error:   sev = "error";   break;
                    case ControllerDiagnosticSeverity::Fatal:   sev = "fatal";   break;
                }
                obj.set("severity", sev);
                obj.set("line",     (unsigned int)d.line);
                obj.set("code",     d.code);
                obj.set("message",  d.message);
                arr.set(i, obj);
            }
            return arr;
        }))
        .function("materialSimulator", optional_override([](MachineController& self) -> MaterialSimulator& {
            return self.materialSimulator();
        }), allow_raw_pointers())
        .function("flushMaterialSimulation", &MachineController::flushMaterialSimulation);

    class_<MaterialSimulator>("MaterialSimulator")
        .constructor<>()
        .function("initialize", &MaterialSimulator::initialize)
        .function("setLocation", &MaterialSimulator::setLocation)
        .function("reset", &MaterialSimulator::reset)
        .function("updateMesh", &MaterialSimulator::updateMesh)
        .function("getPositions", optional_override([](const MaterialSimulator& self) {
            if (self.getPositions().empty()) return val::array();
            return val(typed_memory_view(self.getPositions().size(), self.getPositions().data()));
        }))
        .function("getNormals", optional_override([](const MaterialSimulator& self) {
            if (self.getNormals().empty()) return val::array();
            return val(typed_memory_view(self.getNormals().size(), self.getNormals().data()));
        }))
        .function("getIndices", optional_override([](const MaterialSimulator& self) {
            if (self.getIndices().empty()) return val::array();
            return val(typed_memory_view(self.getIndices().size(), self.getIndices().data()));
        }));
}
#endif
