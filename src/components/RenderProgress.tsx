import { useEffect, useRef } from "react";
import { RenderProgress as RenderProgressType } from "../types";

interface Props {
  progress: RenderProgressType | null;
  isRendering: boolean;
  onCancel: () => void;
  onPause: () => void;
  isPaused: boolean;
  outputPath: string;
  outputFolder: string;
  onOpenFolder: () => void;
  onOpenFile: () => void;
}

export default function RenderProgress({ progress, isRendering, onCancel, onPause, isPaused, outputPath, onOpenFolder, onOpenFile }: Props) {
  const logRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [progress?.log_lines]);
  if (!isRendering && !progress) {
    return (
      <div className="card">
        <h3>📊 Render Progress</h3>
        <div className="empty-state">No render in progress. Click "Start Render" to begin.</div>
      </div>
    );
  }

  if (!progress) return null;

  function formatDur(s: number): string {
    if (s <= 0) return "--:--";
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = Math.floor(s % 60);
    if (h > 0) return `${h}h ${m}m ${sec}s`;
    if (m > 0) return `${m}m ${sec}s`;
    return `${sec}s`;
  }

  const isComplete = progress.stage === "Complete";

  return (
    <div className="card">
      <h3>📊 Render Progress</h3>
      <div className="progress-bar">
        <div
          className="progress-bar-fill"
          style={{
            width: `${Math.min(progress.percent, 100)}%`,
            background: isComplete ? "var(--success)" : undefined,
          }}
        />
      </div>
      <div className="progress-info" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
        <div>
          <strong>Status:</strong>{" "}
          <span style={{ color: isComplete ? "var(--success)" : "var(--primary)" }}>
            {isComplete ? "✅ Complete" : isPaused ? "⏸ Paused" : "▶ Rendering"}
          </span>
        </div>
        <div><strong>Stage:</strong> {progress.stage}</div>
        <div><strong>Progress:</strong> {progress.percent.toFixed(1)}%</div>
        <div><strong>Elapsed:</strong> {formatDur(progress.elapsed_secs)}</div>
        <div><strong>Remaining:</strong> {formatDur(progress.estimated_remaining_secs)}</div>
        <div>
          {progress.current_file && progress.current_file !== "Not selected" && (
            <span><strong>File:</strong> {progress.current_file}</span>
          )}
        </div>
      </div>
      <details style={{ marginTop: 12 }} open>
        <summary style={{ fontSize: 12, color: "var(--text2)", cursor: "pointer" }}>📝 FFmpeg Log</summary>
        <pre
          ref={logRef}
          style={{
            background: "#111",
            color: "#0f0",
            padding: 10,
            borderRadius: 6,
            fontSize: 11,
            lineHeight: 1.4,
            maxHeight: 200,
            overflow: "auto",
            marginTop: 8,
            whiteSpace: "pre-wrap",
            wordBreak: "break-all",
          }}
        >
          {progress.log_lines.length > 0
            ? progress.log_lines.join("\n")
            : "Waiting for output..."}
        </pre>
      </details>

      {isRendering && (
        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <button onClick={onPause} className={isPaused ? "primary" : ""}>
            {isPaused ? "▶ Resume" : "⏸ Pause"}
          </button>
          <button onClick={onCancel} className="danger">⏹ Cancel</button>
        </div>
      )}
      {isComplete && outputPath && (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 13, color: "var(--text2)", wordBreak: "break-all", marginBottom: 8 }}>
            Output: {outputPath}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={onOpenFile}>▶ Open File</button>
            <button onClick={onOpenFolder}>📂 Open Folder</button>
          </div>
        </div>
      )}
    </div>
  );
}
