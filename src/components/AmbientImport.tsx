interface Props {
  ambientPath: string;
  ambientDuration: number;
  onSelect: (path: string) => void;
  onRemove: () => void;
}

function formatDur(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

export default function AmbientImport({ ambientPath, ambientDuration, onSelect, onRemove }: Props) {
  async function handlePick() {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const file = await open({
      multiple: false,
      filters: [{ name: "Audio", extensions: ["mp3", "wav", "flac", "aac", "m4a", "ogg"] }],
    });
    if (!file) return;
    const path = file as string;
    const { invoke } = await import("@tauri-apps/api/core");
    try {
      const meta = await invoke<{ duration: number }>("get_music_metadata", { path });
      if (meta.duration > 0) {
        onSelect(path);
      } else {
        alert("File audio tidak valid atau durasi 0.");
      }
    } catch {
      alert("Gagal membaca metadata file audio.");
    }
  }

  return (
    <div className="card">
      <h3>🌧️ Ambient Sound</h3>
      <p style={{ fontSize: 13, color: "var(--text2)", marginBottom: 8 }}>
        Optional: background sound (rain, river, white noise, etc.)
      </p>
      <div className="btn-group">
        {!ambientPath ? (
          <button onClick={handlePick}>Select Ambient File</button>
        ) : (
          <>
            <button onClick={handlePick}>Change</button>
            <button className="danger" onClick={onRemove}>Remove</button>
          </>
        )}
      </div>
      {ambientPath ? (
        <div style={{ marginTop: 8, padding: 12, background: "var(--surface2)", borderRadius: 6 }}>
          <div style={{ fontWeight: 600 }}>{ambientPath.split("/").pop() || ambientPath.split("\\").pop()}</div>
          <div style={{ fontSize: 13, color: "var(--text2)" }}>
            {formatDur(ambientDuration)}
          </div>
        </div>
      ) : (
        <div className="empty-state" style={{ padding: 16, marginTop: 8 }}>
          No ambient file selected. The video will use music only.
        </div>
      )}
    </div>
  );
}
