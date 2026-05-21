#pragma once

#include <string>
#include <vector>
#include <memory>

namespace aim3d {

struct ParametricFeature {
    std::string id;
    std::string type; // e.g. "Sketch", "Extrude", "Fillet"
    double value;      // Parameter value (e.g. extrusion depth)
    bool isDirty = true;
};

class HistoryTree {
public:
    HistoryTree();
    ~HistoryTree();

    void addFeature(const std::string& type, double initialValue);
    void updateFeature(const std::string& id, double newValue);
    
    // Evaluates all features in order, resolving stable topology references
    bool recomputeAll();

    std::vector<ParametricFeature> features() const { return m_features; }

private:
    std::vector<ParametricFeature> m_features;
    size_t m_featureCounter = 0;
};

} // namespace aim3d
