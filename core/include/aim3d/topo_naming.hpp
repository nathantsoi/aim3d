#pragma once

#include <string>
#include <unordered_map>
#include <memory>

namespace aim3d {

// Mock structure representing an underlying OpenCascade TopoDS_Shape
struct TopoDS_Shape {
    int nativePointerId;
};

class TopologicalNaming {
public:
    TopologicalNaming();
    ~TopologicalNaming();

    // Singleton mapper access
    static TopologicalNaming& get();

    // Map a stable string token to a transient kernel geometry pointer ID
    void registerToken(const std::string& token, int topoId);
    
    // Retrieve transient geometry ID based on the persistent token
    int resolveToken(const std::string& token) const;
    
    // Clear mappings when model rebuilds occur
    void clearMappings();

    // Track stability statistics
    size_t activeTokensCount() const;

private:
    static std::unique_ptr<TopologicalNaming> s_instance;
    std::unordered_map<std::string, int> m_tokenToShapeMap;
};

} // namespace aim3d
