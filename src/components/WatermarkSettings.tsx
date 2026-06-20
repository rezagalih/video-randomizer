import { useRef, useState, useCallback } from "react";
import { VideoFile, RenderSettings, WatermarkSettings as WatermarkType } from "../types";
import { convertFileSrc } from "@tauri-apps/api/core";

interface Props {
  settings: RenderSettings;
  onChange: (s: RenderSettings) => void;
  videos: VideoFile[];
}

export default function WatermarkSettings({ settings, onChange, videos }: Props) {
  const wm = settings.watermark;
  const previewRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const [previewVideo, setPreviewVideo] = useState("");

  const update = (patch: Partial<WatermarkType>) => {
    onChange({ ...settings, watermark: { ...wm, ...patch } });
  };

  async function handleSelectImage() {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const sel = await open({
      multiple: false,
      filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "webp", "bmp", "gif"] }],
    });
    if (sel) {
      // If object, extract path
      const path = typeof sel === "string" ? sel : (sel as { path?: string }).path ?? "";
      if (path) update({ image_path: path, enabled: true });
    }
  }

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setDragging(true);
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragging || !previewRef.current) return;
    const rect = previewRef.current.getBoundingClientRect();
    let x = ((e.clientX - rect.left) / rect.width) * 100;
    let y = ((e.clientY - rect.top) / rect.height) * 100;
    x = Math.max(0, Math.min(100, x));
    y = Math.max(0, Math.min(100, y));
    update({ position_x: x, position_y: y });
  }, [dragging]);

  const handleMouseUp = useCallback(() => {
    setDragging(false);
  }, []);

  return (
    <div className="card">
      <h3>🏷 Watermark</h3>

      <label>
        <input
          type="checkbox"
          checked={wm.enabled}
          onChange={(e) => update({ enabled: e.target.checked })}
        />
        Enable Watermark
      </label>

      {wm.enabled && (
        <>
          <div className="form-group">
            <label>Watermark Image</label>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                type="text"
                value={wm.image_path}
                onChange={(e) => update({ image_path: e.target.value })}
                placeholder="Select a watermark image..."
                readOnly
              />
              <button onClick={handleSelectImage}>📁 Browse</button>
            </div>
            {wm.image_path && (
              <div style={{ fontSize: 12, color: "var(--text2)", marginTop: 4 }}>
                {wm.image_path.split("/").pop()}
              </div>
            )}
          </div>

          <div className="form-group">
            <label>Preview Footage</label>
            <select
              value={previewVideo}
              onChange={(e) => setPreviewVideo(e.target.value)}
              style={{ width: "100%" }}
            >
              <option value="">-- Gradient background --</option>
              {videos.map((v, i) => (
                <option key={i} value={v.path}>
                  {v.filename} ({v.width}x{v.height})
                </option>
              ))}
            </select>
            {previewVideo && (
              <div style={{ fontSize: 12, color: "var(--text2)", marginTop: 4 }}>
                Using {previewVideo.split("/").pop()} as preview background
              </div>
            )}
          </div>

          <div className="form-group">
            <label>Size: {Math.round(wm.scale)}% of video width</label>
            <input
              type="range"
              min={1}
              max={50}
              step={1}
              value={wm.scale}
              onChange={(e) => update({ scale: Number(e.target.value) })}
              style={{ width: "100%" }}
            />
          </div>

          <div className="form-group">
            <label>Preview (drag watermark to position)</label>
            <div
              ref={previewRef}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              style={{
                position: "relative",
                width: "100%",
                aspectRatio: "16 / 9",
                background: previewVideo
                  ? undefined
                  : "linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)",
                border: "1px solid var(--border)",
                borderRadius: 8,
                overflow: "hidden",
                cursor: dragging ? "grabbing" : "default",
              }}
            >
              {previewVideo && (
                <video
                  src={convertFileSrc(previewVideo)}
                  autoPlay
                  muted
                  loop
                  playsInline
                  style={{
                    position: "absolute",
                    width: "100%",
                    height: "100%",
                    objectFit: "contain",
                    background: "#000",
                    pointerEvents: "none",
                  }}
                />
              )}
              <div
                onMouseDown={handleMouseDown}
                style={{
                  position: "absolute",
                  left: `${wm.position_x}%`,
                  top: `${wm.position_y}%`,
                  transform: "translate(-50%, -50%)",
                  width: `${wm.scale}%`,
                  cursor: dragging ? "grabbing" : "grab",
                  userSelect: "none",
                  opacity: 0.85,
                  transition: dragging ? "none" : "box-shadow 0.2s",
                }}
              >
                {wm.image_path ? (
                  <img
                    src={convertFileSrc(wm.image_path)}
                    alt="Watermark"
                    draggable={false}
                    style={{
                      width: "100%",
                      height: "auto",
                      pointerEvents: "none",
                    }}
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = "none";
                    }}
                  />
                ) : (
                  <div
                    style={{
                      background: "var(--primary)",
                      color: "#fff",
                      padding: "4px 12px",
                      borderRadius: 4,
                      fontSize: 12,
                      whiteSpace: "nowrap",
                      textAlign: "center",
                    }}
                  >
                    Watermark
                  </div>
                )}
              </div>

              <div
                style={{
                  position: "absolute",
                  bottom: 8,
                  right: 8,
                  fontSize: 11,
                  color: "var(--text2)",
                  background: "rgba(0,0,0,0.6)",
                  padding: "2px 8px",
                  borderRadius: 4,
                }}
              >
                {Math.round(wm.position_x)}%, {Math.round(wm.position_y)}%
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
