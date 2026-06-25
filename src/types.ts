export interface VideoFile {
  path: string;
  filename: string;
  duration: number;
  width: number;
  height: number;
  fps: number;
}

export interface MusicFile {
  path: string;
  filename: string;
  duration: number;
}

export interface SequenceItem {
  video_path: string;
  filename: string;
  order: number;
  start_time: number;
  end_time: number;
  duration: number;
  is_intro: boolean;
}

export interface WatermarkSettings {
  enabled: boolean;
  image_path: string;
  position_x: number;
  position_y: number;
  scale: number;
}

export interface RenderSettings {
  video_playback_mode: "shuffle" | "sequential";
  music_playback_mode: "shuffle" | "sequential" | "repeat_single";
  processing_mode: "segment_loop";
  duration_mode: { type: "fixed"; value: number } | { type: "fixed_complete_last_song"; value: number } | { type: "selected_songs" };
  mute_source_audio: boolean;
  encoding_speed: "fast" | "balanced" | "quality";
  encoder_mode: "auto" | "hardware" | "software";
  resolution: { type: "original" } | { type: "custom"; width: number; height: number };
  fps: { type: "keep_original" } | { type: "custom"; value: number };
  fade_duration: number;
  output_filename: string;
  output_folder: string;
  loop_playlist: boolean;
  clip_duration: number;
  prevent_duplicates: boolean;
  delete_cache: boolean;
  watermark: WatermarkSettings;
  cut_random_enabled: boolean;
  cut_random_min: number;
  cut_random_max: number;
}

export interface RenderProgress {
  stage: string;
  percent: number;
  elapsed_secs: number;
  estimated_remaining_secs: number;
  current_file: string;
  log_lines: string[];
}

export interface ScanResult {
  videos: VideoFile[];
  music: MusicFile[];
}

export interface MergeProgress {
  stage: string;
  percent: number;
  elapsed_secs: number;
  output_path: string;
}

export type QueueStatus = "pending" | "rendering" | "completed" | "failed" | "cancelled";

export interface QueueItem {
  id: string;
  name: string;
  music: MusicFile[];
  sequence: SequenceItem[];
  settings: RenderSettings;
  musicOrder: number[];
  status: QueueStatus;
  outputPath?: string;
  error?: string;
}
