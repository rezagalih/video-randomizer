import { RenderSettings } from "../types";

interface Props {
  settings: RenderSettings;
  onChange: (s: RenderSettings) => void;
}

const DURATION_PRESETS = [
  { label: "5 minutes", value: 300 },
  { label: "10 minutes", value: 600 },
  { label: "30 minutes", value: 1800 },
  { label: "1 hour", value: 3600 },
  { label: "3 hours", value: 10800 },
];

export default function DurationSettings({ settings, onChange }: Props) {
  const isFixed = settings.duration_mode.type === "fixed";
  const isFixedLast = settings.duration_mode.type === "fixed_complete_last_song";
  const isSelected = settings.duration_mode.type === "selected_songs";

  function setMode(type: string) {
    if (type === "fixed") {
      const prev = settings.duration_mode;
      const value = prev.type === "fixed_complete_last_song" ? prev.value : 1800;
      onChange({ ...settings, duration_mode: { type: "fixed", value } });
    } else if (type === "fixed_complete_last_song") {
      const prev = settings.duration_mode;
      const value = prev.type === "fixed" ? prev.value : 1800;
      onChange({ ...settings, duration_mode: { type: "fixed_complete_last_song", value } });
    } else {
      onChange({ ...settings, duration_mode: { type: "selected_songs" } });
    }
  }

  return (
    <div className="card">
      <h3>⏱ Duration Mode</h3>
      <div className="form-group">
        <label>
          <input type="radio" name="dur" checked={isFixed} onChange={() => setMode("fixed")} />
          Fixed Duration
        </label>
        {isFixed && (
          <div style={{ marginLeft: 24, marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
            {DURATION_PRESETS.map((p) => (
              <button
                key={p.value}
                className={settings.duration_mode.type === "fixed" && settings.duration_mode.value === p.value ? "primary" : ""}
                onClick={() => onChange({ ...settings, duration_mode: { type: "fixed", value: p.value } })}
              >
                {p.label}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="form-group">
        <label>
          <input type="radio" name="dur" checked={isFixedLast} onChange={() => setMode("fixed_complete_last_song")} />
          Fixed Duration + Complete Last Song
        </label>
        {isFixedLast && (
          <div style={{ marginLeft: 24, marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
            {DURATION_PRESETS.map((p) => (
              <button
                key={p.value}
                className={settings.duration_mode.type === "fixed_complete_last_song" && settings.duration_mode.value === p.value ? "primary" : ""}
                onClick={() => onChange({ ...settings, duration_mode: { type: "fixed_complete_last_song", value: p.value } })}
              >
                {p.label}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="form-group">
        <label>
          <input type="radio" name="dur" checked={isSelected} onChange={() => setMode("selected_songs")} />
          Selected Songs Duration
        </label>
      </div>
    </div>
  );
}
