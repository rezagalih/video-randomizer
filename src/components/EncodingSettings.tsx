import { RenderSettings } from "../types";

interface Props {
  settings: RenderSettings;
  onChange: (s: RenderSettings) => void;
}

const RESOLUTIONS = [
  { label: "Original", w: 0, h: 0 },
  { label: "1280x720", w: 1280, h: 720 },
  { label: "1920x1080", w: 1920, h: 1080 },
  { label: "2560x1440", w: 2560, h: 1440 },
  { label: "3840x2160", w: 3840, h: 2160 },
];

const FPS_OPTIONS = [
  { label: "Keep Original", value: 0 },
  { label: "24", value: 24 },
  { label: "25", value: 25 },
  { label: "30", value: 30 },
  { label: "50", value: 50 },
  { label: "60", value: 60 },
];

export default function EncodingSettings({ settings, onChange }: Props) {
  function update(d: Partial<RenderSettings>) {
    onChange({ ...settings, ...d });
  }

  const isCustomRes = settings.resolution.type === "custom";
  const isCustomFps = settings.fps.type === "custom";

  function setResolution(w: number, h: number) {
    if (w === 0) {
      onChange({ ...settings, resolution: { type: "original" } });
    } else {
      onChange({ ...settings, resolution: { type: "custom", width: w, height: h } });
    }
  }

  function setFps(v: number) {
    if (v === 0) {
      onChange({ ...settings, fps: { type: "keep_original" } });
    } else {
      onChange({ ...settings, fps: { type: "custom", value: v } });
    }
  }

  return (
    <div className="card">
      <h3>⚙️ Encoding Settings</h3>
      <div className="form-group">
        <label>
          <input
            type="checkbox"
            checked={settings.mute_source_audio}
            onChange={(e) => update({ mute_source_audio: e.target.checked })}
          />
          Mute source video sound
        </label>
      </div>
      <div className="grid-2">
        <div className="form-group">
          <label>Encoding Speed</label>
          <select
            value={settings.encoding_speed}
            onChange={(e) => update({ encoding_speed: e.target.value as "fast" | "balanced" | "quality" })}
          >
            <option value="fast">Fast</option>
            <option value="balanced">Balanced</option>
            <option value="quality">Quality</option>
          </select>
        </div>
        <div className="form-group">
          <label>Encoder</label>
          <select
            value={settings.encoder_mode}
            onChange={(e) => update({ encoder_mode: e.target.value as "auto" | "hardware" | "software" })}
          >
            <option value="auto">Auto</option>
            <option value="hardware">Hardware (GPU)</option>
            <option value="software">Software (CPU)</option>
          </select>
        </div>
      </div>
      <div className="form-group">
        <label>Resolution</label>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {RESOLUTIONS.map((r) => (
            <button
              key={r.label}
              className={
                (r.w === 0 && !isCustomRes) || (settings.resolution.type === "custom" && settings.resolution.width === r.w && settings.resolution.height === r.h)
                  ? "primary"
                  : ""
              }
              onClick={() => setResolution(r.w, r.h)}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>
      <div className="form-group">
        <label>FPS</label>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {FPS_OPTIONS.map((f) => (
            <button
              key={f.label}
              className={
                (f.value === 0 && !isCustomFps) || (settings.fps.type === "custom" && settings.fps.value === f.value)
                  ? "primary"
                  : ""
              }
              onClick={() => setFps(f.value)}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
