import { SequenceItem } from "../types";

interface Props {
  sequence: SequenceItem[];
  totalDuration: number;
  onRegenerate: () => void;
}

export default function SequenceDisplay({ sequence, totalDuration, onRegenerate }: Props) {
  function formatDur(s: number): string {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  }

  if (sequence.length === 0) {
    return (
      <div className="card">
        <h3>📋 Generated Sequence</h3>
        <div className="empty-state">
          No sequence generated. Go to Settings tab and click "Next: Render →".
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <h3 style={{ margin: 0 }}>📋 Generated Sequence</h3>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ fontSize: 13, color: "var(--text2)" }}>
            Total: {formatDur(totalDuration)}
          </span>
          <button onClick={onRegenerate}>🔄 Regenerate</button>
        </div>
      </div>
      <div style={{ maxHeight: 200, overflowY: "auto" }}>
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Video</th>
              <th>Duration</th>
              <th>Start</th>
              <th>End</th>
            </tr>
          </thead>
          <tbody>
            {sequence.map((item, i) => (
              <tr key={i}>
                <td>{i + 1}</td>
                <td>{item.filename}</td>
                <td>{formatDur(item.duration)}</td>
                <td>{formatDur(item.start_time)}</td>
                <td>{formatDur(item.end_time)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
