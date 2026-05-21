#pragma once

#include <string>
#include <vector>

namespace aim3d {

struct ParametricFeature {
    std::string id;
    std::string type; // e.g. "Sketch", "Extrude", "Fillet"
    double value;      // Parameter value (e.g. extrusion depth)
    std::vector<std::string> selectedTopologyTokens;
    bool isDirty = true;
};

class HistoryTree {
public:
    HistoryTree();
    ~HistoryTree();

    std::string addFeature(const std::string& type, double initialValue);
    bool updateFeature(const std::string& id, double newValue);
    bool addSelection(const std::string& featureId, const std::string& topologyToken);

    // Evaluates all features in order, resolving stable topology references
    bool recomputeAll();

    std::vector<ParametricFeature> features() const { return m_features; }

private:
    std::vector<ParametricFeature> m_features;
    size_t m_featureCounter = 0;
};

} // namespace aim3d
