#include "aim3d/history_tree.hpp"
#include <iostream>

namespace aim3d {

HistoryTree::HistoryTree() {}
HistoryTree::~HistoryTree() {}

std::string HistoryTree::addFeature(const std::string& type, double initialValue) {
    m_featureCounter++;
    std::string id = "feat_" + type + "_" + std::to_string(m_featureCounter);
    m_features.push_back({id, type, initialValue, {}, true});
    std::cout << "[aim3d History] Added parametric feature " << id << std::endl;
    return id;
}

bool HistoryTree::updateFeature(const std::string& id, double newValue) {
    bool found = false;
    for (auto& feat : m_features) {
        if (feat.id == id) {
            feat.value = newValue;
            feat.isDirty = true;
            found = true;
            std::cout << "[aim3d History] Updated parametric feature " << id << " to " << newValue << std::endl;
            continue;
        }
        if (found) {
            feat.isDirty = true;
        }
    }
    return found;
}

bool HistoryTree::addSelection(const std::string& featureId, const std::string& topologyToken) {
    for (auto& feat : m_features) {
        if (feat.id == featureId) {
            feat.selectedTopologyTokens.push_back(topologyToken);
            feat.isDirty = true;
            return true;
        }
    }
    return false;
}

bool HistoryTree::recomputeAll() {
    std::cout << "[aim3d History] Triggering parametric recompute sweep..." << std::endl;

    for (auto& feat : m_features) {
        if (feat.isDirty) {
            std::cout << " -> Recomputing: " << feat.id << " (" << feat.type << ")" << std::endl;
            feat.isDirty = false;
        }
    }
    
    std::cout << "[aim3d History] Parametric history sweep complete." << std::endl;
    return true;
}

} // namespace aim3d
