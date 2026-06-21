import { useState } from "react";
import { VideoFile, MergeProgress } from "../types";

export default function MergerTool() {
  const [videos, setVideos] = useState<VideoFile[]>([]);
  const [output, setOutput] = useState("");
  const [filename, setFilename] = useState("merged.mp4");
  const [merging, setMerging] = useState(false);
  const [progress, setProgress] = useState<MergeProgress | null>(null);
  const [resultPath, setResultPath] = useState("");

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

  function moveUp(i: number) {
    if (i <= 0) return;
    const arr = [...videos];
    [arr[i - 1], arr[i]] = [arr[i], arr[i - 1]];
    setVideos(arr);
  }

  function moveDown(i: number) {
    if (i >= videos.length - 1) return;
    const arr = [...videos];
    [arr[i], arr[i + 1]] = [arr[i + 1], arr[i]];
    setVideos(arr);
  }

  function shuffle() {
    const arr = [...videos];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    setVideos(arr);
  }

  function removeSelected(selected: Set<number>) {
    setVideos(videos.filter((_, i) => !selected.has(i)));
  }

  function removeAll() {
    setVideos([]);
  }

  async function selectOutput() {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const folder = await open({ directory: true });
    if (folder) setOutput(folder as string);
  }

  function formatDur(s: number): string {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  }

  async function startMerge() {
    if (videos.length < 2) { alert("Minimal 2 video."); return; }
    if (!output) { alert("Pilih folder output."); return; }

    const fullPath = `${output}/${filename}`;
    setMerging(true);
    setProgress(null);
    setResultPath("");

    const { invoke, Channel } = await import("@tauri-apps/api/core");
    const channel = new Channel<MergeProgress>();
    channel.onmessage = (p) => {
      setProgress(p);
      if (p.stage === "Complete") {
        setResultPath(p.output_path);
        setMerging(false);
      }
    };

    try {
      await invoke("merge_videos", {
        videos: videos.map((v) => v.path),
        output: fullPath,
        onEvent: channel,
      });
    } catch (e) {
      setMerging(false);
      alert(`Merge gagal: ${e}`);
    }
  }

  async function openFile() {
    if (!resultPath) return;
    const { invoke } = await import("@tauri-apps/api/core");
    try { await invoke("open_folder", { path: resultPath }); }
    catch (e) { alert(`Error: ${e}`); }
  }

  async function openFolder() {
    if (!output) return;
    const { invoke } = await import("@tauri-apps/api/core");
    try { await invoke("open_folder", { path: output }); }
    catch (e) { alert(`Error: ${e}`); }
  }

  const [selected, setSelected] = useState<Set<number>>(new Set());

  function toggle(i: number) {
    const next = new Set(selected);
    if (next.has(i)) next.delete(i); else next.add(i);
    setSelected(next);
  }

  const totalDur = videos.reduce((s, v) => s + v.duration, 0);

  return (
    <div className="card">
      <h3>🔗 Video Merger</h3>
      <p style={{ fontSize: 13, color: "var(--text2)", marginBottom: 8 }}>
        Gabung multiple video jadi satu file tanpa re-encode (cepat).
      </p>

      <div className="btn-group">
        <button onClick={pickFiles}>📁 Import Videos</button>
        <button onClick={shuffle} disabled={videos.length < 2}>🔀 Shuffle</button>
        <button onClick={() => removeSelected(selected)} disabled={selected.size === 0} className="danger">🗑 Remove Selected</button>
        <button onClick={removeAll} disabled={videos.length === 0} className="danger">🗑 Remove All</button>
      </div>

      {videos.length === 0 ? (
        <div className="empty-state">No videos. Import files to merge.</div>
      ) : (
        <>
          <div style={{ fontSize: 13, color: "var(--text2)", margin: "4px 0" }}>
            Total: {videos.length} video &middot; {formatDur(totalDur)}
          </div>
          <div style={{ maxHeight: 250, overflowY: "auto" }}>
            <table>
              <thead>
                <tr>
                  <th style={{ width: 30 }}></th>
                  <th style={{ width: 40 }}>#</th>
                  <th>Filename</th>
                  <th>Duration</th>
                  <th style={{ width: 70 }}>Order</th>
                </tr>
              </thead>
              <tbody>
                {videos.map((v, i) => (
                  <tr key={i} className={selected.has(i) ? "selected" : ""}>
                    <td>
                      <input type="checkbox" checked={selected.has(i)} onChange={() => toggle(i)} />
                    </td>
                    <td>{i + 1}</td>
                    <td>{v.filename}</td>
                    <td>{formatDur(v.duration)}</td>
                    <td>
                      <button onClick={() => moveUp(i)} disabled={i === 0} style={{ padding: "0 6px", fontSize: 12 }}>▲</button>
                      <button onClick={() => moveDown(i)} disabled={i === videos.length - 1} style={{ padding: "0 6px", fontSize: 12, marginLeft: 4 }}>▼</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 12 }}>
        <button onClick={selectOutput}>📁 Output Folder</button>
        <span style={{ flex: 1, fontSize: 13, color: "var(--text2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {output || "Not selected"}
        </span>
        <input
          type="text"
          value={filename}
          onChange={(e) => setFilename(e.target.value)}
          style={{ width: 180 }}
        />
      </div>

      <div style={{ marginTop: 8 }}>
        <button
          className="primary"
          onClick={startMerge}
          disabled={merging || videos.length < 2 || !output}
          style={{ width: "100%" }}
        >
          {merging ? "⏳ Merging..." : "▶ Merge Videos"}
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
        </div>
      )}

      {resultPath && !merging && (
        <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
          <button onClick={openFile}>▶ Open File</button>
          <button onClick={openFolder}>📂 Open Folder</button>
          <button className="primary" onClick={() => { setResultPath(""); setProgress(null); }}>⟳ Merge Again</button>
        </div>
      )}
    </div>
  );
}