import { useMemo } from "react";

const STATUS_OPTIONS = ["inactive", "active", "suspended"];

export default function RadiusSessionPanel({
  sessions = [],
  loading = false,
  error = "",
  selectedCustomerId,
  selectedCustomerName,
  onRefresh,
  onStatusChange
}) {
  const filteredSessions = useMemo(() => {
    if (!selectedCustomerId) return sessions;
    return sessions.filter((session) => session.customerId === selectedCustomerId);
  }, [sessions, selectedCustomerId]);

  return (
    <section className="radius-panel radius-panel-module">
      <header className="radius-panel-head">
        <div>
          <h3>RADIUS Sessions</h3>
          <p className="muted small">
            {selectedCustomerName
              ? `Sessions linked to ${selectedCustomerName}`
              : "All sessions for active customers"}
          </p>
        </div>
        <button type="button" onClick={onRefresh} disabled={loading}>
          Refresh
        </button>
      </header>

      {error && <p className="muted error small">{error}</p>}

      {!error && (
        <div className="radius-table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Username</th>
                <th>Status</th>
                <th>Bandwidth</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {filteredSessions.length === 0 && (
                <tr>
                  <td colSpan={4}>
                    <p className="muted">No sessions to display.</p>
                  </td>
                </tr>
              )}
              {filteredSessions.map((session) => (
                <tr key={session.id}>
                  <td>{session.username}</td>
                  <td>
                    <div className="radius-status-control">
                      <span className={`pill ${session.status === "active" ? "ok" : session.status === "suspended" ? "warn" : ""}`}>
                        {session.status}
                      </span>
                      <select
                        value={session.status}
                        onChange={(event) => onStatusChange?.(session.id, event.target.value)}
                        disabled={loading}
                      >
                        {STATUS_OPTIONS.map((status) => (
                          <option key={status} value={status}>
                            {status}
                          </option>
                        ))}
                      </select>
                    </div>
                  </td>
                  <td>{session.bandwidth || "0 / 0 Mbps"}</td>
                  <td>{session.createdAt ? new Date(session.createdAt).toLocaleString() : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
