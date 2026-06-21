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
    intro: Option<VideoFile>,
) -> Result<Vec<SequenceItem>, String> {
    let count = videos.len();
    if count == 0 {
        return Err("No videos available".into());
    }

    let target = clip_duration.max(0.0);
    let use_target = target > 0.0;

    // prevent_duplicates impossible with single video
    let prevent_duplicates = prevent_duplicates && count > 1;

    fn make_item(video: &VideoFile, order: usize, src_start: f64, src_end: f64, is_intro: bool) -> SequenceItem {
        SequenceItem {
            video_path: video.path.clone(),
            filename: video.filename.clone(),
            order,
            start_time: src_start,
            end_time: src_end,
            duration: src_end - src_start,
            is_intro,
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

    // Prepend intro if provided (no random cut, full duration)
    if let Some(ref intro_video) = intro {
        sequence.push(make_item(intro_video, 0, 0.0, intro_video.duration, true));
    }

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
            sequence.push(make_item(video, sequence.len(), start, end, false));
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

                sequence.push(make_item(video, sequence.len(), start, end, false));

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
pub async fn merge_videos(
    state: State<'_, Mutex<AppState>>,
    videos: Vec<String>,
    output: String,
    on_event: Channel<MergeProgress>,
) -> Result<String, String> {
    if videos.len() < 2 {
        return Err("Minimal 2 video untuk di-merge".into());
    }

    let ffmpeg = {
        let guard = state.lock().map_err(|e| e.to_string())?;
        guard.renderer.ffmpeg_path()
    };

    let tmp_dir = std::env::temp_dir().join("video_randomizer_merge");
    std::fs::create_dir_all(&tmp_dir).map_err(|e| e.to_string())?;

    // create concat playlist
    let playlist_path = tmp_dir.join("merge_playlist.txt");
    {
        let mut f = std::fs::File::create(&playlist_path).map_err(|e| e.to_string())?;
        use std::io::Write;
        for path in &videos {
            // escape single quotes for FFmpeg
            let escaped = path.replace('\'', "'\\''");
            writeln!(f, "file '{}'", escaped).map_err(|e| e.to_string())?;
        }
    }

    let output_path = std::path::PathBuf::from(&output);
    let out_str = output_path.to_string_lossy().to_string();

    let total_dur: f64 = {
        let guard = state.lock().map_err(|e| e.to_string())?;
        let ffprobe = guard.ffprobe_path.clone();
        let mut total = 0.0;
        for p in &videos {
            if let Ok(d) = crate::metadata::get_video_duration(p, &ffprobe) {
                total += d;
            }
        }
        total
    };

    let _ = on_event.send(MergeProgress {
        stage: "Merging...".into(),
        percent: 0.0,
        elapsed_secs: 0.0,
        output_path: out_str.clone(),
    });

    let start = std::time::Instant::now();
    let mut child = std::process::Command::new(&ffmpeg)
        .arg("-y")
        .arg("-f").arg("concat")
        .arg("-safe").arg("0")
        .arg("-i").arg(playlist_path.to_string_lossy().to_string())
        .arg("-c").arg("copy")
        .arg(&out_str)
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| format!("Gagal spawn ffmpeg: {}", e))?;

    // read stderr for progress
    if let Some(stderr) = child.stderr.take() {
        use std::io::BufRead;
        let reader = std::io::BufReader::new(stderr);
        for line in reader.lines() {
            if let Ok(line) = line {
                // parse time=HH:MM:SS.MS from ffmpeg output
                if let Some(time_str) = line.split("time=").nth(1) {
                    let time_str = time_str.split_whitespace().next().unwrap_or("");
                    if let Some(secs) = parse_ffmpeg_time(time_str) {
                        let pct = if total_dur > 0.0 {
                            ((secs / total_dur) * 100.0).min(99.0)
                        } else {
                            0.0
                        };
                        let _ = on_event.send(MergeProgress {
                            stage: "Merging...".into(),
                            percent: pct,
                            elapsed_secs: start.elapsed().as_secs_f64(),
                            output_path: out_str.clone(),
                        });
                    }
                }
            }
        }
    }

    let status = child.wait().map_err(|e| format!("Gagal wait ffmpeg: {}", e))?;
    if !status.success() {
        return Err(format!("FFmpeg gagal: exit code {:?}", status.code()));
    }

    let _ = on_event.send(MergeProgress {
        stage: "Complete".into(),
        percent: 100.0,
        elapsed_secs: start.elapsed().as_secs_f64(),
        output_path: out_str.clone(),
    });

    // clean up temp
    let _ = std::fs::remove_dir_all(&tmp_dir);

    Ok(out_str)
}

fn parse_ffmpeg_time(s: &str) -> Option<f64> {
    let parts: Vec<&str> = s.split(':').collect();
    if parts.len() == 3 {
        let h: f64 = parts[0].parse().ok()?;
        let m: f64 = parts[1].parse().ok()?;
        let sec: f64 = parts[2].parse().ok()?;
        Some(h * 3600.0 + m * 60.0 + sec)
    } else {
        None
    }
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
