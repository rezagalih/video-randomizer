use std::sync::{Arc, Mutex};
use tauri::{Manager, State};
use tauri::ipc::Channel;

use crate::metadata;
use crate::models::*;
use crate::renderer::Renderer;

const STATE_FILE: &str = "app_state.json";

#[tauri::command]
pub fn get_state_path(app: tauri::AppHandle) -> Result<String, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join(STATE_FILE).to_string_lossy().to_string())
}

#[tauri::command]
pub fn save_state(path: String, data: serde_json::Value) -> Result<(), String> {
    let bytes = serde_json::to_vec_pretty(&data).map_err(|e| e.to_string())?;
    std::fs::write(&path, bytes).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn load_state(path: String) -> Result<serde_json::Value, String> {
    let bytes = std::fs::read(&path).map_err(|e| format!("No saved state: {}", e))?;
    serde_json::from_slice(&bytes).map_err(|e| e.to_string())
}

pub struct AppState {
    pub renderer: Arc<Renderer>,
    pub ffprobe_path: String,
}

#[tauri::command]
pub fn get_video_metadata(path: String, state: State<'_, Mutex<AppState>>) -> Result<VideoFile, String> {
    let ffprobe = state.lock().map_err(|e| e.to_string())?.ffprobe_path.clone();
    metadata::get_video_metadata(&path, &ffprobe).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_music_metadata(path: String, state: State<'_, Mutex<AppState>>) -> Result<MusicFile, String> {
    let ffprobe = state.lock().map_err(|e| e.to_string())?.ffprobe_path.clone();
    metadata::get_music_metadata(&path, &ffprobe).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn validate_video(path: String) -> bool {
    metadata::validate_video_file(&path)
}

#[tauri::command]
pub fn validate_music(path: String) -> bool {
    metadata::validate_music_file(&path)
}

#[tauri::command]
pub fn scan_folder(path: String, state: State<'_, Mutex<AppState>>) -> Result<ScanResult, String> {
    let ffprobe = state.lock().map_err(|e| e.to_string())?.ffprobe_path.clone();
    let dir = std::fs::read_dir(&path).map_err(|e| e.to_string())?;

    let mut videos = Vec::new();
    let mut music = Vec::new();

    for entry in dir {
        let entry = entry.map_err(|e| e.to_string())?;
        let p = entry.path();
        let p_str = p.to_string_lossy().to_string();

        if p.is_file() {
            if metadata::validate_video_file(&p_str) {
                if let Ok(m) = metadata::get_video_metadata(&p_str, &ffprobe) {
                    videos.push(m);
                }
            } else if metadata::validate_music_file(&p_str) {
                if let Ok(m) = metadata::get_music_metadata(&p_str, &ffprobe) {
                    music.push(m);
                }
            }
        }
    }

    Ok(ScanResult { videos, music })
}

#[derive(serde::Serialize)]
pub struct ScanResult {
    pub videos: Vec<VideoFile>,
    pub music: Vec<MusicFile>,
}

#[tauri::command]
pub fn generate_sequence(
    videos: Vec<VideoFile>,
    mode: String,
    clip_duration: f64,
    prevent_duplicates: bool,
    cut_random_enabled: bool,
    cut_random_min: f64,
    cut_random_max: f64,
) -> Result<Vec<SequenceItem>, String> {
    let count = videos.len();
    if count == 0 {
        return Err("No videos available".into());
    }

    let target = clip_duration.max(0.0);
    let use_target = target > 0.0;

    // prevent_duplicates impossible with single video
    let prevent_duplicates = prevent_duplicates && count > 1;

    fn make_item(video: &VideoFile, order: usize, start: f64, end: f64) -> SequenceItem {
        SequenceItem {
            video_path: video.path.clone(),
            filename: video.filename.clone(),
            order,
            start_time: start,
            end_time: end,
            duration: end - start,
        }
    }

    fn pick_cut(video: &VideoFile, enabled: bool, min: f64, max: f64) -> (f64, f64) {
        if !enabled || video.duration < min {
            return (0.0, video.duration);
        }
        use rand::Rng;
        let mut rng = rand::thread_rng();
        let max_start = (video.duration - min).max(0.0);
        let start = rng.gen_range(0.0..=max_start);
        let remain = video.duration - start;
        let cut = rng.gen_range(min..=max.min(remain));
        (start, start + cut)
    }

    let mut sequence = Vec::new();
    let mut current_time = 0.0;
    let mut prev_idx = count; // sentinel, not a valid index

    if !use_target {
        // Single pass: one clip per video (full duration, no trimming)
        let order: Vec<usize> = match mode.as_str() {
            "shuffle" => {
                use rand::seq::SliceRandom;
                let mut rng = rand::thread_rng();
                let mut indices: Vec<usize> = (0..count).collect();
                indices.shuffle(&mut rng);
                indices
            }
            _ => (0..count).collect(),
        };

        for &idx in &order {
            let video = &videos[idx];
            let (start, end) = pick_cut(video, cut_random_enabled, cut_random_min, cut_random_max);
            sequence.push(make_item(video, sequence.len(), current_time + start, current_time + end));
            current_time += end - start;
        }
    } else {
        // Multi-round: loop through videos until target duration is reached
        use rand::seq::SliceRandom;

        loop {
            let mut rng = rand::thread_rng();
            let order: Vec<usize> = match mode.as_str() {
                "shuffle" => {
                    let mut indices: Vec<usize> = (0..count).collect();
                    indices.shuffle(&mut rng);
                    if prevent_duplicates && indices[0] == prev_idx {
                        if let Some(p) = indices.iter().position(|&i| i != prev_idx) {
                            indices.swap(0, p);
                        }
                    }
                    indices
                }
                _ => (0..count).collect(),
            };

            for &idx in &order {
                // prevent_duplicates: skip if same video as last in sequence
                if prevent_duplicates && idx == prev_idx {
                    continue;
                }

                let video = &videos[idx];
                let (start, end) = pick_cut(video, cut_random_enabled, cut_random_min, cut_random_max);
                let dur = end - start;

                sequence.push(make_item(video, sequence.len(), current_time + start, current_time + end));

                current_time += dur;
                prev_idx = idx;

                if current_time >= target {
                    break;
                }
            }

            if current_time >= target {
                break;
            }
        }
    }

    Ok(sequence)
}

#[tauri::command]
pub fn generate_music_order(
    music: Vec<MusicFile>,
    mode: String,
) -> Result<Vec<usize>, String> {
    let count = music.len();
    if count == 0 {
        return Err("No music files available".into());
    }

    let order: Vec<usize> = match mode.as_str() {
        "shuffle" => {
            use rand::seq::SliceRandom;
            let mut indices: Vec<usize> = (0..count).collect();
            let mut rng = rand::thread_rng();
            indices.shuffle(&mut rng);
            indices
        }
        "repeat_single" => vec![0],
        _ => (0..count).collect(),
    };

    Ok(order)
}

#[tauri::command]
pub async fn start_render(
    state: State<'_, Mutex<AppState>>,
    music: Vec<MusicFile>,
    sequence: Vec<SequenceItem>,
    settings: RenderSettings,
    on_event: Channel<RenderProgress>,
    music_order: Vec<usize>,
) -> Result<String, String> {
    let renderer = {
        let guard = state.lock().map_err(|e| e.to_string())?;
        guard.renderer.clone()
    };

    renderer
        .run_render(&music, &sequence, &settings, &music_order, move |progress| {
            let _ = on_event.send(progress);
        })
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn cancel_render(state: State<'_, Mutex<AppState>>) -> Result<(), String> {
    let guard = state.lock().map_err(|e| e.to_string())?;
    guard.renderer.cancel();
    Ok(())
}

#[tauri::command]
pub fn pause_render(state: State<'_, Mutex<AppState>>) -> Result<bool, String> {
    let guard = state.lock().map_err(|e| e.to_string())?;
    guard.renderer.toggle_pause();
    Ok(guard.renderer.paused())
}

#[tauri::command]
pub fn open_folder(path: String) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    let status = std::process::Command::new("open")
        .arg(&path)
        .status()
        .map_err(|e| format!("Gagal membuka folder: {}", e))?;

    #[cfg(target_os = "windows")]
    let status = std::process::Command::new("explorer")
        .arg(&path)
        .status()
        .map_err(|e| format!("Gagal membuka folder: {}", e))?;

    #[cfg(target_os = "linux")]
    let status = std::process::Command::new("xdg-open")
        .arg(&path)
        .status()
        .map_err(|e| format!("Gagal membuka folder: {}", e))?;

    if status.success() {
        Ok(())
    } else {
        Err(format!("Gagal membuka folder: exit code {:?}", status.code()))
    }
}
