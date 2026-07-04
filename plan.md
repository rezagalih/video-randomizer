# Video Randomizer Looper

## Project Overview

Video Randomizer Looper is a desktop application built with Tauri, Rust, FFmpeg, and FFprobe.

The application creates long-form videos by combining randomized footage clips with music playlists. The generated video is optimized for YouTube music channels, relaxation videos, afro house channels, meditation content, and other long-duration visual music formats.

Target Platforms:

* Windows
* macOS

Technology Stack:

* Tauri
* Rust
* React
* FFmpeg
* FFprobe

---

# Core Workflow

1. Import video footage
2. Import music files
3. Generate randomized video sequence
4. Build master video segment
5. Loop master segment to target duration
6. Apply music playlist
7. Encode final output
8. Save output file

---

# Video Import

Supported formats:

* MP4
* MOV
* MKV
* WEBM

Import methods:

* Import single video files
* Import entire folder

After import, display:

| Filename | Duration | Resolution | FPS |
| -------- | -------- | ---------- | --- |

Actions:

* Remove selected
* Remove all
* Preview selected video

---

# Music Import

Supported formats:

* MP3
* WAV
* FLAC
* AAC
* M4A

Import methods:

* Import single files
* Import entire folder

After import, display:

| Filename | Duration |
| -------- | -------- |

Actions:

* Remove selected
* Remove all
* Preview selected music

---

# Video Trimmer

✅ **Implemented in v1.6.0**

Fitur untuk memotong video panjang menjadi beberapa segmen pendek dengan menandai checkpoint.

## Set Checkpoint

User dapat menandai titik potong (checkpoint) pada timeline video:

```
Checkpoint:    a       b       c       d       e
               |-------|-------|-------|-------|
Segmen:          a-b     b-c     c-d     d-e
```

Contoh: Video 5 menit dengan checkpoint di menit 0, 1, 3, 4, 5 menghasilkan 4 segmen: 0-1, 1-3, 3-4, 4-5.

## Input Checkpoint

* Input manual: user memasukkan waktu dalam format `HH:MM:SS` atau `detik`
* Visual timeline: klik pada posisi tertentu di timeline preview
* Daftar checkpoint ditampilkan dan bisa dihapus/diedit

## Preview Segmen

Setelah checkpoint ditentukan, aplikasi menampilkan daftar segmen yang akan dihasilkan:

| No | Segmen | Start | End | Duration |
| -- | ------ | ----- | --- | -------- |
| 1 | a → b | 00:00 | 01:00 | 01:00 |
| 2 | b → c | 01:00 | 03:00 | 02:00 |
| 3 | c → d | 03:00 | 04:00 | 01:00 |

## Output

* Setiap segmen disimpan sebagai file video terpisah
* Atau semua segmen langsung ditambahkan ke daftar footage untuk diproses lebih lanjut (shuffle/sequential)

## Actions

* ✅ Reset all checkpoints
* ✅ Preview selected segment
* ✅ Export segments to footage list (via file system)

## Implementation Details

### Frontend — `TrimmerTool.tsx`
* Tab ✂️ **Trimmer** di samping 🔗 Merger
* Pilih video → metadata (durasi, resolusi, fps)
* **Visual timeline** interaktif:
  * Klik untuk tambah checkpoint di posisi itu
  * Hover untuk lihat time indicator (m:ss)
  * Klik marker (garis putih) untuk hapus checkpoint
  * Segmen berwarna berbeda antar checkpoint
* Tabel input manual untuk edit presisi
* Tabel preview segmen (start, end, duration)
* Progress bar saat trimming
* Output folder persist antar session (via `App.tsx` state)

### Backend — `commands.rs`
* Command `trim_video_checkpoints`:
  * Validasi checkpoint (min 2, urut naik, dalam durasi video)
  * FFmpeg `-ss -i -t -c copy` per segmen — cepat, no re-encode
  * Report progress via `Channel<TrimProgress>`
* Output: `video_01_trimmed.mp4`, `video_02_trimmed.mp4`, ...

### Types — `types.ts` / `models.rs`
* `TrimSegment` — index, label, start_time, end_time, duration, output_path
* `TrimProgress` — stage, percent, elapsed_secs, current_segment, total_segments, output_paths

---

# Video Playback Strategy

## Shuffle

Randomize imported footage order.

Example:

Video A
Video D
Video B
Video F
Video C

Options:

* Prevent immediate duplicates
* Regenerate random order

## Sequential

Use imported order.

Example:

Video A
Video B
Video C
Video D

Button:

Generate Sequence

Display generated sequence before rendering.

---

# Music Playback Strategy

## Shuffle

Random music order.

## Sequential

Play music according to imported order.

Additional options:

* Loop playlist
* Repeat single track

---

# Processing Mode

## Mode 1 — Segment Loop (Default)

This is the primary rendering mode for Version 1.0.

The rendering process consists of two passes.

---

### Pass 1 — Master Segment Builder

The application generates a randomized video sequence using imported footage.

Example:

10 videos

Each duration:

10 seconds

Generated order:

Video A
Video D
Video B
Video C
Video F
Video E
Video G
Video H
Video I
Video J

Total duration:

100 seconds

The application combines all clips into a single continuous segment.

Example output:

master_segment.mp4

Duration:

100 seconds

---

### Transition Rules

Crossfade is applied only between clips.

Examples:

A → D
D → B
B → C
C → F

Rules:

* No fade-in on first clip
* No fade-out on last clip
* Only internal transitions between clips

Transition type:

* Dissolve
* Fade
* Smooth Fade

Default:

Dissolve

---

### Pass 2 — Segment Looper

The completed master segment is reused repeatedly until the target duration is reached.

Example:

master_segment.mp4

Duration:

100 seconds

Target:

30 minutes

Calculation:

1800 ÷ 100

Result:

18 loops

Output:

Segment repeated 18 times.

Advantages:

* Faster rendering
* Smaller FFmpeg filter graphs
* Reduced memory usage
* Better stability
* More scalable for long-duration videos

---

# Wizard Mode

Tombol **Wizard Mode** di halaman utama. Saat diklik, muncul popup/modal bertahap (step-by-step).

Tidak mengganggu alur Mode 1 — Segment Loop yang sudah ada.

---

## Step 1 — Intro

Pilih intro video atau lewati (tanpa intro).

Options:

* No Intro
* Pilih file intro (video)

Jika intro dipilih, clip intro akan ditempatkan di awal master segment.

---

## Step 2 — Pilih Footage

Pilih satu atau beberapa file video / folder footage.

Display setelah import:

| Filename | Duration | Resolution | FPS |
| -------- | -------- | ---------- | ---- |

---

## Step 3 — Pilih Musik

Pilih lagu:

* Satu atau beberapa file lagu
* Satu atau beberapa folder lagu

Display setelah import:

| Filename | Duration |
| -------- | -------- |

---

## Step 4 — Pilih Durasi

Tiga mode durasi:

### Fixed Duration

Output berakhir tepat di durasi yang dipilih.

### Fixed Duration + Complete Last Song

Output diperpanjang sampai lagu terakhir selesai.

### Selected Songs Duration

Output sama dengan total durasi lagu yang dipilih.

---

## Step 5 — Queue & Batch

Setelah semua step selesai, wizard menambahkan job ke dalam antrian.

Antrian menampilkan:

| No | Intro | Footage | Musik | Durasi | Status |
| -- | ----- | ------- | ----- | ------ | ------ |

Actions:

* Tambah job baru (buka wizard lagi)
* Hapus job dari antrian
* Hapus semua job
* Render satu per satu
* Render semua (batch)

Setiap job di antrian bisa dirender secara sequential tanpa perlu membuka wizard ulang.

---

# Audio Processing

Music is processed independently from video generation.

Workflow:

1. Create master video segment
2. Loop master segment
3. Build music playlist
4. Combine video and music
5. Render final output

Supported playback modes:

* Shuffle
* Sequential
* Repeat Single Track

---

# Ambient Sound (Ambience)

Ambient sound adalah file audio terpisah (rain, river, white noise, wind, dll)
yang diputar terus menerus sepanjang durasi video — independent dari musik.

## Tujuan

- Suara latar konsisten tanpa jeda (tidak seperti audio asli video yang terpotong-potong)
- Cocok untuk konten relaksasi / nature / meditation
- Level suara bisa diatur terpisah dari musik

## Implementasi

### 1. Import Ambient

Section baru mirip "Intro Import" tapi untuk file audio ambient.
- Daftar format: MP3, WAV, FLAC, AAC, M4A, OGG
- Single file import
- Tidak perlu multiple — satu file ambient saja

### 2. Looping (Pendekatan A — Concat Playlist)

```rust
fn build_ambient_playlist(&self, path: &str, target_dur: f64) -> Result<String> {
    let work = std::env::temp_dir().join("video_randomizer");
    let list = work.join("ambient_playlist.txt");
    let ambient_dur = self.audio_dur(path)?;
    let num_loops = (target_dur / ambient_dur).ceil() as u64;

    let mut content = String::new();
    for _ in 0..num_loops {
        content.push_str(&format!("file '{}'\n", path));
    }
    std::fs::write(&list, &content)?;

    Ok(list.to_string_lossy().to_string())
}
```

Sama seperti pola yang sudah ada di `build_music_playlist`.

### 3. Final Mux — 3 Input

```rust
// Inputs: 0 = video, 1 = music playlist, 2 = ambient playlist
cmd.args(["-map", "0:v:0", "-map", "1:a:0", "-map", "2:a:0"]);
cmd.arg("-filter_complex").arg(
    "[1:a]volume=0.7[music];[2:a]volume=0.3[ambient];[music][ambient]amix=inputs=2:duration=first[out]"
);
cmd.args(["-map", "[out]"]);
cmd.arg("-c:a").arg("aac").arg("-b:a").arg("192k");
```

### 4. Kontrol Volume

Dua slider di Encoding Settings:
- **Music Volume** (0–100%, default 80)
- **Ambient Volume** (0–100%, default 30 — lebih pelan agar tidak dominan)

### 5. Field Baru di RenderSettings

```rust
pub struct RenderSettings {
    // ... existing fields ...
    pub ambient_enabled: bool,
    pub ambient_path: String,
    pub music_volume: f64,     // 0.0 - 1.0
    pub ambient_volume: f64,   // 0.0 - 1.0
}
```

### 6. UI Yang Diubah

- **`AmbientImport.tsx`** — component baru untuk import file ambient
- **`EncodingSettings.tsx`** — tambah dua slider volume
- **`App.tsx`** — default value + state

Tidak mempengaruhi render flow yang sudah ada — ambient hanya menambah input ke filter complex di `mux_video_audio()`.

---

# Duration Modes

## Fixed Duration

Output ends exactly at selected duration.

Examples:

* 5 minutes
* 10 minutes
* 30 minutes
* 1 hour
* 3 hours

---

## Fixed Duration + Complete Last Song

Output extends until currently playing song finishes.

Example:

Target duration:

30 minutes

Current song ends at:

31:45

Final output:

31:45

---

## Selected Songs Duration

User selects songs from the imported music list.

Output duration equals total duration of selected songs.

Example:

Song 1
Song 2
Song 3

Total:

12m 42s

Output duration:

12m 42s

---

# Encoding Settings

## Mute Source Video Audio

Checkbox:

Mute source video sound

Default:

Enabled

When enabled:

Remove all original video audio.

---

## Encoding Speed

Options:

### Fast

Maximum rendering speed.

### Balanced

Recommended default.

### Quality

Best compression efficiency.

Default:

Balanced

---

## Encoder

Options:

### Auto

Automatically detect best encoder.

### Hardware

Use GPU encoder when available.

Examples:

* NVIDIA NVENC
* AMD AMF
* Intel QuickSync
* Apple VideoToolbox

### Software

Examples:

* libx264
* libx265

Default:

Auto

---

# Resolution Settings

Options:

* Original
* 1280x720
* 1920x1080
* 2560x1440
* 3840x2160

Custom resolution supported.

---

# FPS Settings

Options:

* Keep Original
* 24
* 25
* 30
* 50
* 60

Custom FPS supported.

---

# Transition Settings

## Fade Duration

Crossfade duration between clips.

Range:

0.0s to 5.0s

Default:

0.5s

Recommended:

0.5s

Implementation:

FFmpeg xfade filter

---

# Output Settings

## Output Filename

Default:

Timestamp

Format:

YYYYMMDD_HHMMSS

Example:

20260620_213045.mp4

Custom templates:

* timestamp
* music_name
* music_name_resolution
* custom text

---

## Output Folder

Display selected output directory.

Buttons:

* Change Folder
* Open Output Folder

---

# Preview Panel

Video Preview:

Display:

* Duration
* Resolution
* FPS

Music Preview:

Display:

* Duration
* File Size

---

# Cache Management

Temporary files created during rendering:

master_segment.mp4

Options:

### Delete Automatically

Remove cache after rendering.

### Keep Cache

Preserve master segment for future reuse.

Default:

Delete Automatically

---

# Render Progress

Display:

* Current stage
* Current clip
* Current song
* Percentage complete
* Elapsed time
* Estimated remaining time

Buttons:

* Pause
* Cancel

---

# Backend Responsibilities

Rust backend is responsible for:

* File validation
* Metadata extraction
* Randomization logic
* Duration calculations
* Playlist generation
* FFmpeg command generation
* Render management
* Progress tracking

FFprobe is responsible for:

* Duration detection
* FPS detection
* Resolution detection
* Audio metadata extraction

---

# Future Features (v2)

* Batch rendering
* Multiple output jobs
* Save/load projects
* Preset management
* Thumbnail generator
* Logo overlay
* Watermark overlay
* Intro insertion
* Outro insertion
* Beat-synced transitions
* Smart scene detection
* Drag-and-drop timeline editor
* YouTube export presets

