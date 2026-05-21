#pragma once

#include <vector>
#include <string>
#include <memory>
#include <functional>

namespace aim3d {

class Document;

class Application {
public:
    Application();
    ~Application();

    // Singleton access
    static Application& get();

    // Document management
    std::shared_ptr<Document> activeDocument() const;
    std::vector<std::shared_ptr<Document>> documents() const;
    std::shared_ptr<Document> openDocument(const std::string& path);
    std::shared_ptr<Document> createDocument();
    bool closeDocument(const std::shared_ptr<Document>& doc);

    // Headless event bus registration
    using EventCallback = std::function<void(const std::string&, const std::string&)>;
    void registerEventCallback(const std::string& eventType, EventCallback callback);
    void dispatchEvent(const std::string& eventType, const std::string& payload);

    // UI state checks
    bool isHeadless() const { return m_headless; }
    void setHeadless(bool headless) { m_headless = headless; }

private:
    static std::unique_ptr<Application> s_instance;
    std::vector<std::shared_ptr<Document>> m_documents;
    std::shared_ptr<Document> m_activeDocument;
    bool m_headless = true;

    struct EventRegistry {
        std::string type;
        EventCallback callback;
    };
    std::vector<EventRegistry> m_callbacks;
};

} // namespace aim3d
