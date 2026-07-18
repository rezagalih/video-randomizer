import { useState, useEffect, useCallback, useRef } from "react";
import { AudioNormalization, VideoFile, MusicFile, SequenceItem, RenderSettings, RenderProgress, QueueItem, QueueStatus } from "./types";
import VideoImport from "./components/VideoImport";
import MusicImport from "./components/MusicImport";
import PlaybackStrategy from "./components/PlaybackStrategy";
import DurationSettings from "./components/DurationSettings";
import EncodingSettings from "./components/EncodingSettings";
import AmbientImport from "./components/AmbientImport";
import TransitionSettings from "./components/TransitionSettings";
import OutputSettings from "./components/OutputSettings";
import WatermarkSettings from "./components/WatermarkSettings";
import CutRandomSettings from "./components/CutRandomSettings";
import IntroImport from "./components/IntroImport";
import SequenceDisplay from "./components/SequenceDisplay";
import RenderProgressPanel from "./components/RenderProgress";
import QueuePanel from "./components/QueuePanel";
import MergerTool from "./components/MergerTool";
import TrimmerTool from "./components/TrimmerTool";
import LiveOptimizerTool from "./components/LiveOptimizerTool";
import WizardModal from "./components/WizardModal";

type Tab = "import" | "settings" | "render" | "merger" | "trimmer" | "live_optimizer";

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
    cut_random_enabled: false,
    cut_random_min: 3,
    cut_random_max: 5,
    audio_normalization: { type: "off" },
    ambient_enabled: false,
    ambient_path: "",
    music_volume: 0.8,
    ambient_volume: 0.3,
    crf: 23,
  };
}

function formatDuration(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  if (h > 0) return `${h}h${m}m`;
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

function durationModeLabel(mode: RenderSettings["duration_mode"]): string {
  switch (mode.type) {
    case "fixed":
      return `Fixed Duration: ${formatDuration(mode.value)}`;
    case "fixed_complete_last_song":
      return `Fixed Duration + Complete Last Song: ${formatDuration(mode.value)}`;
    case "selected_songs":
      return "Selected Songs Duration";
  }
}

function ensureMp4Extension(filename: string): string {
  const trimmed = filename.trim();
  if (!trimmed) return "untitled.mp4";
  return /\.[^./\\]+$/.test(trimmed) ? trimmed : `${trimmed}.mp4`;
}

function uniqueQueueFilename(filename: string, queue: QueueItem[], excludeId?: string): string {
  const existing = new Set(
    queue
      .filter(j => j.id !== excludeId && j.status === "pending")
      .map(j => j.settings.output_filename)
  );
  let unique = ensureMp4Extension(filename);
  if (!existing.has(unique)) return unique;

  const dotIdx = unique.lastIndexOf(".");
  const base = dotIdx > 0 ? unique.slice(0, dotIdx) : unique;
  const ext = dotIdx > 0 ? unique.slice(dotIdx) : "";
  let counter = 1;
  while (existing.has(`${base} (${counter})${ext}`)) {
    counter++;
  }
  return `${base} (${counter})${ext}`;
}

interface PersistedState {
  videos: VideoFile[];
  music: MusicFile[];
  sequence: SequenceItem[];
  settings: RenderSettings;
  musicOrder: number[];
  introVideo?: VideoFile | null;
  videoFolders?: string[];
  musicFolders?: string[];
  ambientPath?: string;
  ambientDuration?: number;
  trimmerOutputFolder?: string;
  liveOptimizerOutputFolder?: string;
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
  const [introVideo, setIntroVideo] = useState<VideoFile | null>(null);
  const [videoFolders, setVideoFolders] = useState<string[]>([]);
  const [musicFolders, setMusicFolders] = useState<string[]>([]);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);
  const [isQueueRunning, setIsQueueRunning] = useState(false);
  const [autoRegenerate, setAutoRegenerate] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [ambientPath, setAmbientPath] = useState("");
  const [ambientDuration, setAmbientDuration] = useState(0);
  const [trimmerOutputFolder, setTrimmerOutputFolder] = useState("");
  const [liveOptimizerOutputFolder, setLiveOptimizerOutputFolder] = useState("");
  const queueCancelledRef = useRef(false);
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
        if (data.introVideo) setIntroVideo(data.introVideo);
        if (data.videoFolders) setVideoFolders(data.videoFolders);
        if (data.musicFolders) setMusicFolders(data.musicFolders);
        if (data.ambientPath) setAmbientPath(data.ambientPath);
        if (data.ambientDuration) setAmbientDuration(data.ambientDuration);
        if (data.trimmerOutputFolder) setTrimmerOutputFolder(data.trimmerOutputFolder);
        if (data.liveOptimizerOutputFolder) setLiveOptimizerOutputFolder(data.liveOptimizerOutputFolder);
      } catch {
        // no saved state, use defaults
      }
      loaded.current = true;
    })();
  }, []);

  const save = useCallback(async (v: VideoFile[], m: MusicFile[], seq: SequenceItem[], s: RenderSettings, mo: number[], iv: VideoFile | null, vf: string[], mf: string[], ap: string, ad: number, tof: string, loof: string) => {
    if (!statePath.current) return;
    const { invoke } = await import("@tauri-apps/api/core");
    const data: PersistedState = { videos: v, music: m, sequence: seq, settings: s, musicOrder: mo, introVideo: iv, videoFolders: vf, musicFolders: mf, ambientPath: ap, ambientDuration: ad, trimmerOutputFolder: tof, liveOptimizerOutputFolder: loof };
    try {
      await invoke("save_state", { path: statePath.current, data });
    } catch { /* ignore save errors */ }
  }, []);

  useEffect(() => {
    if (!loaded.current) return;
    save(videos, music, sequence, settings, musicOrder, introVideo, videoFolders, musicFolders, ambientPath, ambientDuration, trimmerOutputFolder, liveOptimizerOutputFolder);
  }, [videos, music, sequence, settings, musicOrder, introVideo, videoFolders, musicFolders, ambientPath, ambientDuration, trimmerOutputFolder, liveOptimizerOutputFolder]);

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
        cutRandomEnabled: settings.cut_random_enabled,
        cutRandomMin: settings.cut_random_min,
        cutRandomMax: settings.cut_random_max,
        intro: introVideo,
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
        cutRandomEnabled: settings.cut_random_enabled,
        cutRandomMin: settings.cut_random_min,
        cutRandomMax: settings.cut_random_max,
        intro: introVideo,
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

  async function handleAddToQueue() {
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

    let snapSequence = sequence;
    let snapMusicOrder = musicOrder;

    if (autoRegenerate) {
      const { invoke } = await import("@tauri-apps/api/core");
      try {
        const newSeq = await invoke<SequenceItem[]>("generate_sequence", {
          videos,
          mode: settings.video_playback_mode,
          clipDuration: settings.clip_duration,
          preventDuplicates: settings.prevent_duplicates,
          cutRandomEnabled: settings.cut_random_enabled,
          cutRandomMin: settings.cut_random_min,
          cutRandomMax: settings.cut_random_max,
          intro: introVideo,
        });
        setSequence(newSeq);
        snapSequence = newSeq;
      } catch (e) {
        alert(`Regenerate failed: ${e}`);
        return;
      }
      try {
        const baseOrder = await invoke<number[]>("generate_music_order", {
          music,
          mode: settings.music_playback_mode,
        });
        const { order } = computeMusicPlaylist(baseOrder);
        setMusicOrder(order);
        snapMusicOrder = order;
      } catch (e) {
        alert(`Music order failed: ${e}`);
        return;
      }
    }

    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

    const filename = uniqueQueueFilename(settings.output_filename || "untitled.mp4", queue);
    const jobSettings = filename !== settings.output_filename
      ? { ...settings, output_filename: filename }
      : { ...settings };

    const newItem: QueueItem = {
      id,
      name: filename,
      music: music,
      sequence: snapSequence,
      settings: jobSettings,
      musicOrder: snapMusicOrder.length > 0 ? snapMusicOrder : music.map((_, i) => i),
      status: "pending",
    };
    setQueue(prev => [...prev, newItem]);
  }

  async function handleWizardAddJob(data: {
    intro: VideoFile | null;
    videos: VideoFile[];
    music: MusicFile[];
    musicOrder: number[];
    durationMode: "fixed" | "fixed_complete_last_song" | "selected_songs";
    fixedDurationMinutes: number;
    audioNormalization: AudioNormalization;
    ambientPath: string;
    ambientDuration: number;
    musicVolume: number;
    ambientVolume: number;
    crf: number;
  }) {
    const { invoke } = await import("@tauri-apps/api/core");

    const seq = await invoke<SequenceItem[]>("generate_sequence", {
      videos: data.videos,
      mode: "shuffle",
      clipDuration: 10,
      preventDuplicates: true,
      cutRandomEnabled: false,
      cutRandomMin: 3,
      cutRandomMax: 5,
      intro: data.intro,
    });

    const durationMode: RenderSettings["duration_mode"] = data.durationMode === "fixed"
      ? { type: "fixed", value: data.fixedDurationMinutes * 60 }
      : data.durationMode === "fixed_complete_last_song"
      ? { type: "fixed_complete_last_song", value: data.fixedDurationMinutes * 60 }
      : { type: "selected_songs" };

    const now = new Date();
    const ts =
      now.getFullYear().toString() +
      (now.getMonth() + 1).toString().padStart(2, "0") +
      now.getDate().toString().padStart(2, "0") +
      "_" +
      now.getHours().toString().padStart(2, "0") +
      now.getMinutes().toString().padStart(2, "0") +
      now.getSeconds().toString().padStart(2, "0");
    const filename = uniqueQueueFilename(`wizard_${ts}.mp4`, queue);

    const jobSettings: RenderSettings = {
      ...defaultSettings(),
      duration_mode: durationMode,
      output_filename: filename,
      output_folder: settings.output_folder,
      audio_normalization: data.audioNormalization,
      ambient_enabled: data.ambientPath ? true : false,
      ambient_path: data.ambientPath,
      music_volume: data.musicVolume,
      ambient_volume: data.ambientVolume,
      crf: data.crf,
    };

    function loopPlaylist(baseOrder: number[], music: MusicFile[], targetDuration: number): number[] {
      if (baseOrder.length === 0 || music.length === 0) return [];
      const order: number[] = [];
      let acc = 0;
      outer: while (true) {
        for (const idx of baseOrder) {
          order.push(idx);
          acc += music[idx].duration;
          if (acc >= targetDuration) break outer;
        }
      }
      return order;
    }

    const target = durationMode.type === "selected_songs"
      ? data.music.reduce((s, m) => s + m.duration, 0)
      : durationMode.value;
    const musicOrder = loopPlaylist(data.musicOrder, data.music, target);

    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const newItem: QueueItem = {
      id,
      name: filename,
      music: data.music,
      sequence: seq,
      settings: jobSettings,
      musicOrder,
      status: "pending",
    };
    setQueue(prev => [...prev, newItem]);
    setTab("render");
  }

  function handleRenameQueueItem(id: string, filename: string) {
    setQueue(prev => {
      const unique = uniqueQueueFilename(filename, prev, id);
      return prev.map(item => item.id === id
        ? {
            ...item,
            name: unique,
            settings: { ...item.settings, output_filename: unique },
          }
        : item
      );
    });
  }

  async function handleStartQueue() {
    const pending = queue.filter(j => j.status === "pending");
    if (pending.length === 0) return;

    setIsQueueRunning(true);
    setIsRendering(true);
    setIsPaused(false);
    setProgress(null);
    setOutputPath("");
    queueCancelledRef.current = false;

    for (const job of pending) {
      if (queueCancelledRef.current) break;

      setCurrentJobId(job.id);
      setQueue(prev => prev.map(j => j.id === job.id ? { ...j, status: "rendering" as QueueStatus } : j));

      const { invoke, Channel } = await import("@tauri-apps/api/core");
      const channel = new Channel<RenderProgress>();
      channel.onmessage = (p) => {
        setProgress(p);
        if (p.stage === "Complete") {
          setOutputPath(p.current_file);
        }
      };

      try {
        const result = await invoke<string>("start_render", {
          music: job.music,
          sequence: job.sequence,
          settings: job.settings,
          onEvent: channel,
          musicOrder: job.musicOrder,
        });
        setQueue(prev => prev.map(j => j.id === job.id ? {
          ...j, status: "completed" as QueueStatus, outputPath: result,
        } : j));
        setOutputPath(result);
      } catch (e) {
        const cancelled = queueCancelledRef.current;
        const msg = String(e);
        const clean = /cancelled/i.test(msg) ? "Cancelled by user" : msg;
        setQueue(prev => prev.map(j => j.id === job.id ? {
          ...j,
          status: (cancelled ? "cancelled" : "failed") as QueueStatus,
          error: clean,
        } : j));
        if (cancelled) break;
      }
    }

    setCurrentJobId(null);
    setIsQueueRunning(false);
    setIsRendering(false);
    queueCancelledRef.current = false;
  }

  function handleRemoveFromQueue(id: string) {
    setQueue(prev => prev.filter(j => j.id !== id));
  }

  function handleMoveUp(id: string) {
    setQueue(prev => {
      const idx = prev.findIndex(j => j.id === id);
      if (idx <= 0) return prev;
      const next = [...prev];
      [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
      return next;
    });
  }

  function handleMoveDown(id: string) {
    setQueue(prev => {
      const idx = prev.findIndex(j => j.id === id);
      if (idx < 0 || idx >= prev.length - 1) return prev;
      const next = [...prev];
      [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
      return next;
    });
  }

  async function handleCancel() {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("cancel_render");
    queueCancelledRef.current = true;
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
        <div style={{ flex: 1 }} />
        <button className="primary" onClick={() => setWizardOpen(true)} style={{ fontSize: 12, padding: "6px 14px" }}>
          ✨ Wizard Mode
        </button>
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
        <button className={tab === "merger" ? "active" : ""} onClick={() => setTab("merger")}>
          🔗 Merger
        </button>
        <button className={tab === "trimmer" ? "active" : ""} onClick={() => setTab("trimmer")}>
          ✂️ Trimmer
        </button>
        <button className={tab === "live_optimizer" ? "active" : ""} onClick={() => setTab("live_optimizer")}>
          🔴 Live Optimizer
        </button>
      </div>
      <main>
        {tab === "import" && (
          <div className="panel">
            <div className="grid-2">
              <VideoImport
                videos={videos}
                onVideosChange={setVideos}
                videoFolders={videoFolders}
                onVideoFoldersChange={setVideoFolders}
              />
              <MusicImport
                music={music}
                onMusicChange={setMusic}
                musicFolders={musicFolders}
                onMusicFoldersChange={setMusicFolders}
              />
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
              <CutRandomSettings settings={settings} onChange={setSettings} />
              <DurationSettings settings={settings} onChange={setSettings} />
              <AmbientImport
                ambientPath={ambientPath}
                ambientDuration={ambientDuration}
                onSelect={(path) => {
                  setAmbientPath(path);
                  (async () => {
                    const { invoke } = await import("@tauri-apps/api/core");
                    try {
                      const meta = await invoke<{ duration: number }>("get_music_metadata", { path });
                      setAmbientDuration(meta.duration);
                      setSettings(prev => ({ ...prev, ambient_enabled: true, ambient_path: path }));
                    } catch {}
                  })();
                }}
                onRemove={() => {
                  setAmbientPath("");
                  setAmbientDuration(0);
                  setSettings(prev => ({ ...prev, ambient_enabled: false, ambient_path: "" }));
                }}
              />
              <EncodingSettings settings={settings} onChange={setSettings} />
              <TransitionSettings settings={settings} onChange={setSettings} />
              <WatermarkSettings settings={settings} onChange={setSettings} videos={videos} />
            </div>
          </div>
        )}
        {tab === "render" && (
          <div className="panel">
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <IntroImport video={introVideo} onVideoChange={setIntroVideo} />
              <div className="grid-2">
                <SequenceDisplay
                  sequence={sequence}
                  totalDuration={sequence.reduce((a, b) => a + b.duration, 0)}
                  onRegenerate={handleRegenerateVideo}
                />
                <div className="card">
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
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
                  <div style={{ fontSize: 12, color: "var(--text2)", marginBottom: 8 }}>
                    {durationModeLabel(settings.duration_mode)}
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
              <OutputSettings settings={settings} onChange={setSettings} />
              <QueuePanel
                queue={queue}
                isQueueRunning={isQueueRunning}
                currentJobId={currentJobId}
                canAdd={sequence.length > 0 && music.length > 0 && !!settings.output_folder}
                autoRegenerate={autoRegenerate}
                onAutoRegenerateChange={setAutoRegenerate}
                onAddToQueue={handleAddToQueue}
                onStartQueue={handleStartQueue}
                onRemove={handleRemoveFromQueue}
                onRename={handleRenameQueueItem}
                onMoveUp={handleMoveUp}
                onMoveDown={handleMoveDown}
                onCancelQueue={handleCancel}
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
        {tab === "merger" && (
          <div className="panel">
            <MergerTool />
          </div>
        )}
        {tab === "trimmer" && (
          <div className="panel">
            <TrimmerTool
              outputFolder={trimmerOutputFolder}
              onOutputFolderChange={setTrimmerOutputFolder}
            />
          </div>
        )}
        {tab === "live_optimizer" && (
          <div className="panel">
            <LiveOptimizerTool
              outputFolder={liveOptimizerOutputFolder}
              onOutputFolderChange={setLiveOptimizerOutputFolder}
            />
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
        </div>
      )}
      {tab === "render" && !isRendering && outputPath && (
        <div className="footer-actions">
          <button onClick={() => setTab("settings")}>← Back to Settings</button>
          <button onClick={handleOpenFile}>▶ Open File</button>
          <button onClick={handleOpenFolder}>📂 Open Folder</button>
        </div>
      )}
      <footer style={{
        textAlign: "center",
        padding: "16px 0 8px",
        fontSize: 12,
        color: "var(--text2)",
        borderTop: "1px solid var(--border)",
        marginTop: "auto",
      }}>
        made with ❤️ powered by opencode - big pickle
      </footer>
      <WizardModal
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
        onAddJob={handleWizardAddJob}
      />
    </>
  );
}
