#include "aim3d/controller.hpp"

#include <algorithm>
#include <cmath>
#include <cctype>
#include <cstdlib>
#include <sstream>
#include <utility>
#include <iostream>

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

std::vector<std::string> tokenizeLine(const std::string& line) {
    std::vector<std::string> words;
    std::string currentWord;
    for (char ch : line) {
        if (std::isspace(static_cast<unsigned char>(ch))) {
            if (!currentWord.empty()) {
                words.push_back(currentWord);
                currentWord.clear();
            }
        } else if (std::isalpha(static_cast<unsigned char>(ch))) {
            if (!currentWord.empty()) {
                words.push_back(currentWord);
                currentWord.clear();
            }
            currentWord.push_back(ch);
        } else {
            currentWord.push_back(ch);
        }
    }
    if (!currentWord.empty()) {
        words.push_back(currentWord);
    }
    return words;
}

} // namespace

MachineProfile MachineProfile::defaultThreeAxisMill() {
    MachineProfile profile;
    profile.axes = {
        AxisProfile{"X", -1.0, 300.0, 3000.0, 500.0, 80.0, true},
        AxisProfile{"Y", -1.0, 300.0, 3000.0, 500.0, 80.0, true},
        AxisProfile{"Z", -100.0, 60.0, 1200.0, 350.0, 400.0, true},
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
        case 2:
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
    return parseWithPosition(gcode, 0.0, 0.0, 0.0);
}

ControllerProgram LinuxCncCompatParser::parseWithPosition(const std::string& gcode, double x, double y, double z) const {
    ControllerProgram program;
    program.startPositionMm = {x, y, z};
    ControllerModalState modal;
    modal.positionMm = {x, y, z};
    int activeMotion = -1;
    bool programEnded = false;
    bool hasR = false;
    double rValRaw = 0.0;
    bool hasZ = false;
    double zValRaw = 0.0;

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

        const std::vector<std::string> parsedWords = tokenizeLine(line);
        bool hasCoord = false;
        bool hasArcOffset = false;
        bool hasMotionWord = false;
        bool hasRecord = false;
        bool feedUpdated = false;
        bool spindleUpdated = false;
        bool toolSelected = false;
        bool motionChanged = false;
        int lValue = 1;
        [[maybe_unused]] bool hasP = false;
        [[maybe_unused]] double pValue = 0.0;
        ControllerRecord record;
        record.sourceLine = lineNumber;
        record.sourceText = line;
        record.modal = modal;
        record.targetMm = modal.positionMm;
        record.feedRateMmPerMin = modal.feedRateMmPerMin;
        record.spindleRpm = modal.spindleRpm;
        record.tool = modal.activeTool;

        for (const auto& word : parsedWords) {
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
                    case 81:
                    case 84:
                        if (hasMotionWord) {
                            addDiagnostic(program.diagnostics, ControllerDiagnosticSeverity::Error, lineNumber, "gcode.modal.motion", "Multiple motion commands in one block");
                        }
                        activeMotion = code;
                        hasMotionWord = true;
                        motionChanged = true;
                        break;
                    case 80:
                        if (hasMotionWord) {
                            addDiagnostic(program.diagnostics, ControllerDiagnosticSeverity::Error, lineNumber, "gcode.modal.motion", "Multiple motion commands in one block");
                        }
                        activeMotion = -1;
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
                    case 98:
                        modal.retractToOldZ = true;
                        break;
                    case 99:
                        modal.retractToOldZ = false;
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
                    case 2:
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
                if (letter == 'Z') {
                    zValRaw = value;
                    hasZ = true;
                }
            } else if (letter == 'I' || letter == 'J' || letter == 'K') {
                const std::size_t index = letter == 'I' ? 0 : (letter == 'J' ? 1 : 2);
                record.arcCenterOffsetMm[index] = toMm(value, modal.units);
                hasArcOffset = true;
            } else if (letter == 'R') {
                rValRaw = value;
                hasR = true;
            } else if (letter == 'L') {
                lValue = static_cast<int>(std::llround(value));
            } else if (letter == 'P') {
                pValue = value;
                hasP = true;
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
                if (hasCoord || hasArcOffset) {
                    addDiagnostic(program.diagnostics, ControllerDiagnosticSeverity::Error, lineNumber, "gcode.motion.missing", "Coordinate block has no active motion mode");
                }
                continue;
            }
            if (activeMotion == 81 || activeMotion == 84) {
                if (!hasR) {
                    addDiagnostic(program.diagnostics, ControllerDiagnosticSeverity::Error, lineNumber, "gcode.canned.r", "Canned cycle requires R parameter");
                    continue;
                }
                if (!hasZ) {
                    addDiagnostic(program.diagnostics, ControllerDiagnosticSeverity::Error, lineNumber, "gcode.canned.z", "Canned cycle requires Z parameter");
                    continue;
                }
                if (modal.feedRateMmPerMin <= 0.0) {
                    addDiagnostic(program.diagnostics, ControllerDiagnosticSeverity::Error, lineNumber, "gcode.feed.missing", "Feed motion requires a positive F word before execution");
                    continue;
                }

                double initial_z = modal.positionMm[2];
                double r_val_mm = toMm(rValRaw, modal.units);
                double z_val_mm = toMm(zValRaw, modal.units);

                double r_abs = modal.absoluteDistance ? r_val_mm : initial_z + r_val_mm;
                double z_abs = modal.absoluteDistance ? z_val_mm : r_abs + z_val_mm;
                double retract_z = modal.retractToOldZ ? std::max(initial_z, r_abs) : r_abs;

                double target_x = modal.positionMm[0];
                double target_y = modal.positionMm[1];
                if (record.targetMm[0] != modal.positionMm[0] || (modal.absoluteDistance && hasCoord)) {
                    target_x = record.targetMm[0];
                }
                if (record.targetMm[1] != modal.positionMm[1] || (modal.absoluteDistance && hasCoord)) {
                    target_y = record.targetMm[1];
                }

                double dx = 0.0;
                double dy = 0.0;
                if (!modal.absoluteDistance) {
                    dx = record.targetMm[0] - modal.positionMm[0];
                    dy = record.targetMm[1] - modal.positionMm[1];
                }

                double current_z = initial_z;
                double current_x = modal.positionMm[0];
                double current_y = modal.positionMm[1];

                for (int i = 0; i < lValue; ++i) {
                    double repeat_x = modal.absoluteDistance ? target_x : current_x + dx;
                    double repeat_y = modal.absoluteDistance ? target_y : current_y + dy;

                    // 1. Traverse Z to R first if current_z < R
                    if (current_z < r_abs) {
                        ControllerRecord r;
                        r.sourceLine = lineNumber;
                        r.sourceText = line;
                        r.modal = modal;
                        r.type = ControllerRecordType::Rapid;
                        r.targetMm = {current_x, current_y, r_abs};
                        program.records.push_back(r);
                        current_z = r_abs;
                    }

                    // 2. Rapid traverse to XY
                    {
                        ControllerRecord r;
                        r.sourceLine = lineNumber;
                        r.sourceText = line;
                        r.modal = modal;
                        r.type = ControllerRecordType::Rapid;
                        r.targetMm = {repeat_x, repeat_y, current_z};
                        program.records.push_back(r);
                        current_x = repeat_x;
                        current_y = repeat_y;
                    }

                    // 3. Rapid to R if not there
                    if (current_z != r_abs) {
                        ControllerRecord r;
                        r.sourceLine = lineNumber;
                        r.sourceText = line;
                        r.modal = modal;
                        r.type = ControllerRecordType::Rapid;
                        r.targetMm = {current_x, current_y, r_abs};
                        program.records.push_back(r);
                        current_z = r_abs;
                    }

                    // 4. Feed to Z
                    {
                        ControllerRecord r;
                        r.sourceLine = lineNumber;
                        r.sourceText = line;
                        r.modal = modal;
                        r.type = ControllerRecordType::LinearFeed;
                        r.targetMm = {current_x, current_y, z_abs};
                        r.feedRateMmPerMin = modal.feedRateMmPerMin;
                        program.records.push_back(r);
                        current_z = z_abs;
                    }

                    // 5. Retract
                    if (activeMotion == 81) {
                        ControllerRecord r;
                        r.sourceLine = lineNumber;
                        r.sourceText = line;
                        r.modal = modal;
                        r.type = ControllerRecordType::Rapid;
                        r.targetMm = {current_x, current_y, retract_z};
                        program.records.push_back(r);
                        current_z = retract_z;
                    } else if (activeMotion == 84) {
                        {
                            ControllerRecord r;
                            r.sourceLine = lineNumber;
                            r.sourceText = line;
                            r.modal = modal;
                            r.type = ControllerRecordType::SpindleStop;
                            program.records.push_back(r);
                        }
                        {
                            ControllerRecord r;
                            r.sourceLine = lineNumber;
                            r.sourceText = line;
                            r.modal = modal;
                            r.type = ControllerRecordType::SetSpindle;
                            r.spindleRpm = -modal.spindleRpm;
                            program.records.push_back(r);
                        }
                        {
                            ControllerRecord r;
                            r.sourceLine = lineNumber;
                            r.sourceText = line;
                            r.modal = modal;
                            r.type = ControllerRecordType::LinearFeed;
                            r.targetMm = {current_x, current_y, retract_z};
                            r.feedRateMmPerMin = modal.feedRateMmPerMin;
                            program.records.push_back(r);
                            current_z = retract_z;
                        }
                        {
                            ControllerRecord r;
                            r.sourceLine = lineNumber;
                            r.sourceText = line;
                            r.modal = modal;
                            r.type = ControllerRecordType::SpindleStop;
                            program.records.push_back(r);
                        }
                        {
                            ControllerRecord r;
                            r.sourceLine = lineNumber;
                            r.sourceText = line;
                            r.modal = modal;
                            r.type = ControllerRecordType::SetSpindle;
                            r.spindleRpm = modal.spindleRpm;
                            program.records.push_back(r);
                        }
                    }
                }

                modal.positionMm = {current_x, current_y, current_z};
                hasRecord = false;
            } else {
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
            }
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

    struct PathBlock {
        std::array<double, 3> startMm;
        std::array<double, 3> endMm;
        double distanceMm;
        double maxVelocity;
        double maxAcceleration;
        double entryVelocity;
        double exitVelocity;
        uint32_t flags;
        std::size_t sourceLine;
    };

    std::vector<PathBlock> blocks;
    std::array<double, 3> current = program.startPositionMm;

    // 1. Generate path blocks
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

        // For simplicity, we linearize arcs here into small segments (same as LightweightSimulator)
        std::vector<std::array<double, 3>> waypoints;
        if (record.type == ControllerRecordType::ArcCW || record.type == ControllerRecordType::ArcCCW) {
            double startX = current[0];
            double startY = current[1];
            double endX = record.targetMm[0];
            double endY = record.targetMm[1];
            double cx = startX + record.arcCenterOffsetMm[0];
            double cy = startY + record.arcCenterOffsetMm[1];
            double rStart = std::hypot(startX - cx, startY - cy);
            double rEnd = std::hypot(endX - cx, endY - cy);
            double r = (rStart + rEnd) * 0.5;

            if (r > 1e-4) {
                double startAngle = std::atan2(startY - cy, startX - cx);
                double endAngle = std::atan2(endY - cy, endX - cx);

                bool isCW = (record.type == ControllerRecordType::ArcCW);
                double sweep = endAngle - startAngle;
                if (isCW) {
                    if (sweep > 0) sweep -= 2.0 * M_PI;
                } else {
                    if (sweep < 0) sweep += 2.0 * M_PI;
                }

                int numSegments = std::max(4, static_cast<int>(std::ceil(std::abs(sweep) * r / 0.5))); // 0.5mm segments
                for (int step = 1; step <= numSegments; ++step) {
                    double ratio = (double)step / numSegments;
                    double angle = startAngle + ratio * sweep;
                    double z = current[2] + ratio * (record.targetMm[2] - current[2]);
                    waypoints.push_back({cx + r * std::cos(angle), cy + r * std::sin(angle), z});
                }
            } else {
                waypoints.push_back(record.targetMm);
            }
        } else {
            waypoints.push_back(record.targetMm);
        }

        for (const auto& wp : waypoints) {
            std::array<double, 3> deltaMm = {
                wp[0] - current[0],
                wp[1] - current[1],
                wp[2] - current[2],
            };
            const double distanceMm = std::sqrt(deltaMm[0] * deltaMm[0] + deltaMm[1] * deltaMm[1] + deltaMm[2] * deltaMm[2]);
            if (distanceMm > 1e-9) {
                double maxVel = record.type == ControllerRecordType::Rapid ? m_profile.axes[0].maxVelocityMmPerMin : record.feedRateMmPerMin;
                double maxAccel = m_profile.axes[0].maxAccelerationMmPerSec2;

                for (std::size_t i = 0; i < 3; ++i) {
                    maxVel = std::min(maxVel, m_profile.axes[i].maxVelocityMmPerMin);
                    maxAccel = std::min(maxAccel, m_profile.axes[i].maxAccelerationMmPerSec2);
                }

                uint32_t flags = 0;
                if (record.type == ControllerRecordType::Rapid) flags |= kSegmentFlagRapid;
                if (record.modal.spindleRpm > 0.0) flags |= kSegmentFlagSpindleOn;
                if (record.coolant != CoolantMode::Off) flags |= kSegmentFlagCoolantOn;

                blocks.push_back({current, wp, distanceMm, maxVel / 60.0, maxAccel, 0.0, 0.0, flags, record.sourceLine});
                current = wp;
            }
        }
    }

    if (blocks.empty()) return segments;

    // 2. Junction Velocity Planning (Lookahead)
    // For simplicity, we assume continuous path blending for collinear segments.
    // If the angle between segments is sharp, we decelerate to 0.
    for (std::size_t i = 0; i < blocks.size() - 1; ++i) {
        auto& b1 = blocks[i];
        auto& b2 = blocks[i+1];
        std::array<double, 3> dir1 = {(b1.endMm[0] - b1.startMm[0]) / b1.distanceMm, (b1.endMm[1] - b1.startMm[1]) / b1.distanceMm, (b1.endMm[2] - b1.startMm[2]) / b1.distanceMm};
        std::array<double, 3> dir2 = {(b2.endMm[0] - b2.startMm[0]) / b2.distanceMm, (b2.endMm[1] - b2.startMm[1]) / b2.distanceMm, (b2.endMm[2] - b2.startMm[2]) / b2.distanceMm};
        double dot = dir1[0] * dir2[0] + dir1[1] * dir2[1] + dir1[2] * dir2[2];
        if (dot > 0.99) { // Roughly less than 8 degrees
            b1.exitVelocity = std::min(b1.maxVelocity, b2.maxVelocity);
            b2.entryVelocity = b1.exitVelocity;
        } else {
            b1.exitVelocity = 0.0;
            b2.entryVelocity = 0.0;
        }
    }
    blocks.front().entryVelocity = 0.0;
    blocks.back().exitVelocity = 0.0;

    // 3. Backward Pass
    for (int i = static_cast<int>(blocks.size()) - 2; i >= 0; --i) {
        auto& b = blocks[i];
        auto& next = blocks[i+1];
        b.exitVelocity = std::min(b.exitVelocity, next.entryVelocity);
        double maxEntry = std::sqrt(b.exitVelocity * b.exitVelocity + 2.0 * b.maxAcceleration * b.distanceMm);
        b.entryVelocity = std::min(b.entryVelocity, maxEntry);
    }

    // 4. Forward Pass
    for (std::size_t i = 1; i < blocks.size(); ++i) {
        auto& b = blocks[i];
        auto& prev = blocks[i-1];
        b.entryVelocity = std::min(b.entryVelocity, prev.exitVelocity);
        double maxExit = std::sqrt(b.entryVelocity * b.entryVelocity + 2.0 * b.maxAcceleration * b.distanceMm);
        b.exitVelocity = std::min(b.exitVelocity, maxExit);
    }

    // 5. Generate SpeSegments
    std::array<double, 3> hardwarePos = {0.0, 0.0, 0.0};
    for (const auto& block : blocks) {
        double d = block.distanceMm;
        double a = block.maxAcceleration;
        double v0 = block.entryVelocity;
        double v1 = block.exitVelocity;
        double vmax = block.maxVelocity;

        // Calculate intersection of accel and decel profiles
        double maxReachableSq = (2.0 * a * d + v0 * v0 + v1 * v1) / 2.0;
        if (vmax * vmax > maxReachableSq) {
            vmax = std::sqrt(maxReachableSq);
        }

        double t_accel = (vmax - v0) / a;
        double d_accel = v0 * t_accel + 0.5 * a * t_accel * t_accel;
        
        double t_decel = (vmax - v1) / a;
        double d_decel = vmax * t_decel - 0.5 * a * t_decel * t_decel;
        
        double d_cruise = d - d_accel - d_decel;
        double t_cruise = d_cruise / vmax;

        double total_time = t_accel + t_cruise + t_decel;
        
        // Output fixed duration segments
        double t = 0.0;
        double dt = m_profile.maxSegmentDurationSec;
        while (t < total_time) {
            double current_dt = std::min(dt, total_time - t);
            double v_start = 0.0;
            if (t < t_accel) {
                v_start = v0 + a * t;
            } else if (t < t_accel + t_cruise) {
                v_start = vmax;
            } else {
                v_start = vmax - a * (t - t_accel - t_cruise);
            }

            double next_t = t + current_dt;
            double v_end = 0.0;
            if (next_t < t_accel) {
                v_end = v0 + a * next_t;
            } else if (next_t < t_accel + t_cruise) {
                v_end = vmax;
            } else {
                v_end = vmax - a * (next_t - t_accel - t_cruise);
            }

            double dist_step = (v_start + v_end) * 0.5 * current_dt;
            double fraction = dist_step / d;

            SpeSegment seg;
            seg.sourceLine = block.sourceLine;
            seg.durationUsec = static_cast<uint32_t>(current_dt * 1000000.0);
            seg.flags = block.flags;
            
            for (std::size_t j = 0; j < 3; ++j) {
                hardwarePos[j] += fraction * (block.endMm[j] - block.startMm[j]);
                seg.deltaSteps[j] = static_cast<int32_t>(hardwarePos[j] * m_profile.axes[j].stepsPerMm);
            }

            segments.push_back(seg);
            t += current_dt;
        }
    }

    // Convert accumulated absolute steps back into delta steps for SpeSegment
    std::array<int32_t, 3> lastSteps = {0, 0, 0};
    for (auto& seg : segments) {
        std::array<int32_t, 3> absSteps = seg.deltaSteps;
        seg.deltaSteps[0] = absSteps[0] - lastSteps[0];
        seg.deltaSteps[1] = absSteps[1] - lastSteps[1];
        seg.deltaSteps[2] = absSteps[2] - lastSteps[2];
        lastSteps = absSteps;
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
                // Wait, to do it cleanly without having profile here, maybe MachineController handles Home differently?
                // For now, emulator Home just zeros. MachineController might need to zero XY and set Z.
            }
            break;
        case SpeCommand::Jog:
            if (m_status.state == SpeState::Armed && m_status.taskMode == SpeTaskMode::Manual) {
                for (std::size_t i = 0; i < 3; ++i) {
                    m_status.positionSteps[i] += command.jogSteps[i];
                }
            }
            break;
        case SpeCommand::SetTaskMode:
            if (m_status.state == SpeState::Armed || m_status.state == SpeState::Disarmed) {
                m_status.taskMode = command.requestedTaskMode;
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

MachineController::MachineController(MachineProfile profile)
    : m_profile(std::move(profile)), m_emulator(256), m_planner(m_profile) {
    // Initial setup
    m_workOffsets[54] = {0.0, 0.0, 0.0};
    
    double zHomeMm = (m_profile.nativeUnits == UnitMode::Inches) ? (2.0 * 25.4) : 2.0;
    m_emulator.mutableStatus().positionSteps[2] = static_cast<int32_t>(zHomeMm * m_profile.axes[2].stepsPerMm);

    
    SpeCommandMailbox cmd;
    cmd.command = SpeCommand::SetTaskMode;
    cmd.requestedTaskMode = SpeTaskMode::Manual;
    m_emulator.submitCommand(cmd);

    m_emulator.hostHeartbeat();
    cmd.command = SpeCommand::Arm;
    m_emulator.submitCommand(cmd);
}

void MachineController::setWorkOffset(int code, double x, double y, double z) {
    m_workOffsets[code] = {x, y, z};
}

std::array<double, 3> MachineController::getWorkOffset(int code) const {
    auto it = m_workOffsets.find(code);
    if (it != m_workOffsets.end()) {
        return it->second;
    }
    return {0.0, 0.0, 0.0};
}

void MachineController::setToolOffset(int toolId, double zOffset) {
    m_toolOffsets[toolId] = zOffset;
}

double MachineController::getToolOffset(int toolId) const {
    auto it = m_toolOffsets.find(toolId);
    if (it != m_toolOffsets.end()) {
        return it->second;
    }
    return 0.0;
}

void MachineController::jog(double dx, double dy, double dz) {
    SpeCommandMailbox cmd;
    cmd.command = SpeCommand::Jog;
    cmd.jogSteps[0] = static_cast<int32_t>(dx * m_profile.axes[0].stepsPerMm);
    cmd.jogSteps[1] = static_cast<int32_t>(dy * m_profile.axes[1].stepsPerMm);
    cmd.jogSteps[2] = static_cast<int32_t>(dz * m_profile.axes[2].stepsPerMm);
    m_emulator.submitCommand(cmd);
}

bool MachineController::submitMdi(const std::string& gcode) {
    std::array<double, 3> pos = getToolPosition();
    ControllerProgram prog = m_parser.parseWithPosition(gcode, pos[0], pos[1], pos[2]);
    std::cout << "[Controller] Parsed program with " << prog.records.size() << " records. Start pos: "
              << pos[0] << ", " << pos[1] << ", " << pos[2] << std::endl;

    if (!prog.valid()) {
        m_lastDiagnostics = prog.diagnostics;
        for (const auto& diag : prog.diagnostics) {
            std::cerr << "[Controller] Parser error on line " << diag.line << ": " << diag.message << std::endl;
        }
        return false;
    }
    std::vector<SpeSegment> segs = m_planner.plan(prog, m_lastDiagnostics);
    std::cout << "[Controller] Planner generated " << segs.size() << " segments." << std::endl;
    if (!segs.empty()) {
        std::cout << "[Controller] First segment distance: " 
                  << segs.front().deltaSteps[0] << ", " 
                  << segs.front().deltaSteps[1] << ", " 
                  << segs.front().deltaSteps[2] << " steps" << std::endl;
    }
    for (const auto& diag : m_lastDiagnostics) {
        if (diag.severity == ControllerDiagnosticSeverity::Error || diag.severity == ControllerDiagnosticSeverity::Fatal) {
            std::cerr << "[Controller] Planner error: " << diag.message << std::endl;
        }
    }

    m_plannedSegments.insert(m_plannedSegments.end(), segs.begin(), segs.end());
    
    SpeCommandMailbox cmd;
    cmd.command = SpeCommand::SetTaskMode;
    cmd.requestedTaskMode = SpeTaskMode::Mdi;
    m_emulator.submitCommand(cmd);

    m_emulator.hostHeartbeat();
    cmd.command = SpeCommand::Arm;
    m_emulator.submitCommand(cmd);

    return true;
}

void MachineController::tick(double dtSeconds) {
    m_timeAccumulator += dtSeconds;
    double segmentDt = m_profile.maxSegmentDurationSec;
    if (segmentDt <= 0.0) return;

    while (m_timeAccumulator >= segmentDt) {
        while (!m_plannedSegments.empty() && m_emulator.ring().size() < m_emulator.ring().capacity()) {
            m_emulator.ring().push(m_plannedSegments.front());
            m_plannedSegments.pop_front();
        }
        m_emulator.hostHeartbeat();

        std::array<double, 3> oldPos = getToolPosition();
        m_emulator.tick(false, false);
        std::array<double, 3> newPos = getToolPosition();

        if (oldPos[0] != newPos[0] || oldPos[1] != newPos[1] || oldPos[2] != newPos[2]) {
            // Cut segment (assume a tool radius of 3.175mm / 1/8" for now)
            m_materialSimulator.cutSegment(oldPos, newPos, 3.175);
        }

        m_timeAccumulator -= segmentDt;
    }
}

MaterialSimulator& MachineController::materialSimulator() {
    return m_materialSimulator;
}

const MaterialSimulator& MachineController::materialSimulator() const {
    return m_materialSimulator;
}

std::array<double, 3> MachineController::getToolPosition() const {
    auto steps = m_emulator.status().positionSteps;
    std::array<double, 3> activeOffset = getWorkOffset(54); // Assume G54 active for now
    std::array<double, 3> pos = {0.0, 0.0, 0.0};
    for (std::size_t i = 0; i < 3; ++i) {
        if (m_profile.axes[i].stepsPerMm != 0.0) {
            pos[i] = static_cast<double>(steps[i]) / m_profile.axes[i].stepsPerMm;
        }
        pos[i] += activeOffset[i];
    }
    return pos;
}

const MachineProfile& MachineController::getProfile() const {
    return m_profile;
}

SpeTaskMode MachineController::getTaskMode() const {
    return m_emulator.status().taskMode;
}

void MachineController::setTaskMode(SpeTaskMode mode) {
    SpeCommandMailbox cmd;
    cmd.command = SpeCommand::SetTaskMode;
    cmd.requestedTaskMode = mode;
    m_emulator.submitCommand(cmd);
}

SpeState MachineController::getState() const {
    return m_emulator.status().state;
}

std::size_t MachineController::getQueuedSegments() const {
    return m_plannedSegments.size() + m_emulator.status().queuedSegments;
}

} // namespace aim3d
