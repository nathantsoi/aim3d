#pragma once

#include <string>
#include <vector>
#include <memory>
#include <array>
#include <cstdint>
#include <mutex>
#include <utility>

namespace aim3d {

using EntityId = std::uint64_t;
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
    
private:
    friend class Document;
    void setKernelShape(std::shared_ptr<KernelShape> shape) { m_kernelShape = std::move(shape); }

    EntityId m_id = 0;
    std::string m_name;
    GeometryFormat m_sourceFormat = GeometryFormat::Unknown;
    std::string m_shapeType = "Unknown";
    std::vector<float> m_vertices;
    std::shared_ptr<KernelShape> m_kernelShape;
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
    bool exportGeometry(const std::string& path) const;
    std::vector<BodyInspection> inspectBodies() const;

private:
    EntityId nextEntityId();
    static GeometryFormat detectFormat(const std::string& path);
    static const char* formatName(GeometryFormat format);
    bool saveNativeDocument(const std::string& path) const;

    EntityId m_id = 0;
    EntityId m_nextEntityId = 1;
    std::string m_filePath;
    bool m_dirty = false;
    std::shared_ptr<DesignProduct> m_design;
    std::shared_ptr<CamProduct> m_cam;
    mutable std::mutex m_mutex;
};

} // namespace aim3d
