#pragma once

#include <string>
#include <vector>

namespace aim3d {

struct SketchPoint {
    int id = -1;
    double x = 0.0;
    double y = 0.0;
    bool isFixed = false;

    SketchPoint() = default;
    SketchPoint(double pointX, double pointY) : x(pointX), y(pointY) {}
    SketchPoint(int pointId, double pointX, double pointY, bool fixed = false)
        : id(pointId), x(pointX), y(pointY), isFixed(fixed) {}
};

enum class SketchEntityType {
    Point,
    Line,
    Circle
};

struct SketchEntity {
    int id = -1;
    SketchEntityType type = SketchEntityType::Point;
    int pointAId = -1;
    int pointBId = -1;
    int centerPointId = -1;
    double radius = 0.0;
};

enum class SketchConstraintKind {
    Coincident,
    Distance,
    Tangent,
    Fixed
};

struct SketchConstraintSpec {
    SketchConstraintKind kind = SketchConstraintKind::Distance;
    int entityIdA = -1;
    int entityIdB = -1;
    double value = 0.0;
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
    double residualError = 0.0;
    int iterations = 0;
    bool converged = false;
};

enum class SketchSolveStatus {
    Success,
    DidNotConverge,
    InvalidInput,
    Inconsistent
};

struct SketchSolveOptions {
    int maxIterations = 80;
    double tolerance = 1.0e-8;
    double finiteDifferenceStep = 1.0e-6;
    double damping = 1.0e-8;
};

struct SketchSolveRequest {
    std::vector<SketchPoint> points;
    std::vector<SketchEntity> entities;
    std::vector<SketchConstraintSpec> constraints;
    SketchSolveOptions options;
};

struct SketchSolveResult {
    SketchSolveStatus status = SketchSolveStatus::InvalidInput;
    std::vector<SketchPoint> points;
    SolverDiagnostics diagnostics;
};

class SketchSolver {
public:
    SketchSolver();
    ~SketchSolver();

    SketchSolveResult solve(const SketchSolveRequest& request) const;

    // Data-oriented solver entrypoint
    SolverDiagnostics solve(
        const std::vector<SketchPoint>& inputPoints,
        const std::vector<SketchConstraint>& constraints,
        std::vector<SketchPoint>& solvedPoints
    ) const;
};

} // namespace aim3d

extern "C" {

typedef struct Aim3dSketchPoint {
    int id;
    double x;
    double y;
    int fixed;
} Aim3dSketchPoint;

typedef struct Aim3dSketchEntity {
    int id;
    int type; // 0 point, 1 line, 2 circle
    int point_a_id;
    int point_b_id;
    int center_point_id;
    double radius;
} Aim3dSketchEntity;

typedef struct Aim3dSketchConstraint {
    int type; // 0 coincident, 1 distance, 2 tangent, 3 fixed
    int entity_a_id;
    int entity_b_id;
    double value;
} Aim3dSketchConstraint;

typedef struct Aim3dSketchSolveOptions {
    int max_iterations;
    double tolerance;
    double finite_difference_step;
    double damping;
} Aim3dSketchSolveOptions;

typedef struct Aim3dSketchSolveResult {
    int status; // 0 success, 1 did not converge, 2 invalid input, 3 inconsistent
    int is_fully_constrained;
    int degrees_of_freedom;
    int iterations;
    double residual_error;
    int warning_count;
    char message[256];
} Aim3dSketchSolveResult;

int aim3d_solve_sketch_2d(
    Aim3dSketchPoint* points,
    int point_count,
    const Aim3dSketchEntity* entities,
    int entity_count,
    const Aim3dSketchConstraint* constraints,
    int constraint_count,
    const Aim3dSketchSolveOptions* options,
    Aim3dSketchSolveResult* result
);

} // extern "C"
