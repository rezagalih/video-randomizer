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

