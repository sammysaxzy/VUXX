import { useEffect, useMemo, useState } from "react";
import { io } from "socket.io-client";
import { MapContainer, Marker, Polyline, Popup, TileLayer, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { api } from "../api/client";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:4000";

const markerIcon = new L.Icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41]
});

const nodeColors = {
  mst: "#0088cc",
  closure: "#ff8a00",
  distribution: "#2e9b53",
  client: "#ab47bc",
  splitter: "#d32f2f"
};

const cableColors = {
  planned: "#607d8b",
  installed: "#1e88e5",
  active: "#2e7d32",
  faulty: "#d32f2f",
  maintenance: "#f9a825"
};

function MapClickHandler({ enabled, onClick }) {
  useMapEvents({
    click(e) {
      if (enabled) onClick(e.latlng);
    }
  });
  return null;
}

export default function Dashboard({ session, onLogout }) {
  const [nodes, setNodes] = useState([]);
  const [cables, setCables] = useState([]);
  const [allocations, setAllocations] = useState([]);
  const [mode, setMode] = useState("view");
  const [draftNode, setDraftNode] = useState({
    type: "mst",
    name: "",
    status: "planned"
  });
  const [draftCable, setDraftCable] = useState({
    name: "",
    coreCount: 12,
    status: "planned",
    startNodeId: "",
    endNodeId: ""
  });
  const [coreAllocation, setCoreAllocation] = useState({
    cableId: "",
    coreNumber: 1,
    toNodeId: "",
    status: "active"
  });
  const [error, setError] = useState("");

  const mapCenter = useMemo(() => {
    if (nodes[0]) return [nodes[0].latitude, nodes[0].longitude];
    return [6.5244, 3.3792];
  }, [nodes]);

  async function loadAll() {
    const [nodeRes, cableRes, allocRes] = await Promise.all([
      api.get("/api/nodes"),
      api.get("/api/cables"),
      api.get("/api/allocations")
    ]);
    setNodes(nodeRes.data);
    setCables(cableRes.data);
    setAllocations(allocRes.data);
  }

  useEffect(() => {
    loadAll().catch((err) => setError(err.response?.data?.error || "Failed to load dashboard"));
  }, []);

  useEffect(() => {
    const socket = io(API_BASE, {
      auth: { token: session.token }
    });
    const events = [
      "node.created",
      "node.updated",
      "node.deleted",
      "cable.created",
      "core.allocated",
      "splitter.created",
      "customer.created",
      "fault.created"
    ];
    for (const event of events) {
      socket.on(event, () => loadAll().catch(() => {}));
    }
    return () => socket.disconnect();
  }, [session.token]);

  async function addNodeFromMap(latlng) {
    if (mode !== "add-node") return;
    if (!draftNode.name.trim()) {
      setError("Node name is required before placing on map");
      return;
    }
    setError("");
    await api.post("/api/nodes", {
      ...draftNode,
      latitude: latlng.lat,
      longitude: latlng.lng
    });
    setDraftNode({ ...draftNode, name: "" });
    setMode("view");
  }

  async function createCable() {
    setError("");
    const start = nodes.find((n) => n.id === draftCable.startNodeId);
    const end = nodes.find((n) => n.id === draftCable.endNodeId);
    if (!start || !end) {
      setError("Select start and end nodes");
      return;
    }
    await api.post("/api/cables", {
      ...draftCable,
      coreCount: Number(draftCable.coreCount),
      pathGeojson: {
        type: "LineString",
        coordinates: [
          [start.longitude, start.latitude],
          [end.longitude, end.latitude]
        ]
      }
    });
    setDraftCable({
      name: "",
      coreCount: 12,
      status: "planned",
      startNodeId: "",
      endNodeId: ""
    });
  }

  async function allocateCore() {
    if (!coreAllocation.cableId) {
      setError("Select a cable");
      return;
    }
    setError("");
    await api.post(`/api/cables/${coreAllocation.cableId}/allocate-core`, {
      coreNumber: Number(coreAllocation.coreNumber),
      toNodeId: coreAllocation.toNodeId || undefined,
      status: coreAllocation.status
    });
  }

  return (
    <div className="dashboard">
      <aside className="sidebar">
        <div className="brand">
          {session.tenant?.logo_url ? (
            <img src={session.tenant.logo_url} alt="logo" className="logo" />
          ) : (
            <div className="logo-placeholder">ISP</div>
          )}
          <div>
            <strong>{session.tenant?.company_name || "ISP Dashboard"}</strong>
            <div className="muted small">{session.user.email}</div>
          </div>
        </div>

        <button className="secondary" onClick={onLogout}>
          Sign Out
        </button>

        <h3>Add Asset</h3>
        <label>
          Node Type
          <select
            value={draftNode.type}
            onChange={(e) => setDraftNode({ ...draftNode, type: e.target.value })}
          >
            <option value="mst">MST</option>
            <option value="closure">Closure</option>
            <option value="distribution">Distribution</option>
            <option value="client">Client</option>
            <option value="splitter">Splitter Node</option>
          </select>
        </label>
        <label>
          Node Name
          <input
            value={draftNode.name}
            onChange={(e) => setDraftNode({ ...draftNode, name: e.target.value })}
            placeholder="Street A MST"
          />
        </label>
        <label>
          Status
          <select
            value={draftNode.status}
            onChange={(e) => setDraftNode({ ...draftNode, status: e.target.value })}
          >
            <option value="planned">Planned</option>
            <option value="installed">Installed</option>
            <option value="active">Active</option>
            <option value="faulty">Faulty</option>
            <option value="maintenance">Maintenance</option>
          </select>
        </label>
        <button onClick={() => setMode(mode === "add-node" ? "view" : "add-node")}>
          {mode === "add-node" ? "Cancel Node Placement" : "Place Node On Map"}
        </button>

        <h3>Draw Cable</h3>
        <label>
          Name
          <input
            value={draftCable.name}
            onChange={(e) => setDraftCable({ ...draftCable, name: e.target.value })}
            placeholder="A-B 12 Core"
          />
        </label>
        <label>
          Start Node
          <select
            value={draftCable.startNodeId}
            onChange={(e) => setDraftCable({ ...draftCable, startNodeId: e.target.value })}
          >
            <option value="">Select start</option>
            {nodes.map((node) => (
              <option key={node.id} value={node.id}>
                {node.name} ({node.type})
              </option>
            ))}
          </select>
        </label>
        <label>
          End Node
          <select
            value={draftCable.endNodeId}
            onChange={(e) => setDraftCable({ ...draftCable, endNodeId: e.target.value })}
          >
            <option value="">Select end</option>
            {nodes.map((node) => (
              <option key={node.id} value={node.id}>
                {node.name} ({node.type})
              </option>
            ))}
          </select>
        </label>
        <label>
          Core Count
          <input
            type="number"
            min={1}
            value={draftCable.coreCount}
            onChange={(e) => setDraftCable({ ...draftCable, coreCount: Number(e.target.value) })}
          />
        </label>
        <label>
          Status
          <select
            value={draftCable.status}
            onChange={(e) => setDraftCable({ ...draftCable, status: e.target.value })}
          >
            <option value="planned">Planned</option>
            <option value="installed">Installed</option>
            <option value="active">Active</option>
            <option value="faulty">Faulty</option>
            <option value="maintenance">Maintenance</option>
          </select>
        </label>
        <button onClick={createCable}>Create Cable</button>

        <h3>Allocate Fibre Core</h3>
        <label>
          Cable
          <select
            value={coreAllocation.cableId}
            onChange={(e) => setCoreAllocation({ ...coreAllocation, cableId: e.target.value })}
          >
            <option value="">Select cable</option>
            {cables.map((cable) => (
              <option key={cable.id} value={cable.id}>
                {cable.name} ({cable.core_count} cores)
              </option>
            ))}
          </select>
        </label>
        <label>
          Core Number
          <input
            type="number"
            min={1}
            value={coreAllocation.coreNumber}
            onChange={(e) =>
              setCoreAllocation({ ...coreAllocation, coreNumber: Number(e.target.value) })
            }
          />
        </label>
        <label>
          Destination Node
          <select
            value={coreAllocation.toNodeId}
            onChange={(e) => setCoreAllocation({ ...coreAllocation, toNodeId: e.target.value })}
          >
            <option value="">Optional destination</option>
            {nodes.map((node) => (
              <option key={node.id} value={node.id}>
                {node.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Allocation Status
          <select
            value={coreAllocation.status}
            onChange={(e) => setCoreAllocation({ ...coreAllocation, status: e.target.value })}
          >
            <option value="active">Active</option>
            <option value="reserved">Reserved</option>
          </select>
        </label>
        <button onClick={allocateCore}>Allocate Core</button>

        <h3>Recent Allocations</h3>
        <div className="list">
          {allocations.slice(0, 8).map((item) => (
            <div key={item.id} className="list-item">
              Core {item.core_number} ({item.color}) - {item.status}
            </div>
          ))}
        </div>
        {error && <p className="error">{error}</p>}
      </aside>

      <section className="map-wrap">
        <MapContainer center={mapCenter} zoom={14} className="map">
          <MapClickHandler enabled={mode === "add-node"} onClick={addNodeFromMap} />
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />

          {nodes.map((node) => (
            <Marker key={node.id} icon={markerIcon} position={[node.latitude, node.longitude]}>
              <Popup>
                <strong>{node.name}</strong>
                <div>Type: {node.type}</div>
                <div>Status: {node.status}</div>
              </Popup>
            </Marker>
          ))}

          {cables.map((cable) => {
            const points = cable.path_geojson.coordinates.map((coord) => [coord[1], coord[0]]);
            return (
              <Polyline
                key={cable.id}
                positions={points}
                pathOptions={{ color: cableColors[cable.status] || "#1e88e5", weight: 4 }}
              >
                <Popup>
                  <strong>{cable.name}</strong>
                  <div>Cores: {cable.core_count}</div>
                  <div>Status: {cable.status}</div>
                  <div>
                    Used/Reserved:{" "}
                    {(cable.cores || []).filter((c) => c.status === "used" || c.status === "reserved")
                      .length}
                  </div>
                </Popup>
              </Polyline>
            );
          })}
        </MapContainer>

        <div className="legend">
          <strong>Node Types</strong>
          {Object.entries(nodeColors).map(([type, color]) => (
            <div key={type} className="legend-row">
              <span className="dot" style={{ backgroundColor: color }} />
              <span>{type}</span>
            </div>
          ))}
          <strong className="spaced">Cable Status</strong>
          {Object.entries(cableColors).map(([status, color]) => (
            <div key={status} className="legend-row">
              <span className="line" style={{ backgroundColor: color }} />
              <span>{status}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
