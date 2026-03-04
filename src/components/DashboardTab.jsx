import { useMemo } from "react";

function formatNumber(value) {
  return new Intl.NumberFormat().format(Math.round(value));
}

function formatKmFromMeters(distanceMeters) {
  return formatNumber((distanceMeters || 0) / 1000);
}

function severityRank(severity) {
  if (severity === "critical") return 4;
  if (severity === "high") return 3;
  if (severity === "medium") return 2;
  return 1;
}

export default function DashboardTab({ assets, cables, clients, alerts, logs, onOpenMap, onOpenCrm }) {
  const fibreMeters = useMemo(
    () => cables.reduce((sum, cable) => sum + Number(cable.distance_m || 0), 0),
    [cables]
  );
  const activeClients = useMemo(
    () => clients.filter((client) => client.status === "active").length,
    [clients]
  );
  const criticalAlerts = useMemo(
    () => alerts.filter((alert) => severityRank(alert.severity) >= 3).length,
    [alerts]
  );
  const onlineClients = useMemo(
    () => clients.filter((client) => client.pppoe_status === "online").length,
    [clients]
  );
  const uptimeScore = clients.length ? (onlineClients / clients.length) * 100 : 100;

  const recentFeed = useMemo(() => logs.slice(0, 8), [logs]);
  const activeTechnicians = useMemo(() => {
    const names = new Set();
    logs.slice(0, 50).forEach((entry) => {
      if (entry.actor_name) names.add(entry.actor_name);
    });
    return names.size;
  }, [logs]);

  const hotspotPoints = useMemo(
    () =>
      assets.slice(0, 5).map((asset, index) => ({
        id: asset.id,
        left: 12 + ((index * 19) % 74),
        top: 20 + ((index * 14) % 58),
        online: index % 2 === 0
      })),
    [assets]
  );

  return (
    <section className="dashboard-grid">
      <article className="ops-hero">
        <div>
          <h2>Operation Center</h2>
          <p className="muted">
            <span className="status-dot" /> System Status: Core nodes operational | Last sync: just now
          </p>
        </div>
        <div className="draw-controls">
          <button type="button" onClick={onOpenMap}>
            Open Network Map
          </button>
          <button type="button" onClick={onOpenCrm}>
            Open Client CRM
          </button>
        </div>
      </article>

      <article className="ops-kpi-card">
        <h3>Fibre Deployed</h3>
        <strong>{formatKmFromMeters(fibreMeters)} km</strong>
        <p>{cables.length} cables mapped</p>
      </article>
      <article className="ops-kpi-card">
        <h3>Active Clients</h3>
        <strong>{formatNumber(activeClients)}</strong>
        <p>{formatNumber(clients.length)} total customers</p>
      </article>
      <article className="ops-kpi-card">
        <h3>Critical Alerts</h3>
        <strong>{formatNumber(criticalAlerts)}</strong>
        <p>{alerts.length} open alert items</p>
      </article>
      <article className="ops-kpi-card">
        <h3>Availability Score</h3>
        <strong>{uptimeScore.toFixed(2)}%</strong>
        <p>{onlineClients} online sessions</p>
      </article>

      <article className="ops-map-card">
        <header className="table-head">
          <h2>Network Hotspots Map</h2>
          <p>Live topology pulse</p>
        </header>
        <div className="ops-map-surface">
          <div className="ops-map-glow" />
          {hotspotPoints.map((point) => (
            <span
              key={point.id}
              className={`ops-hotspot ${point.online ? "online" : "outage"}`}
              style={{ left: `${point.left}%`, top: `${point.top}%` }}
            />
          ))}
        </div>
      </article>

      <article className="ops-feed-card">
        <header className="table-head">
          <h2>Live Operations Feed</h2>
          <p>{recentFeed.length} recent events</p>
        </header>
        <div className="log-feed">
          {!recentFeed.length && <p className="muted">No recent operations yet.</p>}
          {recentFeed.map((entry) => (
            <div className="ops-feed-row" key={entry.id}>
              <small>{new Date(entry.created_at).toLocaleTimeString()}</small>
              <strong>{entry.action_type}</strong>
              <span>{entry.actor_name || "system"}</span>
            </div>
          ))}
        </div>
      </article>

      <article className="ops-wide-card">
        <header className="table-head">
          <h2>Recent Field Activities</h2>
          <p>{activeTechnicians} active technicians</p>
        </header>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Technician</th>
                <th>Action</th>
                <th>Entity</th>
                <th>Time</th>
              </tr>
            </thead>
            <tbody>
              {logs.slice(0, 6).map((entry) => (
                <tr key={entry.id}>
                  <td>{entry.actor_name || "system"}</td>
                  <td>{entry.action_type}</td>
                  <td>{entry.entity_type}</td>
                  <td>{new Date(entry.created_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>
    </section>
  );
}
