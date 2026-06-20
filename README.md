# Video Randomizer Looper

A Tauri v2 desktop app that combines randomized video clips with music playlists into long-form rendered videos using FFmpeg.

## How it Works

1. **Import videos** — Add video files (mp4, mov, mkv, webm)
2. **Import music** — Add audio files (mp3, wav, flac, aac, m4a)
3. **Configure settings** — Choose playback mode, duration, encoding, transitions
4. **Render** — Generates a seamless video matching the music duration with crossfade transitions

### Render Pipeline

- **Pass 1**: Build video segment from shuffled/sequenced clips
- **Pass 2**: Loop the segment with crossfade to match music duration
- **Mux**: Combine video with music audio

## Tech Stack

- **Frontend**: React + TypeScript + Vite
- **Backend**: Rust (Tauri v2)
- **Video**: FFmpeg / FFprobe (xfade filter for crossfade transitions)

## Development

```sh
./launch.sh
```

Requires: Rust, Node.js, FFmpeg 8.1+, FFprobe
