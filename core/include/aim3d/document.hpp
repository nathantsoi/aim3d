#pragma once

#include <string>
#include <vector>
#include <memory>

namespace aim3d {

class BRepBody {
public:
    BRepBody(const std::string& name) : m_name(name) {}
    std::string name() const { return m_name; }
    
    // Simulates returning high-performance direct contiguous memory pointers
    const float* getVerticesBuffer(size_t& count) const;
    
private:
    std::string m_name;
    std::vector<float> m_mockVertices = {0.0f, 0.0f, 0.0f, 10.0f, 0.0f, 0.0f, 0.0f, 10.0f, 0.0f};
};

class Component {
public:
    Component(const std::string& name) : m_name(name) {}
    std::string name() const { return m_name; }
    
    std::vector<std::shared_ptr<BRepBody>> bRepBodies() const { return m_bodies; }
    void addBody(std::shared_ptr<BRepBody> body) { m_bodies.push_back(body); }

private:
    std::string m_name;
    std::vector<std::shared_ptr<BRepBody>> m_bodies;
};

class Occurrence {
public:
    Occurrence(const std::string& name, std::shared_ptr<Component> comp) 
        : m_name(name), m_component(comp) {}
    
    std::string name() const { return m_name; }
    std::shared_ptr<Component> component() const { return m_component; }

private:
    std::string m_name;
    std::shared_ptr<Component> m_component;
};

class DesignProduct {
public:
    DesignProduct();
    std::shared_ptr<Component> rootComponent() const { return m_rootComponent; }
    std::vector<std::shared_ptr<Occurrence>> occurrences() const { return m_occurrences; }
    void addOccurrence(std::shared_ptr<Occurrence> occ) { m_occurrences.push_back(occ); }

private:
    std::shared_ptr<Component> m_rootComponent;
    std::vector<std::shared_ptr<Occurrence>> m_occurrences;
};

class CamSetup {
public:
    CamSetup(const std::string& name) : m_name(name) {}
    std::string name() const { return m_name; }
private:
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
    Document(const std::string& filePath);
    ~Document();

    std::string filePath() const { return m_filePath; }
    std::shared_ptr<DesignProduct> design() const { return m_design; }
    std::shared_ptr<CamProduct> cam() const { return m_cam; }

    bool save(const std::string& path);

private:
    std::string m_filePath;
    std::shared_ptr<DesignProduct> m_design;
    std::shared_ptr<CamProduct> m_cam;
};

} // namespace aim3d
