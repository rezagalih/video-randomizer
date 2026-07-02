import { AudioNormalization, RenderSettings } from "../types";

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
      <div className="form-group">
        <label>Audio Normalization (LUFS)</label>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <select
            value={settings.audio_normalization.type}
            onChange={(e) => {
              const t = e.target.value as AudioNormalization["type"];
              switch (t) {
                case "off": update({ audio_normalization: { type: "off" } }); break;
                case "lufs14": update({ audio_normalization: { type: "lufs14" } }); break;
                case "lufs23": update({ audio_normalization: { type: "lufs23" } }); break;
                case "custom": update({ audio_normalization: { type: "custom", value: -14 } }); break;
              }
            }}
          >
            <option value="off">Off</option>
            <option value="lufs14">-14 LUFS (YouTube)</option>
            <option value="lufs23">-23 LUFS (Broadcast)</option>
            <option value="custom">Custom</option>
          </select>
          {settings.audio_normalization.type === "custom" && (
            <input
              type="number"
              min={-40}
              max={0}
              step={0.1}
              value={settings.audio_normalization.value}
              onChange={(e) => update({ audio_normalization: { type: "custom", value: parseFloat(e.target.value) || -14 } })}
              style={{ width: 80 }}
            />
          )}
        </div>
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
      <div className="form-group">
          <label>Video Quality (CRF)</label>
          <p style={{ fontSize: 13, color: "var(--text2)", marginBottom: 8 }}>
            Lower value = better quality, larger file. Recommended: 18-28. Default: 23.
          </p>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span style={{ fontSize: 12, color: "var(--text2)" }}>Higher quality</span>
            <input
              type="range"
              min={0}
              max={51}
              value={settings.crf}
              onChange={(e) => update({ crf: Number(e.target.value) })}
              style={{ flex: 1 }}
            />
            <span style={{ fontSize: 12, color: "var(--text2)" }}>Lower quality</span>
          </div>
          <div style={{ textAlign: "center", fontSize: 13, marginTop: 4, color: "var(--text2)" }}>
            CRF: {settings.crf} {settings.crf <= 18 ? "(High quality)" : settings.crf <= 23 ? "(Good quality)" : settings.crf <= 28 ? "(Medium quality)" : "(Low quality)"}
          </div>
        </div>
        <div className="form-group">
          <label>Music Volume: {Math.round(settings.music_volume * 100)}%</label>
        <input
          type="range"
          min={0}
          max={100}
          value={Math.round(settings.music_volume * 100)}
          onChange={(e) => update({ music_volume: Number(e.target.value) / 100 })}
          style={{ width: "100%" }}
        />
      </div>
      {settings.ambient_enabled && (
        <div className="form-group">
          <label>Ambient Volume: {Math.round(settings.ambient_volume * 100)}%</label>
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(settings.ambient_volume * 100)}
            onChange={(e) => update({ ambient_volume: Number(e.target.value) / 100 })}
            style={{ width: "100%" }}
          />
        </div>
      )}
    </div>
  );
}
