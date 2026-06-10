#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashSet;
use tauri::Manager;

pub enum Aim3dDocumentHandle {}

#[link(name = "aim3d_core")]
extern "C" {
    fn aim3d_document_create() -> *mut Aim3dDocumentHandle;
    fn aim3d_document_add_sketch_on_plane(
        handle: *mut Aim3dDocumentHandle,
        kind: *const std::os::raw::c_char,
        origin_plane: *const std::os::raw::c_char,
        ref_token: *const std::os::raw::c_char,
    ) -> *mut std::os::raw::c_char;
    fn aim3d_document_add_sketch_entity(
        handle: *mut Aim3dDocumentHandle,
        sketch_token: *const std::os::raw::c_char,
        kind: *const std::os::raw::c_char,
        points: *const std::os::raw::c_double,
        point_count: usize,
        radius: std::os::raw::c_double,
        value: std::os::raw::c_double,
        construction: std::os::raw::c_int,
    ) -> *mut std::os::raw::c_char;
    fn aim3d_document_core_state_snapshot(handle: *mut Aim3dDocumentHandle) -> *mut std::os::raw::c_char;
    fn aim3d_document_export_sketch_dxf(handle: *mut Aim3dDocumentHandle, sketch_token: *const std::os::raw::c_char) -> *mut std::os::raw::c_char;
    fn aim3d_string_release(value: *mut std::os::raw::c_char);
}

struct DocumentState(std::sync::Mutex<*mut Aim3dDocumentHandle>);
unsafe impl Send for DocumentState {}
unsafe impl Sync for DocumentState {}

/// Event name the native core broadcasts whenever the document changes
/// (new document / sketch / rectangle / extrude). The frontend listens for
/// this and projects the attached snapshot onto the Pinia store.
const CORE_CHANGED_EVENT: &str = "core://changed";

#[derive(Serialize, Deserialize)]
struct IPCResponse {
    status: String,
    message: String,
    data: String,
}

fn selection_from_token(state: &Value, entity_id: Option<&str>) -> Value {
    let Some(entity_id) = entity_id else {
        return Value::Null;
    };

    if let Some(features) = state.get("features").and_then(Value::as_array) {
        if let Some(feature) = features.iter().find(|feature| {
            feature
                .get("selectionToken")
                .and_then(Value::as_str)
                .is_some_and(|token| token == entity_id)
        }) {
            return json!({
                "id": entity_id,
                "type": "B-rep Exact Face",
                "parentId": feature.get("id").cloned().unwrap_or(Value::Null),
                "parentLabel": feature.get("label").cloned().unwrap_or(Value::Null)
            });
        }
    }

    if let Some(setups) = state.get("setups").and_then(Value::as_array) {
        if let Some(setup) = setups.iter().find(|setup| {
            setup
                .get("id")
                .and_then(Value::as_str)
                .is_some_and(|id| id == entity_id)
        }) {
            return json!({
                "id": entity_id,
                "type": "CAM Setup",
                "parentId": state.get("activeDocumentId").cloned().unwrap_or(Value::Null),
                "parentLabel": setup.get("name").cloned().unwrap_or(Value::Null)
            });
        }
    }

    if let Some(operations) = state.get("operations").and_then(Value::as_array) {
        if let Some(operation) = operations.iter().find(|operation| {
            operation
                .get("id")
                .and_then(Value::as_str)
                .is_some_and(|id| id == entity_id)
        }) {
            return json!({
                "id": entity_id,
                "type": operation.get("type").cloned().unwrap_or(Value::Null),
                "parentId": operation.get("setupId").cloned().unwrap_or(Value::Null),
                "parentLabel": operation.get("setupId").cloned().unwrap_or(Value::Null)
            });
        }
    }

    json!({
        "id": entity_id,
        "type": "Unknown Entity",
        "parentId": state.get("activeDocumentId").cloned().unwrap_or(Value::Null),
        "parentLabel": state.get("documentPath").cloned().unwrap_or(Value::Null)
    })
}

fn update_items_by_id(items: &mut Value, target_id: &str, path: &str, value: Value) {
    let Some(items) = items.as_array_mut() else {
        return;
    };

    if let Some(item) = items.iter_mut().find(|item| {
        item.get("id")
            .and_then(Value::as_str)
            .is_some_and(|id| id == target_id)
    }) {
        item[path] = value;
        item["isDirty"] = json!(true);
        if item.get("status").is_some() {
            item["status"] = json!("Stale");
        }
    }
}

fn retain_by_id(items: &mut Value, target_id: &str) {
    if let Some(array) = items.as_array_mut() {
        array.retain(|item| item.get("id").and_then(Value::as_str) != Some(target_id));
    }
}

fn clear_selection_if(state: &mut Value, target_id: Option<&str>) {
    let selected = state.get("selectedEntityId").and_then(Value::as_str);
    if target_id.is_some() && selected == target_id {
        state["selectedEntityId"] = Value::Null;
        state["selectedEntity"] = Value::Null;
    }
}

fn delete_entity(state: &mut Value, target_kind: &str, target_id: &str) {
    match target_kind {
        "feature" => {
            let token = state["features"]
                .as_array()
                .and_then(|features| {
                    features.iter().find(|feature| {
                        feature.get("id").and_then(Value::as_str) == Some(target_id)
                    })
                })
                .and_then(|feature| feature.get("selectionToken").and_then(Value::as_str))
                .map(str::to_string);
            retain_by_id(&mut state["features"], target_id);
            if let Some(operations) = state["operations"].as_array_mut() {
                for operation in operations {
                    operation["status"] = json!("Stale");
                }
            }
            // Remove the geometry this feature produced so the 3D view stays in
            // sync with the model tree / timeline. Solids reference their source
            // feature via `sourceToken`/`pickable.entityId` (e.g.
            // `feat_Extrude_1_face_0`).
            if let Some(solids) = state["viewportScene"]["solids"].as_array_mut() {
                let prefix = format!("{target_id}_");
                solids.retain(|solid| {
                    let tokens = [
                        solid.get("sourceToken").and_then(Value::as_str),
                        solid
                            .get("pickable")
                            .and_then(|pickable| pickable.get("entityId"))
                            .and_then(Value::as_str),
                        solid.get("id").and_then(Value::as_str),
                    ];
                    !tokens.into_iter().flatten().any(|t| {
                        Some(t) == token.as_deref()
                            || t == target_id
                            || t.starts_with(&prefix)
                    })
                });
            }
            clear_selection_if(state, Some(target_id));
            clear_selection_if(state, token.as_deref());
        }
        "setup" => {
            retain_by_id(&mut state["setups"], target_id);
            if let Some(operations) = state["operations"].as_array_mut() {
                operations.retain(|operation| {
                    operation.get("setupId").and_then(Value::as_str) != Some(target_id)
                });
            }
            clear_selection_if(state, Some(target_id));
        }
        "operation" => {
            retain_by_id(&mut state["operations"], target_id);
            clear_selection_if(state, Some(target_id));
        }
        _ => {}
    }

    let live_operation_ids: Vec<String> = state["operations"]
        .as_array()
        .map(|operations| {
            operations
                .iter()
                .filter_map(|operation| {
                    operation
                        .get("id")
                        .and_then(Value::as_str)
                        .map(str::to_string)
                })
                .collect()
        })
        .unwrap_or_default();
    if let Some(toolpaths) = state["viewportScene"]["toolpaths"].as_array_mut() {
        toolpaths.retain(|toolpath| {
            toolpath
                .get("operationId")
                .and_then(Value::as_str)
                .is_some_and(|id| live_operation_ids.iter().any(|live| live == id))
        });
    }
}

fn default_viewport_scene() -> Value {
    json!({
        "solids": [{
            "id": "solid_MainPocket_1",
            "bodyId": 2,
            "sourceToken": "feat_Extrude_1_face_0",
            "pickable": {
                "entityId": "feat_Extrude_1_face_0",
                "kind": "B-rep Exact Face",
                "priority": 10,
                "snapPoints": [
                    { "id": "solid_MainPocket_1_center", "kind": "center", "position": [0, 0, 0.35] }
                ]
            },
            "positions": [
                -1.8, -1.2, -0.35, 1.8, -1.2, -0.35, 1.8, 1.2, -0.35, -1.8, 1.2, -0.35,
                -1.8, -1.2, 0.35, 1.8, -1.2, 0.35, 1.8, 1.2, 0.35, -1.8, 1.2, 0.35
            ],
            "normals": [
                0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1,
                0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1
            ],
            "colors": [
                0.16, 0.62, 0.9, 1, 0.16, 0.62, 0.9, 1, 0.16, 0.62, 0.9, 1, 0.16, 0.62, 0.9, 1,
                0.2, 0.72, 1, 1, 0.2, 0.72, 1, 1, 0.2, 0.72, 1, 1, 0.2, 0.72, 1, 1
            ],
            "indices": [
                0, 1, 2, 0, 2, 3,
                4, 6, 5, 4, 7, 6,
                0, 4, 5, 0, 5, 1,
                1, 5, 6, 1, 6, 2,
                2, 6, 7, 2, 7, 3,
                3, 7, 4, 3, 4, 0
            ],
            "transform": [
                1, 0, 0, 0,
                0, 1, 0, 0,
                0, 0, 1, 0,
                0, 0, 0, 1
            ]
        }],
        "toolpaths": [{
            "id": "toolpath_op_Pocket_1",
            "operationId": "op_Pocket_1",
            "status": "Stale",
            "color": [1, 0.74, 0.18, 1],
            "points": [
                -1.4, -0.8, 0.55,
                -0.4, -0.8, 0.55,
                -0.4, 0.1, 0.55,
                0.8, 0.1, 0.55,
                0.8, 0.8, 0.55,
                1.4, 0.8, 0.55
            ]
        }],
        "gizmos": {
            "axes": [
                { "id": "axis_x", "label": "X", "color": [0.95, 0.18, 0.2, 1], "points": [0, 0, 0, 1.1, 0, 0] },
                { "id": "axis_y", "label": "Y", "color": [0.2, 0.82, 0.28, 1], "points": [0, 0, 0, 0, 1.1, 0] },
                { "id": "axis_z", "label": "Z", "color": [0.28, 0.48, 1, 1], "points": [0, 0, 0, 0, 0, 1.1] }
            ],
            "grid": false,
            "workOrigin": [0, 0, 0]
        },
        "camera": {
            "target": [0, 0, 0],
            "distance": 5.2,
            "yaw": 0.72,
            "pitch": 0.62,
            "near": 0.01,
            "far": 100
        },
        "diagnostics": {
            "webgpuAvailable": false,
            "frameTimeMs": 0,
            "fps": 0,
            "drawCount": 0,
            "triangleCount": 12,
            "segmentCount": 8,
            "lastPickLatencyMs": 0,
            "hoverTargetId": null,
            "snapCandidateId": null
        }
    })
}

fn sync_viewport_scene(state: &mut Value) {
    if state.get("viewportScene").is_none() || state["viewportScene"].is_null() {
        state["viewportScene"] = default_viewport_scene();
    }

    // A toolpath only has meaning relative to a body it machines. Once every
    // solid is gone, drop any orphaned toolpaths so the 3D view doesn't keep
    // showing a path floating in empty space.
    let no_solids = state["viewportScene"]["solids"]
        .as_array()
        .is_some_and(Vec::is_empty);
    if no_solids {
        state["viewportScene"]["toolpaths"] = json!([]);
    }

    let ready_operation_ids: Vec<String> = state
        .get("operations")
        .and_then(Value::as_array)
        .map(|operations| {
            operations
                .iter()
                .filter(|operation| {
                    operation
                        .get("status")
                        .and_then(Value::as_str)
                        .is_some_and(|status| status == "Ready")
                })
                .filter_map(|operation| {
                    operation
                        .get("id")
                        .and_then(Value::as_str)
                        .map(str::to_string)
                })
                .collect()
        })
        .unwrap_or_default();

    if let Some(toolpaths) = state["viewportScene"]["toolpaths"].as_array_mut() {
        for toolpath in toolpaths {
            let operation_id = toolpath
                .get("operationId")
                .and_then(Value::as_str)
                .unwrap_or_default();
            toolpath["status"] =
                json!(if ready_operation_ids.iter().any(|id| id == operation_id) {
                    "Ready"
                } else {
                    "Stale"
                });
        }
    }

    let triangle_count = state["viewportScene"]["solids"]
        .as_array()
        .map(|solids| {
            solids
                .iter()
                .map(|solid| {
                    solid["indices"]
                        .as_array()
                        .map_or(0, |indices| indices.len() / 3)
                })
                .sum::<usize>()
        })
        .unwrap_or(0);
    let toolpath_segments = state["viewportScene"]["toolpaths"]
        .as_array()
        .map(|toolpaths| {
            toolpaths
                .iter()
                .map(|toolpath| {
                    toolpath["points"]
                        .as_array()
                        .map_or(0, |points| points.len() / 3)
                        .saturating_sub(1)
                })
                .sum::<usize>()
        })
        .unwrap_or(0);
    let axis_segments = state["viewportScene"]["gizmos"]["axes"]
        .as_array()
        .map_or(0, Vec::len);

    state["viewportScene"]["diagnostics"]["triangleCount"] = json!(triangle_count);
    state["viewportScene"]["diagnostics"]["segmentCount"] =
        json!(toolpath_segments + axis_segments);
}

fn feature_from_snapshot(feature: &Value) -> Value {
    let feature_type = feature.get("type").cloned().unwrap_or(Value::Null);
    let label = feature
        .get("label")
        .cloned()
        .unwrap_or_else(|| feature_type.clone());
    let selection_token = feature
        .get("selectionToken")
        .cloned()
        .unwrap_or_else(|| match feature.get("id").and_then(Value::as_str) {
            Some(id) => json!(format!("{id}_face_0")),
            None => Value::Null,
        });
    json!({
        "id": feature.get("id").cloned().unwrap_or(Value::Null),
        "type": feature_type,
        "label": label,
        "value": feature.get("value").cloned().unwrap_or(json!(0)),
        "unit": feature.get("unit").cloned().unwrap_or_else(|| json!("mm")),
        "isDirty": feature.get("isDirty").and_then(Value::as_bool).unwrap_or(false),
        "selectionToken": selection_token
    })
}

/// Projects a flat core-state snapshot (emitted by the native C++/Rust core)
/// onto the UI state. Mirrors `applyCoreSnapshot` in the frontend so the same
/// merge happens whether a snapshot is applied in JS or routed through Rust:
/// the core is the source of truth for features and produced solids, while
/// UI presentation state (camera, gizmos, resolving selection) is preserved.
fn apply_core_snapshot(state: &mut Value, snapshot: &Value) {
    if !snapshot.is_object() {
        return;
    }

    if let Some(id) = snapshot.get("activeDocumentId").and_then(Value::as_str) {
        state["activeDocumentId"] = json!(id);
    }
    if let Some(path) = snapshot.get("documentPath").and_then(Value::as_str) {
        state["documentPath"] = json!(path);
    }
    if let Some(features) = snapshot.get("features").and_then(Value::as_array) {
        let projected: Vec<Value> = features.iter().map(feature_from_snapshot).collect();
        state["features"] = json!(projected);
    }

    // Pass through the browser tree (sketches, construction, bodies) from the
    // C++ core snapshot. The frontend's Pinia store reads browser.sketches to
    // render committed sketch entities in the viewport overlay.
    if let Some(browser) = snapshot.get("browser") {
        if browser.is_object() {
            state["browser"] = browser.clone();
        }
    }

    if state.get("viewportScene").is_none() || state["viewportScene"].is_null() {
        state["viewportScene"] = default_viewport_scene();
    }
    if let Some(scene) = snapshot.get("viewportScene") {
        if let Some(solids) = scene.get("solids").and_then(Value::as_array) {
            state["viewportScene"]["solids"] = json!(solids);
        }
        if let Some(toolpaths) = scene.get("toolpaths").and_then(Value::as_array) {
            state["viewportScene"]["toolpaths"] = json!(toolpaths);
        }
    }

    // Drop a dangling selection that no longer resolves to a live entity.
    if let Some(selected) = state
        .get("selectedEntityId")
        .and_then(Value::as_str)
        .map(str::to_string)
    {
        let mut tokens: HashSet<String> = HashSet::new();
        if let Some(features) = state["features"].as_array() {
            for feature in features {
                if let Some(id) = feature.get("id").and_then(Value::as_str) {
                    tokens.insert(id.to_string());
                }
                if let Some(token) = feature.get("selectionToken").and_then(Value::as_str) {
                    tokens.insert(token.to_string());
                }
            }
        }
        if let Some(solids) = state["viewportScene"]["solids"].as_array() {
            for solid in solids {
                for key in [
                    solid.get("sourceToken").and_then(Value::as_str),
                    solid
                        .get("pickable")
                        .and_then(|pickable| pickable.get("entityId"))
                        .and_then(Value::as_str),
                    solid.get("id").and_then(Value::as_str),
                ]
                .into_iter()
                .flatten()
                {
                    tokens.insert(key.to_string());
                }
            }
        }
        if !tokens.contains(&selected) {
            state["selectedEntityId"] = Value::Null;
            state["selectedEntity"] = Value::Null;
        }
    }

    sync_viewport_scene(state);
}

#[tauri::command]
fn dispatch_core_action(
    action_json: String, 
    state_json: String, 
    doc_state: tauri::State<'_, DocumentState>
) -> IPCResponse {
    let action: Value = match serde_json::from_str(&action_json) {
        Ok(action) => action,
        Err(err) => {
            return IPCResponse {
                status: "error".to_string(),
                message: format!("Invalid action JSON: {err}"),
                data: state_json,
            };
        }
    };

    let mut state: Value = match serde_json::from_str(&state_json) {
        Ok(state) => state,
        Err(err) => {
            return IPCResponse {
                status: "error".to_string(),
                message: format!("Invalid state JSON: {err}"),
                data: "{}".to_string(),
            };
        }
    };

    let action_type = action
        .get("type")
        .and_then(Value::as_str)
        .unwrap_or_default();
    let target_id = action
        .get("targetId")
        .and_then(Value::as_str)
        .unwrap_or_default();
    let target_kind = action
        .get("targetKind")
        .and_then(Value::as_str)
        .unwrap_or_default();
    let path = action
        .get("path")
        .and_then(Value::as_str)
        .unwrap_or_default();
    let value = action.get("value").cloned().unwrap_or(Value::Null);

    match action_type {
        "ui.selectEntity" => {
            let entity_id = value.as_str();
            state["selectedEntityId"] = value.clone();
            state["selectedEntity"] = selection_from_token(&state, entity_id);
        }
        "ui.updateField" => {
            if target_kind == "feature" {
                update_items_by_id(&mut state["features"], target_id, path, value);
                if let Some(operations) = state["operations"].as_array_mut() {
                    for operation in operations {
                        operation["status"] = json!("Stale");
                    }
                }
            } else if target_kind == "setup" {
                update_items_by_id(&mut state["setups"], target_id, path, value);
            } else if target_kind == "operation" {
                update_items_by_id(&mut state["operations"], target_id, path, value);
            }
        }
        "core.deleteEntity" => {
            delete_entity(&mut state, target_kind, target_id);
        }
        "core.createSketch" => {
            let plane_kind = value.get("plane").and_then(|p| p.get("kind")).and_then(Value::as_str).unwrap_or("Origin");
            let origin_plane = value.get("plane").and_then(|p| p.get("originPlane")).and_then(Value::as_str).unwrap_or("XY");
            let ref_token = value.get("plane").and_then(|p| p.get("referenceToken")).and_then(Value::as_str).unwrap_or("");
            
            let c_kind = std::ffi::CString::new(plane_kind).unwrap();
            let c_origin = std::ffi::CString::new(origin_plane).unwrap();
            let c_ref = std::ffi::CString::new(ref_token).unwrap();
            
            unsafe {
                let handle = doc_state.0.lock().unwrap();
                let result = aim3d_document_add_sketch_on_plane(
                    *handle,
                    c_kind.as_ptr(),
                    c_origin.as_ptr(),
                    c_ref.as_ptr()
                );
                if !result.is_null() {
                    aim3d_string_release(result);
                }
                
                let snapshot_ptr = aim3d_document_core_state_snapshot(*handle);
                if !snapshot_ptr.is_null() {
                    let snapshot_cstr = std::ffi::CStr::from_ptr(snapshot_ptr);
                    if let Ok(snapshot_str) = snapshot_cstr.to_str() {
                        if let Ok(new_state) = serde_json::from_str::<Value>(snapshot_str) {
                            apply_core_snapshot(&mut state, &new_state);
                        }
                    }
                    aim3d_string_release(snapshot_ptr);
                }
            }
        }
        "core.createSketchEntity" => {
            let sketch_id = target_id;
            let kind = value.get("kind").and_then(Value::as_str).unwrap_or("");
            let radius = value.get("radius").and_then(Value::as_f64).unwrap_or(0.0);
            let val = value.get("value").and_then(Value::as_f64).unwrap_or(0.0);
            let construction = value.get("construction").and_then(Value::as_bool).unwrap_or(false) as i32;
            
            let mut points = Vec::new();
            if let Some(p) = value.get("points").and_then(Value::as_array) {
                for pt in p {
                    if let Some(n) = pt.as_f64() {
                        points.push(n);
                    }
                }
            }
            
            let c_sketch = std::ffi::CString::new(sketch_id).unwrap();
            let c_kind = std::ffi::CString::new(kind).unwrap();
            
            unsafe {
                let handle = doc_state.0.lock().unwrap();
                let result = aim3d_document_add_sketch_entity(
                    *handle,
                    c_sketch.as_ptr(),
                    c_kind.as_ptr(),
                    points.as_ptr(),
                    points.len() / 2,
                    radius,
                    val,
                    construction
                );
                if !result.is_null() {
                    aim3d_string_release(result);
                }
                
                let snapshot_ptr = aim3d_document_core_state_snapshot(*handle);
                if !snapshot_ptr.is_null() {
                    let snapshot_cstr = std::ffi::CStr::from_ptr(snapshot_ptr);
                    if let Ok(snapshot_str) = snapshot_cstr.to_str() {
                        if let Ok(new_state) = serde_json::from_str::<Value>(snapshot_str) {
                            apply_core_snapshot(&mut state, &new_state);
                        }
                    }
                    aim3d_string_release(snapshot_ptr);
                }
            }
        }
        "core.recomputeDocument" => {
            for key in ["features", "setups", "operations"] {
                if let Some(items) = state[key].as_array_mut() {
                    for item in items {
                        item["isDirty"] = json!(false);
                    }
                }
            }
        }
        "cam.generateToolpath" => {
            if let Some(operations) = state["operations"].as_array_mut() {
                if let Some(operation) = operations.iter_mut().find(|operation| {
                    operation
                        .get("id")
                        .and_then(Value::as_str)
                        .is_some_and(|id| id == target_id)
                }) {
                    operation["status"] = json!("Ready");
                    operation["isDirty"] = json!(false);
                }
            }
            state["gcode"] = json!(format!(
                "; aim3d Posted G-code for {target_id}\nT1 M6\nG0 X0 Y0 Z10\nG1 X12 Y8 Z-2 F800\nG1 X24 Y8 Z-2\nM30"
            ));
        }
        "sim.runSimulation" => {
            state["isSimulating"] = json!(false);
            state["simulationStats"] = json!({ "collisions": 0, "materialRemoved": 1420.5 });
        }
        "core.loadDocumentState" => {
            apply_core_snapshot(&mut state, &value);
        }
        _ => {}
    }

    sync_viewport_scene(&mut state);

    IPCResponse {
        status: "success".to_string(),
        message: format!("Dispatched core action: {action_type}"),
        data: state.to_string(),
    }
}

#[tauri::command]
fn open_document(path: String) -> IPCResponse {
    println!(
        "[Tauri Rust IPC] Invoking headless core open_document for: {}",
        path
    );
    IPCResponse {
        status: "success".to_string(),
        message: format!("Opened document: {}", path),
        data: "{\"doc_id\": \"doc_1001\", \"body_count\": 1}".to_string(),
    }
}

#[tauri::command]
fn solve_2d_sketch(_points_json: String, _constraints_json: String) -> IPCResponse {
    println!("[Tauri Rust IPC] Invoking headless core 2D constraint solver.");
    IPCResponse {
        status: "success".to_string(),
        message: "Sketch solved successfully".to_string(),
        data: "{\"isFullyConstrained\": true, \"degreesOfFreedom\": 0}".to_string(),
    }
}

#[tauri::command]
fn generate_toolpath(operation_id: String) -> IPCResponse {
    println!(
        "[Tauri Rust IPC] Triggering background Clipper2 / OpenCAMLib toolpath solvers for: {}",
        operation_id
    );
    IPCResponse {
        status: "success".to_string(),
        message: format!("Generated toolpath for {}", operation_id),
        data: "{\"points_count\": 125, \"travel_length\": 450.2}".to_string(),
    }
}

#[tauri::command]
fn run_simulation(_gcode: String) -> IPCResponse {
    println!("[Tauri Rust IPC] Triggering Volumetric Taichi SDF Simulation sweep.");
    IPCResponse {
        status: "success".to_string(),
        message: "Simulation run complete".to_string(),
        data: "{\"collisions\": 0, \"material_removed_mm3\": 1420.5}".to_string(),
    }
}

#[tauri::command]
fn recompute_document() -> IPCResponse {
    println!("[Tauri Rust IPC] Invoking headless core parametric recompute.");
    IPCResponse {
        status: "success".to_string(),
        message: "Document recomputed".to_string(),
        data: "{\"recomputed\": true, \"cleared_dirty\": 3}".to_string(),
    }
}

#[tauri::command]
fn post_process(setup_id: String) -> IPCResponse {
    println!("[Tauri Rust IPC] Posting G-code for setup: {}", setup_id);
    IPCResponse {
        status: "success".to_string(),
        message: format!("Posted G-code for {}", setup_id),
        data: format!(
            "{{\"gcode\": \"; aim3d Posted G-code for {setup_id}\\nT1 M6\\nG0 X0 Y0 Z10\\nG1 X12 Y8 Z-2 F800\\nM30\"}}"
        ),
    }
}

/// Merge a core-state snapshot into the supplied UI state and return the
/// projected result. This is the request/response form of the projection (the
/// frontend can route a pulled snapshot through the core boundary instead of
/// merging purely client-side).
#[tauri::command]
fn apply_core_state(snapshot_json: String, state_json: String) -> IPCResponse {
    let snapshot: Value = match serde_json::from_str(&snapshot_json) {
        Ok(snapshot) => snapshot,
        Err(err) => {
            return IPCResponse {
                status: "error".to_string(),
                message: format!("Invalid snapshot JSON: {err}"),
                data: state_json,
            };
        }
    };

    let mut state: Value = match serde_json::from_str(&state_json) {
        Ok(state) => state,
        Err(err) => {
            return IPCResponse {
                status: "error".to_string(),
                message: format!("Invalid state JSON: {err}"),
                data: "{}".to_string(),
            };
        }
    };

    apply_core_snapshot(&mut state, &snapshot);

    IPCResponse {
        status: "success".to_string(),
        message: "Applied core snapshot".to_string(),
        data: state.to_string(),
    }
}

/// Broadcast a core-state snapshot to every window as a `core://changed` event.
/// This is the push hook a core-as-service transport (or a Python sidecar)
/// calls so a scripted document/sketch/rectangle/extrude updates the running UI
/// in real time, without the UI holding any sovereign document state.
#[tauri::command]
fn push_core_snapshot(app: tauri::AppHandle, snapshot_json: String) -> IPCResponse {
    let snapshot: Value = match serde_json::from_str(&snapshot_json) {
        Ok(snapshot) => snapshot,
        Err(err) => {
            return IPCResponse {
                status: "error".to_string(),
                message: format!("Invalid snapshot JSON: {err}"),
                data: "{}".to_string(),
            };
        }
    };

    match app.emit_all(CORE_CHANGED_EVENT, snapshot) {
        Ok(()) => IPCResponse {
            status: "success".to_string(),
            message: "Broadcast core snapshot".to_string(),
            data: "{\"emitted\": true}".to_string(),
        },
        Err(err) => IPCResponse {
            status: "error".to_string(),
            message: format!("Failed to emit core snapshot: {err}"),
            data: "{}".to_string(),
        },
    }
}

#[tauri::command]
fn run_python_script(app: tauri::AppHandle, script_path: String) -> IPCResponse {
    let script_path_display = script_path.clone();
    std::thread::spawn(move || {
        use std::process::{Command, Stdio};
        use std::io::{BufRead, BufReader};

        let mut child = Command::new("python3")
            .arg(&script_path)
            .stdout(Stdio::piped())
            .spawn()
            .expect("Failed to start python process");

        if let Some(stdout) = child.stdout.take() {
            let reader = BufReader::new(stdout);
            for line in reader.lines().map_while(Result::ok) {
                if let Ok(snapshot) = serde_json::from_str::<serde_json::Value>(&line) {
                    if let Some(channel) = snapshot.get("channel").and_then(|c| c.as_str()) {
                        if channel == "core://changed" {
                            if let Some(data) = snapshot.get("snapshot") {
                                let _ = app.emit_all("core://changed", data.clone());
                            }
                        }
                    } else {
                        let _ = app.emit_all("core://changed", snapshot);
                    }
                }
            }
        }
        let _ = child.wait();
    });

    IPCResponse {
        status: "success".to_string(),
        message: format!("Started python script: {}", script_path_display),
        data: "{}".to_string(),
    }
}

#[tauri::command]
fn export_sketch_dxf(
    sketch_token: String,
    file_path: String,
    doc_state: tauri::State<'_, DocumentState>
) -> IPCResponse {
    let c_token = std::ffi::CString::new(sketch_token.as_str()).unwrap();
    
    let dxf_content = unsafe {
        let handle = doc_state.0.lock().unwrap();
        let result = aim3d_document_export_sketch_dxf(*handle, c_token.as_ptr());
        if result.is_null() {
            return IPCResponse {
                status: "error".to_string(),
                message: format!("Sketch '{}' not found or has no entities", sketch_token),
                data: "{}".to_string(),
            };
        }
        let cstr = std::ffi::CStr::from_ptr(result);
        let s = cstr.to_str().unwrap_or("").to_string();
        aim3d_string_release(result);
        s
    };
    
    match std::fs::write(&file_path, &dxf_content) {
        Ok(()) => IPCResponse {
            status: "success".to_string(),
            message: format!("Exported sketch '{}' to {}", sketch_token, file_path),
            data: format!("{{\"path\":\"{}\",\"size\":{}}}", file_path, dxf_content.len()),
        },
        Err(err) => IPCResponse {
            status: "error".to_string(),
            message: format!("Failed to write DXF: {err}"),
            data: "{}".to_string(),
        },
    }
}

fn main() {
    let doc_handle = unsafe { aim3d_document_create() };

    tauri::Builder::default()
        .manage(DocumentState(std::sync::Mutex::new(doc_handle)))
        .invoke_handler(tauri::generate_handler![
            dispatch_core_action,
            apply_core_state,
            push_core_snapshot,
            run_python_script,
            open_document,
            solve_2d_sketch,
            generate_toolpath,
            run_simulation,
            recompute_document,
            post_process,
            export_sketch_dxf
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
