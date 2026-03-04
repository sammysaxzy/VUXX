import { useEffect, useMemo, useState } from "react";
import GoogleMapCanvas from "./GoogleMapCanvas.jsx";

const emptyForm = {
  full_name: "",
  phone: "",
  address: "",
  latitude: "",
  longitude: "",
  mst_asset_id: "",
  pppoe_username: "",
  pppoe_password: "",
  vlan_service_id: "",
  plan_name: "Business 50M",
  plan_speed_mbps: "50",
  olt_name: "",
  pon_port: "",
  onu_serial: "",
  rx_power_dbm: "",
  tx_power_dbm: "",
  notes: ""
};

const usageBars = [38, 34, 52, 64, 43, 71, 84, 56, 28, 40, 22, 47, 59, 43];

export default function CrmTab({
  clients,
  mstAssets,
  assets,
  cables,
  selectedClientPath,
  mapFocusPoint,
  selectedClientAssetIds,
  busy,
  onCreateClient,
  onActivateClient,
  onSuspendClient,
  onDeleteClient,
  onOpenMapPath
}) {
  const [form, setForm] = useState(emptyForm);
  const [selectedClientId, setSelectedClientId] = useState("");
  const [search, setSearch] = useState("");
  const [crmViewFilter, setCrmViewFilter] = useState("all");
  const [activationPick, setActivationPick] = useState({});

  const filteredClients = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return clients;
    return clients.filter((client) => {
      const text = `${client.full_name} ${client.pppoe_username} ${client.address} ${client.mst_name || ""}`.toLowerCase();
      return text.includes(term);
    });
  }, [clients, search]);

  const configuredClients = useMemo(() => {
    return clients.filter((client) => Boolean(client.pppoe_username || client.onu_serial || client.pon_port));
  }, [clients]);

  const visibleConfiguredClients = useMemo(() => {
    let rows = configuredClients;
    if (crmViewFilter !== "all") {
      rows = rows.filter((client) => client.status === crmViewFilter);
    }
    const term = search.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((client) => {
      const line = `${client.full_name} ${client.pppoe_username} ${client.vlan_service_id || ""} ${client.plan_name || ""} ${
        client.olt_name || ""
      } ${client.pon_port || ""} ${client.onu_serial || ""} ${client.address || ""}`.toLowerCase();
      return line.includes(term);
    });
  }, [configuredClients, crmViewFilter, search]);

  const crmCounts = useMemo(
    () => ({
      all: configuredClients.length,
      active: configuredClients.filter((client) => client.status === "active").length,
      pending: configuredClients.filter((client) => client.status === "pending").length,
      suspended: configuredClients.filter((client) => client.status === "suspended").length
    }),
    [configuredClients]
  );

  const selectedClient =
    clients.find((client) => client.id === selectedClientId) ||
    filteredClients[0] ||
    clients[0] ||
    null;

  const planSpeed = Number(selectedClient?.plan_speed_mbps || 0);
  const estimatedDown = planSpeed ? (planSpeed * 0.985).toFixed(1) : "-";
  const estimatedUp = planSpeed ? (planSpeed * 0.972).toFixed(1) : "-";

  useEffect(() => {
    if (!selectedClientId && clients.length) {
      setSelectedClientId(clients[0].id);
      onOpenMapPath(clients[0]);
    }
  }, [clients, selectedClientId, onOpenMapPath]);

  useEffect(() => {
    if (!selectedClient) return;
    setForm((prev) => ({
      ...prev,
      latitude: Number(selectedClient.latitude || prev.latitude || 0).toFixed(6),
      longitude: Number(selectedClient.longitude || prev.longitude || 0).toFixed(6),
      mst_asset_id: selectedClient.mst_asset_id || prev.mst_asset_id || ""
    }));
  }, [selectedClient]);

  function submit(event) {
    event.preventDefault();
    const payload = {
      ...form,
      latitude: Number(form.latitude),
      longitude: Number(form.longitude),
      plan_speed_mbps: Number(form.plan_speed_mbps),
      mst_asset_id: form.mst_asset_id || null,
      rx_power_dbm: form.rx_power_dbm ? Number(form.rx_power_dbm) : null,
      tx_power_dbm: form.tx_power_dbm ? Number(form.tx_power_dbm) : null,
      status: "pending"
    };
    void onCreateClient(payload);
    setForm(emptyForm);
  }

  function pickClient(client) {
    setSelectedClientId(client.id);
    onOpenMapPath(client);
  }

  function confirmDelete(clientId) {
    const allow = window.confirm("Delete this client from CRM and map?");
    if (!allow) return;
    void onDeleteClient(clientId);
  }

  return (
    <section className="crm-shell">
      <article className="crm-map-pane">
        <header className="crm-pane-head">
          <h2>Network Map</h2>
          <div className="draw-controls">
            <button type="button" onClick={() => selectedClient && onOpenMapPath(selectedClient)}>
              Recenter Client
            </button>
          </div>
        </header>
        <GoogleMapCanvas
          assets={assets}
          cables={cables}
          selectedAssetId={null}
          selectedCableId={null}
          highlightClientAssetIds={selectedClientAssetIds}
          focusPoint={mapFocusPoint}
          toolboxEnabled={false}
          drawModeEnabled={false}
          drawPathPoints={[]}
          onSelectAsset={() => {}}
          onSelectCable={() => {}}
        />
        <div className="crm-map-legend">
          <strong>Network Legend</strong>
          <span>
            <i className="legend-line" /> Distribution Fibre
          </span>
          <span>
            <i className="legend-dot active" /> Online Client
          </span>
          <span>
            <i className="legend-dot offline" /> Offline Client
          </span>
        </div>
      </article>

      <article className="crm-panel-pane">
        <header className="crm-profile-head">
          <div className="crm-avatar">{selectedClient?.full_name?.slice(0, 1) || "C"}</div>
          <div>
            <h2>{selectedClient?.full_name || "Select Client"}</h2>
            <p className="muted">
              ID: {selectedClient?.pppoe_username || "-"} · Member since{" "}
              {selectedClient?.created_at ? new Date(selectedClient.created_at).getFullYear() : "-"}
            </p>
            <p>{selectedClient?.address || "-"}</p>
          </div>
          <div className="crm-head-actions">
            <span className={`status-badge status-${selectedClient?.status || "pending"}`}>{selectedClient?.status || "pending"}</span>
            <button type="button">Ticket</button>
            <button type="button">Edit</button>
          </div>
        </header>

        <section className="crm-path-card">
          <h3>Physical Path Topology</h3>
          <div className="topology-row">
            <span className="topology-node">OLT</span>
            <span className="topology-line" />
            <span className="topology-node">HUB</span>
            <span className="topology-line" />
            <span className="topology-node active">
              {selectedClientPath?.mst?.name || selectedClient?.mst_name || "MST"}
            </span>
            <span className="topology-line" />
            <span className="topology-node ont">ONT</span>
          </div>
          <p>
            Fed by <strong>{selectedClientPath?.mst?.name || selectedClient?.mst_name || "-"}</strong>, splitter port{" "}
            <strong>{selectedClientPath?.splitter_port || selectedClient?.port_number || "-"}</strong>,{" "}
            <strong>{selectedClientPath?.core_color || selectedClient?.core_color || "-"}</strong> core.
          </p>
          <p className="muted">
            Estimated line distance: {Math.round(Number(selectedClientPath?.drop_cable?.distance_m || 0)) || "-"}m
          </p>
        </section>

        <section className="crm-kpi-grid">
          <article className="crm-info-card">
            <h4>Optical Levels</h4>
            <div className="metric-row">
              <span>RX Power</span>
              <strong>{selectedClient?.rx_power_dbm ?? "-"} dBm</strong>
            </div>
            <div className="metric-row">
              <span>TX Power</span>
              <strong>{selectedClient?.tx_power_dbm ?? "-"} dBm</strong>
            </div>
          </article>
          <article className="crm-info-card">
            <h4>Provisioning</h4>
            <div className="metric-row">
              <span>PPPoE</span>
              <strong>{selectedClient?.pppoe_username || "-"}</strong>
            </div>
            <div className="metric-row">
              <span>VLAN / PON</span>
              <strong>
                {selectedClient?.vlan_service_id || "-"} / {selectedClient?.pon_port || "-"}
              </strong>
            </div>
          </article>
        </section>

        <section className="crm-plan-card">
          <div className="crm-plan-head">
            <div>
              <h3>{selectedClient?.plan_name || "No Plan Selected"}</h3>
              <p className="muted">Unlimited symmetric fibre access</p>
            </div>
            <strong>${(planSpeed * 0.13 || 54.99).toFixed(2)}/mo</strong>
          </div>
          <div className="crm-speed-row">
            <div>
              <small>Download</small>
              <strong>{estimatedDown} Mbps</strong>
            </div>
            <div>
              <small>Upload</small>
              <strong>{estimatedUp} Mbps</strong>
            </div>
          </div>
        </section>

        <section className="crm-usage-card">
          <header className="table-head">
            <h3>Data Consumption (Current Month)</h3>
            <p>Total: {(planSpeed * 1.62).toFixed(1)} GB</p>
          </header>
          <div className="usage-bars">
            {usageBars.map((value, index) => (
              <span key={index} style={{ height: `${value}%` }} className={index === 7 ? "active" : ""} />
            ))}
          </div>
        </section>

        <section className="crm-actions-grid">
          <article className="card panel-card">
            <header className="table-head">
              <h2>Client Directory</h2>
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search client..." />
            </header>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Status</th>
                    <th>MST</th>
                    <th>Port</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredClients.map((client) => {
                    const selectedMst = activationPick[client.id] || client.mst_asset_id || "";
                    return (
                      <tr key={client.id}>
                        <td>{client.full_name}</td>
                        <td>{client.status}</td>
                        <td>{client.mst_name || "-"}</td>
                        <td>{client.port_number || "-"}</td>
                        <td className="actions-cell">
                          <button type="button" onClick={() => pickClient(client)}>
                            Open
                          </button>
                          <select
                            value={selectedMst}
                            onChange={(event) => setActivationPick((prev) => ({ ...prev, [client.id]: event.target.value }))}
                          >
                            <option value="">Select MST</option>
                            {mstAssets.map((mst) => (
                              <option key={mst.id} value={mst.id}>
                                {mst.name}
                              </option>
                            ))}
                          </select>
                          <button type="button" disabled={client.status === "active"} onClick={() => onActivateClient(client.id, selectedMst || null)}>
                            Activate
                          </button>
                          <button type="button" disabled={client.status === "suspended"} onClick={() => onSuspendClient(client.id)}>
                            Suspend
                          </button>
                          <button type="button" disabled={busy} onClick={() => confirmDelete(client.id)}>
                            Delete
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </article>

          <article className="card panel-card">
            <h2>Register New Client</h2>
            <form onSubmit={submit} className="stack-form">
              <input placeholder="Client name" value={form.full_name} onChange={(event) => setForm((prev) => ({ ...prev, full_name: event.target.value }))} />
              <input placeholder="Phone" value={form.phone} onChange={(event) => setForm((prev) => ({ ...prev, phone: event.target.value }))} />
              <input placeholder="Address" value={form.address} onChange={(event) => setForm((prev) => ({ ...prev, address: event.target.value }))} />
              <div className="draw-controls">
                <input
                  placeholder="Latitude"
                  value={form.latitude}
                  onChange={(event) => setForm((prev) => ({ ...prev, latitude: event.target.value }))}
                />
                <input
                  placeholder="Longitude"
                  value={form.longitude}
                  onChange={(event) => setForm((prev) => ({ ...prev, longitude: event.target.value }))}
                />
              </div>
              <select value={form.mst_asset_id} onChange={(event) => setForm((prev) => ({ ...prev, mst_asset_id: event.target.value }))}>
                <option value="">Select MST (optional)</option>
                {mstAssets.map((mst) => (
                  <option key={mst.id} value={mst.id}>
                    {mst.name}
                  </option>
                ))}
              </select>
              <input
                placeholder="PPPoE username"
                value={form.pppoe_username}
                onChange={(event) => setForm((prev) => ({ ...prev, pppoe_username: event.target.value }))}
              />
              <input
                placeholder="PPPoE password"
                value={form.pppoe_password}
                onChange={(event) => setForm((prev) => ({ ...prev, pppoe_password: event.target.value }))}
              />
              <input placeholder="Plan name" value={form.plan_name} onChange={(event) => setForm((prev) => ({ ...prev, plan_name: event.target.value }))} />
              <input
                placeholder="Speed Mbps"
                value={form.plan_speed_mbps}
                onChange={(event) => setForm((prev) => ({ ...prev, plan_speed_mbps: event.target.value }))}
              />
              <input placeholder="OLT Name" value={form.olt_name} onChange={(event) => setForm((prev) => ({ ...prev, olt_name: event.target.value }))} />
              <input placeholder="PON Port" value={form.pon_port} onChange={(event) => setForm((prev) => ({ ...prev, pon_port: event.target.value }))} />
              <input
                placeholder="ONU Serial"
                value={form.onu_serial}
                onChange={(event) => setForm((prev) => ({ ...prev, onu_serial: event.target.value }))}
              />
              <button type="submit" disabled={busy}>
                Add Client
              </button>
            </form>
          </article>
        </section>

        <section className="card panel-card crm-configured-card">
          <header className="table-head">
            <h2>All Configured Clients</h2>
            <p>
              Showing {visibleConfiguredClients.length} of {configuredClients.length}
            </p>
          </header>
          <div className="filter-tabs">
            <button type="button" className={crmViewFilter === "all" ? "active" : ""} onClick={() => setCrmViewFilter("all")}>
              All ({crmCounts.all})
            </button>
            <button
              type="button"
              className={crmViewFilter === "active" ? "active" : ""}
              onClick={() => setCrmViewFilter("active")}
            >
              Active ({crmCounts.active})
            </button>
            <button
              type="button"
              className={crmViewFilter === "pending" ? "active" : ""}
              onClick={() => setCrmViewFilter("pending")}
            >
              Pending ({crmCounts.pending})
            </button>
            <button
              type="button"
              className={crmViewFilter === "suspended" ? "active" : ""}
              onClick={() => setCrmViewFilter("suspended")}
            >
              Suspended ({crmCounts.suspended})
            </button>
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Status</th>
                  <th>Phone</th>
                  <th>Address</th>
                  <th>PPPoE Username</th>
                  <th>VLAN</th>
                  <th>Plan</th>
                  <th>OLT</th>
                  <th>PON</th>
                  <th>ONU Serial</th>
                  <th>MST</th>
                  <th>Leg</th>
                  <th>Core</th>
                  <th>RX/TX dBm</th>
                  <th>Last Seen</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {!visibleConfiguredClients.length && (
                  <tr>
                    <td colSpan={16}>No configured clients match current filter.</td>
                  </tr>
                )}
                {visibleConfiguredClients.map((client) => {
                  const selectedMst = activationPick[client.id] || client.mst_asset_id || "";
                  return (
                    <tr key={`cfg-${client.id}`}>
                      <td>{client.full_name}</td>
                      <td>{client.status}</td>
                      <td>{client.phone || "-"}</td>
                      <td>{client.address || "-"}</td>
                      <td>{client.pppoe_username || "-"}</td>
                      <td>{client.vlan_service_id || "-"}</td>
                      <td>
                        {client.plan_name || "-"} ({client.plan_speed_mbps || "-"}M)
                      </td>
                      <td>{client.olt_name || "-"}</td>
                      <td>{client.pon_port || "-"}</td>
                      <td>{client.onu_serial || "-"}</td>
                      <td>{client.mst_name || "-"}</td>
                      <td>{client.port_number || "-"}</td>
                      <td>{client.core_color || "-"}</td>
                      <td>
                        {client.rx_power_dbm ?? "-"} / {client.tx_power_dbm ?? "-"}
                      </td>
                      <td>{client.last_seen ? new Date(client.last_seen).toLocaleString() : "-"}</td>
                      <td className="actions-cell">
                        <button type="button" onClick={() => pickClient(client)}>
                          Open
                        </button>
                        <select
                          value={selectedMst}
                          onChange={(event) => setActivationPick((prev) => ({ ...prev, [client.id]: event.target.value }))}
                        >
                          <option value="">Select MST</option>
                          {mstAssets.map((mst) => (
                            <option key={mst.id} value={mst.id}>
                              {mst.name}
                            </option>
                          ))}
                        </select>
                        <button type="button" disabled={client.status === "active"} onClick={() => onActivateClient(client.id, selectedMst || null)}>
                          Activate
                        </button>
                        <button type="button" disabled={client.status === "suspended"} onClick={() => onSuspendClient(client.id)}>
                          Suspend
                        </button>
                        <button type="button" disabled={busy} onClick={() => confirmDelete(client.id)}>
                          Delete
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </article>
    </section>
  );
}
