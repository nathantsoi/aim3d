#pragma once

#include "aim3d/topo_naming.hpp"

#include <array>
#include <string>
#include <vector>

// General document feature model.
//
// This header defines the typed, extensible feature graph that the headless
// core owns and projects to the UI and the Python facade:
//   - sketches anchor to a plane reference and own their entities
//   - solid features reference a sketch/profile and a boolean operation
//   - construction objects (planes/axes/points) are first-class and referenced
//     by stable token
//   - a timeline records the parametric history order
//
// Geometry payloads are captured generically (point lists + scalar params) so
// serialization is uniform across kinds. Exact evaluation is implemented only
// for the rectangle-profile extrude path today; other kinds are recorded with
// stub evaluators (see document.cpp).

namespace aim3d {

// ---- Stable references -------------------------------------------------

enum class OriginPlaneId {
    XY,
    XZ,
    YZ
};

const char* originPlaneName(OriginPlaneId plane);
OriginPlaneId originPlaneFromName(const std::string& name);

// A stable reference to a document entity by id and user-facing token.
struct EntityRef {
    EntityId id = 0;
    std::string token;
};

enum class SketchPlaneKind {
    Origin,
    ConstructionPlane,
    PlanarFace
};

const char* sketchPlaneKindName(SketchPlaneKind kind);

// How a sketch is anchored: a default origin plane, a construction plane, or a
// planar face on an existing body.
struct SketchPlaneReference {
    SketchPlaneKind kind = SketchPlaneKind::Origin;
    OriginPlaneId originPlane = OriginPlaneId::XY;
    EntityRef constructionPlane;  // when kind == ConstructionPlane
    EntityRef face;               // when kind == PlanarFace
};

// ---- Sketch entities ---------------------------------------------------

// Sketch element kinds. Named "Element" (not "Entity") to avoid colliding with
// the 2D solver's SketchEntity DTO in sketch_solver.hpp. The snapshot JSON key
// remains "entities" for UI/Fusion familiarity.
enum class SketchElementKind {
    Line,
    MidpointLine,
    Rectangle2Point,
    Rectangle3Point,
    RectangleCenter,
    CircleCenterDiameter,
    Circle2Point,
    Circle3Point,
    Arc3Point,
    ArcCenterPoint,
    ArcTangent,
    Polygon,
    Ellipse,
    Slot,
    Spline,
    ConicCurve,
    Point,
    Text,
    Mirror,
    CircularPattern,
    RectangularPattern,
    ProjectInclude,
    Dimension
};

const char* sketchElementKindName(SketchElementKind kind);
bool sketchElementKindFromName(const std::string& name, SketchElementKind& out);

// A single sketch-plane element. Geometry is captured generically as a list of
// 2D points plus optional scalar parameters, which keeps serialization uniform
// across kinds. Specific evaluators (closed-loop -> profile, dimensions ->
// driven geometry) are follow-up work.
struct SketchElement {
    EntityRef ref;
    SketchElementKind kind = SketchElementKind::Line;
    std::vector<std::array<double, 2>> points;
    double radius = 0.0;
    double value = 0.0;       // dimension value / generic scalar
    bool construction = false;
    std::string label;
};

// ---- Profiles ----------------------------------------------------------

struct ProfileReference {
    std::string sketchToken;
    int profileIndex = 0;
};

// ---- Solid features ----------------------------------------------------

enum class FeatureOperation {
    NewBody,
    Join,
    Cut,
    Intersect
};

const char* featureOperationName(FeatureOperation op);
FeatureOperation featureOperationFromName(const std::string& name);

enum class SolidFeatureKind {
    Extrude,
    Revolve,
    Sweep,
    Loft,
    Rib,
    Web,
    Emboss,
    Hole,
    Thread,
    Box,
    Cylinder,
    Sphere,
    Torus,
    Coil,
    Pipe,
    Mirror,
    Pattern,
    Thicken,
    BoundaryFill,
    Form,
    Derive,
    AutomatedModeling,
    BaseFeature
};

const char* solidFeatureKindName(SolidFeatureKind kind);
bool solidFeatureKindFromName(const std::string& name, SolidFeatureKind& out);

struct SolidFeature {
    EntityRef ref;
    SolidFeatureKind kind = SolidFeatureKind::Extrude;
    FeatureOperation operation = FeatureOperation::NewBody;
    ProfileReference profile;
    EntityId sketchId = 0;
    EntityId bodyId = 0;       // body produced (0 when not yet evaluated)
    double value = 0.0;        // primary scalar (extrude distance, revolve angle, ...)
    std::string unit = "mm";
    bool dirty = false;
    std::string label;
};

// ---- Construction objects ---------------------------------------------

enum class ConstructionKind {
    UCS,
    OffsetPlane,
    PlaneAtAngle,
    TangentPlane,
    Midplane,
    PerpendicularPlane,
    PlaneThroughTwoEdges,
    PlaneThroughThreePoints,
    PlaneAlongPath,
    AxisThroughCylinderConeTorus,
    AxisPerpendicularToFace,
    AxisThroughTwoPlanes,
    AxisThroughTwoPoints,
    AxisThroughEdge,
    PointAtVertex,
    PointThroughTwoEdges,
    PointThroughThreePlanes,
    PointAtCenter,
    PointAtEdgeAndPlane,
    PointAlongPath
};

const char* constructionKindName(ConstructionKind kind);
bool constructionKindFromName(const std::string& name, ConstructionKind& out);

// Browser category for a construction object: "plane", "axis", or "point".
const char* constructionCategory(ConstructionKind kind);

struct ConstructionObject {
    EntityRef ref;
    ConstructionKind kind = ConstructionKind::OffsetPlane;
    std::vector<std::string> inputs;  // tokens of referenced geometry
    double value = 0.0;               // offset/angle parameter
    bool visible = true;
    std::string label;
    // Evaluated geometry (stub placement until full kernel refs are wired).
    std::array<double, 3> origin = {0.0, 0.0, 0.0};
    std::array<double, 3> axisU = {1.0, 0.0, 0.0};   // in-plane U or axis direction
    std::array<double, 3> axisV = {0.0, 1.0, 0.0};   // in-plane V (planes only)
    std::array<double, 3> normal = {0.0, 0.0, 1.0};  // plane normal
    double extent = 2.0;                              // half-size of plane grid / axis length
};

// Assign stub world-space geometry for a construction object from its kind,
// inputs, and scalar parameter (offset, angle, etc.).
void evaluateConstructionGeometry(ConstructionObject& object);

// ---- Sketch feature ----------------------------------------------------

struct SketchFeature {
    EntityRef ref;
    SketchPlaneReference plane;
    std::vector<SketchElement> entities;
    bool visible = true;
};

// ---- Timeline ----------------------------------------------------------

enum class TimelineCategory {
    Sketch,
    Solid
};

struct TimelineEntry {
    TimelineCategory category = TimelineCategory::Sketch;
    std::string token;  // sketch or solid feature token
};

// Lightweight projection of a timeline feature, used for back-compatible
// queries and the UI timeline ticks.
struct TimelineFeatureInfo {
    std::string token;
    std::string type;   // "Sketch", "Extrude", "Revolve", ...
    std::string label;
    double value = 0.0;
    std::string unit = "mm";
    bool dirty = false;
};

} // namespace aim3d
