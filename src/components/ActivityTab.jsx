import { useState } from "react";

const emptyEvent = {
  action_type: "fibre_installed",
  asset_id: "",
  client_id: "",
  cable_id: "",
  notes: "",
  photo_urls: ""
};

export default function ActivityTab({ logs, splices, assets, clients, cables, busy, onCreateFieldEvent }) {
  const [eventForm, setEventForm] = useState(emptyEvent);

  function submitEvent(event) {
    event.preventDefault();
    const payload = {
      action_type: eventForm.action_type,
      asset_id: eventForm.asset_id || null,
      client_id: eventForm.client_id || null,
      cable_id: eventForm.cable_id || null,
      notes: eventForm.notes,
      photo_urls: eventForm.photo_urls
        ? eventForm.photo_urls
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean)
        : [],
      before_state: {},
      after_state: {}
    };
    void onCreateFieldEvent(payload);
    setEventForm(emptyEvent);
  }

  return (
    <section className="tab-grid tab-grid-activity">
      <article className="card panel-card">
        <h2>Record Field Activity (Engineer)</h2>
        <form onSubmit={submitEvent} className="stack-form">
          <select value={eventForm.action_type} onChange={(event) => setEventForm((prev) => ({ ...prev, action_type: event.target.value }))}>
            <option value="fibre_installed">Fibre Installed</option>
            <option value="core_spliced">Core Spliced</option>
            <option value="client_connected">Client Connected</option>
            <option value="client_suspended">Client Suspended</option>
            <option value="mst_added">MST Added</option>
            <option value="mst_removed">MST Removed</option>
            <option value="mst_modified">MST Modified</option>
            <option value="splitter_replaced">Splitter Replaced</option>
            <option value="cable_rerouted">Cable Rerouted</option>
            <option value="fault_reported">Fault Reported</option>
            <option value="fault_resolved">Fault Resolved</option>
            <option value="fibre_cut_reported">Fibre Cut Reported</option>
            <option value="fibre_cut_resolved">Fibre Cut Resolved</option>
            <option value="maintenance_started">Maintenance Started</option>
            <option value="maintenance_completed">Maintenance Completed</option>
            <option value="network_upgraded">Network Upgraded</option>
          </select>
          <select value={eventForm.asset_id} onChange={(event) => setEventForm((prev) => ({ ...prev, asset_id: event.target.value }))}>
            <option value="">Related asset (optional)</option>
            {assets.map((asset) => (
              <option key={asset.id} value={asset.id}>
                {asset.name} ({asset.asset_type})
              </option>
            ))}
          </select>
          <select value={eventForm.client_id} onChange={(event) => setEventForm((prev) => ({ ...prev, client_id: event.target.value }))}>
            <option value="">Related client (optional)</option>
            {clients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.full_name}
              </option>
            ))}
          </select>
          <select value={eventForm.cable_id} onChange={(event) => setEventForm((prev) => ({ ...prev, cable_id: event.target.value }))}>
            <option value="">Related cable (optional)</option>
            {cables.map((cable) => (
              <option key={cable.id} value={cable.id}>
                {cable.label}
              </option>
            ))}
          </select>
          <input
            placeholder="Engineer notes (what was done on site)"
            value={eventForm.notes}
            onChange={(event) => setEventForm((prev) => ({ ...prev, notes: event.target.value }))}
          />
          <input
            placeholder="Photo evidence URLs (comma separated)"
            value={eventForm.photo_urls}
            onChange={(event) => setEventForm((prev) => ({ ...prev, photo_urls: event.target.value }))}
          />
          <button type="submit" disabled={busy}>
            Save Field Activity
          </button>
        </form>
      </article>

      <article className="card table-card">
        <header className="table-head">
          <h2>Audit Timeline</h2>
          <p>{logs.length} records</p>
        </header>
        <div className="log-feed">
          {!logs.length && <p className="muted">No audit entries yet.</p>}
          {logs.map((entry) => (
            <div key={entry.id} className="log-row">
              <div>
                <strong>{entry.action_type}</strong>
                <span>{entry.entity_type}</span>
                {Array.isArray(entry?.metadata?.photo_urls) && entry.metadata.photo_urls.length > 0 && (
                  <small>{entry.metadata.photo_urls.length} photo evidence link(s)</small>
                )}
              </div>
              <div>
                <small>{entry.actor_name || "system"}</small>
                <small>{new Date(entry.created_at).toLocaleString()}</small>
              </div>
            </div>
          ))}
        </div>
      </article>

      <article className="card table-card">
        <header className="table-head">
          <h2>Splice Records</h2>
          <p>{splices.length} events</p>
        </header>
        <div className="log-feed">
          {!splices.length && <p className="muted">No splicing activity yet.</p>}
          {splices.map((splice) => (
            <div key={splice.id} className="log-row">
              <div>
                <strong>{splice.engineer_name}</strong>
                <span>
                  {splice.from_core_color} {"->"} {splice.to_core_color}
                </span>
              </div>
              <div>
                <small>{splice.location_name || "no location"}</small>
                <small>{new Date(splice.created_at).toLocaleString()}</small>
              </div>
            </div>
          ))}
        </div>
      </article>
    </section>
  );
}
