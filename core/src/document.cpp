#include "aim3d/document.hpp"
#include <iostream>

namespace aim3d {

const float* BRepBody::getVerticesBuffer(size_t& count) const {
    count = m_mockVertices.size();
    return m_mockVertices.data();
}

DesignProduct::DesignProduct() {
    m_rootComponent = std::make_shared<Component>("RootComponent");
    // Add a default mock solid body to the root component
    auto mockBody = std::make_shared<BRepBody>("Body1");
    m_rootComponent->addBody(mockBody);
}

Document::Document() : m_filePath("Untitled.a3d") {
    m_design = std::make_shared<DesignProduct>();
    m_cam = std::make_shared<CamProduct>();
}

Document::Document(const std::string& filePath) : m_filePath(filePath) {
    m_design = std::make_shared<DesignProduct>();
    m_cam = std::make_shared<CamProduct>();
}

Document::~Document() {}

bool Document::save(const std::string& path) {
    m_filePath = path;
    std::cout << "[aim3d core] Saving document model to " << path << std::endl;
    return true;
}

} // namespace aim3d
