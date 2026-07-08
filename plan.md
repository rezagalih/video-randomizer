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

✅ **Implemented**

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

✅ **Implemented**

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

# Remaster Audio (Tab Khusus)

> **⚠️ HIDDEN — Tab disembunyikan dari UI (Juli 2026). Perlu riset total ulang.**
> **Fitur opsional — terpisah dari pipeline render utama.**
> ~~Tab 🎛️ **Remaster** di samping Merger & Trimmer.~~

Tab khusus untuk remastering file audio (lagu) agar suara lebih natural dan tidak terdengar terlalu "AI".

## Alur Kerja

1. Import satu atau beberapa file audio (MP3, WAV, FLAC, AAC, M4A)
2. Pilih preset remastering
3. Preview hasil (opsional)
4. Export file remastered
5. Hasil remastered bisa dipakai di render tab sebagai music input

## Display Setelah Import

| Filename | Duration | Format | Bitrate |
| -------- | -------- | ------ | ------- |

## Preset EQ & Filter

Setiap preset adalah kombinasi dari beberapa filter FFmpeg (`-af`).

### None (Original)

Tidak ada processing. Output same as input.

### Warm Natural

EQ ringan + compression untuk warmth analog.

```
equalizer=f=50:t=q:w=1:g=2.5
equalizer=f=200:t=q:w=1:g=2
equalizer=f=3000:t=q:w=0.5:g=-1
equalizer=f=8000:t=q:w=1:g=-2.5
equalizer=f=12000:t=q:w=1:g=-3
acompressor=threshold=-15dB:ratio=2.5:attack=10:release=80
```

### Analog Vintage

Tape saturation + low-end boost + gentle compression.

```
aexciter=amount=0.25
equalizer=f=80:t=q:w=1:g=3
equalizer=f=150:t=q:w=1:g=2
equalizer=f=5000:t=q:w=1:g=-1
equalizer=f=10000:t=q:w=1:g=-3
acompressor=threshold=-18dB:ratio=2:attack=20:release=100
alimiter=limit=-1.5dB:attack=0.1:release=1
```

### Smooth Broadcast

Stylized untuk speech/vocal — mid boosted, highs smoothed.

```
equalizer=f=100:t=q:w=1:g=1.5
equalizer=f=300:t=q:w=1:g=3
equalizer=f=1000:t=q:w=1:g=1
equalizer=f=6000:t=q:w=1:g=-2
equalizer=f=12000:t=q:w=1:g=-4
acompressor=threshold=-20dB:ratio=3:attack=5:release=50
alimiter=limit=-1dB:attack=0.1:release=0.5
```

### Voice Clear

Untuk musik dengan vokal — clarity boost tanpa sibilance.

```
equalizer=f=200:t=q:w=1:g=1
equalizer=f=3000:t=q:w=1:g=3
equalizer=f=5000:t=q:w=1:g=2
equalizer=f=8000:t=q:w=1:g=-1.5
equalizer=f=12000:t=q:w=1:g=-2
acompressor=threshold=-14dB:ratio=2.5:attack=5:release=60
alimiter=limit=-1dB:attack=0.1:release=0.5
```

### Heavy Bass

Untuk dance/beat-driven — sub-bass boosted + tight compression.

```
equalizer=f=40:t=q:w=1:g=5
equalizer=f=80:t=q:w=1:g=3.5
equalizer=f=150:t=q:w=1:g=2
equalizer=f=400:t=q:w=1:g=-1
equalizer=f=1000:t=q:w=0.5:g=-1.5
acompressor=threshold=-20dB:ratio=4:attack=5:release=40
alimiter=limit=-1dB:attack=0.1:release=0.5
```

### Lo-Fi / Chill

Untuk lo-fi, chillhop, ambient — warmth tape + high cut.

```
equalizer=f=60:t=q:w=1:g=2
equalizer=f=200:t=q:w=1:g=2.5
equalizer=f=400:t=q:w=1:g=1.5
equalizer=f=4000:t=q:w=1:g=-3
equalizer=f=10000:t=q:w=1:g=-5
acompressor=threshold=-15dB:ratio=2:attack=15:release=120
alimiter=limit=-2dB:attack=0.5:release=1
```

### Phonk / Drift

Bass agresif + high-end presence, cocok untuk phonk, drift, meme edit.

```
equalizer=f=40:t=q:w=1:g=6
equalizer=f=80:t=q:w=1:g=4
equalizer=f=150:t=q:w=1:g=3
equalizer=f=2000:t=q:w=1:g=2
equalizer=f=5000:t=q:w=1:g=1.5
equalizer=f=10000:t=q:w=1:g=1
equalizer=f=14000:t=q:w=1:g=2
acompressor=threshold=-22dB:ratio=4:attack=3:release=30
alimiter=limit=-0.5dB:attack=0.05:release=0.3
```

### EDM / Electro

Agresif di sub-bass dan high-end untuk club sound.

```
equalizer=f=40:t=q:w=1:g=4
equalizer=f=60:t=q:w=1:g=3
equalizer=f=200:t=q:w=1:g=-1
equalizer=f=400:t=q:w=1:g=-2
equalizer=f=5000:t=q:w=1:g=2.5
equalizer=f=10000:t=q:w=1:g=3
equalizer=f=16000:t=q:w=1:g=2
acompressor=threshold=-18dB:ratio=3:attack=5:release=40
alimiter=limit=-1dB:attack=0.1:release=0.5
```

### Hip-Hop / RnB

Bass punchy + vokal clear, mid-low boosted.

```
equalizer=f=50:t=q:w=1:g=4
equalizer=f=100:t=q:w=1:g=3
equalizer=f=250:t=q:w=1:g=1.5
equalizer=f=400:t=q:w=0.5:g=-1.5
equalizer=f=3000:t=q:w=1:g=2
equalizer=f=6000:t=q:w=1:g=1
equalizer=f=10000:t=q:w=1:g=-1
equalizer=f=14000:t=q:w=1:g=-2
acompressor=threshold=-16dB:ratio=2.5:attack=8:release=60
alimiter=limit=-1dB:attack=0.1:release=0.5
```

### Rock / Metal

Mid agresif + high-end tajam, low-end tight.

```
equalizer=f=60:t=q:w=1:g=2
equalizer=f=120:t=q:w=1:g=1
equalizer=f=800:t=q:w=1:g=2
equalizer=f=2500:t=q:w=1:g=3
equalizer=f=5000:t=q:w=1:g=2
equalizer=f=8000:t=q:w=1:g=1.5
equalizer=f=12000:t=q:w=1:g=-1
acompressor=threshold=-14dB:ratio=3.5:attack=3:release=30
alimiter=limit=-0.5dB:attack=0.05:release=0.3
```

### Jazz / Akustik

Natural, warm, dynamic range dipertahankan — minimal compression.

```
equalizer=f=80:t=q:w=1:g=1.5
equalizer=f=250:t=q:w=1:g=2
equalizer=f=1000:t=q:w=1:g=1
equalizer=f=4000:t=q:w=1:g=-0.5
equalizer=f=8000:t=q:w=1:g=-1
equalizer=f=12000:t=q:w=1:g=-1.5
acompressor=threshold=-10dB:ratio=1.5:attack=30:release=150
```

### Classical / Orchestral

Dynamic range lebar, highs jernih, bass alami.

```
equalizer=f=40:t=q:w=0.5:g=1
equalizer=f=200:t=q:w=1:g=1
equalizer=f=500:t=q:w=1:g=0.5
equalizer=f=2000:t=q:w=1:g=1
equalizer=f=5000:t=q:w=0.5:g=1.5
equalizer=f=10000:t=q:w=1:g=1
equalizer=f=16000:t=q:w=1:g=2
acompressor=threshold=-8dB:ratio=1.2:attack=50:release=200
```

### Reggae / Dub

Bass tebal + mid hangat, treble halus.

```
equalizer=f=40:t=q:w=1:g=4
equalizer=f=80:t=q:w=1:g=3
equalizer=f=200:t=q:w=1:g=2
equalizer=f=500:t=q:w=1:g=1
equalizer=f=3000:t=q:w=1:g=-1.5
equalizer=f=8000:t=q:w=1:g=-2.5
equalizer=f=12000:t=q:w=1:g=-3
acompressor=threshold=-15dB:ratio=2.5:attack=10:release=80
alimiter=limit=-1.5dB:attack=0.1:release=1
```

### Podcast / Audiobook

Vokal maksimal, noise rendah, konsisten — untuk spoken word.

```
equalizer=f=80:t=q:w=1:g=2
equalizer=f=150:t=q:w=1:g=1.5
equalizer=f=300:t=q:w=1:g=3
equalizer=f=1000:t=q:w=1:g=2
equalizer=f=3000:t=q:w=1:g=2
equalizer=f=6000:t=q:w=1:g=-2
equalizer=f=10000:t=q:w=1:g=-3
equalizer=f=14000:t=q:w=1:g=-5
anlmdn=s=0.5:p=0.4:r=1.5
acompressor=threshold=-24dB:ratio=3.5:attack=3:release=40
alimiter=limit=-0.5dB:attack=0.1:release=0.5
```

### Custom

User dapat mengatur sendiri parameter EQ & filter.

| Parameter | Range | Default |
| --------- | ----- | ------- |
| Bass (60Hz) | -12 to +12 dB | 0 |
| Low-Mid (250Hz) | -12 to +12 dB | 0 |
| Mid (1kHz) | -12 to +12 dB | 0 |
| High-Mid (5kHz) | -12 to +12 dB | 0 |
| Treble (10kHz) | -12 to +12 dB | 0 |
| Compression | None / Light / Medium / Heavy | None |
| Saturation | 0-100% | 0 |
| Limiter | On / Off | Off |

## Preview

* Play segment pendek (15-30 detik) dengan preset terpilih
* Tampilkan perbandingan waveform: original vs remastered (lihat perbedaan sebelum export)

## Output

| Field | Detail |
| ----- | ------ |
| Format | Sama dengan input (lossless: WAV/FLAC, lossy: MP3 320kbps). Bisa pilih format output terpisah |
| Nama | `{original}_{preset}_remastered.{ext}` |
| Folder | Bisa pilih sendiri / default: folder yang sama dengan original |

## Batch Processing

> Fitur untuk meremaster banyak file audio sekaligus dengan preset yang sama atau berbeda.

### Flow Batch

1. Import multiple files (atau folder)
2. Pilih **Apply to All** (satu preset untuk semua) atau **Per File** (masing-masing beda preset)
3. Tentukan format output (WAV / FLAC / MP3 320kbps / same as input)
4. Klik **Export All**
5. Progress bar menunjukkan: `File 3/12 — Remastering — 45%`
6. Tombol **Cancel** untuk membatalkan batch
7. Setelah selesai, muncul summary: `12 files remastered, 3 failed`

### Display List (Batch)

| # | Filename | Duration | Preset | Status |
| - | -------- | -------- | ------ | ------ |
| 1 | track1.mp3 | 3:45 | Warm Natural | ✅ Done |
| 2 | track2.mp3 | 4:12 | Analog Vintage | ⏳ Processing |
| 3 | track3.mp3 | 3:30 | Warm Natural | ⏳ Pending |
| ... | ... | ... | ... | ... |

### Actions

* Import audio files (single)
* Import folder (scan semua file audio)
* Pilih preset per file atau apply to all
* Preview perbandingan
* Export satu per satu
* Export all (batch)
* Open output folder
* Reset all

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

# Remastering (Post-Processing)

> **Bukan fitur utama.** Ini adalah lapisan enhancement opsional setelah pipeline dasar berjalan.
> Fokus utama tetap Mode 1 — Segment Loop yang sudah ada.
> Remastering hanya dipakai jika user mengaktifkannya secara eksplisit.

Fitur untuk memperhalus hasil render agar transisi dan tampilan lebih natural, tidak terlihat seperti potongan mentah.

## Color Matching

Samakan tone warna antar clip agar tidak ada lompatan warna yang mencolok saat transisi.

* Rata-rata brightness/contrast per clip disamakan (FFmpeg `eq` filter)
* Atau apply LUT seragam ke semua clip
* Opsional: auto white balance

## Smart Transitions

Variasi transisi antar clip, tidak hanya dissolve:

* Motion-blur crossfade
* Dip to black / dip to white
* Zoom in/out saat transisi
* Slide left/right crop
* Dipilih random atau sequential sesuai preferensi

## Audio Smoothing

* Fade in/out audio per clip (terpisah dari video crossfade)
* Beat-matched cut opsional — deteksi beat dan potong clip mengikuti irama

## Motion

* Stabilization untuk clip goyang (FFmpeg `vidstab`)
* Ken Burns effect — slow zoom/pan pada clip diam agar lebih sinematik

## Look & Feel

* Film grain halus agar tidak terlalu mulus
* Vignette — gelapkan pinggir frame
* Sharpening ringan

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
