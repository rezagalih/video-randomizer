import { RenderSettings } from "../types";

interface Props {
  settings: RenderSettings;
  onChange: (s: RenderSettings) => void;
}

export default function TransitionSettings({ settings, onChange }: Props) {
  return (
    <div className="card">
      <h3>🔄 Transition Settings</h3>
      <div className="form-group">
        <label>Transition Type</label>
        <select disabled style={{ opacity: 0.5 }}>
          <option>Dissolve (default)</option>
        </select>
        <div style={{ fontSize: 12, color: "var(--text2)", marginTop: 4 }}>Crossfade/Dissolve between clips (FFmpeg xfade filter)</div>
      </div>
      <div className="form-group">
        <label>Fade Duration (seconds)</label>
        <div className="form-row">
          <input
            type="range"
            min={0}
            max={5}
            step={0.1}
            value={settings.fade_duration}
            onChange={(e) => onChange({ ...settings, fade_duration: parseFloat(e.target.value) })}
            style={{ flex: 1 }}
          />
          <span style={{ minWidth: 40, textAlign: "right" }}>{settings.fade_duration.toFixed(1)}s</span>
        </div>
        <div style={{ fontSize: 12, color: "var(--text2)" }}>
          Range: 0.0s to 5.0s | Recommended: 0.5s
        </div>
      </div>
    </div>
  );
}
