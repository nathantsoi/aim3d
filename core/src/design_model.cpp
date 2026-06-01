#include "aim3d/design_model.hpp"

#include <algorithm>
#include <cctype>
#include <unordered_map>

namespace aim3d {

namespace {

std::string toLower(const std::string& value) {
    std::string out = value;
    std::transform(out.begin(), out.end(), out.begin(), [](unsigned char c) {
        return static_cast<char>(std::tolower(c));
    });
    return out;
}

} // namespace

const char* originPlaneName(OriginPlaneId plane) {
    switch (plane) {
    case OriginPlaneId::XZ: return "XZ";
    case OriginPlaneId::YZ: return "YZ";
    case OriginPlaneId::XY:
    default: return "XY";
    }
}

OriginPlaneId originPlaneFromName(const std::string& name) {
    const std::string lowered = toLower(name);
    if (lowered.find("yz") != std::string::npos) {
        return OriginPlaneId::YZ;
    }
    if (lowered.find("xz") != std::string::npos) {
        return OriginPlaneId::XZ;
    }
    return OriginPlaneId::XY;
}

const char* sketchPlaneKindName(SketchPlaneKind kind) {
    switch (kind) {
    case SketchPlaneKind::ConstructionPlane: return "ConstructionPlane";
    case SketchPlaneKind::PlanarFace: return "PlanarFace";
    case SketchPlaneKind::Origin:
    default: return "Origin";
    }
}

namespace {

const std::vector<std::pair<SketchElementKind, const char*>>& sketchElementTable() {
    static const std::vector<std::pair<SketchElementKind, const char*>> table = {
        {SketchElementKind::Line, "Line"},
        {SketchElementKind::MidpointLine, "MidpointLine"},
        {SketchElementKind::Rectangle2Point, "Rectangle2Point"},
        {SketchElementKind::Rectangle3Point, "Rectangle3Point"},
        {SketchElementKind::RectangleCenter, "RectangleCenter"},
        {SketchElementKind::CircleCenterDiameter, "CircleCenterDiameter"},
        {SketchElementKind::Circle2Point, "Circle2Point"},
        {SketchElementKind::Circle3Point, "Circle3Point"},
        {SketchElementKind::Arc3Point, "Arc3Point"},
        {SketchElementKind::ArcCenterPoint, "ArcCenterPoint"},
        {SketchElementKind::ArcTangent, "ArcTangent"},
        {SketchElementKind::Polygon, "Polygon"},
        {SketchElementKind::Ellipse, "Ellipse"},
        {SketchElementKind::Slot, "Slot"},
        {SketchElementKind::Spline, "Spline"},
        {SketchElementKind::ConicCurve, "ConicCurve"},
        {SketchElementKind::Point, "Point"},
        {SketchElementKind::Text, "Text"},
        {SketchElementKind::Mirror, "Mirror"},
        {SketchElementKind::CircularPattern, "CircularPattern"},
        {SketchElementKind::RectangularPattern, "RectangularPattern"},
        {SketchElementKind::ProjectInclude, "ProjectInclude"},
        {SketchElementKind::Dimension, "Dimension"},
    };
    return table;
}

} // namespace

const char* sketchElementKindName(SketchElementKind kind) {
    for (const auto& entry : sketchElementTable()) {
        if (entry.first == kind) {
            return entry.second;
        }
    }
    return "Line";
}

bool sketchElementKindFromName(const std::string& name, SketchElementKind& out) {
    const std::string lowered = toLower(name);
    for (const auto& entry : sketchElementTable()) {
        if (toLower(entry.second) == lowered) {
            out = entry.first;
            return true;
        }
    }
    return false;
}

const char* featureOperationName(FeatureOperation op) {
    switch (op) {
    case FeatureOperation::Join: return "Join";
    case FeatureOperation::Cut: return "Cut";
    case FeatureOperation::Intersect: return "Intersect";
    case FeatureOperation::NewBody:
    default: return "NewBody";
    }
}

FeatureOperation featureOperationFromName(const std::string& name) {
    const std::string lowered = toLower(name);
    if (lowered.find("join") != std::string::npos) {
        return FeatureOperation::Join;
    }
    if (lowered.find("cut") != std::string::npos) {
        return FeatureOperation::Cut;
    }
    if (lowered.find("intersect") != std::string::npos) {
        return FeatureOperation::Intersect;
    }
    return FeatureOperation::NewBody;
}

namespace {

const std::vector<std::pair<SolidFeatureKind, const char*>>& solidFeatureTable() {
    static const std::vector<std::pair<SolidFeatureKind, const char*>> table = {
        {SolidFeatureKind::Extrude, "Extrude"},
        {SolidFeatureKind::Revolve, "Revolve"},
        {SolidFeatureKind::Sweep, "Sweep"},
        {SolidFeatureKind::Loft, "Loft"},
        {SolidFeatureKind::Rib, "Rib"},
        {SolidFeatureKind::Web, "Web"},
        {SolidFeatureKind::Emboss, "Emboss"},
        {SolidFeatureKind::Hole, "Hole"},
        {SolidFeatureKind::Thread, "Thread"},
        {SolidFeatureKind::Box, "Box"},
        {SolidFeatureKind::Cylinder, "Cylinder"},
        {SolidFeatureKind::Sphere, "Sphere"},
        {SolidFeatureKind::Torus, "Torus"},
        {SolidFeatureKind::Coil, "Coil"},
        {SolidFeatureKind::Pipe, "Pipe"},
        {SolidFeatureKind::Mirror, "Mirror"},
        {SolidFeatureKind::Pattern, "Pattern"},
        {SolidFeatureKind::Thicken, "Thicken"},
        {SolidFeatureKind::BoundaryFill, "BoundaryFill"},
        {SolidFeatureKind::Form, "Form"},
        {SolidFeatureKind::Derive, "Derive"},
        {SolidFeatureKind::AutomatedModeling, "AutomatedModeling"},
        {SolidFeatureKind::BaseFeature, "BaseFeature"},
    };
    return table;
}

} // namespace

const char* solidFeatureKindName(SolidFeatureKind kind) {
    for (const auto& entry : solidFeatureTable()) {
        if (entry.first == kind) {
            return entry.second;
        }
    }
    return "Extrude";
}

bool solidFeatureKindFromName(const std::string& name, SolidFeatureKind& out) {
    const std::string lowered = toLower(name);
    for (const auto& entry : solidFeatureTable()) {
        if (toLower(entry.second) == lowered) {
            out = entry.first;
            return true;
        }
    }
    return false;
}

namespace {

struct ConstructionInfo {
    ConstructionKind kind;
    const char* name;
    const char* category;
};

const std::vector<ConstructionInfo>& constructionTable() {
    static const std::vector<ConstructionInfo> table = {
        {ConstructionKind::UCS, "UCS", "ucs"},
        {ConstructionKind::OffsetPlane, "OffsetPlane", "plane"},
        {ConstructionKind::PlaneAtAngle, "PlaneAtAngle", "plane"},
        {ConstructionKind::TangentPlane, "TangentPlane", "plane"},
        {ConstructionKind::Midplane, "Midplane", "plane"},
        {ConstructionKind::PerpendicularPlane, "PerpendicularPlane", "plane"},
        {ConstructionKind::PlaneThroughTwoEdges, "PlaneThroughTwoEdges", "plane"},
        {ConstructionKind::PlaneThroughThreePoints, "PlaneThroughThreePoints", "plane"},
        {ConstructionKind::PlaneAlongPath, "PlaneAlongPath", "plane"},
        {ConstructionKind::AxisThroughCylinderConeTorus, "AxisThroughCylinderConeTorus", "axis"},
        {ConstructionKind::AxisPerpendicularToFace, "AxisPerpendicularToFace", "axis"},
        {ConstructionKind::AxisThroughTwoPlanes, "AxisThroughTwoPlanes", "axis"},
        {ConstructionKind::AxisThroughTwoPoints, "AxisThroughTwoPoints", "axis"},
        {ConstructionKind::AxisThroughEdge, "AxisThroughEdge", "axis"},
        {ConstructionKind::PointAtVertex, "PointAtVertex", "point"},
        {ConstructionKind::PointThroughTwoEdges, "PointThroughTwoEdges", "point"},
        {ConstructionKind::PointThroughThreePlanes, "PointThroughThreePlanes", "point"},
        {ConstructionKind::PointAtCenter, "PointAtCenter", "point"},
        {ConstructionKind::PointAtEdgeAndPlane, "PointAtEdgeAndPlane", "point"},
        {ConstructionKind::PointAlongPath, "PointAlongPath", "point"},
    };
    return table;
}

} // namespace

const char* constructionKindName(ConstructionKind kind) {
    for (const auto& entry : constructionTable()) {
        if (entry.kind == kind) {
            return entry.name;
        }
    }
    return "OffsetPlane";
}

bool constructionKindFromName(const std::string& name, ConstructionKind& out) {
    const std::string lowered = toLower(name);
    for (const auto& entry : constructionTable()) {
        if (toLower(entry.name) == lowered) {
            out = entry.kind;
            return true;
        }
    }
    return false;
}

const char* constructionCategory(ConstructionKind kind) {
    for (const auto& entry : constructionTable()) {
        if (entry.kind == kind) {
            return entry.category;
        }
    }
    return "plane";
}

} // namespace aim3d
