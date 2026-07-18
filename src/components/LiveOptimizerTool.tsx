import { useState } from "react";
import { VideoFile, LiveOptimizeProgress } from "../types";

interface LiveOptimizerToolProps {
  outputFolder: string;
  onOutputFolderChange: (path: string) => void;
}

export default function LiveOptimizerTool({ outputFolder, onOutputFolderChange }: LiveOptimizerToolProps) {
  const [videos, setVideos] = useState<VideoFile[]>([]);
  const [preset, setPreset] = useState("1080p_30fps");
  const [optimizing, setOptimizing] = useState(false);
  const [progress, setProgress] = useState<LiveOptimizeProgress | null>(null);

  async function pickFiles() {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const files = await open({
      multiple: true,
      filters: [{ name: "Video", extensions: ["mp4", "mov", "mkv", "webm"] }],
    });
    if (!files) return;
    const paths = Array.isArray(files) ? files : [files];
    const { invoke } = await import("@tauri-apps/api/core");
    const existing = new Set(videos.map((v) => v.path));
    const newVids: VideoFile[] = [];
    for (const p of paths as string[]) {
      if (existing.has(p)) continue;
      try {
        const meta = await invoke<VideoFile>("get_video_metadata", { path: p });
        newVids.push(meta);
      } catch { /* skip */ }
    }
    setVideos([...videos, ...newVids]);
  }

  function removeAll() {
    setVideos([]);
  }

  async function selectOutput() {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const folder = await open({ directory: true });
    if (folder) onOutputFolderChange(folder as string);
  }

  function formatDur(s: number): string {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  }

  async function startOptimization() {
    if (videos.length === 0) { alert("Pilih video."); return; }
    if (!outputFolder) { alert("Pilih folder output."); return; }

    setOptimizing(true);
    setProgress(null);

    const { invoke, Channel } = await import("@tauri-apps/api/core");
    const channel = new Channel<LiveOptimizeProgress>();
    channel.onmessage = (p) => {
      setProgress(p);
      if (p.stage === "Complete") {
        setOptimizing(false);
      }
    };

    try {
      await invoke("optimize_for_live", {
        videos: videos.map((v) => v.path),
        preset: preset,
        outputFolder: outputFolder,
        onEvent: channel,
      });
    } catch (e) {
      setOptimizing(false);
      alert(`Optimization gagal: ${e}`);
    }
  }

  async function openFolder() {
    if (!outputFolder) return;
    const { invoke } = await import("@tauri-apps/api/core");
    try { await invoke("open_folder", { path: outputFolder }); }
    catch (e) { alert(`Error: ${e}`); }
  }

  const presets = [
    { value: "1080p_30fps", label: "1080p 30fps" },
    { value: "1080p_25fps", label: "1080p 25fps" },
    { value: "720p_30fps", label: "720p 30fps" },
    { value: "720p_25fps", label: "720p 25fps" },
  ];

  return (
    <div className="card">
      <h3>🔴 Live Optimizer</h3>
      <p style={{ fontSize: 13, color: "var(--text2)", marginBottom: 8 }}>
        Batch process video agar seragam untuk live streaming (resolusi dan fps).
      </p>

      <div className="btn-group">
        <button onClick={pickFiles}>📁 Import Videos</button>
        <button onClick={removeAll} disabled={videos.length === 0} className="danger">🗑 Remove All</button>
      </div>

      {videos.length === 0 ? (
        <div className="empty-state" style={{ marginTop: 12 }}>No videos. Import files to optimize.</div>
      ) : (
        <div style={{ maxHeight: 200, overflowY: "auto", marginTop: 12 }}>
          <table>
            <thead>
              <tr>
                <th style={{ width: 40 }}>#</th>
                <th>Filename</th>
                <th>Original Res</th>
                <th>Original FPS</th>
                <th>Duration</th>
              </tr>
            </thead>
            <tbody>
              {videos.map((v, i) => (
                <tr key={i}>
                  <td>{i + 1}</td>
                  <td>{v.filename}</td>
                  <td>{v.width}x{v.height}</td>
                  <td>{v.fps.toFixed(2)}</td>
                  <td>{formatDur(v.duration)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 16 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <label style={{ fontSize: 12, color: "var(--text2)" }}>Preset / Target:</label>
          <select value={preset} onChange={(e) => setPreset(e.target.value)} style={{ padding: "4px 8px" }}>
            {presets.map((p) => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>
        </div>
        
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
          <label style={{ fontSize: 12, color: "var(--text2)" }}>Output Folder:</label>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button onClick={selectOutput} style={{ padding: "4px 8px", fontSize: 12 }}>📁 Select</button>
            <span style={{ fontSize: 13, color: "var(--text2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {outputFolder || "Not selected"}
            </span>
          </div>
        </div>
      </div>

      <div style={{ marginTop: 16 }}>
        <button
          className="primary"
          onClick={startOptimization}
          disabled={optimizing || videos.length === 0 || !outputFolder}
          style={{ width: "100%" }}
        >
          {optimizing ? "⏳ Optimizing..." : "▶ Start Optimization"}
        </button>
      </div>

      {progress && (
        <div style={{ marginTop: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "var(--text2)" }}>
            <span>{progress.stage}</span>
            <span>{progress.percent.toFixed(1)}% &middot; {progress.elapsed_secs.toFixed(0)}s</span>
          </div>
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: `${progress.percent}%` }} />
          </div>
          {progress.current_filename && progress.stage !== "Complete" && (
            <div style={{ fontSize: 11, color: "var(--text2)", marginTop: 4 }}>
              Current file: {progress.current_filename}
            </div>
          )}
        </div>
      )}

      {progress?.stage === "Complete" && !optimizing && (
        <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
          <button onClick={openFolder}>📂 Open Output Folder</button>
          <button className="primary" onClick={() => { setProgress(null); }}>⟳ Optimize More</button>
        </div>
      )}
    </div>
  );
}
