import { QueueItem } from "../types";

interface Props {
  queue: QueueItem[];
  isQueueRunning: boolean;
  currentJobId: string | null;
  canAdd: boolean;
  autoRegenerate: boolean;
  onAutoRegenerateChange: (v: boolean) => void;
  onAddToQueue: () => void;
  onStartQueue: () => void;
  onRemove: (id: string) => void;
  onMoveUp: (id: string) => void;
  onMoveDown: (id: string) => void;
  onCancelQueue: () => void;
}

function statusLabel(status: QueueItem["status"]): string {
  switch (status) {
    case "pending": return "⏳ Pending";
    case "rendering": return "▶ Rendering";
    case "completed": return "✅ Completed";
    case "failed": return "❌ Failed";
    case "cancelled": return "⛔ Cancelled";
  }
}

export default function QueuePanel({
  queue, isQueueRunning, currentJobId, canAdd,
  autoRegenerate, onAutoRegenerateChange,
  onAddToQueue, onStartQueue, onRemove, onMoveUp, onMoveDown, onCancelQueue,
}: Props) {
  const pendingCount = queue.filter(j => j.status === "pending").length;
  const isProcessing = isQueueRunning || queue.some(j => j.status === "rendering");

  return (
    <div className="card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <h3 style={{ margin: 0 }}>📋 Render Queue</h3>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={autoRegenerate}
              onChange={(e) => onAutoRegenerateChange(e.target.checked)}
            />
            Auto-regenerate before add
          </label>
          <button onClick={onAddToQueue} disabled={!canAdd || isProcessing}>
            + Add to Queue
          </button>
          {!isProcessing && pendingCount > 0 && (
            <button className="primary" onClick={onStartQueue}>
              ▶ Start Queue ({pendingCount})
            </button>
          )}
          {isProcessing && (
            <button className="danger" onClick={onCancelQueue}>
              ⏹ Cancel Queue
            </button>
          )}
        </div>
      </div>

      {queue.length === 0 ? (
        <div className="empty-state">No jobs in queue. Configure settings and click "Add to Queue".</div>
      ) : (
        <div style={{ maxHeight: 300, overflowY: "auto" }}>
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Job</th>
                <th>Status</th>
                <th style={{ width: 80 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {queue.map((item, i) => {
                const isCurrent = item.id === currentJobId;
                const isPending = item.status === "pending";
                return (
                  <tr key={item.id} style={{
                    background: isCurrent ? "var(--primary-bg)" : undefined,
                    opacity: item.status === "completed" || item.status === "cancelled" ? 0.6 : 1,
                  }}>
                    <td>{i + 1}</td>
                    <td style={{ wordBreak: "break-all", fontSize: 13 }}>{item.name}</td>
                    <td>
                      <span style={{
                        color: item.status === "completed" ? "var(--success)" :
                               item.status === "failed" ? "var(--danger)" :
                               isCurrent ? "var(--primary)" : undefined,
                      }}>
                        {isCurrent ? statusLabel("rendering") : statusLabel(item.status)}
                      </span>
                      {item.error && (
                        <span style={{ display: "block", fontSize: 11, color: "var(--danger)", marginTop: 2 }}>
                          {item.error}
                        </span>
                      )}
                      {item.outputPath && (
                        <span style={{ display: "block", fontSize: 11, color: "var(--text2)", wordBreak: "break-all", marginTop: 2 }}>
                          {item.outputPath}
                        </span>
                      )}
                    </td>
                    <td>
                      {!isProcessing && (
                        <div style={{ display: "flex", gap: 4 }}>
                          {isPending && (
                            <>
                              <button
                                style={{ fontSize: 11, padding: "2px 6px" }}
                                disabled={i === 0}
                                onClick={() => onMoveUp(item.id)}
                                title="Move up"
                              >↑</button>
                              <button
                                style={{ fontSize: 11, padding: "2px 6px" }}
                                disabled={i === queue.length - 1}
                                onClick={() => onMoveDown(item.id)}
                                title="Move down"
                              >↓</button>
                            </>
                          )}
                          {item.status !== "rendering" && (
                            <button
                              style={{ fontSize: 11, padding: "2px 6px" }}
                              onClick={() => onRemove(item.id)}
                              title="Remove"
                            >✕</button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
