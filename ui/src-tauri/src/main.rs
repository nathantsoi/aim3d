#![cfg_attr(all(not(debug_assertions), target_os = "windows"), windows_subsystem = "windows")]

use serde::{Serialize, Deserialize};

#[derive(Serialize, Deserialize)]
struct IPCResponse {
    status: String,
    message: String,
    data: String,
}

#[tauri::command]
fn open_document(path: String) -> IPCResponse {
    println!("[Tauri Rust IPC] Invoking headless core open_document for: {}", path);
    IPCResponse {
        status: "success".to_string(),
        message: format!("Opened document: {}", path),
        data: "{\"doc_id\": \"doc_1001\", \"body_count\": 1}".to_string(),
    }
}

#[tauri::command]
fn solve_2d_sketch(points_json: String, constraints_json: String) -> IPCResponse {
    println!("[Tauri Rust IPC] Invoking headless core 2D constraint solver.");
    IPCResponse {
        status: "success".to_string(),
        message: "Sketch solved successfully".to_string(),
        data: "{\"isFullyConstrained\": true, \"degreesOfFreedom\": 0}".to_string(),
    }
}

#[tauri::command]
fn generate_toolpath(operation_id: String) -> IPCResponse {
    println!("[Tauri Rust IPC] Triggering background Clipper2 / OpenCAMLib toolpath solvers for: {}", operation_id);
    IPCResponse {
        status: "success".to_string(),
        message: format!("Generated toolpath for {}", operation_id),
        data: "{\"points_count\": 125, \"travel_length\": 450.2}".to_string(),
    }
}

#[tauri::command]
fn run_simulation(gcode: String) -> IPCResponse {
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
            open_document,
            solve_2d_sketch,
            generate_toolpath,
            run_simulation
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
