use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VideoFile {
    pub path: String,
    pub filename: String,
    pub duration: f64,
    pub width: u32,
    pub height: u32,
    pub fps: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MusicFile {
    pub path: String,
    pub filename: String,
    pub duration: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SequenceItem {
    pub video_path: String,
    pub filename: String,
    pub order: usize,
    pub start_time: f64,
    pub end_time: f64,
    pub duration: f64,
    pub is_intro: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PlaybackMode {
    Shuffle,
    Sequential,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum MusicPlaybackMode {
    Shuffle,
    Sequential,
    RepeatSingle,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ProcessingMode {
    SegmentLoop,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", content = "value", rename_all = "snake_case")]
pub enum DurationMode {
    Fixed(f64),
    FixedCompleteLastSong(f64),
    SelectedSongs,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum EncodingSpeed {
    Fast,
    Balanced,
    Quality,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum EncoderMode {
    Auto,
    Hardware,
    Software,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum OutputResolution {
    Original,
    Custom { width: u32, height: u32 },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", content = "value", rename_all = "snake_case")]
pub enum OutputFps {
    KeepOriginal,
    Custom(f64),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WatermarkSettings {
    pub enabled: bool,
    pub image_path: String,
    pub position_x: f64,
    pub position_y: f64,
    pub scale: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RenderSettings {
    pub video_playback_mode: PlaybackMode,
    pub music_playback_mode: MusicPlaybackMode,
    pub processing_mode: ProcessingMode,
    pub duration_mode: DurationMode,
    pub mute_source_audio: bool,
    pub encoding_speed: EncodingSpeed,
    pub encoder_mode: EncoderMode,
    pub resolution: OutputResolution,
    pub fps: OutputFps,
    pub fade_duration: f64,
    pub output_filename: String,
    pub output_folder: String,
    pub loop_playlist: bool,
    pub clip_duration: f64,
    pub prevent_duplicates: bool,
    pub delete_cache: bool,
    pub watermark: WatermarkSettings,
    pub cut_random_enabled: bool,
    pub cut_random_min: f64,
    pub cut_random_max: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RenderProgress {
    pub stage: String,
    pub percent: f64,
    pub elapsed_secs: f64,
    pub estimated_remaining_secs: f64,
    pub current_file: String,
    pub log_lines: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MergeProgress {
    pub stage: String,
    pub percent: f64,
    pub elapsed_secs: f64,
    pub output_path: String,
}
