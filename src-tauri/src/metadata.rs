use anyhow::{Context, Result};
use serde_json::Value;
use std::process::Command;

use crate::models::{MusicFile, VideoFile};

pub fn get_video_metadata(path: &str) -> Result<VideoFile> {
    let output = Command::new("ffprobe")
        .args([
            "-v",
            "quiet",
            "-print_format",
            "json",
            "-show_format",
            "-show_streams",
            path,
        ])
        .output()
        .context("Failed to execute ffprobe")?;

    let json: Value =
        serde_json::from_slice(&output.stdout).context("Failed to parse ffprobe output")?;

    let filename = std::path::Path::new(path)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("unknown")
        .to_string();

    let duration: f64 = json["format"]["duration"]
        .as_str()
        .and_then(|d| d.parse().ok())
        .unwrap_or(0.0);

    let mut width = 0u32;
    let mut height = 0u32;
    let mut fps = 0.0f64;

    if let Some(streams) = json["streams"].as_array() {
        for stream in streams {
            if stream["codec_type"] == "video" {
                width = stream["width"].as_u64().unwrap_or(0) as u32;
                height = stream["height"].as_u64().unwrap_or(0) as u32;

                let r_frame_rate = stream["r_frame_rate"].as_str().unwrap_or("0/1");
                let parts: Vec<&str> = r_frame_rate.split('/').collect();
                if parts.len() == 2 {
                    let num: f64 = parts[0].parse().unwrap_or(0.0);
                    let den: f64 = parts[1].parse().unwrap_or(1.0);
                    if den > 0.0 {
                        fps = num / den;
                    }
                }
                break;
            }
        }
    }

    Ok(VideoFile {
        path: path.to_string(),
        filename,
        duration,
        width,
        height,
        fps,
    })
}

pub fn get_music_metadata(path: &str) -> Result<MusicFile> {
    let output = Command::new("ffprobe")
        .args([
            "-v",
            "quiet",
            "-print_format",
            "json",
            "-show_format",
            path,
        ])
        .output()
        .context("Failed to execute ffprobe")?;

    let json: Value =
        serde_json::from_slice(&output.stdout).context("Failed to parse ffprobe output")?;

    let filename = std::path::Path::new(path)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("unknown")
        .to_string();

    let duration: f64 = json["format"]["duration"]
        .as_str()
        .and_then(|d| d.parse().ok())
        .unwrap_or(0.0);

    Ok(MusicFile {
        path: path.to_string(),
        filename,
        duration,
    })
}

pub fn validate_video_file(path: &str) -> bool {
    let ext = std::path::Path::new(path)
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_lowercase())
        .unwrap_or_default();

    matches!(ext.as_str(), "mp4" | "mov" | "mkv" | "webm")
}

pub fn validate_music_file(path: &str) -> bool {
    let ext = std::path::Path::new(path)
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_lowercase())
        .unwrap_or_default();

    matches!(ext.as_str(), "mp3" | "wav" | "flac" | "aac" | "m4a")
}
