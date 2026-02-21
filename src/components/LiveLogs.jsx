export default function LiveLogs({ logs = [] }) {
  return (
    <section className="live-logs">
      <header>
        <h3>Live stream</h3>
        <p className="muted small">Telemetry &amp; RADIUS events</p>
      </header>
      <div className="log-table">
        <table>
          <thead>
            <tr>
              <th>Timestamp</th>
              <th>Level</th>
              <th>Source</th>
              <th>Event</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => (
              <tr key={log.id}>
                <td>{new Date(log.timestamp).toLocaleTimeString()}</td>
                <td className={`pill ${log.level === "critical" ? "danger" : log.level === "warning" ? "warn" : "info"}`}>
                  {log.level}
                </td>
                <td>{log.source}</td>
                <td>{log.message}</td>
              </tr>
            ))}
            {logs.length === 0 && (
              <tr>
                <td colSpan={4} className="muted">
                  Waiting for live telemetry...
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
