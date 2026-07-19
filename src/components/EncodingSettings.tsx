import { AudioNormalization, RenderSettings } from "../types";

interface Props {
  settings: RenderSettings;
  onChange: (s: RenderSettings) => void;
}

export const VIDEO_PRESETS = [
  { value: "1080p_60fps", label: "1080p 60fps (6000 kbps)" },
  { value: "1080p_30fps", label: "1080p 30fps (4500 kbps)" },
  { value: "1080p_25fps", label: "1080p 25fps (4000 kbps)" },
  { value: "720p_60fps", label: "720p 60fps (4500 kbps)" },
  { value: "720p_30fps", label: "720p 30fps (2500 kbps)" },
  { value: "720p_25fps", label: "720p 25fps (2000 kbps)" },
];

export default function EncodingSettings({ settings, onChange }: Props) {
  function update(d: Partial<RenderSettings>) {
    onChange({ ...settings, ...d });
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
        <label>Video Output Quality</label>
        <p style={{ fontSize: 13, color: "var(--text2)", marginBottom: 8 }}>
          Preset kualitas video yang sudah dikunci (Fixed Bitrate/CBR) agar optimal untuk live streaming maupun playback.
        </p>
        <select
          value={settings.video_preset}
          onChange={(e) => update({ video_preset: e.target.value })}
          style={{ width: "100%", padding: "8px" }}
        >
          {VIDEO_PRESETS.map((p) => (
            <option key={p.value} value={p.value}>{p.label}</option>
          ))}
        </select>
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
