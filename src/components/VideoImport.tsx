import { useState } from "react";
import { VideoFile, ScanResult } from "../types";

interface Props {
  videos: VideoFile[];
  onVideosChange: (v: VideoFile[]) => void;
  videoFolders: string[];
  onVideoFoldersChange: (f: string[]) => void;
}

export default function VideoImport({ videos, onVideosChange, videoFolders, onVideoFoldersChange }: Props) {
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(false);

  async function pickFiles() {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const files = await open({
      multiple: true,
      filters: [{ name: "Video", extensions: ["mp4", "mov", "mkv", "webm"] }],
    });
    if (!files) return;
    const paths = Array.isArray(files) ? files : [files];
    await addVideos(paths as string[]);
  }

  async function pickFolder() {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const folder = await open({ directory: true });
    if (!folder) return;
    setLoading(true);
    const { invoke } = await import("@tauri-apps/api/core");
    try {
      const result = await invoke<ScanResult>("scan_folder", { path: folder });
      const existing = new Set(videos.map((v) => v.path));
      const newVids = result.videos.filter((v) => !existing.has(v.path));
      onVideosChange([...videos, ...newVids]);
      // add folder to source list if not already present
      if (!videoFolders.includes(folder as string)) {
        onVideoFoldersChange([...videoFolders, folder as string]);
      }
    } finally {
      setLoading(false);
    }
  }

  function removeFolder(folder: string) {
    onVideoFoldersChange(videoFolders.filter((f) => f !== folder));
    // remove all videos whose path starts with this folder
    const prefix = folder.endsWith("/") || folder.endsWith("\\") ? folder : folder + "/";
    onVideosChange(videos.filter((v) => !v.path.startsWith(prefix)));
  }

  async function addVideos(paths: string[]) {
    const { invoke } = await import("@tauri-apps/api/core");
    const existing = new Set(videos.map((v) => v.path));
    const newVids: VideoFile[] = [];
    for (const p of paths) {
      if (existing.has(p)) continue;
      try {
        const meta = await invoke<VideoFile>("get_video_metadata", { path: p });
        newVids.push(meta);
      } catch { /* skip invalid */ }
    }
    onVideosChange([...videos, ...newVids]);
  }

  function removeSelected() {
    const remaining = videos.filter((_, i) => !selected.has(i));
    onVideosChange(remaining);
    setSelected(new Set());
  }

  function removeAll() {
    onVideosChange([]);
    setSelected(new Set());
  }

  function toggle(i: number) {
    const next = new Set(selected);
    if (next.has(i)) next.delete(i);
    else next.add(i);
    setSelected(next);
  }

  function formatDur(s: number): string {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  }

  return (
    <div className="card">
      <h3>📹 Video Footage</h3>
      <div className="btn-group">
        <button onClick={pickFiles}>📁 Import Files</button>
        <button onClick={pickFolder} disabled={loading}>
          {loading ? "⏳ Scanning..." : "📂 Import Folder"}
        </button>
        <button onClick={removeSelected} disabled={selected.size === 0} className="danger">
          🗑 Remove Selected
        </button>
        <button onClick={removeAll} disabled={videos.length === 0} className="danger">
          🗑 Remove All
        </button>
      </div>
      {videoFolders.length > 0 && (
        <div style={{ margin: "8px 0", padding: "8px", background: "var(--bg2)", borderRadius: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4, color: "var(--text2)" }}>Source Folders:</div>
          {videoFolders.map((f, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2, fontSize: 13 }}>
              <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>📁 {f}</span>
              <button
                onClick={() => removeFolder(f)}
                style={{ padding: "2px 8px", fontSize: 12, background: "none", border: "1px solid var(--border)", borderRadius: 4, cursor: "pointer" }}
              >✕</button>
            </div>
          ))}
        </div>
      )}
      {videos.length === 0 ? (
        <div className="empty-state">No videos imported. Click Import Files or Import Folder to add videos.</div>
      ) : (
        <div style={{ maxHeight: 300, overflowY: "auto" }}>
          <table>
            <thead>
              <tr>
                <th style={{ width: 30 }}></th>
                <th>Filename</th>
                <th>Duration</th>
                <th>Resolution</th>
                <th>FPS</th>
              </tr>
            </thead>
            <tbody>
              {videos.map((v, i) => (
                <tr key={i} className={selected.has(i) ? "selected" : ""} onClick={() => toggle(i)}>
                  <td>
                    <input type="checkbox" checked={selected.has(i)} onChange={() => toggle(i)} />
                  </td>
                  <td>{v.filename}</td>
                  <td>{formatDur(v.duration)}</td>
                  <td>{v.width}x{v.height}</td>
                  <td>{v.fps.toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
