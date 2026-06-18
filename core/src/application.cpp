#include "aim3d/application.hpp"
#include "aim3d/document.hpp"
#include <iostream>
#include <algorithm>
#include <cctype>
#include <exception>
#include <stdexcept>

namespace aim3d {

namespace {

bool isExchangeGeometryPath(const std::string& path) {
    const auto dot = path.find_last_of('.');
    if (dot == std::string::npos) {
        return false;
    }

    std::string ext = path.substr(dot + 1);
    std::transform(ext.begin(), ext.end(), ext.begin(), [](unsigned char c) {
        return static_cast<char>(std::tolower(c));
    });
    return ext == "step" || ext == "stp" || ext == "iges" || ext == "igs" || ext == "brep";
}

} // namespace

std::unique_ptr<Application> Application::s_instance = nullptr;

Application::Application() {
    EventCallback logCallback = [](const std::string& type, const std::string& msg) {
        std::cout << "[aim3d core Event] " << type << ": " << msg << std::endl;
    };
    registerEventCallback("LOG", logCallback);
}

Application::~Application() {
    for (auto& task : m_taskFutures) {
        if (task.second.valid()) {
            task.second.wait();
        }
    }
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
    dispatchEvent("LOG", "Opening document path: " + path);
    auto doc = std::make_shared<Document>(m_nextDocumentId++, path);
    if (isExchangeGeometryPath(path)) {
        doc->importGeometry(path);
    }
    m_documents.push_back(doc);
    m_activeDocument = doc;
    return doc;
}

std::shared_ptr<Document> Application::createDocument() {
    dispatchEvent("LOG", "Creating new headless document product model.");
    auto doc = std::make_shared<Document>(m_nextDocumentId++);
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

TaskId Application::importGeometryAsync(const std::shared_ptr<Document>& doc, const std::string& path) {
    const auto id = m_nextTaskId++;
    setTaskStatus(id, TaskStatus::Pending, "Import queued");
    {
        std::lock_guard<std::mutex> lock(m_taskMutex);
        m_taskFutures[id] = std::async(AIM3D_LAUNCH_POLICY, [this, id, doc, path]() {
            setTaskStatus(id, TaskStatus::Running, "Import running");
            dispatchEvent("GEOMETRY_TASK_STARTED", std::to_string(id));
            try {
                if (!doc) {
                    throw std::invalid_argument("Cannot import geometry without a document");
                }
                auto body = doc->importGeometry(path);
                setTaskStatus(id, TaskStatus::Completed, "Imported body " + body->name());
                dispatchEvent("GEOMETRY_TASK_COMPLETED", std::to_string(id));
            } catch (const std::exception& ex) {
                setTaskStatus(id, TaskStatus::Failed, ex.what());
                dispatchEvent("GEOMETRY_TASK_FAILED", ex.what());
            }
        });
    }
    return id;
}

TaskId Application::inspectBodiesAsync(const std::shared_ptr<Document>& doc) {
    const auto id = m_nextTaskId++;
    setTaskStatus(id, TaskStatus::Pending, "Inspection queued");
    {
        std::lock_guard<std::mutex> lock(m_taskMutex);
        m_taskFutures[id] = std::async(AIM3D_LAUNCH_POLICY, [this, id, doc]() {
            setTaskStatus(id, TaskStatus::Running, "Inspection running");
            dispatchEvent("GEOMETRY_TASK_STARTED", std::to_string(id));
            try {
                if (!doc) {
                    throw std::invalid_argument("Cannot inspect bodies without a document");
                }
                const auto inspections = doc->inspectBodies();
                setTaskStatus(id, TaskStatus::Completed, "Inspected " + std::to_string(inspections.size()) + " bodies");
                dispatchEvent("GEOMETRY_TASK_COMPLETED", std::to_string(id));
            } catch (const std::exception& ex) {
                setTaskStatus(id, TaskStatus::Failed, ex.what());
                dispatchEvent("GEOMETRY_TASK_FAILED", ex.what());
            }
        });
    }
    return id;
}

TaskSnapshot Application::taskSnapshot(TaskId id) const {
    std::lock_guard<std::mutex> lock(m_taskMutex);
    const auto it = m_tasks.find(id);
    if (it == m_tasks.end()) {
        return {id, TaskStatus::Failed, "Unknown task"};
    }
    return it->second;
}

bool Application::waitForTask(TaskId id) {
    std::future<void>* task = nullptr;
    {
        std::lock_guard<std::mutex> lock(m_taskMutex);
        const auto it = m_taskFutures.find(id);
        if (it == m_taskFutures.end()) {
            return false;
        }
        task = &it->second;
    }
    if (task->valid()) {
        task->wait();
    }
    return true;
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

void Application::setTaskStatus(TaskId id, TaskStatus status, const std::string& message) {
    std::lock_guard<std::mutex> lock(m_taskMutex);
    m_tasks[id] = {id, status, message};
}

} // namespace aim3d
