#include "aim3d/topo_naming.hpp"
#include <iostream>

namespace aim3d {

std::unique_ptr<TopologicalNaming> TopologicalNaming::s_instance = nullptr;

TopologicalNaming::TopologicalNaming() {}
TopologicalNaming::~TopologicalNaming() {
    clearMappings();
}

TopologicalNaming& TopologicalNaming::get() {
    if (!s_instance) {
        s_instance = std::make_unique<TopologicalNaming>();
    }
    return *s_instance;
}

void TopologicalNaming::registerToken(const std::string& token, int topoId) {
    m_tokenToShapeMap[token] = topoId;
    std::cout << "[aim3d TNP] Mapped persistent token '" << token 
              << "' -> transient shape ID " << topoId << std::endl;
}

int TopologicalNaming::resolveToken(const std::string& token) const {
    auto it = m_tokenToShapeMap.find(token);
    if (it != m_tokenToShapeMap.end()) {
        return it->second;
    }
    return -1; // Unresolved or stale shape pointer
}

void TopologicalNaming::clearMappings() {
    m_tokenToShapeMap.clear();
}

size_t TopologicalNaming::activeTokensCount() const {
    return m_tokenToShapeMap.size();
}

} // namespace aim3d
