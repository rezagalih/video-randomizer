#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
DEST="$PROJECT_DIR/src-tauri/resources/bin"
mkdir -p "$DEST"

OS="$(uname -s)"

if [ "$OS" = "Darwin" ]; then
  VERSION="${1:-7.1}"
  echo "Downloading ffmpeg $VERSION for macOS..."
  curl -#Lo "$DEST/ffmpeg.zip" "https://evermeet.cx/ffmpeg/ffmpeg-$VERSION.zip"
  echo "Downloading ffprobe $VERSION for macOS..."
  curl -#Lo "$DEST/ffprobe.zip" "https://evermeet.cx/ffmpeg/ffprobe-$VERSION.zip"
  cd "$DEST"
  unzip -o ffmpeg.zip
  unzip -o ffprobe.zip
  chmod +x ffmpeg ffprobe
  rm -f ffmpeg.zip ffprobe.zip
elif [ "$OS" = "Linux" ]; then
  echo "Downloading ffmpeg for Linux..."
  curl -#Lo /tmp/ffmpeg-linux.zip "https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-linux64-gpl.zip"
  unzip -jo /tmp/ffmpeg-linux.zip "*/bin/ffmpeg" "*/bin/ffprobe" -d "$DEST"
  chmod +x "$DEST"/ffmpeg "$DEST"/ffprobe
  rm -f /tmp/ffmpeg-linux.zip
else
  echo "Downloading ffmpeg for Windows..."
  curl -#Lo /tmp/ffmpeg-win.zip "https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip"
  unzip -jo /tmp/ffmpeg-win.zip "*/bin/ffmpeg.exe" "*/bin/ffprobe.exe" -d "$DEST"
  rm -f /tmp/ffmpeg-win.zip
fi

echo "Done: $(ls "$DEST")"
