#pragma once

#include "aim3d/design_model.hpp"
#include "aim3d/history_tree.hpp"
#include "aim3d/topo_naming.hpp"

#include <string>
#include <vector>
#include <memory>
#include <array>
#include <cstdint>
#include <mutex>
#include <utility>

namespace aim3d {

struct KernelShape;

enum class GeometryFormat {
    Unknown,
    Step,
    Iges,
    Brep
};

struct BoundingBox {
    double minX = 0.0;
    double minY = 0.0;
    double minZ = 0.0;
    double maxX = 0.0;
    double maxY = 0.0;
    double maxZ = 0.0;
};

struct BodyInspection {
    EntityId id = 0;
    std::string name;
    GeometryFormat sourceFormat = GeometryFormat::Unknown;
    std::string shapeType = "Unknown";
    BoundingBox bounds;
    std::size_t faceCount = 0;
    std::size_t edgeCount = 0;
    std::size_t vertexCount = 0;
};

struct ViewportSolidMesh {
    struct SnapPoint {
        std::string id;
        std::string kind;
        std::array<float, 3> position = {0.0f, 0.0f, 0.0f};
    };

    struct PickableMetadata {
        std::string entityId;
        std::string kind = "B-rep Entity";
        int priority = 0;
        std::vector<SnapPoint> snapPoints;
    };

    std::string id;
    EntityId bodyId = 0;
    std::string sourceToken;
    PickableMetadata pickable;
    std::vector<float> positions;
    std::vector<float> normals;
    std::vector<float> colors;
    std::vector<std::uint32_t> indices;
    std::array<float, 16> transform = {
        1.0f, 0.0f, 0.0f, 0.0f,
        0.0f, 1.0f, 0.0f, 0.0f,
        0.0f, 0.0f, 1.0f, 0.0f,
        0.0f, 0.0f, 0.0f, 1.0f
    };
};

struct ViewportToolpath {
    std::string id;
    std::string operationId;
    std::string status;
    std::array<float, 4> color = {1.0f, 0.74f, 0.18f, 1.0f};
    std::vector<float> points;
};

struct ViewportAxis {
    std::string id;
    std::string label;
    std::array<float, 4> color = {1.0f, 1.0f, 1.0f, 1.0f};
    std::vector<float> points;
};

// Renderable construction geometry (planes, axes, points) for the viewport.
struct ViewportConstruction {
    std::string id;
    std::string token;
    std::string category;  // plane, axis, point, ucs
    std::string kind;
    std::array<float, 4> color = {0.45f, 0.75f, 1.0f, 0.85f};
    std::vector<float> points;
    bool visible = true;
};

struct ViewportCamera {
    std::array<float, 3> target = {0.0f, 0.0f, 0.0f};
    float distance = 5.2f;
    float yaw = 0.72f;
    float pitch = 0.62f;
    float nearPlane = 0.01f;
    float farPlane = 100.0f;
};

struct ViewportDiagnostics {
    bool webgpuAvailable = false;
    float frameTimeMs = 0.0f;
    float fps = 0.0f;
    std::size_t drawCount = 0;
    std::size_t triangleCount = 0;
    std::size_t segmentCount = 0;
    float lastPickLatencyMs = 0.0f;
    std::string hoverTargetId;
    std::string snapCandidateId;
};

struct ViewportScene {
    std::vector<ViewportSolidMesh> solids;
    std::vector<ViewportToolpath> toolpaths;
    std::vector<ViewportAxis> axes;
    std::vector<ViewportConstruction> construction;
    ViewportCamera camera;
    ViewportDiagnostics diagnostics;
};

// The general feature model (sketches, solid features, construction objects,
// and the timeline) lives in design_model.hpp.

class BRepBody {
public:
    BRepBody(EntityId id, const std::string& name);
    BRepBody(const std::string& name) : BRepBody(0, name) {}

    EntityId id() const { return m_id; }
    std::string name() const { return m_name; }
    void setName(const std::string& name) { m_name = name; }
    GeometryFormat sourceFormat() const { return m_sourceFormat; }
    void setSourceFormat(GeometryFormat format) { m_sourceFormat = format; }
    std::string shapeType() const { return m_shapeType; }
    void setShapeType(const std::string& shapeType) { m_shapeType = shapeType; }
    
    const float* getVerticesBuffer(size_t& count) const;
    BodyInspection inspect() const;
    std::shared_ptr<KernelShape> kernelShapeHandle() const { return m_kernelShape; }

    // Synthetic axis-aligned box geometry, used to represent extruded
    // rectangular profiles when no exact B-rep kernel (OCCT) is available.
    bool hasBox() const { return m_hasBox; }
    const std::array<double, 3>& boxMin() const { return m_boxMin; }
    const std::array<double, 3>& boxMax() const { return m_boxMax; }
    void setBox(const std::array<double, 3>& minCorner, const std::array<double, 3>& maxCorner);

private:
    friend class Document;
    void setKernelShape(std::shared_ptr<KernelShape> shape) { m_kernelShape = std::move(shape); }

    EntityId m_id = 0;
    std::string m_name;
    GeometryFormat m_sourceFormat = GeometryFormat::Unknown;
    std::string m_shapeType = "Unknown";
    std::vector<float> m_vertices;
    std::shared_ptr<KernelShape> m_kernelShape;
    bool m_hasBox = false;
    std::array<double, 3> m_boxMin = {0.0, 0.0, 0.0};
    std::array<double, 3> m_boxMax = {0.0, 0.0, 0.0};
};

class Component {
public:
    Component(EntityId id, const std::string& name) : m_id(id), m_name(name) {}
    Component(const std::string& name) : Component(0, name) {}

    EntityId id() const { return m_id; }
    std::string name() const { return m_name; }
    
    std::vector<std::shared_ptr<BRepBody>> bRepBodies() const { return m_bodies; }
    void addBody(std::shared_ptr<BRepBody> body) { m_bodies.push_back(body); }

private:
    EntityId m_id = 0;
    std::string m_name;
    std::vector<std::shared_ptr<BRepBody>> m_bodies;
};

class Occurrence {
public:
    Occurrence(EntityId id, const std::string& name, std::shared_ptr<Component> comp)
        : m_id(id), m_name(name), m_component(comp) {}
    Occurrence(const std::string& name, std::shared_ptr<Component> comp)
        : Occurrence(0, name, comp) {}
    
    EntityId id() const { return m_id; }
    std::string name() const { return m_name; }
    std::shared_ptr<Component> component() const { return m_component; }

private:
    EntityId m_id = 0;
    std::string m_name;
    std::shared_ptr<Component> m_component;
};

class DesignProduct {
public:
    DesignProduct();
    explicit DesignProduct(EntityId rootComponentId);
    std::shared_ptr<Component> rootComponent() const { return m_rootComponent; }
    std::vector<std::shared_ptr<Occurrence>> occurrences() const { return m_occurrences; }
    void addOccurrence(std::shared_ptr<Occurrence> occ) { m_occurrences.push_back(occ); }

private:
    std::shared_ptr<Component> m_rootComponent;
    std::vector<std::shared_ptr<Occurrence>> m_occurrences;
};

class CamSetup {
public:
    CamSetup(EntityId id, const std::string& name) : m_id(id), m_name(name) {}
    CamSetup(const std::string& name) : CamSetup(0, name) {}
    EntityId id() const { return m_id; }
    std::string name() const { return m_name; }
private:
    EntityId m_id = 0;
    std::string m_name;
};

class CamProduct {
public:
    CamProduct() { createSetup("Setup1"); }
    std::vector<std::shared_ptr<CamSetup>> setups() const { return m_setups; }
    std::shared_ptr<CamSetup> createSetup(const std::string& name) {
        auto setup = std::make_shared<CamSetup>(name);
        m_setups.push_back(setup);
        return setup;
    }
private:
    std::vector<std::shared_ptr<CamSetup>> m_setups;
};

class Document {
public:
    Document();
    explicit Document(EntityId id);
    Document(const std::string& filePath);
    Document(EntityId id, const std::string& filePath);
    ~Document();

    EntityId id() const { return m_id; }
    std::string filePath() const { return m_filePath; }
    bool isDirty() const { return m_dirty; }
    std::shared_ptr<DesignProduct> design() const { return m_design; }
    std::shared_ptr<CamProduct> cam() const { return m_cam; }

    bool save(const std::string& path);
    std::shared_ptr<BRepBody> importGeometry(const std::string& path);
    bool replaceBodyGeometry(EntityId bodyId, const std::string& path);
    bool applySplitEdit(EntityId bodyId, double splitX);
    bool applyOffsetEdit(EntityId bodyId, double offset);
    std::string addSplitEditFeature(EntityId bodyId, double splitX);
    std::string addOffsetEditFeature(EntityId bodyId, double offset);
    bool recomputeHistory();
    bool exportGeometry(const std::string& path) const;
    std::vector<BodyInspection> inspectBodies() const;
    ViewportScene viewportScene() const;

    // Parametric modeling API (the source of truth for the UI projection).
    // Each "add" returns the stable feature token (e.g. "feat_Sketch_1").

    // Create a sketch anchored to a plane reference (origin plane, construction
    // plane, or planar face). The string overload is kept for back-compat and
    // resolves to the named origin plane (XY/XZ/YZ).
    std::string addSketch(const SketchPlaneReference& plane);
    std::string addSketch(const std::string& plane = "XY");

    // Add a generic element (line, circle, rectangle, dimension, ...) to a
    // sketch. Returns the element token, or empty on failure.
    std::string addSketchEntity(const std::string& sketchToken, const SketchElement& element);
    // Convenience: add an axis-aligned 2-point rectangle entity to a sketch.
    bool addRectangleToSketch(const std::string& sketchToken, double x0, double y0, double x1, double y1);

    // Add a solid feature referencing a sketch profile. Only Extrude with a
    // rectangle profile currently evaluates to a body; other kinds are
    // recorded on the timeline with stub evaluators. Returns the feature token.
    std::string addSolidFeature(
        SolidFeatureKind kind,
        const std::string& sketchToken,
        double value,
        FeatureOperation operation = FeatureOperation::NewBody);
    // Convenience for the evaluated extrude path. Returns the feature token.
    std::string addExtrude(
        const std::string& sketchToken,
        double distance,
        FeatureOperation operation = FeatureOperation::NewBody);

    // Register a construction object (plane/axis/point). Returns its token.
    std::string addConstructionObject(
        ConstructionKind kind,
        const std::vector<std::string>& inputs = {},
        double value = 0.0);

    // Timeline projection used by the UI ticks and back-compat queries.
    std::vector<TimelineFeatureInfo> features() const;
    std::vector<SketchFeature> sketches() const;
    std::vector<SolidFeature> solidFeatures() const;
    std::vector<ConstructionObject> constructionObjects() const;

    // Export a sketch's entities to DXF format. Returns the DXF string, or
    // empty on failure.
    std::string exportSketchDxf(const std::string& sketchToken) const;

    // Serialized core-state snapshot (schemaVersion 2) consumed by the UI.
    std::string coreStateSnapshot() const;

    const TopologicalNaming& topology() const { return m_topology; }
    const HistoryTree& history() const { return m_history; }
    HistoryTree& history() { return m_history; }

private:
    enum class TopologyEditType {
        Split,
        Offset
    };

    struct TopologyEditFeature {
        std::string featureId;
        TopologyEditType type = TopologyEditType::Split;
        EntityId bodyId = 0;
        double value = 0.0;
        std::shared_ptr<KernelShape> sourceShape;
    };

    EntityId nextEntityId();
    static GeometryFormat detectFormat(const std::string& path);
    static const char* formatName(GeometryFormat format);
    bool saveNativeDocument(const std::string& path) const;
    void registerBodyTopology(const std::shared_ptr<BRepBody>& body);
    std::vector<TopologyRecord> buildBodyTopologyRecords(const BRepBody& body) const;
    std::shared_ptr<BRepBody> findBody(EntityId bodyId) const;
    bool applySplitEditUnlocked(EntityId bodyId, double splitX, const std::string& featureId, std::shared_ptr<KernelShape> sourceShape);
    bool applyOffsetEditUnlocked(EntityId bodyId, double offset, const std::string& featureId, std::shared_ptr<KernelShape> sourceShape);

    SketchFeature* findSketchByToken(const std::string& token);
    const SketchFeature* findSketchByToken(const std::string& token) const;
    SolidFeature* findSolidByToken(const std::string& token);
    // Computes the axis-aligned bounds of the first closed rectangle profile in
    // a sketch (used by the extrude evaluator). Returns false when absent.
    bool sketchRectangleBounds(const SketchFeature& sketch, std::array<double, 4>& bounds) const;
    // Generates a body for an extrude over a rectangle profile. Returns 0 when
    // no evaluable profile is present.
    EntityId evaluateExtrudeBody(const SketchFeature& sketch, double distance);
    std::string coreStateSnapshotUnlocked() const;

    EntityId m_id = 0;
    EntityId m_nextEntityId = 1;
    std::string m_filePath;
    bool m_dirty = false;
    std::shared_ptr<DesignProduct> m_design;
    std::shared_ptr<CamProduct> m_cam;
    TopologicalNaming m_topology;
    HistoryTree m_history;
    std::vector<TopologyEditFeature> m_topologyEditFeatures;
    std::vector<SketchFeature> m_sketches;
    std::vector<SolidFeature> m_solids;
    std::vector<ConstructionObject> m_construction;
    std::vector<TimelineEntry> m_timeline;
    int m_sketchCount = 0;
    int m_solidCounts[24] = {0};
    int m_constructionPlaneCount = 0;
    int m_constructionAxisCount = 0;
    int m_constructionPointCount = 0;
    int m_constructionUcsCount = 0;
    int m_sketchEntityCount = 0;
    mutable std::mutex m_mutex;
};

} // namespace aim3d
