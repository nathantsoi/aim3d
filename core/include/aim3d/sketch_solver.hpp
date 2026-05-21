#pragma once

#include <vector>
#include <string>

namespace aim3d {

struct SketchPoint {
    double x;
    double y;
};

struct SketchConstraint {
    std::string type; // "COINCIDENT", "TANGENT", "DISTANCE"
    int entityIdA;
    int entityIdB;
    double value;      // e.g. distance value
};

struct SolverDiagnostics {
    bool isFullyConstrained;
    int degreesOfFreedom;
    std::vector<std::string> warnings;
};

class SketchSolver {
public:
    SketchSolver();
    ~SketchSolver();

    // Data-oriented solver entrypoint
    SolverDiagnostics solve(
        const std::vector<SketchPoint>& inputPoints,
        const std::vector<SketchConstraint>& constraints,
        std::vector<SketchPoint>& solvedPoints
    );
};

} // namespace aim3d
