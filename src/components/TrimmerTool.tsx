import { useRef, useState, useCallback, useMemo } from "react";
import { VideoFile, TrimSegment, TrimProgress } from "../types";

interface Props {
  outputFolder: string;
  onOutputFolderChange: (v: string) => void;
}

const SEGMENT_COLORS = [
  "#e94560", "#0f3460", "#2ecc71", "#f39c12",
  "#9b59b6", "#1abc9c", "#e67e22", "#3498db",
  "#e91e63", "#00bcd4", "#ff5722", "#8bc34a",
];

function formatTime(s: number): string {
  s = Math.round(s);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

function parseTimeInput(s: string): number | null {
  s = s.trim();
  if (!s) return null;
  if (s.includes(":")) {
    const parts = s.split(":").map(Number);
    if (parts.some(isNaN)) return null;
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    return null;
  }
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

export default function TrimmerTool({ outputFolder, onOutputFolderChange }: Props) {
  const [video, setVideo] = useState<VideoFile | null>(null);
  const [checkpoints, setCheckpoints] = useState<number[]>([0]);
  const [inputValues, setInputValues] = useState<string[]>(["0"]);
  const [trimming, setTrimming] = useState(false);
  const [progress, setProgress] = useState<TrimProgress | null>(null);
  const [segments, setSegments] = useState<TrimSegment[]>([]);
  const [resultPaths, setResultPaths] = useState<string[]>([]);
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const timelineRef = useRef<HTMLDivElement>(null);

  const dur = video?.duration ?? 0;

  async function pickVideo() {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const files = await open({
      multiple: false,
      filters: [{ name: "Video", extensions: ["mp4", "mov", "mkv", "webm"] }],
    });
    if (!files) return;
    const path = Array.isArray(files) ? files[0] : files;
    const { invoke } = await import("@tauri-apps/api/core");
    try {
      const meta = await invoke<VideoFile>("get_video_metadata", { path });
      setVideo(meta);
      setCheckpoints([0, meta.duration]);
      setInputValues(["0", formatTime(meta.duration)]);
      setSegments([]);
      setResultPaths([]);
      setProgress(null);
    } catch (e) {
      alert(`Gagal membaca metadata: ${e}`);
    }
  }

  function addCheckpointAt(time: number) {
    if (!video) return;
    const eps = 0.5 / dur * 100;
    const exist = checkpoints.some((cp) => Math.abs(cp - time) < eps);
    if (exist) return;

    const cps = [...checkpoints, time].sort((a, b) => a - b);
    const vals = cps.map((t) => formatTime(t));
    setCheckpoints(cps);
    setInputValues(vals);
  }

  function removeCheckpoint(i: number) {
    if (checkpoints.length <= 2) return;
    const cps = checkpoints.filter((_, idx) => idx !== i);
    const vals = cps.map((t) => formatTime(t));
    setCheckpoints(cps);
    setInputValues(vals);
  }

  function handleTimelineClick(e: React.MouseEvent) {
    if (!dur) return;
    const rect = timelineRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left;
    const pct = x / rect.width;
    const time = Math.max(0, Math.min(dur, pct * dur));
    addCheckpointAt(time);
  }

  const handleTimelineHover = useCallback((e: React.MouseEvent) => {
    if (!dur) return;
    const rect = timelineRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left;
    const pct = x / rect.width;
    setHoverTime(Math.max(0, Math.min(dur, pct * dur)));
  }, [dur]);

  function handleMarkerClick(e: React.MouseEvent, i: number) {
    e.stopPropagation();
    removeCheckpoint(i);
  }

  function updateCheckpoint(i: number, raw: string) {
    const next = [...inputValues];
    next[i] = raw;
    setInputValues(next);

    const parsed = parseTimeInput(raw);
    if (parsed === null) return;
    if (!video || parsed < 0 || parsed > video.duration) return;

    const cps = [...checkpoints];
    cps[i] = parsed;

    const valid = [...cps].sort((a, b) => a - b);
    if (JSON.stringify(cps) !== JSON.stringify(valid)) return;

    setCheckpoints(cps);
  }

  function resetCheckpoints() {
    if (!video) return;
    setCheckpoints([0, video.duration]);
    setInputValues(["0", formatTime(video.duration)]);
    setSegments([]);
    setResultPaths([]);
    setProgress(null);
  }

  const previewSegments = useMemo(() => {
    const segs: { label: string; start: number; end: number; dur: number; pct: number }[] = [];
    for (let i = 0; i < checkpoints.length - 1; i++) {
      const s = checkpoints[i];
      const e = checkpoints[i + 1];
      segs.push({
        label: `${formatTime(s)} → ${formatTime(e)}`,
        start: s,
        end: e,
        dur: e - s,
        pct: dur > 0 ? ((e - s) / dur) * 100 : 0,
      });
    }
    return segs;
  }, [checkpoints, dur]);

  const totalDur = useMemo(() => previewSegments.reduce((sum, seg) => sum + seg.dur, 0), [previewSegments]);

  async function selectOutput() {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const folder = await open({ directory: true });
    if (folder) onOutputFolderChange(folder as string);
  }

  async function startTrim() {
    if (!video || checkpoints.length < 2) return;
    if (!outputFolder) { alert("Pilih folder output."); return; }

    setTrimming(true);
    setProgress(null);
    setSegments([]);
    setResultPaths([]);

    const { invoke, Channel } = await import("@tauri-apps/api/core");
    const channel = new Channel<TrimProgress>();
    channel.onmessage = (p) => {
      setProgress(p);
      if (p.stage === "Complete") {
        setResultPaths(p.output_paths);
        setTrimming(false);
      }
    };

    try {
      const result = await invoke<TrimSegment[]>("trim_video_checkpoints", {
        videoPath: video.path,
        checkpoints,
        outputFolder: outputFolder,
        onEvent: channel,
      });
      setSegments(result);
    } catch (e) {
      setTrimming(false);
      alert(`Trim gagal: ${e}`);
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

  const hoverPct = dur > 0 && hoverTime !== null ? (hoverTime / dur) * 100 : null;

  return (
    <div className="card">
      <h3>✂️ Video Trimmer</h3>
      <p style={{ fontSize: 13, color: "var(--text2)", marginBottom: 8 }}>
        Potong video panjang menjadi beberapa segmen. Klik timeline untuk tambah checkpoint.
      </p>

      <div className="btn-group">
        <button onClick={pickVideo}>📁 Pilih Video</button>
        {video && <button onClick={resetCheckpoints}>⟳ Reset</button>}
      </div>

      {!video ? (
        <div className="empty-state">Pilih video untuk memulai.</div>
      ) : (
        <>
          <div style={{ fontSize: 13, color: "var(--text2)", margin: "4px 0" }}>
            {video.filename} &middot; {formatTime(video.duration)} &middot; {video.width}x{video.height} &middot; {video.fps.toFixed(1)} fps
          </div>

          {dur > 0 && (
            <div style={{ marginTop: 12, marginBottom: 12 }}>
              <div
                ref={timelineRef}
                onClick={handleTimelineClick}
                onMouseMove={handleTimelineHover}
                onMouseLeave={() => setHoverTime(null)}
                style={{
                  position: "relative",
                  width: "100%",
                  height: 40,
                  background: "var(--surface2)",
                  borderRadius: 6,
                  cursor: "crosshair",
                  overflow: "hidden",
                }}
              >
                {previewSegments.map((seg, i) => (
                  <div
                    key={i}
                    style={{
                      position: "absolute",
                      left: `${(seg.start / dur) * 100}%`,
                      width: `${seg.pct}%`,
                      top: 0,
                      height: "100%",
                      background: SEGMENT_COLORS[i % SEGMENT_COLORS.length],
                      opacity: 0.35,
                      borderRight: checkpoints[i + 1] < dur ? "1px solid rgba(255,255,255,0.15)" : "none",
                    }}
                  />
                ))}
                {checkpoints.map((cp, i) => {
                  const pct = (cp / dur) * 100;
                  const isFirst = i === 0;
                  const isLast = i === checkpoints.length - 1;
                  return (
                    <div
                      key={i}
                      onClick={(e) => handleMarkerClick(e, i)}
                      title={`${String.fromCharCode(97 + i)} (${formatTime(cp)}) — click to remove`}
                      style={{
                        position: "absolute",
                        left: `${pct}%`,
                        top: 0,
                        transform: "translateX(-50%)",
                        width: 2,
                        height: "100%",
                        background: "#fff",
                        zIndex: 10,
                        cursor: checkpoints.length > 2 ? "pointer" : "default",
                        opacity: isFirst || isLast ? 0.6 : 1,
                      }}
                    >
                      <div
                        style={{
                          position: "absolute",
                          top: -14,
                          left: "50%",
                          transform: "translateX(-50%)",
                          fontSize: 10,
                          color: "#fff",
                          background: "rgba(0,0,0,0.7)",
                          padding: "1px 5px",
                          borderRadius: 3,
                          whiteSpace: "nowrap",
                          pointerEvents: "none",
                        }}
                      >
                        {String.fromCharCode(97 + i)}
                      </div>
                      {!isFirst && !isLast && (
                        <div
                          style={{
                            position: "absolute",
                            top: "50%",
                            left: "50%",
                            transform: "translate(-50%, -50%)",
                            width: 10,
                            height: 10,
                            borderRadius: "50%",
                            background: "#fff",
                            border: "2px solid var(--bg)",
                          }}
                        />
                      )}
                    </div>
                  );
                })}
                {hoverPct !== null && (
                  <div
                    style={{
                      position: "absolute",
                      left: `${hoverPct}%`,
                      top: 0,
                      height: "100%",
                      width: 1,
                      background: "rgba(255,255,255,0.4)",
                      zIndex: 5,
                      pointerEvents: "none",
                    }}
                  >
                    <div
                      style={{
                        position: "absolute",
                        top: "50%",
                        left: 12,
                        transform: "translateY(-50%)",
                        fontSize: 11,
                        color: "#fff",
                        background: "rgba(0,0,0,0.8)",
                        padding: "2px 6px",
                        borderRadius: 3,
                        whiteSpace: "nowrap",
                        pointerEvents: "none",
                      }}
                    >
                      {formatTime(hoverTime!)}
                    </div>
                  </div>
                )}
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "var(--text2)", marginTop: 2 }}>
                <span>0:00</span>
                <span>{formatTime(dur)}</span>
              </div>
              {hoverTime !== null && (
                <div style={{ fontSize: 11, color: "var(--text2)", textAlign: "center", marginTop: 2 }}>
                  {formatTime(hoverTime!)} — klik untuk tambah checkpoint
                </div>
              )}
            </div>
          )}

          <div style={{ marginTop: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
              <strong style={{ fontSize: 14 }}>Checkpoint ({checkpoints.length})</strong>
              <span style={{ fontSize: 12, color: "var(--text2)" }}>
                Klik marker untuk hapus &middot; +{">"} tombol untuk tambah di akhir
              </span>
            </div>
            <div style={{ maxHeight: 180, overflowY: "auto", overscrollBehavior: "contain" }}>
              <table>
                <thead>
                  <tr>
                    <th style={{ width: 30 }}>#</th>
                    <th>Time</th>
                    <th style={{ width: 40 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {checkpoints.map((cp, i) => (
                    <tr key={i}>
                      <td style={{ textAlign: "center" }}>{String.fromCharCode(97 + i)}</td>
                      <td>
                        <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                          <input
                            type="text"
                            value={inputValues[i] || ""}
                            onChange={(e) => updateCheckpoint(i, e.target.value)}
                            style={{ flex: 1, padding: "4px 8px", fontSize: 13 }}
                          />
                          <span style={{ fontSize: 11, color: "var(--text2)", minWidth: 28 }}>
                            {formatTime(cp)}
                          </span>
                        </div>
                      </td>
                      <td>
                        <button
                          onClick={() => removeCheckpoint(i)}
                          disabled={checkpoints.length <= 2 || trimming}
                          className="danger"
                          style={{ padding: "0 6px", fontSize: 12, lineHeight: "22px" }}
                          title="Hapus checkpoint"
                        >
                          ✕
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div style={{ marginTop: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
              <strong style={{ fontSize: 14 }}>Preview Segmen</strong>
              <span style={{ fontSize: 13, color: "var(--text2)" }}>
                Total: {formatTime(totalDur)}
              </span>
            </div>
            {previewSegments.length === 0 ? (
              <div className="empty-state">Tambahkan minimal 2 checkpoint.</div>
            ) : (
              <div style={{ maxHeight: 250, overflowY: "auto", overscrollBehavior: "contain" }}>
                <table>
                  <thead>
                    <tr>
                      <th style={{ width: 50 }}>Segmen</th>
                      <th>Start</th>
                      <th>End</th>
                      <th>Duration</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewSegments.map((seg, i) => (
                      <tr key={i}>
                        <td>
                          <span style={{
                            display: "inline-block",
                            width: 10,
                            height: 10,
                            borderRadius: 2,
                            background: SEGMENT_COLORS[i % SEGMENT_COLORS.length],
                            marginRight: 6,
                            verticalAlign: "middle",
                          }} />
                          {String.fromCharCode(97 + i)}→{String.fromCharCode(98 + i)}
                        </td>
                        <td>{formatTime(seg.start)}</td>
                        <td>{formatTime(seg.end)}</td>
                        <td>{formatTime(seg.dur)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
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
              onClick={startTrim}
              disabled={trimming || checkpoints.length < 2 || !outputFolder}
              style={{ width: "100%" }}
            >
              {trimming ? "⏳ Trimming..." : "✂️ Trim Video"}
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

          {resultPaths.length > 0 && !trimming && (
            <div style={{ marginTop: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                <strong style={{ fontSize: 14 }}>Hasil ({resultPaths.length} segmen)</strong>
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={openFolder}>📂 Open Folder</button>
                  <button className="primary" onClick={() => { setResultPaths([]); setSegments([]); setProgress(null); }}>
                    ⟳ Trim Again
                  </button>
                </div>
              </div>
              <div style={{ maxHeight: 250, overflowY: "auto", overscrollBehavior: "contain" }}>
                <table>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Segmen</th>
                      <th>Duration</th>
                      <th>File</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {(segments.length > 0 ? segments : resultPaths.map((p, i) => ({
                      index: i + 1,
                      label: previewSegments[i]?.label || `Segmen ${i + 1}`,
                      duration: previewSegments[i]?.dur || 0,
                      output_path: p,
                    }))).map((seg, i) => (
                      <tr key={i}>
                        <td>{seg.index}</td>
                        <td>{seg.label}</td>
                        <td>{formatTime(seg.duration)}</td>
                        <td style={{ fontSize: 12, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {seg.output_path.split("/").pop() || seg.output_path}
                        </td>
                        <td>
                          <button onClick={() => openFile(seg.output_path)} style={{ padding: "0 8px", fontSize: 12 }}>
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
