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

// Parametric modeling API. Returned strings are owned by the caller and must
// be released with aim3d_string_release.

// Create a sketch on a named origin plane (XY/XZ/YZ). Shorthand kept for
// back-compat; resolves to a plane reference of kind Origin.
char* aim3d_document_add_sketch(Aim3dDocumentHandle* handle, const char* plane);
// Create a sketch on a full plane reference. `kind` is one of
// "Origin"/"ConstructionPlane"/"PlanarFace"; `origin_plane` is XY/XZ/YZ (used
// when kind == Origin); `ref_token` is the construction-plane or face token.
char* aim3d_document_add_sketch_on_plane(
    Aim3dDocumentHandle* handle,
    const char* kind,
    const char* origin_plane,
    const char* ref_token);

int aim3d_document_add_rectangle(
    Aim3dDocumentHandle* handle,
    const char* sketch_token,
    double x0,
    double y0,
    double x1,
    double y1);
// Add a generic sketch element. `points` is a flattened [x0,y0,x1,y1,...]
// array with `point_count` (x,y) pairs. Returns the element token.
char* aim3d_document_add_sketch_entity(
    Aim3dDocumentHandle* handle,
    const char* sketch_token,
    const char* kind,
    const double* points,
    std::size_t point_count,
    double radius,
    double value,
    int construction);

char* aim3d_document_add_extrude(Aim3dDocumentHandle* handle, const char* sketch_token, double distance);
// Add any solid feature kind (Extrude/Revolve/Sweep/Loft/...). Only Extrude
// with a rectangle profile evaluates to geometry; others are timeline stubs.
// `operation` is NewBody/Join/Cut/Intersect. Returns the feature token.
char* aim3d_document_add_solid_feature(
    Aim3dDocumentHandle* handle,
    const char* kind,
    const char* sketch_token,
    double value,
    const char* operation);
// Register a construction plane/axis/point. `inputs_csv` is a comma-separated
// list of referenced geometry tokens (may be empty). Returns the object token.
char* aim3d_document_add_construction(
    Aim3dDocumentHandle* handle,
    const char* kind,
    const char* inputs_csv,
    double value);

char* aim3d_document_core_state_snapshot(Aim3dDocumentHandle* handle);
// Export a sketch's entities to DXF. Returns a caller-owned string (release
// with aim3d_string_release), or nullptr if the sketch token is not found.
char* aim3d_document_export_sketch_dxf(Aim3dDocumentHandle* handle, const char* sketch_token);

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

// Lightweight simulator API
typedef struct Aim3dSimulatorHandle Aim3dSimulatorHandle;

Aim3dSimulatorHandle* aim3d_simulator_create(void);
void aim3d_simulator_release(Aim3dSimulatorHandle* handle);
int aim3d_simulator_run(
    Aim3dSimulatorHandle* handle,
    const char* gcode, 
    double stockX, 
    double stockY, 
    double stockZ, 
    int resX, 
    int resY,
    const int* toolIds,
    const double* toolRadii,
    const int* toolIsBall,
    int toolCount);

void aim3d_simulator_set_work_offset(Aim3dSimulatorHandle* handle, int code, double x, double y, double z);

std::size_t aim3d_simulator_vertex_count(Aim3dSimulatorHandle* handle);
std::size_t aim3d_simulator_index_count(Aim3dSimulatorHandle* handle);
void aim3d_simulator_copy_mesh(
    Aim3dSimulatorHandle* handle,
    float* outPos, 
    float* outNorm, 
    uint32_t* outInd);

} // extern "C"
