import { useState } from "react";
import { VideoFile, MusicFile, ScanResult } from "../types";

interface Props {
  open: boolean;
  onClose: () => void;
  onAddJob: (data: {
    intro: VideoFile | null;
    videos: VideoFile[];
    music: MusicFile[];
    musicOrder: number[];
    durationMode: "fixed" | "fixed_complete_last_song" | "selected_songs";
    fixedDurationMinutes: number;
  }) => Promise<void>;
}

const STEPS = ["Intro", "Footage", "Music", "Duration", "Queue"];

function formatDur(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

export default function WizardModal({ open, onClose, onAddJob }: Props) {
  const [step, setStep] = useState(0);
  const [adding, setAdding] = useState(false);

  const [intro, setIntro] = useState<VideoFile | null>(null);
  const [videos, setVideos] = useState<VideoFile[]>([]);
  const [music, setMusic] = useState<MusicFile[]>([]);
  const [musicOrder, setMusicOrder] = useState<number[]>([]);
  const [durationMode, setDurationMode] = useState<"fixed" | "fixed_complete_last_song" | "selected_songs">("fixed");
  const [fixedDurationMinutes, setFixedDurationMinutes] = useState(30);

  if (!open) return null;

  function reset() {
    setStep(0);
    setIntro(null);
    setVideos([]);
    setMusic([]);
    setMusicOrder([]);
    setDurationMode("fixed");
    setFixedDurationMinutes(30);
    setAdding(false);
  }

  function handleClose() {
    reset();
    onClose();
  }

  async function pickIntro() {
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
      setIntro(meta);
    } catch {
      alert("Could not read intro video metadata.");
    }
  }

  async function pickVideoFiles() {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const files = await open({
      multiple: true,
      filters: [{ name: "Video", extensions: ["mp4", "mov", "mkv", "webm"] }],
    });
    if (!files) return;
    const paths = Array.isArray(files) ? files : [files];
    const { invoke } = await import("@tauri-apps/api/core");
    const existing = new Set(videos.map(v => v.path));
    const newVids: VideoFile[] = [];
    for (const p of paths as string[]) {
      if (existing.has(p)) continue;
      try {
        const meta = await invoke<VideoFile>("get_video_metadata", { path: p });
        newVids.push(meta);
      } catch { /* skip */ }
    }
    setVideos(prev => [...prev, ...newVids]);
  }

  async function pickVideoFolder() {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const folder = await open({ directory: true });
    if (!folder) return;
    const { invoke } = await import("@tauri-apps/api/core");
    try {
      const result = await invoke<ScanResult>("scan_folder", { path: folder });
      const existing = new Set(videos.map(v => v.path));
      const newVids = result.videos.filter(v => !existing.has(v.path));
      setVideos(prev => [...prev, ...newVids]);
    } catch { /* skip */ }
  }

  function removeVideo(i: number) {
    setVideos(prev => prev.filter((_, idx) => idx !== i));
  }

  function removeAllVideos() {
    setVideos([]);
  }

  async function pickMusicFiles() {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const files = await open({
      multiple: true,
      filters: [{ name: "Music", extensions: ["mp3", "wav", "flac", "aac", "m4a"] }],
    });
    if (!files) return;
    const paths = Array.isArray(files) ? files : [files];
    const { invoke } = await import("@tauri-apps/api/core");
    const existing = new Set(music.map(m => m.path));
    const newMusic: MusicFile[] = [];
    for (const p of paths as string[]) {
      if (existing.has(p)) continue;
      try {
        const meta = await invoke<MusicFile>("get_music_metadata", { path: p });
        newMusic.push(meta);
      } catch { /* skip */ }
    }
    const startIdx = music.length;
    setMusic(prev => [...prev, ...newMusic]);
    setMusicOrder(prev => [...prev, ...newMusic.map((_, i) => startIdx + i)]);
  }

  async function pickMusicFolder() {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const folder = await open({ directory: true });
    if (!folder) return;
    const { invoke } = await import("@tauri-apps/api/core");
    try {
      const result = await invoke<ScanResult>("scan_folder", { path: folder });
      const existing = new Set(music.map(m => m.path));
      const newMusic = result.music.filter(m => !existing.has(m.path));
      const startIdx = music.length;
      setMusic(prev => [...prev, ...newMusic]);
      setMusicOrder(prev => [...prev, ...newMusic.map((_, i) => startIdx + i)]);
    } catch { /* skip */ }
  }

  function removeMusic(i: number) {
    setMusic(prev => {
      const updated = prev.filter((_, idx) => idx !== i);
      setMusicOrder(prevOrder => {
        const filtered = prevOrder.filter(idx => idx !== i).map(idx => idx > i ? idx - 1 : idx);
        return filtered;
      });
      return updated;
    });
  }

  function removeAllMusic() {
    setMusic([]);
    setMusicOrder([]);
  }

  function shuffleMusic() {
    setMusicOrder(prev => {
      const arr = [...prev];
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr;
    });
  }

  async function handleAddToQueue() {
    if (videos.length === 0) { alert("Select at least one video footage."); return; }
    if (music.length === 0) { alert("Select at least one music file."); return; }
    setAdding(true);
    try {
      await onAddJob({ intro, videos, music, musicOrder, durationMode, fixedDurationMinutes });
      reset();
      onClose();
    } catch (e) {
      alert(`Failed to add job: ${e}`);
    } finally {
      setAdding(false);
    }
  }

  const canNext = (() => {
    switch (step) {
      case 0: return true;
      case 1: return videos.length > 0;
      case 2: return music.length > 0;
      case 3: return true;
      default: return true;
    }
  })();

  function renderStep() {
    switch (step) {
      case 0:
        return (
          <div>
            <p className="hint" style={{ marginBottom: 16 }}>Select an intro video or skip this step.</p>
            <div className="btn-group">
              {!intro ? (
                <button onClick={pickIntro}>Select Intro Video</button>
              ) : (
                <>
                  <button onClick={pickIntro}>Change</button>
                  <button className="danger" onClick={() => setIntro(null)}>Remove</button>
                </>
              )}
            </div>
            {intro ? (
              <div style={{ marginTop: 8, padding: 12, background: "var(--surface2)", borderRadius: 6 }}>
                <div style={{ fontWeight: 600 }}>{intro.filename}</div>
                <div style={{ fontSize: 13, color: "var(--text2)" }}>
                  {formatDur(intro.duration)} &middot; {intro.width}x{intro.height} &middot; {intro.fps.toFixed(1)}fps
                </div>
              </div>
            ) : (
              <div className="empty-state" style={{ padding: 20 }}>No intro video selected. The video will start without an intro.</div>
            )}
          </div>
        );

      case 1:
        return (
          <div>
            <p className="hint" style={{ marginBottom: 16 }}>Select video footage to include in the video.</p>
            <div className="btn-group">
              <button onClick={pickVideoFiles}>📁 Add Video Files</button>
              <button onClick={pickVideoFolder}>📂 Add Video Folder</button>
              <button className="danger" onClick={removeAllVideos} disabled={videos.length === 0}>🗑 Remove All</button>
            </div>
            {videos.length === 0 ? (
              <div className="empty-state" style={{ padding: 20 }}>No videos selected.</div>
            ) : (
              <div style={{ maxHeight: 250, overflowY: "auto" }}>
                <table>
                  <thead>
                    <tr>
                      <th>Filename</th>
                      <th>Duration</th>
                      <th>Resolution</th>
                      <th style={{ width: 50 }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {videos.map((v, i) => (
                      <tr key={i}>
                        <td>{v.filename}</td>
                        <td>{formatDur(v.duration)}</td>
                        <td>{v.width}x{v.height}</td>
                        <td>
                          <button
                            style={{ fontSize: 11, padding: "2px 8px" }}
                            onClick={() => removeVideo(i)}
                          >✕</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );

      case 2:
        return (
          <div>
            <p className="hint" style={{ marginBottom: 16 }}>Select music tracks for the video soundtrack.</p>
            <div className="btn-group">
              <button onClick={pickMusicFiles}>🎵 Add Music Files</button>
              <button onClick={pickMusicFolder}>📂 Add Music Folder</button>
              <button onClick={shuffleMusic} disabled={music.length < 2}>🔀 Shuffle</button>
              <button className="danger" onClick={removeAllMusic} disabled={music.length === 0}>🗑 Remove All</button>
            </div>
            {music.length === 0 ? (
              <div className="empty-state" style={{ padding: 20 }}>No music selected.</div>
            ) : (
              <div style={{ maxHeight: 250, overflowY: "auto" }}>
                <table>
                  <thead>
                    <tr>
                      <th style={{ width: 30 }}>#</th>
                      <th>Filename</th>
                      <th>Duration</th>
                      <th style={{ width: 50 }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {musicOrder.map((idx, i) => (
                      <tr key={idx}>
                        <td>{i + 1}</td>
                        <td>{music[idx].filename}</td>
                        <td>{formatDur(music[idx].duration)}</td>
                        <td>
                          <button
                            style={{ fontSize: 11, padding: "2px 8px" }}
                            onClick={() => removeMusic(idx)}
                          >✕</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );

      case 3:
        return (
          <div>
            <p className="hint" style={{ marginBottom: 16 }}>Choose how the final video duration is determined.</p>
            <div className="form-group">
              <label style={{ cursor: "pointer", padding: "10px 12px", border: "1px solid var(--border)", borderRadius: 6, marginBottom: 8, background: durationMode === "fixed" ? "var(--surface2)" : undefined }}>
                <input
                  type="radio"
                  name="durationMode"
                  checked={durationMode === "fixed"}
                  onChange={() => setDurationMode("fixed")}
                />
                Fixed Duration
              </label>
              {durationMode === "fixed" && (
                <div style={{ marginLeft: 28, marginBottom: 12 }}>
                  <label style={{ marginBottom: 4, display: "block", fontSize: 13, color: "var(--text2)" }}>Duration (minutes):</label>
                  <input
                    type="number"
                    min={1}
                    value={fixedDurationMinutes}
                    onChange={e => setFixedDurationMinutes(Math.max(1, Number(e.target.value)))}
                    style={{ width: 120 }}
                  />
                </div>
              )}
              <label style={{ cursor: "pointer", padding: "10px 12px", border: "1px solid var(--border)", borderRadius: 6, marginBottom: 8, display: "block", background: durationMode === "fixed_complete_last_song" ? "var(--surface2)" : undefined }}>
                <input
                  type="radio"
                  name="durationMode"
                  checked={durationMode === "fixed_complete_last_song"}
                  onChange={() => setDurationMode("fixed_complete_last_song")}
                />
                Fixed Duration + Complete Last Song
              </label>
              {durationMode === "fixed_complete_last_song" && (
                <div style={{ marginLeft: 28, marginBottom: 12 }}>
                  <label style={{ marginBottom: 4, display: "block", fontSize: 13, color: "var(--text2)" }}>Target duration (minutes):</label>
                  <input
                    type="number"
                    min={1}
                    value={fixedDurationMinutes}
                    onChange={e => setFixedDurationMinutes(Math.max(1, Number(e.target.value)))}
                    style={{ width: 120 }}
                  />
                </div>
              )}
              <label style={{ cursor: "pointer", padding: "10px 12px", border: "1px solid var(--border)", borderRadius: 6, display: "block", background: durationMode === "selected_songs" ? "var(--surface2)" : undefined }}>
                <input
                  type="radio"
                  name="durationMode"
                  checked={durationMode === "selected_songs"}
                  onChange={() => setDurationMode("selected_songs")}
                />
                Selected Songs Duration
              </label>
            </div>
            {durationMode === "selected_songs" && (
              <p style={{ fontSize: 13, color: "var(--text2)", marginTop: 8 }}>
                Total music duration: {formatDur(music.reduce((s, m) => s + m.duration, 0))}
              </p>
            )}
          </div>
        );

      case 4:
        const totalMusicDur = music.reduce((s, m) => s + m.duration, 0);
        const totalVideoDur = videos.reduce((s, v) => s + v.duration, 0);
        return (
          <div>
            <p className="hint" style={{ marginBottom: 16 }}>Review your selections before adding to the queue.</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div className="card" style={{ padding: 12 }}>
                <strong>Intro:</strong> {intro ? intro.filename : "No intro"}
              </div>
              <div className="card" style={{ padding: 12 }}>
                <strong>Footage:</strong> {videos.length} file(s) &middot; Total: {formatDur(totalVideoDur)}
              </div>
              <div className="card" style={{ padding: 12 }}>
                <strong>Music:</strong> {music.length} file(s) &middot; Total: {formatDur(totalMusicDur)}
              </div>
              <div className="card" style={{ padding: 12 }}>
                <strong>Duration:</strong>{" "}
                {durationMode === "fixed" && `Fixed (${fixedDurationMinutes} min)`}
                {durationMode === "fixed_complete_last_song" && `Fixed + Complete Last Song (${fixedDurationMinutes} min)`}
                {durationMode === "selected_songs" && "Selected Songs Duration"}
              </div>
            </div>
          </div>
        );
    }
  }

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>✨ Wizard Mode</h2>
          <button className="modal-close" onClick={handleClose}>✕</button>
        </div>

        <div className="step-indicator">
          {STEPS.map((label, i) => (
            <div key={i} className={`step-dot ${i === step ? "active" : ""} ${i < step ? "done" : ""}`}>
              <span className="step-number">{i < step ? "✓" : i + 1}</span>
              <span className="step-label">{label}</span>
            </div>
          ))}
        </div>

        <div className="modal-body">
          {renderStep()}
        </div>

        <div className="modal-footer">
          <button onClick={handleClose}>Cancel</button>
          {step > 0 && <button onClick={() => setStep(s => s - 1)}>← Back</button>}
          <div style={{ flex: 1 }} />
          {step < STEPS.length - 1 ? (
            <button className="primary" disabled={!canNext} onClick={() => setStep(s => s + 1)}>
              Next →
            </button>
          ) : (
            <button className="primary" disabled={adding} onClick={handleAddToQueue}>
              {adding ? "Adding..." : "+ Add to Queue"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
