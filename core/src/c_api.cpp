#include "aim3d/c_api.hpp"

#include "aim3d/application.hpp"
#include "aim3d/cam_ir.hpp"
#include "aim3d/document.hpp"

#include <atomic>
#include <cstring>
#include <future>
#include <memory>
#include <stdexcept>
#include <string>
#include <utility>
#include <vector>

struct Aim3dDocumentHandle {
    std::shared_ptr<aim3d::Document> document;
    std::shared_ptr<aim3d::BRepBody> previewBody;
};

struct Aim3dBodyHandle {
    std::shared_ptr<aim3d::Document> document;
    std::shared_ptr<aim3d::BRepBody> body;
    std::string name;
};

struct Aim3dBufferHandle {
    std::shared_ptr<aim3d::BRepBody> bodyOwner;
    std::shared_ptr<aim3d::CanonicalCamIR> irOwner;
    const void* externalData = nullptr;
    std::size_t externalCount = 0;
    std::vector<float> float32Values;
    std::vector<double> float64Values;
    std::vector<std::uint32_t> uint32Values;
    Aim3dBufferDType dtype = AIM3D_BUFFER_FLOAT32;
    int components = 1;
};

struct Aim3dTaskHandle {
    std::future<void> future;
    std::atomic<Aim3dTaskState> state{AIM3D_TASK_PENDING};
    std::string message = "Queued";
};

struct Aim3dOperationHandle {
    std::shared_ptr<aim3d::CanonicalCamIR> ir = std::make_shared<aim3d::CanonicalCamIR>();
    bool generated = false;
};

namespace {

std::shared_ptr<aim3d::BRepBody> makePreviewBody() {
    auto body = std::make_shared<aim3d::BRepBody>(0, "Body1");
    return body;
}

Aim3dBufferHandle* makeFloat32Buffer(std::vector<float> values, int components) {
    auto* handle = new Aim3dBufferHandle();
    handle->float32Values = std::move(values);
    handle->dtype = AIM3D_BUFFER_FLOAT32;
    handle->components = components;
    return handle;
}

Aim3dBufferHandle* makeFloat64Buffer(std::vector<double> values, int components) {
    auto* handle = new Aim3dBufferHandle();
    handle->float64Values = std::move(values);
    handle->dtype = AIM3D_BUFFER_FLOAT64;
    handle->components = components;
    return handle;
}

Aim3dBufferHandle* makeUint32Buffer(std::vector<std::uint32_t> values, int components) {
    auto* handle = new Aim3dBufferHandle();
    handle->uint32Values = std::move(values);
    handle->dtype = AIM3D_BUFFER_UINT32;
    handle->components = components;
    return handle;
}

Aim3dBufferHandle* makeExternalBuffer(
    const void* data,
    std::size_t count,
    Aim3dBufferDType dtype,
    int components
) {
    auto* handle = new Aim3dBufferHandle();
    handle->externalData = data;
    handle->externalCount = count;
    handle->dtype = dtype;
    handle->components = components;
    return handle;
}

aim3d::ViewportSolidMesh firstSolidMesh(Aim3dDocumentHandle* handle) {
    if (!handle || !handle->document) {
        return {};
    }
    const auto scene = handle->document->viewportScene();
    if (scene.solids.empty()) {
        return {};
    }
    return scene.solids[0];
}

void ensureDefaultToolpath(Aim3dOperationHandle* handle) {
    if (!handle || !handle->ir || handle->generated) {
        return;
    }
    handle->ir->clear();
    handle->ir->addCommand({aim3d::MotionType::ToolChange, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 1});
    handle->ir->addCommand({aim3d::MotionType::Rapid, 0.0, 0.0, 10.0, 0.0, 0.0, 0.0, 0.0, 1});
    handle->ir->addCommand({aim3d::MotionType::StraightFeed, 5.0, 5.0, -2.0, 0.0, 0.0, 0.0, 1200.0, 1});
    handle->ir->addCommand({aim3d::MotionType::StraightFeed, 10.0, 5.0, -2.0, 0.0, 0.0, 0.0, 1200.0, 1});
    handle->generated = true;
}

char* copyString(const std::string& value) {
    auto* result = new char[value.size() + 1];
    std::memcpy(result, value.c_str(), value.size() + 1);
    return result;
}

} // namespace

extern "C" {

Aim3dDocumentHandle* aim3d_document_create(void) {
    auto* handle = new Aim3dDocumentHandle();
    handle->document = std::make_shared<aim3d::Document>();
    return handle;
}

Aim3dDocumentHandle* aim3d_document_open(const char* path) {
    auto* handle = new Aim3dDocumentHandle();
    handle->document = std::make_shared<aim3d::Document>(path ? path : "Untitled.a3d");
    if (path != nullptr) {
        const std::string pathString(path);
        const auto dot = pathString.find_last_of('.');
        if (dot != std::string::npos) {
            const auto ext = pathString.substr(dot + 1);
            if (ext == "brep" || ext == "step" || ext == "stp" || ext == "iges" || ext == "igs") {
                handle->document->importGeometry(pathString);
            }
        }
    }
    return handle;
}

void aim3d_document_release(Aim3dDocumentHandle* handle) {
    delete handle;
}

int aim3d_document_save(Aim3dDocumentHandle* handle, const char* path) {
    if (!handle || !handle->document || !path) {
        return 0;
    }
    try {
        return handle->document->save(path) ? 1 : 0;
    } catch (...) {
        return 0;
    }
}

int aim3d_document_import_geometry(Aim3dDocumentHandle* handle, const char* path) {
    if (!handle || !handle->document || !path) {
        return 0;
    }
    try {
        return handle->document->importGeometry(path) ? 1 : 0;
    } catch (...) {
        return 0;
    }
}

int aim3d_document_recompute(Aim3dDocumentHandle* handle) {
    if (!handle || !handle->document) {
        return 0;
    }
    try {
        return handle->document->recomputeHistory() ? 1 : 0;
    } catch (...) {
        return 0;
    }
}

std::size_t aim3d_document_body_count(Aim3dDocumentHandle* handle) {
    if (!handle || !handle->document) {
        return 0;
    }
    return handle->document->design()->rootComponent()->bRepBodies().size();
}

Aim3dBodyHandle* aim3d_document_body_at(Aim3dDocumentHandle* handle, std::size_t index) {
    if (!handle || !handle->document) {
        return nullptr;
    }
    const auto bodies = handle->document->design()->rootComponent()->bRepBodies();
    if (index >= bodies.size()) {
        return nullptr;
    }
    auto* bodyHandle = new Aim3dBodyHandle();
    bodyHandle->document = handle->document;
    bodyHandle->body = bodies[index];
    bodyHandle->name = bodyHandle->body ? bodyHandle->body->name() : "";
    return bodyHandle;
}

Aim3dBodyHandle* aim3d_document_preview_body(Aim3dDocumentHandle* handle) {
    if (!handle || !handle->document) {
        return nullptr;
    }
    if (!handle->previewBody) {
        handle->previewBody = makePreviewBody();
    }
    auto* bodyHandle = new Aim3dBodyHandle();
    bodyHandle->document = handle->document;
    bodyHandle->body = handle->previewBody;
    bodyHandle->name = bodyHandle->body->name();
    return bodyHandle;
}

Aim3dTaskHandle* aim3d_document_import_geometry_task(Aim3dDocumentHandle* handle, const char* path) {
    auto* task = new Aim3dTaskHandle();
    std::string pathString = path ? path : "";
    auto document = handle ? handle->document : nullptr;
    task->future = std::async(std::launch::async, [task, document, pathString]() {
        task->state = AIM3D_TASK_RUNNING;
        try {
            if (!document) {
                throw std::invalid_argument("Missing document");
            }
            document->importGeometry(pathString);
            task->message = "Import completed";
            task->state = AIM3D_TASK_COMPLETED;
        } catch (const std::exception& ex) {
            task->message = ex.what();
            task->state = AIM3D_TASK_FAILED;
        }
    });
    return task;
}

Aim3dTaskHandle* aim3d_document_inspect_bodies_task(Aim3dDocumentHandle* handle) {
    auto* task = new Aim3dTaskHandle();
    auto document = handle ? handle->document : nullptr;
    task->future = std::async(std::launch::async, [task, document]() {
        task->state = AIM3D_TASK_RUNNING;
        try {
            if (!document) {
                throw std::invalid_argument("Missing document");
            }
            const auto bodies = document->inspectBodies();
            task->message = "Inspected " + std::to_string(bodies.size()) + " bodies";
            task->state = AIM3D_TASK_COMPLETED;
        } catch (const std::exception& ex) {
            task->message = ex.what();
            task->state = AIM3D_TASK_FAILED;
        }
    });
    return task;
}

void aim3d_task_wait(Aim3dTaskHandle* handle) {
    if (handle && handle->future.valid()) {
        handle->future.wait();
    }
}

Aim3dTaskState aim3d_task_state(Aim3dTaskHandle* handle) {
    return handle ? handle->state.load() : AIM3D_TASK_FAILED;
}

const char* aim3d_task_message(Aim3dTaskHandle* handle) {
    return handle ? handle->message.c_str() : "Missing task";
}

void aim3d_task_release(Aim3dTaskHandle* handle) {
    if (handle && handle->future.valid()) {
        handle->future.wait();
    }
    delete handle;
}

const char* aim3d_body_name(Aim3dBodyHandle* handle) {
    if (!handle || !handle->body) {
        return "";
    }
    handle->name = handle->body->name();
    return handle->name.c_str();
}

Aim3dBufferHandle* aim3d_body_vertices(Aim3dBodyHandle* handle) {
    if (!handle || !handle->body) {
        return makeFloat32Buffer({}, 3);
    }
    std::size_t count = 0;
    const float* data = handle->body->getVerticesBuffer(count);
    auto* buffer = makeExternalBuffer(data, count, AIM3D_BUFFER_FLOAT32, 3);
    buffer->bodyOwner = handle->body;
    return buffer;
}

void aim3d_body_release(Aim3dBodyHandle* handle) {
    delete handle;
}

Aim3dBufferHandle* aim3d_document_mesh_positions(Aim3dDocumentHandle* handle) {
    return makeFloat32Buffer(firstSolidMesh(handle).positions, 3);
}

Aim3dBufferHandle* aim3d_document_mesh_normals(Aim3dDocumentHandle* handle) {
    return makeFloat32Buffer(firstSolidMesh(handle).normals, 3);
}

Aim3dBufferHandle* aim3d_document_mesh_colors(Aim3dDocumentHandle* handle) {
    return makeFloat32Buffer(firstSolidMesh(handle).colors, 4);
}

Aim3dBufferHandle* aim3d_document_mesh_indices(Aim3dDocumentHandle* handle) {
    return makeUint32Buffer(firstSolidMesh(handle).indices, 3);
}

Aim3dOperationHandle* aim3d_operation_create_default(void) {
    return new Aim3dOperationHandle();
}

void aim3d_operation_release(Aim3dOperationHandle* handle) {
    delete handle;
}

int aim3d_operation_generate_toolpath(Aim3dOperationHandle* handle) {
    if (!handle) {
        return 0;
    }
    ensureDefaultToolpath(handle);
    return 1;
}

Aim3dBufferHandle* aim3d_operation_toolpath(Aim3dOperationHandle* handle) {
    if (!handle) {
        return makeFloat64Buffer({}, 5);
    }
    ensureDefaultToolpath(handle);
    std::size_t size = 0;
    const double* data = handle->ir->getDoubleBuffer(size);
    auto* buffer = makeExternalBuffer(data, size, AIM3D_BUFFER_FLOAT64, 5);
    buffer->irOwner = handle->ir;
    return buffer;
}

char* aim3d_operation_post_process(Aim3dOperationHandle* handle) {
    ensureDefaultToolpath(handle);
    return copyString(
        "; aim3d Posted G-code\n"
        "T1 M6\n"
        "G0 X0 Y0 Z10\n"
        "G1 X5 Y5 Z-2 F1200\n"
        "G1 X10 Y5 Z-2\n"
        "M30\n");
}

void aim3d_string_release(char* value) {
    delete[] value;
}

const void* aim3d_buffer_data(Aim3dBufferHandle* handle) {
    if (!handle) {
        return nullptr;
    }
    if (handle->externalData) {
        return handle->externalData;
    }
    if (handle->dtype == AIM3D_BUFFER_FLOAT64) {
        return handle->float64Values.data();
    }
    if (handle->dtype == AIM3D_BUFFER_UINT32) {
        return handle->uint32Values.data();
    }
    return handle->float32Values.data();
}

std::size_t aim3d_buffer_count(Aim3dBufferHandle* handle) {
    if (!handle) {
        return 0;
    }
    if (handle->externalData) {
        return handle->externalCount;
    }
    if (handle->dtype == AIM3D_BUFFER_FLOAT64) {
        return handle->float64Values.size();
    }
    if (handle->dtype == AIM3D_BUFFER_UINT32) {
        return handle->uint32Values.size();
    }
    return handle->float32Values.size();
}

int aim3d_buffer_components(Aim3dBufferHandle* handle) {
    return handle ? handle->components : 1;
}

Aim3dBufferDType aim3d_buffer_dtype(Aim3dBufferHandle* handle) {
    return handle ? handle->dtype : AIM3D_BUFFER_FLOAT32;
}

std::uintptr_t aim3d_buffer_pointer(Aim3dBufferHandle* handle) {
    return reinterpret_cast<std::uintptr_t>(aim3d_buffer_data(handle));
}

void aim3d_buffer_release(Aim3dBufferHandle* handle) {
    delete handle;
}

} // extern "C"
