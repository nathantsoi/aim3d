#pragma once

#include <vector>
#include <string>
#include <memory>
#include <functional>
#include <future>
#include <map>
#include <mutex>
#include <atomic>

namespace aim3d {

class Document;
struct BodyInspection;

using DocumentId = unsigned long long;
using TaskId = unsigned long long;

enum class TaskStatus {
    Pending,
    Running,
    Completed,
    Failed
};

struct TaskSnapshot {
    TaskId id = 0;
    TaskStatus status = TaskStatus::Pending;
    std::string message;
};

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

    // Background geometry work
    TaskId importGeometryAsync(const std::shared_ptr<Document>& doc, const std::string& path);
    TaskId inspectBodiesAsync(const std::shared_ptr<Document>& doc);
    TaskSnapshot taskSnapshot(TaskId id) const;
    bool waitForTask(TaskId id);

    // Headless event bus registration
    using EventCallback = std::function<void(const std::string&, const std::string&)>;
    void registerEventCallback(const std::string& eventType, EventCallback callback);
    void dispatchEvent(const std::string& eventType, const std::string& payload);

    // UI state checks
    bool isHeadless() const { return m_headless; }
    void setHeadless(bool headless) { m_headless = headless; }

private:
    void setTaskStatus(TaskId id, TaskStatus status, const std::string& message);

    static std::unique_ptr<Application> s_instance;
    std::vector<std::shared_ptr<Document>> m_documents;
    std::shared_ptr<Document> m_activeDocument;
    bool m_headless = true;
    std::atomic<DocumentId> m_nextDocumentId{1};
    std::atomic<TaskId> m_nextTaskId{1};

    struct EventRegistry {
        std::string type;
        EventCallback callback;
    };
    std::vector<EventRegistry> m_callbacks;

    mutable std::mutex m_taskMutex;
    std::map<TaskId, TaskSnapshot> m_tasks;
    std::map<TaskId, std::future<void>> m_taskFutures;
};

} // namespace aim3d
