use std::io::BufRead;
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

#[tauri::command]
pub async fn trim_video_checkpoints(
    state: State<'_, Mutex<AppState>>,
    video_path: String,
    checkpoints: Vec<f64>,
    output_folder: String,
    on_event: Channel<TrimProgress>,
) -> Result<Vec<TrimSegment>, String> {
    if checkpoints.len() < 2 {
        return Err("Minimal 2 checkpoint diperlukan".into());
    }

    let ffmpeg = {
        let guard = state.lock().map_err(|e| e.to_string())?;
        guard.renderer.ffmpeg_path()
    };

    let ffprobe = {
        let guard = state.lock().map_err(|e| e.to_string())?;
        guard.ffprobe_path.clone()
    };

    let video_dur = metadata::get_video_duration(&video_path, &ffprobe)
        .map_err(|e| format!("Gagal membaca durasi video: {}", e))?;

    for &cp in &checkpoints {
        if cp < 0.0 || cp > video_dur {
            return Err(format!("Checkpoint {:.1}s di luar durasi video ({:.1}s)", cp, video_dur));
        }
    }

    // checkpoints must be in ascending order
    for w in checkpoints.windows(2) {
        if w[0] > w[1] {
            return Err("Checkpoint harus diurutkan naik".into());
        }
    }

    std::fs::create_dir_all(&output_folder).map_err(|e| e.to_string())?;

    let video_stem = std::path::Path::new(&video_path)
        .file_stem()
        .and_then(|n| n.to_str())
        .unwrap_or("video");

    let ext = std::path::Path::new(&video_path)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("mp4");

    let start = std::time::Instant::now();
    let total = checkpoints.len() - 1;
    let mut segments = Vec::new();
    let mut output_paths = Vec::new();

    for i in 0..total {
        let start_time = checkpoints[i];
        let end_time = checkpoints[i + 1];
        let duration = end_time - start_time;

        let seg_filename = format!("{}_{:02}_trimmed.{}", video_stem, i + 1, ext);
        let out_path = std::path::PathBuf::from(&output_folder).join(&seg_filename);
        let out_str = out_path.to_string_lossy().to_string();

        let label = format!("{} → {}",
            format_trim_time(start_time),
            format_trim_time(end_time)
        );

        let mut cmd = std::process::Command::new(&ffmpeg);
        cmd.arg("-y")
            .arg("-ss").arg(start_time.to_string())
            .arg("-i").arg(&video_path)
            .arg("-t").arg(duration.to_string())
            .arg("-c").arg("copy")
            .arg(&out_str);

        let stderr_path = out_path.with_extension("log");
        let stderr_file = std::fs::File::create(&stderr_path).map_err(|e| e.to_string())?;

        let mut child = cmd
            .stdout(std::process::Stdio::null())
            .stderr(stderr_file)
            .spawn()
            .map_err(|e| format!("Gagal spawn ffmpeg segmen {}: {}", i + 1, e))?;

        // poll for completion
        while child.try_wait().map_err(|e| e.to_string())?.is_none() {
            std::thread::sleep(std::time::Duration::from_millis(200));
            let _ = on_event.send(TrimProgress {
                stage: format!("Trimming segmen {}/{}", i + 1, total),
                percent: ((i as f64 + 0.5) / total as f64) * 100.0,
                elapsed_secs: start.elapsed().as_secs_f64(),
                current_segment: i + 1,
                total_segments: total,
                output_paths: output_paths.clone(),
            });
        }

        let status = child.wait().map_err(|e| format!("Gagal wait ffmpeg segmen {}: {}", i + 1, e))?;
        if !status.success() {
            let log_content = std::fs::read_to_string(&stderr_path).unwrap_or_default();
            let detail = if log_content.is_empty() { "no detail".into() } else { log_content.trim().to_string() };
            return Err(format!("FFmpeg gagal pada segmen {} (exit {:?}):\n{}", i + 1, status.code(), detail));
        }

        output_paths.push(out_str.clone());

        segments.push(TrimSegment {
            index: i + 1,
            label,
            start_time,
            end_time,
            duration,
            output_path: out_str,
        });

        let _ = on_event.send(TrimProgress {
            stage: format!("Trimmed segmen {}/{}", i + 1, total),
            percent: ((i + 1) as f64 / total as f64) * 100.0,
            elapsed_secs: start.elapsed().as_secs_f64(),
            current_segment: i + 1,
            total_segments: total,
            output_paths: output_paths.clone(),
        });
    }

    // cleanup log files
    for i in 0..total {
        let seg_filename = format!("{}_{:02}_trimmed.log", video_stem, i + 1);
        let log_path = std::path::PathBuf::from(&output_folder).join(&seg_filename);
        let _ = std::fs::remove_file(&log_path);
    }

    let _ = on_event.send(TrimProgress {
        stage: "Complete".into(),
        percent: 100.0,
        elapsed_secs: start.elapsed().as_secs_f64(),
        current_segment: total,
        total_segments: total,
        output_paths: output_paths.clone(),
    });

    Ok(segments)
}

fn get_remaster_filter(preset: &str) -> Option<&'static str> {
    match preset {
        "none" => None,
        "warm_natural" => Some("equalizer=f=50:t=q:w=1:g=2.5,equalizer=f=200:t=q:w=1:g=2,equalizer=f=3000:t=q:w=0.5:g=-1,equalizer=f=8000:t=q:w=1:g=-2.5,equalizer=f=12000:t=q:w=1:g=-3,acompressor=threshold=-15dB:ratio=2.5:attack=10:release=80"),
        "analog_vintage" => Some("aexciter=amount=0.25,equalizer=f=80:t=q:w=1:g=3,equalizer=f=150:t=q:w=1:g=2,equalizer=f=5000:t=q:w=1:g=-1,equalizer=f=10000:t=q:w=1:g=-3,acompressor=threshold=-18dB:ratio=2:attack=20:release=100,alimiter=limit=-1.5dB:attack=0.1:release=1"),
        "smooth_broadcast" => Some("equalizer=f=100:t=q:w=1:g=1.5,equalizer=f=300:t=q:w=1:g=3,equalizer=f=1000:t=q:w=1:g=1,equalizer=f=6000:t=q:w=1:g=-2,equalizer=f=12000:t=q:w=1:g=-4,acompressor=threshold=-20dB:ratio=3:attack=5:release=50,alimiter=limit=-1dB:attack=0.1:release=0.5"),
        "voice_clear" => Some("equalizer=f=200:t=q:w=1:g=1,equalizer=f=3000:t=q:w=1:g=3,equalizer=f=5000:t=q:w=1:g=2,equalizer=f=8000:t=q:w=1:g=-1.5,equalizer=f=12000:t=q:w=1:g=-2,acompressor=threshold=-14dB:ratio=2.5:attack=5:release=60,alimiter=limit=-1dB:attack=0.1:release=0.5"),
        "heavy_bass" => Some("equalizer=f=40:t=q:w=1:g=5,equalizer=f=80:t=q:w=1:g=3.5,equalizer=f=150:t=q:w=1:g=2,equalizer=f=400:t=q:w=1:g=-1,equalizer=f=1000:t=q:w=0.5:g=-1.5,acompressor=threshold=-20dB:ratio=4:attack=5:release=40,alimiter=limit=-1dB:attack=0.1:release=0.5"),
        "lo_fi_chill" => Some("equalizer=f=60:t=q:w=1:g=2,equalizer=f=200:t=q:w=1:g=2.5,equalizer=f=400:t=q:w=1:g=1.5,equalizer=f=4000:t=q:w=1:g=-3,equalizer=f=10000:t=q:w=1:g=-5,acompressor=threshold=-15dB:ratio=2:attack=15:release=120,alimiter=limit=-2dB:attack=0.5:release=1"),
        "phonk_drift" => Some("equalizer=f=40:t=q:w=1:g=6,equalizer=f=80:t=q:w=1:g=4,equalizer=f=150:t=q:w=1:g=3,equalizer=f=2000:t=q:w=1:g=2,equalizer=f=5000:t=q:w=1:g=1.5,equalizer=f=10000:t=q:w=1:g=1,equalizer=f=14000:t=q:w=1:g=2,acompressor=threshold=-22dB:ratio=4:attack=3:release=30,alimiter=limit=-0.5dB:attack=0.05:release=0.3"),
        "edm_electro" => Some("equalizer=f=40:t=q:w=1:g=4,equalizer=f=60:t=q:w=1:g=3,equalizer=f=200:t=q:w=1:g=-1,equalizer=f=400:t=q:w=1:g=-2,equalizer=f=5000:t=q:w=1:g=2.5,equalizer=f=10000:t=q:w=1:g=3,equalizer=f=16000:t=q:w=1:g=2,acompressor=threshold=-18dB:ratio=3:attack=5:release=40,alimiter=limit=-1dB:attack=0.1:release=0.5"),
        "hip_hop_rnb" => Some("equalizer=f=50:t=q:w=1:g=4,equalizer=f=100:t=q:w=1:g=3,equalizer=f=250:t=q:w=1:g=1.5,equalizer=f=400:t=q:w=0.5:g=-1.5,equalizer=f=3000:t=q:w=1:g=2,equalizer=f=6000:t=q:w=1:g=1,equalizer=f=10000:t=q:w=1:g=-1,equalizer=f=14000:t=q:w=1:g=-2,acompressor=threshold=-16dB:ratio=2.5:attack=8:release=60,alimiter=limit=-1dB:attack=0.1:release=0.5"),
        "rock_metal" => Some("equalizer=f=60:t=q:w=1:g=2,equalizer=f=120:t=q:w=1:g=1,equalizer=f=800:t=q:w=1:g=2,equalizer=f=2500:t=q:w=1:g=3,equalizer=f=5000:t=q:w=1:g=2,equalizer=f=8000:t=q:w=1:g=1.5,equalizer=f=12000:t=q:w=1:g=-1,acompressor=threshold=-14dB:ratio=3.5:attack=3:release=30,alimiter=limit=-0.5dB:attack=0.05:release=0.3"),
        "jazz_akustik" => Some("equalizer=f=80:t=q:w=1:g=1.5,equalizer=f=250:t=q:w=1:g=2,equalizer=f=1000:t=q:w=1:g=1,equalizer=f=4000:t=q:w=1:g=-0.5,equalizer=f=8000:t=q:w=1:g=-1,equalizer=f=12000:t=q:w=1:g=-1.5,acompressor=threshold=-10dB:ratio=1.5:attack=30:release=150"),
        "classical_orchestral" => Some("equalizer=f=40:t=q:w=0.5:g=1,equalizer=f=200:t=q:w=1:g=1,equalizer=f=500:t=q:w=1:g=0.5,equalizer=f=2000:t=q:w=1:g=1,equalizer=f=5000:t=q:w=0.5:g=1.5,equalizer=f=10000:t=q:w=1:g=1,equalizer=f=16000:t=q:w=1:g=2,acompressor=threshold=-8dB:ratio=1.2:attack=50:release=200"),
        "reggae_dub" => Some("equalizer=f=40:t=q:w=1:g=4,equalizer=f=80:t=q:w=1:g=3,equalizer=f=200:t=q:w=1:g=2,equalizer=f=500:t=q:w=1:g=1,equalizer=f=3000:t=q:w=1:g=-1.5,equalizer=f=8000:t=q:w=1:g=-2.5,equalizer=f=12000:t=q:w=1:g=-3,acompressor=threshold=-15dB:ratio=2.5:attack=10:release=80,alimiter=limit=-1.5dB:attack=0.1:release=1"),
        "podcast_audiobook" => Some("equalizer=f=80:t=q:w=1:g=2,equalizer=f=150:t=q:w=1:g=1.5,equalizer=f=300:t=q:w=1:g=3,equalizer=f=1000:t=q:w=1:g=2,equalizer=f=3000:t=q:w=1:g=2,equalizer=f=6000:t=q:w=1:g=-2,equalizer=f=10000:t=q:w=1:g=-3,equalizer=f=14000:t=q:w=1:g=-5,anlmdn=s=0.5:p=0.4:r=1.5,acompressor=threshold=-24dB:ratio=3.5:attack=3:release=40,alimiter=limit=-0.5dB:attack=0.1:release=0.5"),
        "acoustic_guitar" => Some("equalizer=f=100:t=q:w=1:g=2,equalizer=f=500:t=q:w=1:g=2.5,equalizer=f=1000:t=q:w=1:g=2,equalizer=f=3000:t=q:w=1:g=1.5,equalizer=f=6000:t=q:w=1:g=2,equalizer=f=10000:t=q:w=1:g=-1,acompressor=threshold=-12dB:ratio=2:attack=15:release=100"),
        "piano_keys" => Some("equalizer=f=80:t=q:w=1:g=1,equalizer=f=250:t=q:w=1:g=1.5,equalizer=f=1000:t=q:w=1:g=2,equalizer=f=3000:t=q:w=1:g=3,equalizer=f=6000:t=q:w=1:g=2,equalizer=f=10000:t=q:w=1:g=1.5,equalizer=f=14000:t=q:w=1:g=2,acompressor=threshold=-10dB:ratio=1.5:attack=20:release=120"),
        "cinematic" => Some("equalizer=f=40:t=q:w=1:g=3,equalizer=f=80:t=q:w=1:g=2,equalizer=f=200:t=q:w=0.5:g=-1,equalizer=f=1000:t=q:w=0.5:g=-1,equalizer=f=5000:t=q:w=1:g=2,equalizer=f=12000:t=q:w=1:g=3,equalizer=f=16000:t=q:w=1:g=2,acompressor=threshold=-14dB:ratio=2.5:attack=10:release=60,alimiter=limit=-1dB:attack=0.1:release=0.5"),
        "ambient_drone" => Some("equalizer=f=60:t=q:w=1:g=2,equalizer=f=200:t=q:w=1:g=1,equalizer=f=4000:t=q:w=1:g=-3,equalizer=f=8000:t=q:w=1:g=-5,equalizer=f=12000:t=q:w=1:g=-6,acompressor=threshold=-18dB:ratio=2:attack=30:release=150,alimiter=limit=-2dB:attack=0.5:release=1"),
        "soul_funk" => Some("equalizer=f=60:t=q:w=1:g=2.5,equalizer=f=200:t=q:w=1:g=2,equalizer=f=500:t=q:w=1:g=1,equalizer=f=2000:t=q:w=1:g=1.5,equalizer=f=5000:t=q:w=1:g=2,equalizer=f=10000:t=q:w=1:g=1,acompressor=threshold=-14dB:ratio=2.5:attack=8:release=60,alimiter=limit=-1dB:attack=0.1:release=0.5"),
        "latin" => Some("equalizer=f=80:t=q:w=1:g=2,equalizer=f=250:t=q:w=1:g=1.5,equalizer=f=1000:t=q:w=0.5:g=1,equalizer=f=3000:t=q:w=1:g=2.5,equalizer=f=6000:t=q:w=1:g=2,equalizer=f=10000:t=q:w=1:g=1,equalizer=f=14000:t=q:w=1:g=1.5,acompressor=threshold=-15dB:ratio=2.5:attack=10:release=60,alimiter=limit=-1dB:attack=0.1:release=0.5"),
        "kpop_pop" => Some("equalizer=f=50:t=q:w=1:g=3,equalizer=f=100:t=q:w=1:g=2,equalizer=f=300:t=q:w=1:g=1.5,equalizer=f=1000:t=q:w=0.5:g=1,equalizer=f=4000:t=q:w=1:g=2,equalizer=f=8000:t=q:w=1:g=2.5,equalizer=f=12000:t=q:w=1:g=2,equalizer=f=16000:t=q:w=1:g=1.5,acompressor=threshold=-16dB:ratio=3:attack=5:release=40,alimiter=limit=-0.5dB:attack=0.05:release=0.3"),
        "trap_drill" => Some("equalizer=f=30:t=q:w=1:g=6,equalizer=f=60:t=q:w=1:g=4,equalizer=f=120:t=q:w=1:g=2,equalizer=f=250:t=q:w=1:g=-2,equalizer=f=500:t=q:w=1:g=-2.5,equalizer=f=2000:t=q:w=1:g=2,equalizer=f=6000:t=q:w=1:g=2.5,equalizer=f=10000:t=q:w=1:g=1,equalizer=f=14000:t=q:w=1:g=2,acompressor=threshold=-22dB:ratio=4:attack=3:release=25,alimiter=limit=-0.5dB:attack=0.05:release=0.3"),
        "drum_bass" => Some("equalizer=f=40:t=q:w=1:g=4,equalizer=f=80:t=q:w=1:g=3,equalizer=f=200:t=q:w=1:g=1,equalizer=f=400:t=q:w=1:g=-1.5,equalizer=f=1000:t=q:w=0.5:g=-2,equalizer=f=3000:t=q:w=1:g=1,equalizer=f=6000:t=q:w=1:g=2,equalizer=f=12000:t=q:w=1:g=1.5,acompressor=threshold=-18dB:ratio=3:attack=4:release=35,alimiter=limit=-1dB:attack=0.05:release=0.3"),
        "techno_house" => Some("equalizer=f=40:t=q:w=1:g=3,equalizer=f=80:t=q:w=1:g=2,equalizer=f=200:t=q:w=1:g=1,equalizer=f=500:t=q:w=1:g=-1,equalizer=f=2000:t=q:w=1:g=2,equalizer=f=5000:t=q:w=1:g=2.5,equalizer=f=10000:t=q:w=1:g=3,equalizer=f=16000:t=q:w=1:g=2,acompressor=threshold=-16dB:ratio=3.5:attack=5:release=30,alimiter=limit=-0.5dB:attack=0.05:release=0.3"),
        "blues" => Some("equalizer=f=80:t=q:w=1:g=2,equalizer=f=250:t=q:w=1:g=2.5,equalizer=f=600:t=q:w=1:g=2,equalizer=f=1500:t=q:w=1:g=1.5,equalizer=f=4000:t=q:w=1:g=1,equalizer=f=8000:t=q:w=1:g=-0.5,equalizer=f=12000:t=q:w=1:g=-1.5,acompressor=threshold=-12dB:ratio=2:attack=15:release=80,alimiter=limit=-1.5dB:attack=0.1:release=1"),
        "vocal_boost" => Some("equalizer=f=200:t=q:w=1:g=2,equalizer=f=1000:t=q:w=1:g=2.5,equalizer=f=3000:t=q:w=1:g=3,equalizer=f=5000:t=q:w=1:g=2,equalizer=f=8000:t=q:w=1:g=1,equalizer=f=12000:t=q:w=1:g=-1.5,acompressor=threshold=-16dB:ratio=2.5:attack=5:release=50,alimiter=limit=-1dB:attack=0.1:release=0.5"),
        "bass_boost" => Some("equalizer=f=40:t=q:w=1:g=5,equalizer=f=80:t=q:w=1:g=4,equalizer=f=160:t=q:w=1:g=2,equalizer=f=300:t=q:w=1:g=-1,equalizer=f=600:t=q:w=1:g=-1.5,acompressor=threshold=-18dB:ratio=3:attack=8:release=50,alimiter=limit=-1dB:attack=0.1:release=0.5"),
        "afro_house" => Some("equalizer=f=60:t=q:w=1:g=3,equalizer=f=120:t=q:w=1:g=2.5,equalizer=f=400:t=q:w=1:g=2,equalizer=f=800:t=q:w=1:g=1.5,equalizer=f=2000:t=q:w=1:g=1,equalizer=f=5000:t=q:w=1:g=-0.5,equalizer=f=10000:t=q:w=1:g=-2,equalizer=f=14000:t=q:w=1:g=-3,acompressor=threshold=-18dB:ratio=2.2:attack=10:release=200,alimiter=limit=-1.5dB"),
        _ => None,
    }
}

#[tauri::command]
pub async fn remaster_audio(
    state: State<'_, Mutex<AppState>>,
    files: Vec<String>,
    presets: Vec<String>,
    output_folder: String,
    output_format: String,
    use_limiter: bool,
    on_event: Channel<RemasterProgress>,
) -> Result<Vec<String>, String> {
    if files.is_empty() {
        return Err("No audio files provided".into());
    }

    if presets.len() != files.len() {
        return Err("Presets count must match files count".into());
    }

    // validate all presets first
    for (i, p) in presets.iter().enumerate() {
        if p.is_empty() || p == "none" { continue; }
        if get_remaster_filter(p).is_none() {
            return Err(format!("Unknown preset '{}' for file {}", p, i + 1));
        }
    }

    let (ffmpeg, ffprobe) = {
        let guard = state.lock().map_err(|e| e.to_string())?;
        (guard.renderer.ffmpeg_path(), guard.ffprobe_path.clone())
    };

    std::fs::create_dir_all(&output_folder).map_err(|e| e.to_string())?;

    let ext = match output_format.as_str() {
        "wav" => "wav",
        "flac" => "flac",
        _ => "mp3",
    };

    let start = std::time::Instant::now();
    let total = files.len();
    let mut output_paths = Vec::new();

    for (i, path) in files.iter().enumerate() {
        let file_preset = &presets[i];
        let mut filter = get_remaster_filter(file_preset).map(|f| f.to_string());
        if !use_limiter {
            if let Some(ref mut f) = filter {
                if let Some(pos) = f.find(",alimiter=") {
                    f.truncate(pos);
                }
            }
        }

        let filename = std::path::Path::new(path)
            .file_stem()
            .and_then(|n| n.to_str())
            .unwrap_or("audio");

        let out_filename = if file_preset.is_empty() || file_preset == "none" {
            format!("{}.{}", filename, ext)
        } else {
            format!("{}_{}_remastered.{}", filename, file_preset, ext)
        };

        let out_path = std::path::PathBuf::from(&output_folder).join(&out_filename);
        let out_str = out_path.to_string_lossy().to_string();

        let _ = on_event.send(RemasterProgress {
            stage: format!("Remastering {}/{}", i + 1, total),
            percent: ((i as f64 / total as f64) * 100.0).max(0.1),
            elapsed_secs: start.elapsed().as_secs_f64(),
            current_file: i + 1,
            total_files: total,
            current_filename: out_filename.clone(),
            output_paths: output_paths.clone(),
        });

        // get audio duration for progress tracking
        let file_dur = metadata::get_video_duration(path, &ffprobe).ok();

        let mut cmd = std::process::Command::new(&ffmpeg);
        cmd.arg("-y").arg("-i").arg(path);

        if let Some(f) = filter {
            cmd.arg("-af").arg(f);
        }

        match ext {
            "wav" => {
                cmd.arg("-c:a").arg("pcm_s16le");
            }
            "flac" => {
                cmd.arg("-c:a").arg("flac");
            }
            _ => {
                cmd.arg("-c:a").arg("libmp3lame").arg("-b:a").arg("320k");
            }
        }

        cmd.arg(&out_str);

        let mut child = cmd
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::piped())
            .spawn()
            .map_err(|e| format!("Gagal spawn ffmpeg: {}", e))?;

        // read stderr for progress + capture error lines
        let mut stderr_log = String::new();
        if let Some(stderr) = child.stderr.take() {
            let reader = std::io::BufReader::new(stderr);
            for line in reader.lines() {
                if let Ok(line) = line {
                    if let Some(time_str) = line.split("time=").nth(1) {
                        let time_str = time_str.split_whitespace().next().unwrap_or("");
                        if let Some(secs) = parse_ffmpeg_time(time_str) {
                            let file_pct = if let Some(dur) = file_dur {
                                if dur > 0.0 { ((secs / dur) * 100.0).min(99.0) } else { 50.0 }
                            } else {
                                50.0
                            };
                            let overall_pct = ((i as f64 + file_pct / 100.0) / total as f64) * 100.0;
                            let _ = on_event.send(RemasterProgress {
                                stage: format!("Remastering {}/{} — {}%", i + 1, total, file_pct as u32),
                                percent: overall_pct.min(99.0),
                                elapsed_secs: start.elapsed().as_secs_f64(),
                                current_file: i + 1,
                                total_files: total,
                                current_filename: out_filename.clone(),
                                output_paths: output_paths.clone(),
                            });
                        }
                    } else if line.contains("error") || line.contains("Error") || line.contains("Invalid") || line.contains("failed") {
                        stderr_log.push_str(&line);
                        stderr_log.push('\n');
                    }
                }
            }
        }

        let status = child.wait().map_err(|e| format!("Gagal wait ffmpeg: {}", e))?;
        if !status.success() {
            let detail = if stderr_log.is_empty() { "no detail".into() } else { stderr_log };
            return Err(format!("FFmpeg gagal pada file {}/{}: {}\n{}", i + 1, total, filename, detail));
        }

        output_paths.push(out_str.clone());
    }

    let _ = on_event.send(RemasterProgress {
        stage: "Complete".into(),
        percent: 100.0,
        elapsed_secs: start.elapsed().as_secs_f64(),
        current_file: total,
        total_files: total,
        current_filename: String::new(),
        output_paths: output_paths.clone(),
    });

    Ok(output_paths)
}

fn format_trim_time(secs: f64) -> String {
    let h = (secs / 3600.0) as u64;
    let m = ((secs % 3600.0) / 60.0) as u64;
    let s = secs % 60.0;
    if h > 0 {
        format!("{:02}:{:02}:{:05.2}", h, m, s)
    } else {
        format!("{:02}:{:05.2}", m, s)
    }
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

#[tauri::command]
pub async fn optimize_for_live(
    state: State<'_, Mutex<AppState>>,
    videos: Vec<String>,
    preset: String,
    output_folder: String,
    on_event: Channel<LiveOptimizeProgress>,
) -> Result<Vec<String>, String> {
    if videos.is_empty() {
        return Err("No videos provided".into());
    }

    let (ffmpeg, ffprobe) = {
        let guard = state.lock().map_err(|e| e.to_string())?;
        (guard.renderer.ffmpeg_path(), guard.ffprobe_path.clone())
    };

    std::fs::create_dir_all(&output_folder).map_err(|e| e.to_string())?;

    let start = std::time::Instant::now();
    let total = videos.len();
    let mut output_paths = Vec::new();

    // Determine FFmpeg arguments based on preset
    let (scale_filter, fps, bitrate) = match preset.as_str() {
        "1080p_30fps" => ("scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2", "30", "4500k"),
        "1080p_25fps" => ("scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2", "25", "4000k"),
        "720p_30fps" => ("scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2", "30", "2500k"),
        "720p_25fps" => ("scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2", "25", "2000k"),
        _ => return Err(format!("Unknown preset: {}", preset)),
    };

    for (i, path) in videos.iter().enumerate() {
        let filename = std::path::Path::new(path)
            .file_stem()
            .and_then(|n| n.to_str())
            .unwrap_or("video");
        
        let ext = std::path::Path::new(path)
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("mp4");

        let out_filename = format!("{}_live_{}.{}", filename, preset, ext);
        let out_path = std::path::PathBuf::from(&output_folder).join(&out_filename);
        let out_str = out_path.to_string_lossy().to_string();

        let _ = on_event.send(LiveOptimizeProgress {
            stage: format!("Optimizing {}/{}", i + 1, total),
            percent: ((i as f64 / total as f64) * 100.0).max(0.1),
            elapsed_secs: start.elapsed().as_secs_f64(),
            current_file: i + 1,
            total_files: total,
            current_filename: out_filename.clone(),
            output_paths: output_paths.clone(),
        });

        // Get duration for progress tracking
        let file_dur = metadata::get_video_duration(path, &ffprobe).ok();

        let mut cmd = std::process::Command::new(&ffmpeg);
        cmd.arg("-y").arg("-i").arg(path);

        // Filters: scale + fps
        let filter_complex = format!("{},fps={}", scale_filter, fps);
        cmd.arg("-vf").arg(filter_complex);

        // Encoding settings (fast, standard H264 for live with capped bitrate)
        let bufsize = match bitrate {
            "4500k" => "9000k",
            "4000k" => "8000k",
            "2500k" => "5000k",
            "2000k" => "4000k",
            _ => "8000k",
        };

        cmd.arg("-c:v").arg("libx264")
           .arg("-preset").arg("veryfast")
           .arg("-b:v").arg(bitrate)
           .arg("-maxrate").arg(bitrate)
           .arg("-bufsize").arg(bufsize)
           .arg("-pix_fmt").arg("yuv420p")
           .arg("-g").arg(format!("{}", fps.parse::<u32>().unwrap_or(30) * 2)) // keyframe interval 2 seconds
           .arg("-c:a").arg("aac")
           .arg("-b:a").arg("128k")
           .arg(&out_str);

        let mut child = cmd
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::piped())
            .spawn()
            .map_err(|e| format!("Gagal spawn ffmpeg: {}", e))?;

        let mut stderr_log = String::new();
        if let Some(stderr) = child.stderr.take() {
            use std::io::BufRead;
            let reader = std::io::BufReader::new(stderr);
            for line in reader.lines() {
                if let Ok(line) = line {
                    if let Some(time_str) = line.split("time=").nth(1) {
                        let time_str = time_str.split_whitespace().next().unwrap_or("");
                        if let Some(secs) = parse_ffmpeg_time(time_str) {
                            let file_pct = if let Some(dur) = file_dur {
                                if dur > 0.0 { ((secs / dur) * 100.0).min(99.0) } else { 50.0 }
                            } else {
                                50.0
                            };
                            let overall_pct = ((i as f64 + file_pct / 100.0) / total as f64) * 100.0;
                            let _ = on_event.send(LiveOptimizeProgress {
                                stage: format!("Optimizing {}/{} — {}%", i + 1, total, file_pct as u32),
                                percent: overall_pct.min(99.0),
                                elapsed_secs: start.elapsed().as_secs_f64(),
                                current_file: i + 1,
                                total_files: total,
                                current_filename: out_filename.clone(),
                                output_paths: output_paths.clone(),
                            });
                        }
                    } else if line.contains("error") || line.contains("Error") || line.contains("Invalid") || line.contains("failed") {
                        stderr_log.push_str(&line);
                        stderr_log.push('\n');
                    }
                }
            }
        }

        let status = child.wait().map_err(|e| format!("Gagal wait ffmpeg: {}", e))?;
        if !status.success() {
            let detail = if stderr_log.is_empty() { "no detail".into() } else { stderr_log };
            return Err(format!("FFmpeg gagal pada file {}/{}: {}\n{}", i + 1, total, filename, detail));
        }

        output_paths.push(out_str.clone());
    }

    let _ = on_event.send(LiveOptimizeProgress {
        stage: "Complete".into(),
        percent: 100.0,
        elapsed_secs: start.elapsed().as_secs_f64(),
        current_file: total,
        total_files: total,
        current_filename: String::new(),
        output_paths: output_paths.clone(),
    });

    Ok(output_paths)
}
