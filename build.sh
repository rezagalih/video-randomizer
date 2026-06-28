#!/usr/bin/env bash
set -euo pipefail

APP_NAME="Video Randomizer Looper"
SOURCE="src-tauri/target/release/bundle/macos/${APP_NAME}.app"
DEST="${HOME}/Applications/${APP_NAME}.app"

echo "Building Tauri app..."
npm run tauri build

echo "Copying to ${DEST}..."
rm -rf "${DEST}"
cp -R "${SOURCE}" "${DEST}"

echo "Done! App installed to ${DEST}"
