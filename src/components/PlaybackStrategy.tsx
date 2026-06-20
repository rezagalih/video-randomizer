import { RenderSettings } from "../types";

interface Props {
  settings: RenderSettings;
  onChange: (s: RenderSettings) => void;
}

export default function PlaybackStrategy({ settings, onChange }: Props) {
  function update(d: Partial<RenderSettings>) {
    onChange({ ...settings, ...d });
  }

  return (
    <div className="card">
      <h3>▶️ Playback Strategy</h3>
      <div className="grid-2">
        <div className="form-group">
          <label>Video Playback</label>
          <select
            value={settings.video_playback_mode}
            onChange={(e) => update({ video_playback_mode: e.target.value as "shuffle" | "sequential" })}
          >
            <option value="shuffle">Shuffle</option>
            <option value="sequential">Sequential</option>
          </select>
        </div>
        <div className="form-group">
          <label>Music Playback</label>
          <select
            value={settings.music_playback_mode}
            onChange={(e) => update({ music_playback_mode: e.target.value as "shuffle" | "sequential" | "repeat_single" })}
          >
            <option value="shuffle">Shuffle</option>
            <option value="sequential">Sequential</option>
            <option value="repeat_single">Repeat Single Track</option>
          </select>
        </div>
      </div>
      <div className="grid-2">
        <div className="form-group">
          <label>
            <input
              type="checkbox"
              checked={settings.prevent_duplicates}
              onChange={(e) => update({ prevent_duplicates: e.target.checked })}
            />
            Prevent immediate duplicates
          </label>
        </div>
        <div className="form-group">
          <label>
            <input
              type="checkbox"
              checked={settings.loop_playlist}
              onChange={(e) => update({ loop_playlist: e.target.checked })}
            />
            Loop playlist
          </label>
        </div>
      </div>
      <div className="form-group">
        <label>Segment Duration — Pass 1 (seconds, 0 = all videos once)</label>
        <input
          type="number"
          min={0}
          step={0.5}
          value={settings.clip_duration}
          onChange={(e) => update({ clip_duration: parseFloat(e.target.value) || 0 })}
        />
        <div style={{ fontSize: 12, color: "var(--text2)", marginTop: 4 }}>
          Durasi total segmen yang dibuat dari semua video (di-shuffle & di-loop). Hasil segmen ini lalu di-loop lagi di Pass 2 untuk mencocokkan durasi musik. Contoh: set 60s → kumpulan video diisi sampai ~60 detik.
        </div>
      </div>
    </div>
  );
}
