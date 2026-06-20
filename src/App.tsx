import { useState, useEffect, useCallback, useRef } from "react";
import { VideoFile, MusicFile, SequenceItem, RenderSettings, RenderProgress } from "./types";
import VideoImport from "./components/VideoImport";
import MusicImport from "./components/MusicImport";
import PlaybackStrategy from "./components/PlaybackStrategy";
import DurationSettings from "./components/DurationSettings";
import EncodingSettings from "./components/EncodingSettings";
import TransitionSettings from "./components/TransitionSettings";
import OutputSettings from "./components/OutputSettings";
import WatermarkSettings from "./components/WatermarkSettings";
import SequenceDisplay from "./components/SequenceDisplay";
import RenderProgressPanel from "./components/RenderProgress";

type Tab = "import" | "settings" | "render";

function defaultSettings(): RenderSettings {
  const now = new Date();
  const ts =
    now.getFullYear().toString() +
    (now.getMonth() + 1).toString().padStart(2, "0") +
    now.getDate().toString().padStart(2, "0") +
    "_" +
    now.getHours().toString().padStart(2, "0") +
    now.getMinutes().toString().padStart(2, "0") +
    now.getSeconds().toString().padStart(2, "0");

  return {
    video_playback_mode: "shuffle",
    music_playback_mode: "shuffle",
    processing_mode: "segment_loop",
    duration_mode: { type: "fixed", value: 1800 },
    mute_source_audio: true,
    encoding_speed: "balanced",
    encoder_mode: "auto",
    resolution: { type: "original" },
    fps: { type: "keep_original" },
    fade_duration: 0.5,
    output_filename: `${ts}.mp4`,
    output_folder: "",
    loop_playlist: true,
    clip_duration: 10,
    prevent_duplicates: true,
    delete_cache: true,
    watermark: {
      enabled: false,
      image_path: "",
      position_x: 50,
      position_y: 50,
      scale: 10,
    },
  };
}

function formatDuration(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  if (h > 0) return `${h}h${m}m`;
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

interface PersistedState {
  videos: VideoFile[];
  music: MusicFile[];
  sequence: SequenceItem[];
  settings: RenderSettings;
  musicOrder: number[];
}

export default function App() {
  const [tab, setTab] = useState<Tab>("import");
  const [videos, setVideos] = useState<VideoFile[]>([]);
  const [music, setMusic] = useState<MusicFile[]>([]);
  const [sequence, setSequence] = useState<SequenceItem[]>([]);
  const [settings, setSettings] = useState<RenderSettings>(defaultSettings);
  const [isRendering, setIsRendering] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [progress, setProgress] = useState<RenderProgress | null>(null);
  const [outputPath, setOutputPath] = useState<string>("");
  const [musicOrder, setMusicOrder] = useState<number[]>([]);
  const statePath = useRef<string>("");
  const loaded = useRef(false);

  useEffect(() => {
    (async () => {
      const { invoke } = await import("@tauri-apps/api/core");
      const path = await invoke<string>("get_state_path");
      statePath.current = path;
      try {
        const data = await invoke<PersistedState>("load_state", { path });
        setVideos(data.videos || []);
        setMusic(data.music || []);
        setSequence(data.sequence || []);
        if (data.settings) setSettings({ ...defaultSettings(), ...data.settings });
        if (data.musicOrder) setMusicOrder(data.musicOrder);
      } catch {
        // no saved state, use defaults
      }
      loaded.current = true;
    })();
  }, []);

  const save = useCallback(async (v: VideoFile[], m: MusicFile[], seq: SequenceItem[], s: RenderSettings, mo: number[]) => {
    if (!statePath.current) return;
    const { invoke } = await import("@tauri-apps/api/core");
    const data: PersistedState = { videos: v, music: m, sequence: seq, settings: s, musicOrder: mo };
    try {
      await invoke("save_state", { path: statePath.current, data });
    } catch { /* ignore save errors */ }
  }, []);

  useEffect(() => {
    if (!loaded.current) return;
    save(videos, music, sequence, settings, musicOrder);
  }, [videos, music, sequence, settings, musicOrder]);

  // auto-generate when entering render tab
  useEffect(() => {
    if (!loaded.current || tab !== "render") return;
    if (videos.length > 0 && sequence.length === 0) {
      handleRegenerateVideo();
    }
    if (music.length > 0 && musicOrder.length === 0) {
      handleMusicOrder();
    }
  }, [tab]);

  function computeMusicPlaylist(baseOrder: number[]): { order: number[]; total: number } {
    if (baseOrder.length === 0 || music.length === 0) return { order: [], total: 0 };

    const target = (() => {
      switch (settings.duration_mode.type) {
        case "fixed": return settings.duration_mode.value;
        case "fixed_complete_last_song": return settings.duration_mode.value;
        case "selected_songs": return music.reduce((s, m) => s + m.duration, 0);
      }
    })();

    const order: number[] = [];
    let acc = 0;

    if (settings.loop_playlist) {
      outer: while (true) {
        for (const idx of baseOrder) {
          order.push(idx);
          acc += music[idx].duration;
          if (acc >= target) break outer;
        }
      }
    } else {
      for (const idx of baseOrder) {
        order.push(idx);
        acc += music[idx].duration;
        if (acc >= target) break;
      }
      if (acc < target) {
        const last = baseOrder[baseOrder.length - 1] ?? 0;
        while (acc < target) {
          order.push(last);
          acc += music[last].duration;
        }
      }
    }

    const total = settings.duration_mode.type === "fixed"
      ? settings.duration_mode.value
      : acc;

    return { order, total };
  }

  async function handleRegenerateVideo() {
    if (videos.length === 0) return;
    const { invoke } = await import("@tauri-apps/api/core");
    try {
      const seq = await invoke<SequenceItem[]>("generate_sequence", {
        videos,
        mode: settings.video_playback_mode,
        clipDuration: settings.clip_duration,
        preventDuplicates: settings.prevent_duplicates,
      });
      setSequence(seq);
    } catch (e) {
      alert(`Failed to regenerate video sequence: ${e}`);
    }
  }

  async function handleMusicOrder() {
    if (music.length === 0) return;
    const { invoke } = await import("@tauri-apps/api/core");
    try {
      const baseOrder = await invoke<number[]>("generate_music_order", {
        music,
        mode: settings.music_playback_mode,
      });
      const { order } = computeMusicPlaylist(baseOrder);
      setMusicOrder(order);
    } catch (e) {
      alert(`Failed to generate music order: ${e}`);
    }
  }

  async function handleGenerateSequence() {
    if (videos.length === 0) return;
    const { invoke } = await import("@tauri-apps/api/core");
    try {
      const seq = await invoke<SequenceItem[]>("generate_sequence", {
        videos,
        mode: settings.video_playback_mode,
        clipDuration: settings.clip_duration,
        preventDuplicates: settings.prevent_duplicates,
      });
      setSequence(seq);
      if (music.length > 0) {
        const baseOrder = await invoke<number[]>("generate_music_order", {
          music,
          mode: settings.music_playback_mode,
        });
        const { order } = computeMusicPlaylist(baseOrder);
        setMusicOrder(order);
      }
      setTab("render");
    } catch (e) {
      alert(`Failed to generate sequence: ${e}`);
    }
  }

  async function handleStartRender() {
    if (sequence.length === 0) {
      alert("Generate a video sequence first.");
      return;
    }
    if (music.length === 0) {
      alert("Import music files first.");
      return;
    }
    if (!settings.output_folder) {
      alert("Select an output folder first.");
      return;
    }

    setIsRendering(true);
    setIsPaused(false);
    setProgress(null);
    setOutputPath("");

    const { invoke, Channel } = await import("@tauri-apps/api/core");

    const channel = new Channel<RenderProgress>();
    channel.onmessage = (p) => {
      setProgress(p);
      if (p.stage === "Complete") {
        setOutputPath(p.current_file);
        setIsRendering(false);
      }
    };

    try {
      await invoke<string>("start_render", {
        music,
        sequence,
        settings,
        onEvent: channel,
      });
    } catch (e) {
      setIsRendering(false);
      alert(`Render failed: ${e}`);
    }
  }

  async function handleCancel() {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("cancel_render");
    setIsRendering(false);
    setIsPaused(false);
  }

  async function handlePause() {
    const { invoke } = await import("@tauri-apps/api/core");
    const paused = await invoke<boolean>("pause_render");
    setIsPaused(paused);
  }

  async function handleOpenFile() {
    if (!outputPath) return;
    const { invoke } = await import("@tauri-apps/api/core");
    try {
      await invoke("open_folder", { path: outputPath });
    } catch (e) {
      alert(`Tidak dapat membuka file: ${e}`);
    }
  }

  async function handleOpenFolder() {
    if (!settings.output_folder) return;
    const { invoke } = await import("@tauri-apps/api/core");
    try {
      await invoke("open_folder", { path: settings.output_folder });
    } catch (e) {
      alert(`Tidak dapat membuka folder: ${e}`);
    }
  }

  return (
    <>
      <header>
        <h1>Video Randomizer Looper</h1>
        <span>
          {videos.length > 0 && <span className="badge badge-video">{videos.length} videos</span>}{" "}
          {music.length > 0 && <span className="badge badge-music">{music.length} tracks</span>}
        </span>
      </header>
      <div className="tabs">
        <button className={tab === "import" ? "active" : ""} onClick={() => setTab("import")}>
          📂 Import
        </button>
        <button className={tab === "settings" ? "active" : ""} onClick={() => setTab("settings")}>
          ⚙️ Settings
        </button>
        <button className={tab === "render" ? "active" : ""} onClick={() => setTab("render")}>
          🎬 Render
        </button>
      </div>
      <main>
        {tab === "import" && (
          <div className="panel">
            <div className="grid-2">
              <VideoImport videos={videos} onVideosChange={setVideos} />
              <MusicImport music={music} onMusicChange={setMusic} />
            </div>
          </div>
        )}
        {tab === "settings" && (
          <div className="panel">
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <PlaybackStrategy
                settings={settings}
                onChange={setSettings}
              />
              <DurationSettings settings={settings} onChange={setSettings} />
              <EncodingSettings settings={settings} onChange={setSettings} />
              <TransitionSettings settings={settings} onChange={setSettings} />
              <OutputSettings settings={settings} onChange={setSettings} />
              <WatermarkSettings settings={settings} onChange={setSettings} videos={videos} />
            </div>
          </div>
        )}
        {tab === "render" && (
          <div className="panel">
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div className="grid-2">
                <SequenceDisplay
                  sequence={sequence}
                  totalDuration={sequence.reduce((a, b) => a + b.duration, 0)}
                  onRegenerate={handleRegenerateVideo}
                />
                <div className="card">
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                    <h3 style={{ margin: 0 }}>🎵 Music Order</h3>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      {musicOrder.length > 0 && (
                        <span style={{ fontSize: 13, color: "var(--text2)" }}>
                          Total: {formatDuration(musicOrder.reduce((s, i) => s + (music[i]?.duration || 0), 0))}
                        </span>
                      )}
                      <button onClick={handleMusicOrder}>🔄 Regenerate</button>
                    </div>
                  </div>
                  {musicOrder.length === 0 ? (
                    <div className="empty-state">No music order generated.</div>
                  ) : (
                    <div style={{ maxHeight: 200, overflowY: "auto" }}>
                      <table>
                        <thead>
                          <tr>
                            <th>#</th>
                            <th>Track</th>
                            <th>Duration</th>
                          </tr>
                        </thead>
                        <tbody>
                          {musicOrder.map((idx, i) => (
                            <tr key={i}>
                              <td>{i + 1}</td>
                              <td>{music[idx]?.filename || "?"}</td>
                              <td>{formatDuration(music[idx]?.duration || 0)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
              <RenderProgressPanel
                progress={progress}
                isRendering={isRendering}
                isPaused={isPaused}
                outputPath={outputPath}
                outputFolder={settings.output_folder}
                onCancel={handleCancel}
                onPause={handlePause}
                onOpenFolder={handleOpenFolder}
                onOpenFile={handleOpenFile}
              />
            </div>
          </div>
        )}
      </main>
      {tab !== "render" && (
        <div className="footer-actions">
          {tab === "import" && (
            <button className="primary" disabled={videos.length === 0 || music.length === 0} onClick={() => setTab("settings")}>
              ⚙️ Next: Settings →
            </button>
          )}
          {tab === "settings" && (
            <>
              <button onClick={() => setTab("import")}>← Back</button>
              <button className="primary" onClick={handleGenerateSequence}>
                🎬 Next: Render →
              </button>
            </>
          )}
        </div>
      )}
      {tab === "render" && !isRendering && !outputPath && (
        <div className="footer-actions">
          <button onClick={() => setTab("settings")}>← Back to Settings</button>
          <button
            className="primary"
            onClick={handleStartRender}
            disabled={sequence.length === 0 || music.length === 0}
          >
            ▶ Start Render
          </button>
        </div>
      )}
      {tab === "render" && !isRendering && outputPath && (
        <div className="footer-actions">
          <button onClick={() => setTab("settings")}>← Back to Settings</button>
          <button onClick={handleOpenFile}>▶ Open File</button>
          <button onClick={handleOpenFolder}>📂 Open Folder</button>
          <button className="primary" onClick={handleStartRender}>▶ Render Again</button>
        </div>
      )}
    </>
  );
}
