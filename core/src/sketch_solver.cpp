#include "aim3d/sketch_solver.hpp"

#include <algorithm>
#include <array>
#include <cmath>
#include <cstring>
#include <limits>
#include <string>
#include <unordered_map>

namespace aim3d {
namespace {

constexpr double kEpsilon = 1.0e-12;

struct PointRef {
    bool found = false;
    std::size_t index = 0;
};

struct EntityLookup {
    std::unordered_map<int, std::size_t> pointsById;
    std::unordered_map<int, std::size_t> entitiesById;
};

EntityLookup buildLookup(const SketchSolveRequest& request) {
    EntityLookup lookup;
    for (std::size_t i = 0; i < request.points.size(); ++i) {
        lookup.pointsById[request.points[i].id] = i;
    }
    for (std::size_t i = 0; i < request.entities.size(); ++i) {
        lookup.entitiesById[request.entities[i].id] = i;
    }
    return lookup;
}

PointRef pointForIdOrEntity(const SketchSolveRequest& request, const EntityLookup& lookup, int id) {
    const auto pointIt = lookup.pointsById.find(id);
    if (pointIt != lookup.pointsById.end()) {
        return {true, pointIt->second};
    }

    const auto entityIt = lookup.entitiesById.find(id);
    if (entityIt == lookup.entitiesById.end()) {
        return {};
    }

    const auto& entity = request.entities[entityIt->second];
    if (entity.type != SketchEntityType::Point) {
        return {};
    }

    const auto entityPointIt = lookup.pointsById.find(entity.pointAId);
    if (entityPointIt == lookup.pointsById.end()) {
        return {};
    }
    return {true, entityPointIt->second};
}

const SketchEntity* entityForId(const SketchSolveRequest& request, const EntityLookup& lookup, int id) {
    const auto entityIt = lookup.entitiesById.find(id);
    if (entityIt == lookup.entitiesById.end()) {
        return nullptr;
    }
    return &request.entities[entityIt->second];
}

double distance(const SketchPoint& a, const SketchPoint& b) {
    return std::hypot(a.x - b.x, a.y - b.y);
}

double signedLineDistance(const SketchPoint& a, const SketchPoint& b, const SketchPoint& p) {
    const double dx = b.x - a.x;
    const double dy = b.y - a.y;
    const double length = std::hypot(dx, dy);
    if (length <= kEpsilon) {
        return std::numeric_limits<double>::quiet_NaN();
    }
    return ((p.x - a.x) * dy - (p.y - a.y) * dx) / length;
}

void appendFixedResiduals(
    const SketchSolveRequest& request,
    const std::vector<SketchPoint>& points,
    std::vector<double>& residuals
) {
    for (std::size_t i = 0; i < points.size(); ++i) {
        if (!request.points[i].isFixed) {
            continue;
        }
        residuals.push_back(points[i].x - request.points[i].x);
        residuals.push_back(points[i].y - request.points[i].y);
    }
}

bool appendConstraintResidual(
    const SketchSolveRequest& request,
    const EntityLookup& lookup,
    const std::vector<SketchPoint>& points,
    const SketchConstraintSpec& constraint,
    std::vector<double>& residuals,
    std::string& error
) {
    if (constraint.kind == SketchConstraintKind::Coincident) {
        const auto a = pointForIdOrEntity(request, lookup, constraint.entityIdA);
        const auto b = pointForIdOrEntity(request, lookup, constraint.entityIdB);
        if (!a.found || !b.found) {
            error = "COINCIDENT requires two point entities or point ids";
            return false;
        }
        residuals.push_back(points[a.index].x - points[b.index].x);
        residuals.push_back(points[a.index].y - points[b.index].y);
        return true;
    }

    if (constraint.kind == SketchConstraintKind::Distance) {
        const auto a = pointForIdOrEntity(request, lookup, constraint.entityIdA);
        const auto b = pointForIdOrEntity(request, lookup, constraint.entityIdB);
        if (!a.found || !b.found) {
            error = "DISTANCE requires two point entities or point ids";
            return false;
        }
        residuals.push_back(distance(points[a.index], points[b.index]) - constraint.value);
        return true;
    }

    if (constraint.kind == SketchConstraintKind::Fixed) {
        const auto p = pointForIdOrEntity(request, lookup, constraint.entityIdA);
        if (!p.found) {
            error = "FIXED requires a point entity or point id";
            return false;
        }
        residuals.push_back(points[p.index].x - request.points[p.index].x);
        residuals.push_back(points[p.index].y - request.points[p.index].y);
        return true;
    }

    const auto* first = entityForId(request, lookup, constraint.entityIdA);
    const auto* second = entityForId(request, lookup, constraint.entityIdB);
    if (constraint.kind == SketchConstraintKind::Tangent && first && second) {
        const SketchEntity* line = first->type == SketchEntityType::Line ? first : nullptr;
        const SketchEntity* circle = first->type == SketchEntityType::Circle ? first : nullptr;
        if (!line && second->type == SketchEntityType::Line) {
            line = second;
        }
        if (!circle && second->type == SketchEntityType::Circle) {
            circle = second;
        }

        if (line && circle) {
            const auto a = pointForIdOrEntity(request, lookup, line->pointAId);
            const auto b = pointForIdOrEntity(request, lookup, line->pointBId);
            const auto c = pointForIdOrEntity(request, lookup, circle->centerPointId);
            if (!a.found || !b.found || !c.found) {
                error = "TANGENT line-circle references missing points";
                return false;
            }
            const double lineDistance = signedLineDistance(points[a.index], points[b.index], points[c.index]);
            if (!std::isfinite(lineDistance)) {
                error = "TANGENT line-circle requires a non-degenerate line";
                return false;
            }
            residuals.push_back(std::abs(lineDistance) - circle->radius);
            return true;
        }

        if (first->type == SketchEntityType::Circle && second->type == SketchEntityType::Circle) {
            const auto a = pointForIdOrEntity(request, lookup, first->centerPointId);
            const auto b = pointForIdOrEntity(request, lookup, second->centerPointId);
            if (!a.found || !b.found) {
                error = "TANGENT circle-circle references missing centers";
                return false;
            }
            const double target = constraint.value < 0.0
                ? std::abs(first->radius - second->radius)
                : first->radius + second->radius;
            residuals.push_back(distance(points[a.index], points[b.index]) - target);
            return true;
        }
    }

    error = "Unsupported sketch constraint/entity combination";
    return false;
}

bool computeResiduals(
    const SketchSolveRequest& request,
    const EntityLookup& lookup,
    const std::vector<SketchPoint>& points,
    std::vector<double>& residuals,
    std::string& error
) {
    residuals.clear();
    appendFixedResiduals(request, points, residuals);
    for (const auto& constraint : request.constraints) {
        if (!appendConstraintResidual(request, lookup, points, constraint, residuals, error)) {
            return false;
        }
    }
    return true;
}

double residualNorm(const std::vector<double>& residuals) {
    if (residuals.empty()) {
        return 0.0;
    }
    double sum = 0.0;
    for (const double residual : residuals) {
        sum += residual * residual;
    }
    return std::sqrt(sum / static_cast<double>(residuals.size()));
}

bool solveLinearSystem(std::vector<std::vector<double>> a, std::vector<double> b, std::vector<double>& x) {
    const std::size_t n = b.size();
    x.assign(n, 0.0);
    for (std::size_t col = 0; col < n; ++col) {
        std::size_t pivot = col;
        for (std::size_t row = col + 1; row < n; ++row) {
            if (std::abs(a[row][col]) > std::abs(a[pivot][col])) {
                pivot = row;
            }
        }
        if (std::abs(a[pivot][col]) <= kEpsilon) {
            return false;
        }
        if (pivot != col) {
            std::swap(a[pivot], a[col]);
            std::swap(b[pivot], b[col]);
        }
        const double diag = a[col][col];
        for (std::size_t j = col; j < n; ++j) {
            a[col][j] /= diag;
        }
        b[col] /= diag;
        for (std::size_t row = 0; row < n; ++row) {
            if (row == col) {
                continue;
            }
            const double factor = a[row][col];
            for (std::size_t j = col; j < n; ++j) {
                a[row][j] -= factor * a[col][j];
            }
            b[row] -= factor * b[col];
        }
    }
    x = b;
    return true;
}

int matrixRank(std::vector<std::vector<double>> matrix, double tolerance) {
    if (matrix.empty() || matrix[0].empty()) {
        return 0;
    }

    const std::size_t rows = matrix.size();
    const std::size_t cols = matrix[0].size();
    std::size_t rank = 0;
    for (std::size_t col = 0; col < cols && rank < rows; ++col) {
        std::size_t pivot = rank;
        for (std::size_t row = rank + 1; row < rows; ++row) {
            if (std::abs(matrix[row][col]) > std::abs(matrix[pivot][col])) {
                pivot = row;
            }
        }
        if (std::abs(matrix[pivot][col]) <= tolerance) {
            continue;
        }
        std::swap(matrix[pivot], matrix[rank]);
        const double diag = matrix[rank][col];
        for (std::size_t j = col; j < cols; ++j) {
            matrix[rank][j] /= diag;
        }
        for (std::size_t row = 0; row < rows; ++row) {
            if (row == rank) {
                continue;
            }
            const double factor = matrix[row][col];
            for (std::size_t j = col; j < cols; ++j) {
                matrix[row][j] -= factor * matrix[rank][j];
            }
        }
        ++rank;
    }
    return static_cast<int>(rank);
}

std::vector<std::array<std::size_t, 2>> variableMap(const std::vector<SketchPoint>& points) {
    std::vector<std::array<std::size_t, 2>> variables;
    for (std::size_t i = 0; i < points.size(); ++i) {
        if (points[i].isFixed) {
            continue;
        }
        variables.push_back({i, 0});
        variables.push_back({i, 1});
    }
    return variables;
}

void addToVariable(std::vector<SketchPoint>& points, const std::array<std::size_t, 2>& variable, double delta) {
    if (variable[1] == 0) {
        points[variable[0]].x += delta;
    } else {
        points[variable[0]].y += delta;
    }
}

std::vector<std::vector<double>> computeJacobian(
    const SketchSolveRequest& request,
    const EntityLookup& lookup,
    const std::vector<SketchPoint>& points,
    const std::vector<double>& residuals,
    const std::vector<std::array<std::size_t, 2>>& variables,
    double step,
    std::string& error
) {
    std::vector<std::vector<double>> jacobian(residuals.size(), std::vector<double>(variables.size(), 0.0));
    for (std::size_t variableIndex = 0; variableIndex < variables.size(); ++variableIndex) {
        auto perturbed = points;
        addToVariable(perturbed, variables[variableIndex], step);

        std::vector<double> perturbedResiduals;
        if (!computeResiduals(request, lookup, perturbed, perturbedResiduals, error)) {
            return {};
        }
        if (perturbedResiduals.size() != residuals.size()) {
            error = "Residual size changed during finite difference evaluation";
            return {};
        }
        for (std::size_t row = 0; row < residuals.size(); ++row) {
            jacobian[row][variableIndex] = (perturbedResiduals[row] - residuals[row]) / step;
        }
    }
    return jacobian;
}

SketchConstraintKind kindFromString(const std::string& type) {
    if (type == "COINCIDENT") {
        return SketchConstraintKind::Coincident;
    }
    if (type == "TANGENT") {
        return SketchConstraintKind::Tangent;
    }
    if (type == "FIXED") {
        return SketchConstraintKind::Fixed;
    }
    return SketchConstraintKind::Distance;
}

} // namespace

SketchSolver::SketchSolver() = default;
SketchSolver::~SketchSolver() = default;

SketchSolveResult SketchSolver::solve(const SketchSolveRequest& request) const {
    SketchSolveResult result;
    result.points = request.points;

    if (request.options.maxIterations < 1 || request.options.tolerance <= 0.0 ||
        request.options.finiteDifferenceStep <= 0.0 || request.options.damping < 0.0) {
        result.status = SketchSolveStatus::InvalidInput;
        result.diagnostics.warnings.push_back("Invalid sketch solver options");
        return result;
    }

    const auto lookup = buildLookup(request);
    std::string error;
    std::vector<double> residuals;
    if (!computeResiduals(request, lookup, result.points, residuals, error)) {
        result.status = SketchSolveStatus::InvalidInput;
        result.diagnostics.warnings.push_back(error);
        return result;
    }

    const auto variables = variableMap(result.points);
    if (variables.empty()) {
        result.diagnostics.residualError = residualNorm(residuals);
        result.diagnostics.degreesOfFreedom = 0;
        result.diagnostics.isFullyConstrained = true;
        result.diagnostics.converged = result.diagnostics.residualError <= request.options.tolerance;
        result.status = result.diagnostics.converged ? SketchSolveStatus::Success : SketchSolveStatus::Inconsistent;
        if (result.status != SketchSolveStatus::Success) {
            result.diagnostics.warnings.push_back("Fixed sketch does not satisfy all constraints");
        }
        return result;
    }

    double currentNorm = residualNorm(residuals);
    double damping = std::max(request.options.damping, 1.0e-12);

    for (int iteration = 0; iteration < request.options.maxIterations; ++iteration) {
        result.diagnostics.iterations = iteration + 1;
        if (currentNorm <= request.options.tolerance) {
            result.diagnostics.converged = true;
            break;
        }

        const auto jacobian = computeJacobian(
            request,
            lookup,
            result.points,
            residuals,
            variables,
            request.options.finiteDifferenceStep,
            error
        );
        if (!error.empty()) {
            result.status = SketchSolveStatus::InvalidInput;
            result.diagnostics.warnings.push_back(error);
            return result;
        }

        std::vector<std::vector<double>> normal(variables.size(), std::vector<double>(variables.size(), 0.0));
        std::vector<double> rhs(variables.size(), 0.0);
        for (std::size_t row = 0; row < residuals.size(); ++row) {
            for (std::size_t col = 0; col < variables.size(); ++col) {
                rhs[col] -= jacobian[row][col] * residuals[row];
                for (std::size_t k = 0; k < variables.size(); ++k) {
                    normal[col][k] += jacobian[row][col] * jacobian[row][k];
                }
            }
        }
        for (std::size_t i = 0; i < variables.size(); ++i) {
            normal[i][i] += damping;
        }

        std::vector<double> step;
        if (!solveLinearSystem(normal, rhs, step)) {
            result.status = SketchSolveStatus::DidNotConverge;
            result.diagnostics.warnings.push_back("Linearized sketch solve became singular");
            break;
        }

        bool accepted = false;
        double scale = 1.0;
        for (int attempt = 0; attempt < 8; ++attempt) {
            auto candidate = result.points;
            for (std::size_t i = 0; i < variables.size(); ++i) {
                addToVariable(candidate, variables[i], step[i] * scale);
            }

            std::vector<double> candidateResiduals;
            if (!computeResiduals(request, lookup, candidate, candidateResiduals, error)) {
                result.status = SketchSolveStatus::InvalidInput;
                result.diagnostics.warnings.push_back(error);
                return result;
            }
            const double candidateNorm = residualNorm(candidateResiduals);
            if (candidateNorm < currentNorm || candidateNorm <= request.options.tolerance) {
                result.points = candidate;
                residuals = candidateResiduals;
                currentNorm = candidateNorm;
                damping = std::max(damping * 0.25, request.options.damping);
                accepted = true;
                break;
            }
            scale *= 0.5;
        }

        if (!accepted) {
            damping *= 10.0;
        }

        double maxStep = 0.0;
        for (const double value : step) {
            maxStep = std::max(maxStep, std::abs(value));
        }
        if (maxStep <= request.options.tolerance && currentNorm <= request.options.tolerance * 100.0) {
            result.diagnostics.converged = true;
            break;
        }
    }

    result.diagnostics.residualError = currentNorm;

    error.clear();
    const auto finalJacobian = computeJacobian(
        request,
        lookup,
        result.points,
        residuals,
        variables,
        request.options.finiteDifferenceStep,
        error
    );
    const int rank = error.empty() ? matrixRank(finalJacobian, 1.0e-7) : 0;
    result.diagnostics.degreesOfFreedom = std::max(0, static_cast<int>(variables.size()) - rank);
    result.diagnostics.isFullyConstrained = result.diagnostics.degreesOfFreedom == 0;

    if (currentNorm <= std::max(request.options.tolerance * 100.0, 1.0e-6)) {
        result.status = SketchSolveStatus::Success;
        result.diagnostics.converged = true;
    } else if (currentNorm > 1.0e-4) {
        result.status = SketchSolveStatus::Inconsistent;
        result.diagnostics.warnings.push_back("Sketch constraints could not be satisfied within tolerance");
    } else if (result.status != SketchSolveStatus::DidNotConverge) {
        result.status = SketchSolveStatus::DidNotConverge;
        result.diagnostics.warnings.push_back("Sketch solve reached iteration limit before convergence");
    }

    return result;
}

SolverDiagnostics SketchSolver::solve(
    const std::vector<SketchPoint>& inputPoints,
    const std::vector<SketchConstraint>& constraints,
    std::vector<SketchPoint>& solvedPoints
) const {
    SketchSolveRequest request;
    request.points = inputPoints;
    request.entities.reserve(inputPoints.size());
    for (std::size_t i = 0; i < inputPoints.size(); ++i) {
        if (request.points[i].id < 0) {
            request.points[i].id = static_cast<int>(i);
        }
        SketchEntity entity;
        entity.id = request.points[i].id;
        entity.type = SketchEntityType::Point;
        entity.pointAId = request.points[i].id;
        request.entities.push_back(entity);
    }
    for (const auto& constraint : constraints) {
        request.constraints.push_back({
            kindFromString(constraint.type),
            constraint.entityIdA,
            constraint.entityIdB,
            constraint.value
        });
    }

    const auto result = solve(request);
    solvedPoints = result.points;
    return result.diagnostics;
}

} // namespace aim3d

namespace {

void copyMessage(const std::string& message, Aim3dSketchSolveResult* result) {
    std::memset(result->message, 0, sizeof(result->message));
    std::strncpy(result->message, message.c_str(), sizeof(result->message) - 1);
}

} // namespace

int aim3d_solve_sketch_2d(
    Aim3dSketchPoint* points,
    int point_count,
    const Aim3dSketchEntity* entities,
    int entity_count,
    const Aim3dSketchConstraint* constraints,
    int constraint_count,
    const Aim3dSketchSolveOptions* options,
    Aim3dSketchSolveResult* result
) {
    if (!points || point_count < 0 || entity_count < 0 || constraint_count < 0 || !result ||
        (entity_count > 0 && !entities) || (constraint_count > 0 && !constraints)) {
        return 2;
    }

    aim3d::SketchSolveRequest request;
    request.points.reserve(static_cast<std::size_t>(point_count));
    for (int i = 0; i < point_count; ++i) {
        request.points.push_back({points[i].id, points[i].x, points[i].y, points[i].fixed != 0});
    }

    request.entities.reserve(static_cast<std::size_t>(entity_count));
    for (int i = 0; i < entity_count; ++i) {
        aim3d::SketchEntityType type = aim3d::SketchEntityType::Point;
        if (entities[i].type == 1) {
            type = aim3d::SketchEntityType::Line;
        } else if (entities[i].type == 2) {
            type = aim3d::SketchEntityType::Circle;
        }
        request.entities.push_back({
            entities[i].id,
            type,
            entities[i].point_a_id,
            entities[i].point_b_id,
            entities[i].center_point_id,
            entities[i].radius
        });
    }

    request.constraints.reserve(static_cast<std::size_t>(constraint_count));
    for (int i = 0; i < constraint_count; ++i) {
        aim3d::SketchConstraintKind kind = aim3d::SketchConstraintKind::Coincident;
        if (constraints[i].type == 1) {
            kind = aim3d::SketchConstraintKind::Distance;
        } else if (constraints[i].type == 2) {
            kind = aim3d::SketchConstraintKind::Tangent;
        } else if (constraints[i].type == 3) {
            kind = aim3d::SketchConstraintKind::Fixed;
        }
        request.constraints.push_back({
            kind,
            constraints[i].entity_a_id,
            constraints[i].entity_b_id,
            constraints[i].value
        });
    }

    if (options) {
        if (options->max_iterations > 0) {
            request.options.maxIterations = options->max_iterations;
        }
        if (options->tolerance > 0.0) {
            request.options.tolerance = options->tolerance;
        }
        if (options->finite_difference_step > 0.0) {
            request.options.finiteDifferenceStep = options->finite_difference_step;
        }
        if (options->damping >= 0.0) {
            request.options.damping = options->damping;
        }
    }

    const aim3d::SketchSolver solver;
    const auto solved = solver.solve(request);
    for (int i = 0; i < point_count && i < static_cast<int>(solved.points.size()); ++i) {
        points[i].x = solved.points[static_cast<std::size_t>(i)].x;
        points[i].y = solved.points[static_cast<std::size_t>(i)].y;
    }

    result->status = static_cast<int>(solved.status);
    result->is_fully_constrained = solved.diagnostics.isFullyConstrained ? 1 : 0;
    result->degrees_of_freedom = solved.diagnostics.degreesOfFreedom;
    result->iterations = solved.diagnostics.iterations;
    result->residual_error = solved.diagnostics.residualError;
    result->warning_count = static_cast<int>(solved.diagnostics.warnings.size());
    copyMessage(
        solved.diagnostics.warnings.empty() ? "ok" : solved.diagnostics.warnings.front(),
        result
    );
    return result->status;
}
