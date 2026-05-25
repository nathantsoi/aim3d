#pragma once

#include <cstddef>
#include <cstdint>

extern "C" {

typedef struct Aim3dDocumentHandle Aim3dDocumentHandle;
typedef struct Aim3dBodyHandle Aim3dBodyHandle;
typedef struct Aim3dBufferHandle Aim3dBufferHandle;
typedef struct Aim3dTaskHandle Aim3dTaskHandle;
typedef struct Aim3dOperationHandle Aim3dOperationHandle;

typedef enum Aim3dBufferDType {
    AIM3D_BUFFER_FLOAT32 = 1,
    AIM3D_BUFFER_FLOAT64 = 2,
    AIM3D_BUFFER_UINT32 = 3
} Aim3dBufferDType;

typedef enum Aim3dTaskState {
    AIM3D_TASK_PENDING = 0,
    AIM3D_TASK_RUNNING = 1,
    AIM3D_TASK_COMPLETED = 2,
    AIM3D_TASK_FAILED = 3
} Aim3dTaskState;

Aim3dDocumentHandle* aim3d_document_create(void);
Aim3dDocumentHandle* aim3d_document_open(const char* path);
void aim3d_document_release(Aim3dDocumentHandle* handle);

int aim3d_document_save(Aim3dDocumentHandle* handle, const char* path);
int aim3d_document_import_geometry(Aim3dDocumentHandle* handle, const char* path);
int aim3d_document_recompute(Aim3dDocumentHandle* handle);
std::size_t aim3d_document_body_count(Aim3dDocumentHandle* handle);
Aim3dBodyHandle* aim3d_document_body_at(Aim3dDocumentHandle* handle, std::size_t index);
Aim3dBodyHandle* aim3d_document_preview_body(Aim3dDocumentHandle* handle);

Aim3dTaskHandle* aim3d_document_import_geometry_task(Aim3dDocumentHandle* handle, const char* path);
Aim3dTaskHandle* aim3d_document_inspect_bodies_task(Aim3dDocumentHandle* handle);
void aim3d_task_wait(Aim3dTaskHandle* handle);
Aim3dTaskState aim3d_task_state(Aim3dTaskHandle* handle);
const char* aim3d_task_message(Aim3dTaskHandle* handle);
void aim3d_task_release(Aim3dTaskHandle* handle);

const char* aim3d_body_name(Aim3dBodyHandle* handle);
Aim3dBufferHandle* aim3d_body_vertices(Aim3dBodyHandle* handle);
void aim3d_body_release(Aim3dBodyHandle* handle);

Aim3dBufferHandle* aim3d_document_mesh_positions(Aim3dDocumentHandle* handle);
Aim3dBufferHandle* aim3d_document_mesh_normals(Aim3dDocumentHandle* handle);
Aim3dBufferHandle* aim3d_document_mesh_colors(Aim3dDocumentHandle* handle);
Aim3dBufferHandle* aim3d_document_mesh_indices(Aim3dDocumentHandle* handle);

Aim3dOperationHandle* aim3d_operation_create_default(void);
void aim3d_operation_release(Aim3dOperationHandle* handle);
int aim3d_operation_generate_toolpath(Aim3dOperationHandle* handle);
Aim3dBufferHandle* aim3d_operation_toolpath(Aim3dOperationHandle* handle);
char* aim3d_operation_post_process(Aim3dOperationHandle* handle);
void aim3d_string_release(char* value);

const void* aim3d_buffer_data(Aim3dBufferHandle* handle);
std::size_t aim3d_buffer_count(Aim3dBufferHandle* handle);
int aim3d_buffer_components(Aim3dBufferHandle* handle);
Aim3dBufferDType aim3d_buffer_dtype(Aim3dBufferHandle* handle);
std::uintptr_t aim3d_buffer_pointer(Aim3dBufferHandle* handle);
void aim3d_buffer_release(Aim3dBufferHandle* handle);

} // extern "C"
