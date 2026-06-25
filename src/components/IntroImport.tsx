import { useState, useEffect } from "react";
import { VideoFile } from "../types";

interface Props {
  video: VideoFile | null;
  onVideoChange: (v: VideoFile | null) => void;
}

export default function IntroImport({ video, onVideoChange }: Props) {
  const [videoSrc, setVideoSrc] = useState("");

  useEffect(() => {
    if (!video) { setVideoSrc(""); return; }
    (async () => {
      const { convertFileSrc } = await import("@tauri-apps/api/core");
      setVideoSrc(convertFileSrc(video.path));
    })();
  }, [video?.path]);

  async function pickFile() {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const file = await open({
      multiple: false,
      filters: [{ name: "Video", extensions: ["mp4", "mov", "mkv", "webm"] }],
    });
    if (!file) return;
    const path = file as string;
    const { invoke } = await import("@tauri-apps/api/core");
    try {
      const meta = await invoke<VideoFile>("get_video_metadata", { path });
      onVideoChange(meta);
    } catch {
      alert("Could not read video metadata for intro.");
    }
  }

  function remove() {
    onVideoChange(null);
  }

  function formatDur(s: number): string {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  }

  return (
    <div className="card">
      <h3>Intro Video</h3>
      <p className="hint">A short video that plays once before the looped content. Optional.</p>
      <div className="btn-group">
        {!video ? (
          <button onClick={pickFile}>Select Intro Video</button>
        ) : (
          <>
            <button onClick={pickFile}>Change</button>
            <button onClick={remove} className="danger">Remove</button>
          </>
        )}
      </div>
      {video && (
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 8 }}
          onDoubleClick={async () => {
            const { invoke } = await import("@tauri-apps/api/core");
            try { await invoke("open_folder", { path: video.path }); } catch {}
          }}
        >
          <div className="video-thumb" style={{ width: 80, height: 50, background: "#333", borderRadius: 4, overflow: "hidden", flexShrink: 0 }}>
            {videoSrc && (
              <video
                src={videoSrc}
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
                muted
              />
            )}
          </div>
          <div>
            <div style={{ fontWeight: 600 }}>{video.filename}</div>
            <div className="text-muted">{formatDur(video.duration)} &middot; {video.width}x{video.height} &middot; {video.fps.toFixed(1)}fps</div>
          </div>
        </div>
      )}
    </div>
  );
}
