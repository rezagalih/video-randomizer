import { RenderSettings } from "../types";

interface Props {
  settings: RenderSettings;
  onChange: (s: RenderSettings) => void;
}

const PRESETS = [
  { label: "3–5 detik", min: 3, max: 5 },
  { label: "3–8 detik", min: 3, max: 8 },
  { label: "3–10 detik", min: 3, max: 10 },
];

export default function CutRandomSettings({ settings, onChange }: Props) {
  return (
    <div className="card">
      <h3>✂️ Cut Random Footage</h3>
      <div className="form-group">
        <label>
          <input
            type="checkbox"
            checked={settings.cut_random_enabled}
            onChange={(e) => onChange({ ...settings, cut_random_enabled: e.target.checked })}
          />
          {" "}Potong footage secara acak
        </label>
      </div>
      {settings.cut_random_enabled && (
        <div style={{ marginLeft: 24, display: "flex", gap: 8, flexWrap: "wrap" }}>
          {PRESETS.map((p) => (
            <button
              key={p.label}
              className={
                settings.cut_random_min === p.min && settings.cut_random_max === p.max
                  ? "primary"
                  : ""
              }
              onClick={() =>
                onChange({
                  ...settings,
                  cut_random_min: p.min,
                  cut_random_max: p.max,
                })
              }
            >
              {p.label}
            </button>
          ))}
        </div>
      )}
      {settings.cut_random_enabled && (
        <p style={{ fontSize: 13, color: "var(--text2)", marginTop: 8, marginLeft: 24 }}>
          Footage yang durasinya kurang dari batas minimum ({settings.cut_random_min} detik) tidak akan dipotong.
        </p>
      )}
    </div>
  );
}
