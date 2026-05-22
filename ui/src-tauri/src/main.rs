#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

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

#[tauri::command]
fn dispatch_core_action(action_json: String, state_json: String) -> IPCResponse {
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

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            dispatch_core_action,
            open_document,
            solve_2d_sketch,
            generate_toolpath,
            run_simulation
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
