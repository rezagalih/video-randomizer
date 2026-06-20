mod commands;
mod metadata;
mod models;
mod renderer;

use std::sync::{Arc, Mutex};

use commands::AppState;
use renderer::Renderer;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .manage(Mutex::new(AppState {
            renderer: Arc::new(Renderer::new()),
        }))
        .invoke_handler(tauri::generate_handler![
            commands::get_video_metadata,
            commands::get_music_metadata,
            commands::validate_video,
            commands::validate_music,
            commands::scan_folder,
            commands::generate_sequence,
            commands::generate_music_order,
            commands::start_render,
            commands::cancel_render,
            commands::pause_render,
            commands::get_state_path,
            commands::save_state,
            commands::load_state,
            commands::open_folder,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
