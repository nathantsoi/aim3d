#include "aim3d/application.hpp"
#include "aim3d/document.hpp"
#include <iostream>
#include <algorithm>

namespace aim3d {

std::unique_ptr<Application> Application::s_instance = nullptr;

Application::Application() {
    EventCallback logCallback = [](const std::string& type, const std::string& msg) {
        std::cout << "[aim3d core Event] " << type << ": " << msg << std::endl;
    };
    registerEventCallback("LOG", logCallback);
}

Application::~Application() {
    m_documents.clear();
    m_activeDocument = nullptr;
}

Application& Application::get() {
    if (!s_instance) {
        s_instance = std::make_unique<Application>();
    }
    return *s_instance;
}

std::shared_ptr<Document> Application::activeDocument() const {
    return m_activeDocument;
}

std::vector<std::shared_ptr<Document>> Application::documents() const {
    return m_documents;
}

std::shared_ptr<Document> Application::openDocument(const std::string& path) {
    dispatchEvent("LOG", "Opening STEP/IGES document path: " + path);
    auto doc = std::make_shared<Document>(path);
    m_documents.push_back(doc);
    m_activeDocument = doc;
    return doc;
}

std::shared_ptr<Document> Application::createDocument() {
    dispatchEvent("LOG", "Creating new headless document product model.");
    auto doc = std::make_shared<Document>();
    m_documents.push_back(doc);
    m_activeDocument = doc;
    return doc;
}

bool Application::closeDocument(const std::shared_ptr<Document>& doc) {
    auto it = std::find(m_documents.begin(), m_documents.end(), doc);
    if (it != m_documents.end()) {
        dispatchEvent("LOG", "Closing document: " + doc->filePath());
        m_documents.erase(it);
        if (m_activeDocument == doc) {
            m_activeDocument = m_documents.empty() ? nullptr : m_documents.back();
        }
        return true;
    }
    return false;
}

void Application::registerEventCallback(const std::string& eventType, EventCallback callback) {
    m_callbacks.push_back({eventType, callback});
}

void Application::dispatchEvent(const std::string& eventType, const std::string& payload) {
    for (const auto& reg : m_callbacks) {
        if (reg.type == eventType) {
            reg.callback(eventType, payload);
        }
    }
}

} // namespace aim3d
