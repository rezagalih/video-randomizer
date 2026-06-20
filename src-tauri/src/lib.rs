mod commands;
mod metadata;
mod models;
mod renderer;

use std::sync::{Arc, Mutex};

use commands::AppState;
use renderer::Renderer;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            // resolve bundled ffmpeg/ffprobe paths
            let ffmpeg_path = app
                .path()
                .resolve("bin/ffmpeg", tauri::path::BaseDirectory::Resource)
                .unwrap_or_else(|_| "ffmpeg".into());
            let ffprobe_path = app
                .path()
                .resolve("bin/ffprobe", tauri::path::BaseDirectory::Resource)
                .unwrap_or_else(|_| "ffprobe".into());

            let state = AppState {
                renderer: Arc::new(Renderer::new(
                    ffmpeg_path.to_string_lossy().to_string(),
                    ffprobe_path.to_string_lossy().to_string(),
                )),
                ffprobe_path: ffprobe_path.to_string_lossy().to_string(),
            };
            app.manage(Mutex::new(state));
            Ok(())
        })
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
