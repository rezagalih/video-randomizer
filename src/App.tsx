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

interface PersistedState {
  videos: VideoFile[];
  music: MusicFile[];
  sequence: SequenceItem[];
  settings: RenderSettings;
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
      } catch {
        // no saved state, use defaults
      }
      loaded.current = true;
    })();
  }, []);

  const save = useCallback(async (v: VideoFile[], m: MusicFile[], seq: SequenceItem[], s: RenderSettings) => {
    if (!statePath.current) return;
    const { invoke } = await import("@tauri-apps/api/core");
    const data: PersistedState = { videos: v, music: m, sequence: seq, settings: s };
    try {
      await invoke("save_state", { path: statePath.current, data });
    } catch { /* ignore save errors */ }
  }, []);

  useEffect(() => {
    if (!loaded.current) return;
    save(videos, music, sequence, settings);
  }, [videos, music, sequence, settings]);

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
              <SequenceDisplay
                sequence={sequence}
                totalDuration={sequence.reduce((a, b) => a + b.duration, 0)}
                onRegenerate={handleGenerateSequence}
              />
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
