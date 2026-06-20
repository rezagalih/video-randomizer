#!/bin/bash
. "$HOME/.cargo/env"
cd "$(dirname "$0")"
cargo tauri dev
