import { useState } from "react";
import { MusicFile, RemasterProgress, REMASTER_PRESETS } from "../types";

const REMASTER_PRESET_KEYS = Object.keys(REMASTER_PRESETS);

function formatTime(s: number): string {
  s = Math.round(s);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

interface Props {
  outputFolder: string;
  onOutputFolderChange: (v: string) => void;
}

export default function RemasterTool({ outputFolder, onOutputFolderChange }: Props) {
  const [files, setFiles] = useState<MusicFile[]>([]);
  const [preset, setPreset] = useState("warm_natural");
  const [outputFormat, setOutputFormat] = useState("mp3");
  const [remastering, setRemastering] = useState(false);
  const [progress, setProgress] = useState<RemasterProgress | null>(null);
  const [resultPaths, setResultPaths] = useState<string[]>([]);
  const [perFilePresets, setPerFilePresets] = useState<Record<number, string>>({});
  const [useLimiter, setUseLimiter] = useState(true);

  async function pickFiles() {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const result = await open({
      multiple: true,
      filters: [
        { name: "Audio", extensions: ["mp3", "wav", "flac", "aac", "m4a", "ogg"] },
      ],
    });
    if (!result) return;
    const paths = Array.isArray(result) ? result : [result];
    const { invoke } = await import("@tauri-apps/api/core");
    const existing = new Set(files.map((f) => f.path));
    const newFiles: MusicFile[] = [];
    for (const p of paths as string[]) {
      if (existing.has(p)) continue;
      try {
        const meta = await invoke<MusicFile>("get_music_metadata", { path: p });
        newFiles.push(meta);
      } catch { /* skip */ }
    }
    setFiles((prev) => [...prev, ...newFiles]);
  }

  async function pickFolder() {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const folder = await open({ directory: true });
    if (!folder) return;
    const { invoke } = await import("@tauri-apps/api/core");
    try {
      const scan = await invoke<{ videos: []; music: MusicFile[] }>("scan_folder", { path: folder });
      const existing = new Set(files.map((f) => f.path));
      const newFiles = scan.music.filter((m) => !existing.has(m.path));
      setFiles((prev) => [...prev, ...newFiles]);
    } catch (e) {
      alert(`Gagal scan folder: ${e}`);
    }
  }

  function removeSelected(selected: Set<number>) {
    setFiles(files.filter((_, i) => !selected.has(i)));
    const next = { ...perFilePresets };
    const idxs = [...selected].sort((a, b) => b - a);
    for (const idx of idxs) {
      delete next[idx];
      const shifted = Object.fromEntries(
        Object.entries(next).map(([k, v]) => [parseInt(k) > idx ? parseInt(k) - 1 : parseInt(k), v])
      );
      setPerFilePresets(shifted);
    }
  }

  function removeAll() {
    setFiles([]);
    setPerFilePresets({});
  }

  async function selectOutput() {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const folder = await open({ directory: true });
    if (folder) onOutputFolderChange(folder as string);
  }

  function getPresetFor(i: number): string {
    return perFilePresets[i] ?? preset;
  }

  function setPresetFor(i: number, p: string) {
    setPerFilePresets({ ...perFilePresets, [i]: p });
  }

  async function startRemaster() {
    if (files.length === 0) { alert("Import audio files first."); return; }
    if (!outputFolder) { alert("Pilih folder output."); return; }

    setRemastering(true);
    setProgress(null);
    setResultPaths([]);

    const { invoke, Channel } = await import("@tauri-apps/api/core");
    const channel = new Channel<RemasterProgress>();
    channel.onmessage = (p) => {
      setProgress(p);
      if (p.stage === "Complete") {
        setResultPaths(p.output_paths);
        setRemastering(false);
      }
    };

    try {
      const presets = files.map((_, i) => perFilePresets[i] || preset || "none");
      const results = await invoke<string[]>("remaster_audio", {
        files: files.map((f) => f.path),
        presets,
        outputFolder,
        outputFormat,
        useLimiter,
        onEvent: channel,
      });
      setResultPaths(results);
    } catch (e) {
      setRemastering(false);
      alert(`Remaster gagal: ${e}`);
    }
  }

  async function openFile(p: string) {
    const { invoke } = await import("@tauri-apps/api/core");
    try { await invoke("open_folder", { path: p }); }
    catch (e) { alert(`Error: ${e}`); }
  }

  async function openFolder() {
    if (!outputFolder) return;
    const { invoke } = await import("@tauri-apps/api/core");
    try { await invoke("open_folder", { path: outputFolder }); }
    catch (e) { alert(`Error: ${e}`); }
  }

  const [selected, setSelected] = useState<Set<number>>(new Set());

  function toggle(i: number) {
    const next = new Set(selected);
    if (next.has(i)) next.delete(i); else next.add(i);
    setSelected(next);
  }

  const totalDur = files.reduce((s, f) => s + f.duration, 0);
  const selectedPresetInfo = REMASTER_PRESETS[preset];

  return (
    <div className="card">
      <h3>🎛️ Audio Remaster</h3>
      <p style={{ fontSize: 13, color: "var(--text2)", marginBottom: 8 }}>
        Remaster audio agar lebih natural dan tidak terlalu "AI". Pilih preset sesuai genre.
      </p>

      <div className="btn-group">
        <button onClick={pickFiles}>🎵 Import Files</button>
        <button onClick={pickFolder}>📁 Import Folder</button>
        <button onClick={() => removeSelected(selected)} disabled={selected.size === 0} className="danger">
          🗑 Remove Selected
        </button>
        <button onClick={removeAll} disabled={files.length === 0} className="danger">
          🗑 Remove All
        </button>
      </div>

      {files.length === 0 ? (
        <div className="empty-state">Import audio files untuk memulai.</div>
      ) : (
        <>
          <div style={{ fontSize: 13, color: "var(--text2)", margin: "4px 0" }}>
            Total: {files.length} file &middot; {formatTime(totalDur)}
          </div>

          <div style={{ marginTop: 8 }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8, flexWrap: "wrap" }}>
              <div>
                <label style={{ fontSize: 12, color: "var(--text2)", marginBottom: 2 }}>
                  Preset Global
                </label>
                <select
                  value={preset}
                  onChange={(e) => setPreset(e.target.value)}
                  style={{ padding: "6px 10px", fontSize: 13, minWidth: 180 }}
                >
                  {REMASTER_PRESET_KEYS.map((key) => (
                    <option key={key} value={key}>
                      {REMASTER_PRESETS[key].icon} {REMASTER_PRESETS[key].label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 12, color: "var(--text2)", marginBottom: 2 }}>
                  Output Format
                </label>
                <select
                  value={outputFormat}
                  onChange={(e) => setOutputFormat(e.target.value)}
                  style={{ padding: "6px 10px", fontSize: 13 }}
                >
                  <option value="mp3">MP3 320kbps</option>
                  <option value="wav">WAV (lossless)</option>
                  <option value="flac">FLAC (lossless)</option>
                </select>
              </div>
              <div>
                <label style={{ fontSize: 12, color: "var(--text2)", marginBottom: 2 }}>
                  Limiter
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: 4, cursor: "pointer", fontSize: 13 }}>
                  <input
                    type="checkbox"
                    checked={useLimiter}
                    onChange={(e) => setUseLimiter(e.target.checked)}
                  />
                  {useLimiter ? "ON" : "OFF"}
                </label>
              </div>
            </div>
            {selectedPresetInfo && (
              <div style={{ fontSize: 12, color: "var(--text2)", marginBottom: 8 }}>
                <strong>{selectedPresetInfo.icon} {selectedPresetInfo.label}</strong>: {selectedPresetInfo.description}
              </div>
            )}
          </div>

          <div style={{ maxHeight: 300, overflowY: "auto", overscrollBehavior: "contain" }}>
            <table>
              <thead>
                <tr>
                  <th style={{ width: 30 }}></th>
                  <th style={{ width: 40 }}>#</th>
                  <th>Filename</th>
                  <th>Duration</th>
                  <th>Preset</th>
                </tr>
              </thead>
              <tbody>
                {files.map((f, i) => (
                  <tr key={i} className={selected.has(i) ? "selected" : ""}>
                    <td>
                      <input type="checkbox" checked={selected.has(i)} onChange={() => toggle(i)} />
                    </td>
                    <td>{i + 1}</td>
                    <td>{f.filename}</td>
                    <td>{formatTime(f.duration)}</td>
                    <td>
                      <select
                        value={getPresetFor(i)}
                        onChange={(e) => setPresetFor(i, e.target.value)}
                        style={{ padding: "2px 4px", fontSize: 11, maxWidth: 130 }}
                        title="Override preset per file"
                      >
                        <option value="">Use Global</option>
                        {REMASTER_PRESET_KEYS.map((key) => (
                          <option key={key} value={key}>{REMASTER_PRESETS[key].icon} {REMASTER_PRESETS[key].label}</option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 12 }}>
            <button onClick={selectOutput}>📁 Output Folder</button>
            <span style={{ flex: 1, fontSize: 13, color: "var(--text2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {outputFolder || "Not selected"}
            </span>
          </div>

          <div style={{ marginTop: 8 }}>
            <button
              className="primary"
              onClick={startRemaster}
              disabled={remastering || files.length === 0 || !outputFolder}
              style={{ width: "100%" }}
            >
              {remastering ? `⏳ Remastering ${progress?.current_file ?? 0}/${progress?.total_files ?? files.length}...` : "🎛️ Start Remaster"}
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
              {progress.current_filename && (
                <div style={{ fontSize: 12, color: "var(--text2)", marginTop: 4 }}>
                  File: {progress.current_filename}
                </div>
              )}
            </div>
          )}

          {resultPaths.length > 0 && !remastering && (
            <div style={{ marginTop: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                <strong style={{ fontSize: 14 }}>Hasil ({resultPaths.length} file)</strong>
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={openFolder}>📂 Open Folder</button>
                  <button className="primary" onClick={() => { setResultPaths([]); setProgress(null); }}>
                    ⟳ Remaster Again
                  </button>
                </div>
              </div>
              <div style={{ maxHeight: 250, overflowY: "auto", overscrollBehavior: "contain" }}>
                <table>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>File</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {resultPaths.map((p, i) => (
                      <tr key={i}>
                        <td>{i + 1}</td>
                        <td style={{ fontSize: 12, maxWidth: 300, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {p.split("/").pop() || p}
                        </td>
                        <td>
                          <button onClick={() => openFile(p)} style={{ padding: "0 8px", fontSize: 12 }}>
                            ▶
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
