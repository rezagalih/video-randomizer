# Video Randomizer Looper

A Tauri v2 desktop app that combines randomized video clips with music playlists into long-form rendered videos using FFmpeg.

## How it Works

1. **Import videos** — Add video files (mp4, mov, mkv, webm)
2. **Import music** — Add audio files (mp3, wav, flac, aac, m4a)
3. **Configure settings** — Choose playback mode, duration, encoding, transitions, random cut
4. **Render** — Generates a seamless video matching the music duration with crossfade transitions

### Render Pipeline

- **Build music playlist** — Shuffle/sequence music to match target duration
- **Trim video segments** — Optionally cut random footage from each clip
- **Loop with crossfade** — Loop segments using xfade filter to match music duration
- **Mux** — Combine video with music audio (with optional watermark overlay)

## Tech Stack

- **Frontend**: React + TypeScript + Vite
- **Backend**: Rust (Tauri v2)
- **Video**: FFmpeg / FFprobe (xfade filter for crossfade)

## Prerequisites

- Rust (latest stable)
- Node.js 18+
- npm

FFmpeg/FFprobe are **bundled with the app** — no system installation required.

## Setup

```sh
# Install frontend dependencies
npm install

# Download bundled FFmpeg binaries for your platform
./scripts/download-ffmpeg.sh
```

This places `ffmpeg` and `ffprobe` in `src-tauri/resources/bin/`.  
The directory already contains binaries for all platforms (macOS + Windows).  
Run the script only if you need to refresh or update them.

## Development

```sh
npm run tauri dev
```

## Build for Production

### macOS

```sh
npm run tauri build
```

Output:
- `src-tauri/target/release/bundle/macos/Video Randomizer Looper.app`
- `src-tauri/target/release/bundle/dmg/Video Randomizer Looper_1.0.0_aarch64.dmg`

### Windows

Build on a Windows machine (cross-compilation from macOS is not supported):

```sh
npm run tauri build
```

Output:
- `src-tauri/target/release/bundle/msi/Video Randomizer Looper_1.0.0_x64.msi`
- `src-tauri/target/release/bundle/nsis/Video Randomizer Looper_1.0.0_x64-setup.exe`

> Note: On Windows you need the Visual Studio Build Tools and WebView2 (included with Windows 10+).

### Build Output Structure

The `.app` / installer includes:
- Frontend (React) — compiled to `dist/`
- Rust backend — compiled binary
- **FFmpeg + FFprobe** — bundled in `Resources/bin/`

No external dependencies needed at runtime.

## Scripts

| Script | Purpose |
|--------|---------|
| `scripts/download-ffmpeg.sh` | Download FFmpeg/FFprobe for current platform |
| `npm run dev` | Start Vite dev server (port 1420) |
| `npm run build` | TypeScript check + Vite production build |
| `npm run tauri dev` | Launch Tauri dev mode |
| `npm run tauri build` | Build release app bundle |

## Project Structure

```
video-randomizer/
├── src/                          # React frontend
│   ├── App.tsx                   # Main app (3 tabs, state, render flow)
│   ├── types.ts                  # TypeScript interfaces
│   └── components/
│       ├── VideoImport.tsx
│       ├── MusicImport.tsx
│       ├── PlaybackStrategy.tsx
│       ├── DurationSettings.tsx
│       ├── EncodingSettings.tsx
│       ├── TransitionSettings.tsx
│       ├── CutRandomSettings.tsx
│       ├── OutputSettings.tsx
│       ├── WatermarkSettings.tsx
│       ├── SequenceDisplay.tsx
│       └── RenderProgress.tsx
├── src-tauri/                    # Rust backend
│   ├── src/
│   │   ├── main.rs               # Entry point
│   │   ├── lib.rs                # App setup, plugin registration
│   │   ├── commands.rs           # Tauri IPC commands
│   │   ├── models.rs             # Serde data models
│   │   ├── renderer.rs           # FFmpeg pipeline
│   │   └── metadata.rs           # FFprobe metadata extraction
│   ├── resources/bin/            # Bundled FFmpeg binaries
│   │   ├── ffmpeg                # macOS
│   │   ├── ffprobe               # macOS
│   │   ├── ffmpeg.exe            # Windows
│   │   └── ffprobe.exe           # Windows
│   └── tauri.conf.json           # Tauri configuration
└── scripts/
    └── download-ffmpeg.sh        # FFmpeg download helper
```
