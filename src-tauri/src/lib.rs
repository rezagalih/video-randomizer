mod commands;
mod metadata;
mod models;
mod renderer;

use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use commands::AppState;
use renderer::Renderer;
use tauri::Manager;

#[cfg(windows)]
fn resolve_binary(app: &tauri::App, name: &str) -> PathBuf {
    let exe_name = format!("{}.exe", name);
    // On Windows, check exe directory first (side-by-side: video.exe + ffmpeg.exe)
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            let candidate = dir.join(&exe_name);
            if candidate.exists() {
                return candidate;
            }
        }
    }
    // Fall back to resource bundle (installer-extracted resources/bin/)
    if let Ok(p) = app.path().resolve(&format!("bin/{}", name), tauri::path::BaseDirectory::Resource) {
        return p;
    }
    PathBuf::from(exe_name)
}

#[cfg(not(windows))]
fn resolve_binary(app: &tauri::App, name: &str) -> PathBuf {
    // macOS / Linux: bundled inside .app Resources/bin/
    app.path()
        .resolve(&format!("bin/{}", name), tauri::path::BaseDirectory::Resource)
        .unwrap_or_else(|_| PathBuf::from(name))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            let ffmpeg_path = resolve_binary(app, "ffmpeg");
            let ffprobe_path = resolve_binary(app, "ffprobe");

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
            commands::merge_videos,
            commands::trim_video_checkpoints,
            commands::remaster_audio,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
