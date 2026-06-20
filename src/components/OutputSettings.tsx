import { RenderSettings } from "../types";

interface Props {
  settings: RenderSettings;
  onChange: (s: RenderSettings) => void;
}

export default function OutputSettings({ settings, onChange }: Props) {
  async function selectFolder() {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const folder = await open({ directory: true });
    if (folder) {
      onChange({ ...settings, output_folder: folder as string });
    }
  }

  async function openFolder() {
    if (!settings.output_folder) return;
    const { invoke } = await import("@tauri-apps/api/core");
    try {
      await invoke("open_folder", { path: settings.output_folder });
    } catch (e) {
      alert(`Tidak dapat membuka folder: ${e}`);
    }
  }

  function update(d: Partial<RenderSettings>) {
    onChange({ ...settings, ...d });
  }

  return (
    <div className="card">
      <h3>💾 Output Settings</h3>
      <div className="form-group">
        <label>Output Folder</label>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input
            type="text"
            value={settings.output_folder || "Not selected"}
            readOnly
            style={{ flex: 1 }}
          />
          <button onClick={selectFolder}>📁 Change Folder</button>
          <button onClick={openFolder} disabled={!settings.output_folder}>📂 Open</button>
        </div>
      </div>
      <div className="form-group">
        <label>Output Filename</label>
        <input
          type="text"
          value={settings.output_filename}
          onChange={(e) => update({ output_filename: e.target.value })}
        />
        <div style={{ fontSize: 12, color: "var(--text2)", marginTop: 4 }}>
          Use: timestamp, music_name, custom text. Default: YYYYMMDD_HHMMSS
        </div>
      </div>
      <div className="form-group">
        <label>
          <input
            type="checkbox"
            checked={settings.delete_cache}
            onChange={(e) => update({ delete_cache: e.target.checked })}
          />
          Delete temporary cache after rendering
        </label>
      </div>
    </div>
  );
}
