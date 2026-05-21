#include "aim3d/history_tree.hpp"
#include "aim3d/topo_naming.hpp"
#include <iostream>

namespace aim3d {

HistoryTree::HistoryTree() {}
HistoryTree::~HistoryTree() {}

void HistoryTree::addFeature(const std::string& type, double initialValue) {
    m_featureCounter++;
    std::string id = "feat_" + type + "_" + std::to_string(m_featureCounter);
    m_features.push_back({id, type, initialValue, true});
    std::cout << "[aim3d History] Added parametric feature " << id << std::endl;
}

void HistoryTree::updateFeature(const std::string& id, double newValue) {
    for (auto& feat : m_features) {
        if (feat.id == id) {
            feat.value = newValue;
            feat.isDirty = true;
            std::cout << "[aim3d History] Updated parametric feature " << id << " to " << newValue << std::endl;
            break;
        }
    }
}

bool HistoryTree::recomputeAll() {
    std::cout << "[aim3d History] Triggering parametric recompute sweep..." << std::endl;
    
    // Clear mappings before rebuilding geometry representations
    auto& namingDb = TopologicalNaming::get();
    namingDb.clearMappings();

    for (size_t i = 0; i < m_features.size(); ++i) {
        auto& feat = m_features[i];
        if (feat.isDirty) {
            std::cout << " -> Recomputing: " << feat.id << " (" << feat.type << ")" << std::endl;
            feat.isDirty = false;
        }
        
        // Simulates mapping evaluated shapes to stable naming tokens
        std::string stableFaceToken = feat.id + "_face_0";
        int mockShapePointerId = 1000 + i; // Evaluated shape ID
        namingDb.registerToken(stableFaceToken, mockShapePointerId);
    }
    
    std::cout << "[aim3d History] Parametric history sweep complete. All shapes stable." << std::endl;
    return true;
}

} // namespace aim3d
