import { useState } from "react";
import { MusicFile, ScanResult } from "../types";

interface Props {
  music: MusicFile[];
  onMusicChange: (m: MusicFile[]) => void;
  musicFolders: string[];
  onMusicFoldersChange: (f: string[]) => void;
}

export default function MusicImport({ music, onMusicChange, musicFolders, onMusicFoldersChange }: Props) {
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(false);

  async function pickFiles() {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const files = await open({
      multiple: true,
      filters: [{ name: "Music", extensions: ["mp3", "wav", "flac", "aac", "m4a"] }],
    });
    if (!files) return;
    const paths = Array.isArray(files) ? files : [files];
    await addMusic(paths as string[]);
  }

  async function pickFolder() {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const folder = await open({ directory: true });
    if (!folder) return;
    setLoading(true);
    const { invoke } = await import("@tauri-apps/api/core");
    try {
      const result = await invoke<ScanResult>("scan_folder", { path: folder });
      const existing = new Set(music.map((m) => m.path));
      const newMusic = result.music.filter((m) => !existing.has(m.path));
      onMusicChange([...music, ...newMusic]);
      if (!musicFolders.includes(folder as string)) {
        onMusicFoldersChange([...musicFolders, folder as string]);
      }
    } finally {
      setLoading(false);
    }
  }

  function removeFolder(folder: string) {
    onMusicFoldersChange(musicFolders.filter((f) => f !== folder));
    const prefix = folder.endsWith("/") || folder.endsWith("\\") ? folder : folder + "/";
    onMusicChange(music.filter((m) => !m.path.startsWith(prefix)));
  }

  async function addMusic(paths: string[]) {
    const { invoke } = await import("@tauri-apps/api/core");
    const existing = new Set(music.map((m) => m.path));
    const newMusic: MusicFile[] = [];
    for (const p of paths) {
      if (existing.has(p)) continue;
      try {
        const meta = await invoke<MusicFile>("get_music_metadata", { path: p });
        newMusic.push(meta);
      } catch { /* skip */ }
    }
    onMusicChange([...music, ...newMusic]);
  }

  function removeSelected() {
    const remaining = music.filter((_, i) => !selected.has(i));
    onMusicChange(remaining);
    setSelected(new Set());
  }

  function removeAll() {
    onMusicChange([]);
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
      <h3>🎵 Music Files</h3>
      <div className="btn-group">
        <button onClick={pickFiles}>📁 Import Files</button>
        <button onClick={pickFolder} disabled={loading}>
          {loading ? "⏳ Scanning..." : "📂 Import Folder"}
        </button>
        <button onClick={removeSelected} disabled={selected.size === 0} className="danger">
          🗑 Remove Selected
        </button>
        <button onClick={removeAll} disabled={music.length === 0} className="danger">
          🗑 Remove All
        </button>
      </div>
      {musicFolders.length > 0 && (
        <div style={{ margin: "8px 0", padding: "8px", background: "var(--bg2)", borderRadius: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4, color: "var(--text2)" }}>Source Folders:</div>
          {musicFolders.map((f, i) => (
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
      {music.length === 0 ? (
        <div className="empty-state">No music imported. Click Import Files or Import Folder to add music.</div>
      ) : (
        <div style={{ maxHeight: 300, overflowY: "auto" }}>
          <table>
            <thead>
              <tr>
                <th style={{ width: 30 }}></th>
                <th>Filename</th>
                <th>Duration</th>
              </tr>
            </thead>
            <tbody>
              {music.map((m, i) => (
                <tr key={i} className={selected.has(i) ? "selected" : ""} onClick={() => toggle(i)}>
                  <td>
                    <input type="checkbox" checked={selected.has(i)} onChange={() => toggle(i)} />
                  </td>
                  <td>{m.filename}</td>
                  <td>{formatDur(m.duration)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
