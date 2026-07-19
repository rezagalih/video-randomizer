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

export type AudioNormalization =
  | { type: "off" }
  | { type: "lufs14" }
  | { type: "lufs23" }
  | { type: "custom"; value: number };

export interface RenderSettings {
  video_playback_mode: "shuffle" | "sequential";
  music_playback_mode: "shuffle" | "sequential" | "repeat_single";
  processing_mode: "segment_loop";
  duration_mode: { type: "fixed"; value: number } | { type: "fixed_complete_last_song"; value: number } | { type: "selected_songs" };
  mute_source_audio: boolean;
  encoding_speed: "fast" | "balanced" | "quality";
  encoder_mode: "auto" | "hardware" | "software";
  video_preset: string;
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
  audio_normalization: AudioNormalization;
  ambient_enabled: boolean;
  ambient_path: string;
  music_volume: number;
  ambient_volume: number;
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

export interface TrimSegment {
  index: number;
  label: string;
  start_time: number;
  end_time: number;
  duration: number;
  output_path: string;
}

export interface TrimProgress {
  stage: string;
  percent: number;
  elapsed_secs: number;
  current_segment: number;
  total_segments: number;
  output_paths: string[];
}

export interface RemasterProgress {
  stage: string;
  percent: number;
  elapsed_secs: number;
  current_file: number;
  total_files: number;
  current_filename: string;
  output_paths: string[];
}

export interface LiveOptimizeProgress {
  stage: string;
  percent: number;
  elapsed_secs: number;
  current_file: number;
  total_files: number;
  current_filename: string;
  output_paths: string[];
}

export const REMASTER_PRESETS: Record<string, { label: string; description: string; icon: string }> = {
  none: { icon: "🔇", label: "None (Original)", description: "No processing" },
  warm_natural: { icon: "🌤️", label: "Warm Natural", description: "Warmth analog, cocok untuk daily listening" },
  analog_vintage: { icon: "📼", label: "Analog Vintage", description: "Tape saturation + low-end boost" },
  smooth_broadcast: { icon: "📻", label: "Smooth Broadcast", description: "Mid boosted, highs smoothed" },
  voice_clear: { icon: "🎙️", label: "Voice Clear", description: "Vokal clarity tanpa sibilance" },
  heavy_bass: { icon: "🅱️", label: "Heavy Bass", description: "Sub-bass boosted, dance/beat-driven" },
  lo_fi_chill: { icon: "☕", label: "Lo-Fi / Chill", description: "Warm tape + high cut" },
  phonk_drift: { icon: "🏎️", label: "Phonk / Drift", description: "Bass agresif + high presence" },
  edm_electro: { icon: "⚡", label: "EDM / Electro", description: "Sub-bass & high-end agresif" },
  hip_hop_rnb: { icon: "🎤", label: "Hip-Hop / RnB", description: "Bass punchy + vokal clear" },
  rock_metal: { icon: "🎸", label: "Rock / Metal", description: "Mid agresif + high-end tajam" },
  jazz_akustik: { icon: "🎷", label: "Jazz / Akustik", description: "Natural warm, dynamic range" },
  classical_orchestral: { icon: "🎻", label: "Classical / Orchestral", description: "Dynamic lebar, highs jernih" },
  reggae_dub: { icon: "🌴", label: "Reggae / Dub", description: "Bass tebal, mid hangat" },
  podcast_audiobook: { icon: "🎧", label: "Podcast / Audiobook", description: "Vokal maksimal, noise rendah" },
  acoustic_guitar: { icon: "🎶", label: "Acoustic Guitar", description: "Warm mid, highs natural" },
  afro_house: { icon: "🥁", label: "Afro House", description: "Punchy mid, perkusi hadir, highs smooth" },
  piano_keys: { icon: "🎹", label: "Piano / Keys", description: "Bright, resonant, clear highs" },
  cinematic: { icon: "🎬", label: "Cinematic / Film Score", description: "Dramatis, wide, sub-bass" },
  ambient_drone: { icon: "🌫️", label: "Ambient / Drone", description: "Soft, airy, high cut" },
  soul_funk: { icon: "🕺", label: "Soul / Funk", description: "Warm bass, crisp highs" },
  latin: { icon: "💃", label: "Latin", description: "Bright, rhythmic, presence" },
  kpop_pop: { icon: "🌟", label: "K-Pop / Pop", description: "Bright, punchy, compressed" },
  trap_drill: { icon: "🔥", label: "Trap / Drill", description: "Sub-bass heavy, aggressive" },
  drum_bass: { icon: "🔊", label: "Drum & Bass", description: "Sub-bass punch, crisp mids" },
  techno_house: { icon: "💿", label: "Techno / House", description: "Sub-bass tight, highs sparkle" },
  blues: { icon: "😎", label: "Blues", description: "Warm mid, smooth highs" },
  vocal_boost: { icon: "🗣️", label: "Vocal Boost", description: "Mid-high clarity for vocals" },
  bass_boost: { icon: "🔽", label: "Bass Boost", description: "Simple sub-bass & low-end boost" },
};

export interface WizardSelections {
  intro: VideoFile | null;
  videos: VideoFile[];
  music: MusicFile[];
  durationMode: "fixed" | "fixed_complete_last_song" | "selected_songs";
  fixedDurationMinutes: number;
  video_preset: string;
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
