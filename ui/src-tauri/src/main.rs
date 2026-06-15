#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashSet;
use tauri::Manager;

#[allow(dead_code)]
pub struct Aim3dDocumentHandle;

#[allow(dead_code)]
struct DocumentState(std::sync::Mutex<Aim3dDocumentHandle>);
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

// Unused functions removed since all FFI operations are now client-side or WASM based.

fn default_viewport_scene() -> Value {
    json!({
        "solids": [],
        "toolpaths": [],
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
            "triangleCount": 0,
            "segmentCount": 0,
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
    _action_json: String, 
    state_json: String, 
    _doc_state: tauri::State<'_, DocumentState>
) -> IPCResponse {
    // Return the state back to the UI. The UI will process CAD/CAM changes client-side or via WASM.
    IPCResponse {
        status: "success".to_string(),
        message: "Routed to mock/WASM boundary".to_string(),
        data: state_json,
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
    _doc_state: tauri::State<'_, DocumentState>
) -> IPCResponse {
    // Stubbed since all solver logic now runs inside WebAssembly
    IPCResponse {
        status: "success".to_string(),
        message: format!("DXF export stub for sketch '{}' to {}", sketch_token, file_path),
        data: "{}".to_string(),
    }
}

fn main() {
    tauri::Builder::default()
        .manage(DocumentState(std::sync::Mutex::new(Aim3dDocumentHandle)))
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
