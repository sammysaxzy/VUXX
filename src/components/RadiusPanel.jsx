export default function RadiusPanel({ sessions = [], loading = false, onRefresh }) {
  return (
    <section className="radius-panel">
      <header className="panel-head">
        <div>
          <h3>RADIUS sessions</h3>
          <p className="muted small">Independent session telemetry.</p>
        </div>
        <button type="button" className="ghost-btn" onClick={onRefresh} disabled={loading}>
          Refresh
        </button>
      </header>
      <div className="radius-table-wrapper">
        <table>
          <thead>
            <tr>
              <th>PPPoE user</th>
              <th>Status</th>
              <th>Bandwidth</th>
              <th>NAS IP</th>
            </tr>
          </thead>
          <tbody>
            {sessions.length === 0 && (
              <tr>
                <td colSpan={4}>
                  <p className="muted">Waiting for sessions...</p>
                </td>
              </tr>
            )}
            {sessions.map((session) => (
              <tr key={session.id}>
                <td>{session.username}</td>
                <td>
                  <span className={`pill ${session.status === "active" ? "ok" : session.status === "suspended" ? "warn" : ""}`}>
                    {session.status}
                  </span>
                </td>
                <td>
                  {session.bandwidthUp || "0 Mbps"} / {session.bandwidthDown || "0 Mbps"}
                </td>
                <td>{session.ipAddress || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
