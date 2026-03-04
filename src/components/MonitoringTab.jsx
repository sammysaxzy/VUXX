import { useState } from "react";

const emptySnapshot = {
  client_id: "",
  pppoe_status: "online",
  rx_power_dbm: "-19",
  tx_power_dbm: "2",
  uptime_seconds: "7200"
};

export default function MonitoringTab({ clients, alerts, busy, onUpdateMonitoring, onOpenMapPath }) {
  const [snapshot, setSnapshot] = useState(emptySnapshot);

  function submit(event) {
    event.preventDefault();
    if (!snapshot.client_id) return;
    const payload = {
      pppoe_status: snapshot.pppoe_status,
      rx_power_dbm: snapshot.rx_power_dbm ? Number(snapshot.rx_power_dbm) : null,
      tx_power_dbm: snapshot.tx_power_dbm ? Number(snapshot.tx_power_dbm) : null,
      uptime_seconds: snapshot.uptime_seconds ? Number(snapshot.uptime_seconds) : null
    };
    void onUpdateMonitoring(snapshot.client_id, payload);
  }

  return (
    <section className="tab-grid tab-grid-monitor">
      <article className="card panel-card">
        <h2>Push Monitoring Snapshot</h2>
        <form onSubmit={submit} className="stack-form">
          <select value={snapshot.client_id} onChange={(event) => setSnapshot((prev) => ({ ...prev, client_id: event.target.value }))}>
            <option value="">Select Client</option>
            {clients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.full_name}
              </option>
            ))}
          </select>
          <select value={snapshot.pppoe_status} onChange={(event) => setSnapshot((prev) => ({ ...prev, pppoe_status: event.target.value }))}>
            <option value="online">Online</option>
            <option value="offline">Offline</option>
            <option value="unknown">Unknown</option>
          </select>
          <input
            placeholder="RX Power (dBm)"
            value={snapshot.rx_power_dbm}
            onChange={(event) => setSnapshot((prev) => ({ ...prev, rx_power_dbm: event.target.value }))}
          />
          <input
            placeholder="TX Power (dBm)"
            value={snapshot.tx_power_dbm}
            onChange={(event) => setSnapshot((prev) => ({ ...prev, tx_power_dbm: event.target.value }))}
          />
          <input
            placeholder="Uptime seconds"
            value={snapshot.uptime_seconds}
            onChange={(event) => setSnapshot((prev) => ({ ...prev, uptime_seconds: event.target.value }))}
          />
          <button type="submit" disabled={busy}>
            Update Monitoring
          </button>
        </form>
      </article>

      <article className="card table-card">
        <header className="table-head">
          <h2>Router-Level Client State</h2>
        </header>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Client</th>
                <th>PPPoE</th>
                <th>RX/TX</th>
                <th>Last Seen</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {clients.map((client) => (
                <tr key={client.id}>
                  <td>{client.full_name}</td>
                  <td>{client.pppoe_status}</td>
                  <td>
                    {client.rx_power_dbm ?? "-"} / {client.tx_power_dbm ?? "-"}
                  </td>
                  <td>{client.last_seen ? new Date(client.last_seen).toLocaleString() : "-"}</td>
                  <td className="actions-cell">
                    <button
                      type="button"
                      onClick={() => onUpdateMonitoring(client.id, { pppoe_status: "online", rx_power_dbm: -19, tx_power_dbm: 2, uptime_seconds: 8200 })}
                    >
                      Mark Online
                    </button>
                    <button
                      type="button"
                      onClick={() => onUpdateMonitoring(client.id, { pppoe_status: "offline", rx_power_dbm: -30, tx_power_dbm: 0, uptime_seconds: 120 })}
                    >
                      Mark Offline
                    </button>
                    <button type="button" onClick={() => onOpenMapPath(client)}>
                      Open Map Link
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>

      <article className="card table-card">
        <header className="table-head">
          <h2>Active Alerts</h2>
        </header>
        <div className="alerts-list">
          {!alerts.length && <p className="muted">No active alerts.</p>}
          {alerts.map((alert) => (
            <div key={alert.id} className="alert-row">
              <strong>{alert.alert_type}</strong>
              <span>{alert.client_name}</span>
              <span>{alert.severity}</span>
              <small>{new Date(alert.created_at).toLocaleString()}</small>
              <p>{alert.message}</p>
            </div>
          ))}
        </div>
      </article>
    </section>
  );
}

