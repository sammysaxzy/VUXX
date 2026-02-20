import { useCallback, useEffect, useMemo, useState } from "react";
import { CircleMarker, MapContainer, Polyline, Popup, TileLayer, Tooltip, useMapEvents } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import CustomersList from "../pages/customers/CustomersList.jsx";
import { fetchCustomers } from "../services/customerService.js";

const INITIAL_NODES = [
  { id: "olt-1", type: "olt", name: "OLT-A Ogba", lat: 6.622, lng: 3.341, area: "Ogba", oltId: "olt-1", status: "active" },
  { id: "olt-2", type: "olt", name: "OLT-B Omole", lat: 6.636, lng: 3.364, area: "Omole", oltId: "olt-2", status: "active" },
  { id: "mst-1", type: "mst", name: "MST Street A", lat: 6.625, lng: 3.352, area: "Ogba", oltId: "olt-1", status: "active" },
  { id: "mst-2", type: "mst", name: "MST Street B", lat: 6.629, lng: 3.358, area: "Ogba", oltId: "olt-1", status: "active" },
  { id: "mst-3", type: "mst", name: "MST Unity Rd", lat: 6.638, lng: 3.37, area: "Omole", oltId: "olt-2", status: "active" },
  { id: "client-1", type: "client", name: "Adewale House", lat: 6.631, lng: 3.361, area: "Ogba", oltId: "olt-1", status: "active" },
  { id: "client-2", type: "client", name: "Clara Bakery", lat: 6.628, lng: 3.355, area: "Ogba", oltId: "olt-1", status: "suspended" },
  { id: "client-3", type: "client", name: "Perfect Seam", lat: 6.639, lng: 3.378, area: "Omole", oltId: "olt-2", status: "active" }
];

const INITIAL_ROUTES = [
  { id: "r1", sourceId: "olt-1", targetId: "mst-1", status: "active", label: "Backbone-1" },
  { id: "r2", sourceId: "mst-1", targetId: "mst-2", status: "active", label: "Distribution-4C" },
  { id: "r3", sourceId: "mst-2", targetId: "client-1", status: "active", label: "Drop-1C" },
  { id: "r4", sourceId: "mst-1", targetId: "client-2", status: "faulty", label: "Drop-1C" },
  { id: "r5", sourceId: "olt-2", targetId: "mst-3", status: "active", label: "Backbone-2" },
  { id: "r6", sourceId: "mst-3", targetId: "client-3", status: "active", label: "Drop-1C" }
];


const NAV_ITEMS = ["Customers", "Plans", "Tickets", "RADIUS", "Map", "Reports"];

const NODE_COLORS = {
  olt: "#20c8ff",
  mst: "#ffb342",
  activeClient: "#21d07a",
  suspendedClient: "#ff4d57"
};

function MapClickListener({ mode, draftAsset, onMapAdd }) {
  useMapEvents({
    click(e) {
      if (mode === "add-mst" || mode === "add-client") {
        onMapAdd(e.latlng);
      }
    }
  });

  return mode !== "pan" ? (
    <div className="map-mode-hint">
      Click map to place: <strong>{mode === "add-mst" ? `MST (${draftAsset.name || "Unnamed"})` : mode === "add-client" ? `Client (${draftAsset.name || "Unnamed"})` : "Draw Fiber"}</strong>
    </div>
  ) : null;
}

function nextId(prefix) {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
}

export default function NocDashboard() {
  const [nodes, setNodes] = useState(INITIAL_NODES);
  const [routes, setRoutes] = useState(INITIAL_ROUTES);
  const [customers, setCustomers] = useState([]);
  const [customersLoading, setCustomersLoading] = useState(false);
  const [customersError, setCustomersError] = useState("");
  const [liveLogs, setLiveLogs] = useState([
    "[08:12:07] PPPoE session established for adewale@pppoe",
    "[08:16:31] Ticket #211 created: low signal near MST Street B",
    "[08:21:15] OLT-A uplink utilization reached 72%"
  ]);

  const [mode, setMode] = useState("pan");
  const [drawSourceId, setDrawSourceId] = useState("");
  const [activeNav, setActiveNav] = useState("Map");
  const [filters, setFilters] = useState({ area: "all", oltId: "all", plan: "all" });
  const [draftAsset, setDraftAsset] = useState({
    name: "",
    area: "Ogba",
    oltId: "olt-1",
    plan: "Home 40Mbps",
    status: "active"
  });
 
const loadCustomers = useCallback(async () => {
  setCustomersLoading(true);
  setCustomersError("");
  try {
    const payload = await fetchCustomers();
    setCustomers(payload);
  } catch (error) {
    const message = error?.response?.data?.error || error?.message || "Unable to load customers";
    setCustomersError(message);
  } finally {
    setCustomersLoading(false);
  }
}, []);

  useEffect(() => {
    loadCustomers();
  }, [loadCustomers]);

  const oltNodes = useMemo(() => nodes.filter((n) => n.type === "olt"), [nodes]);
  const areaOptions = useMemo(() => [...new Set(nodes.map((n) => n.area))], [nodes]);
  const planOptions = useMemo(() => [...new Set(customers.map((c) => c.plan))], [customers]);
  const isCustomersView = activeNav === "Customers";
  const customerByNodeId = useMemo(
    () => {
      return customers.reduce((acc, customer) => {
        if (customer.nodeId) {
          acc[customer.nodeId] = customer;
        }
        return acc;
      }, {});
    },
    [customers]
  );

  const filteredNodes = useMemo(() => {
    return nodes.filter((node) => {
      if (filters.area !== "all" && node.area !== filters.area) return false;
      if (filters.oltId !== "all" && node.oltId !== filters.oltId && node.id !== filters.oltId) return false;
      if (filters.plan !== "all" && node.type === "client") {
        return customerByNodeId[node.id]?.plan === filters.plan;
      }
      if (filters.plan !== "all" && node.type !== "client") {
        const linkedClient = routes.some((r) => {
          const source = nodes.find((n) => n.id === r.sourceId);
          const target = nodes.find((n) => n.id === r.targetId);
          const clientNode = source?.type === "client" ? source : target?.type === "client" ? target : null;
          return clientNode && customerByNodeId[clientNode.id]?.plan === filters.plan && (r.sourceId === node.id || r.targetId === node.id);
        });
        return linkedClient;
      }
      return true;
    });
  }, [customerByNodeId, filters, nodes, routes]);

  const filteredNodeIds = useMemo(() => new Set(filteredNodes.map((n) => n.id)), [filteredNodes]);

  const filteredRoutes = useMemo(() => {
    return routes.filter((route) => filteredNodeIds.has(route.sourceId) && filteredNodeIds.has(route.targetId));
  }, [filteredNodeIds, routes]);

  useEffect(() => {
    const timer = setInterval(() => {
      const logSamples = [
        "RADIUS auth request accepted",
        "ONU signal warning on client drop",
        "Plan upgrade synced to billing cache",
        "Fiber continuity test completed on sector Ogba-North",
        "PPPoE reconnection attempt detected"
      ];
      const pick = logSamples[Math.floor(Math.random() * logSamples.length)];
      const now = new Date();
      const stamp = now.toTimeString().slice(0, 8);
      setLiveLogs((prev) => [`[${stamp}] ${pick}`, ...prev].slice(0, 12));
    }, 6500);
    return () => clearInterval(timer);
  }, []);

  const mapCenter = useMemo(() => {
    if (!filteredNodes.length) return [6.63, 3.36];
    return [filteredNodes[0].lat, filteredNodes[0].lng];
  }, [filteredNodes]);

  function routePoints(route) {
    const source = nodes.find((n) => n.id === route.sourceId);
    const target = nodes.find((n) => n.id === route.targetId);
    if (!source || !target) return [];
    return [
      [source.lat, source.lng],
      [target.lat, target.lng]
    ];
  }

  function nodeColor(node) {
    if (node.type === "client") {
      return node.status === "active" ? NODE_COLORS.activeClient : NODE_COLORS.suspendedClient;
    }
    if (node.type === "olt") return NODE_COLORS.olt;
    return NODE_COLORS.mst;
  }

  function setTool(nextMode) {
    setMode((prev) => (prev === nextMode ? "pan" : nextMode));
    setDrawSourceId("");
  }

  function handleMapAdd(latlng) {
    if (mode !== "add-mst" && mode !== "add-client") return;
    const type = mode === "add-mst" ? "mst" : "client";
    if (!draftAsset.name.trim()) return;

    const newNode = {
      id: nextId(type),
      type,
      name: draftAsset.name.trim(),
      lat: Number(latlng.lat.toFixed(6)),
      lng: Number(latlng.lng.toFixed(6)),
      area: draftAsset.area,
      oltId: draftAsset.oltId,
      status: draftAsset.status
    };
    setNodes((prev) => [...prev, newNode]);

    if (type === "client") {
      const newCustomer = {
        id: nextId("cust"),
        nodeId: newNode.id,
        name: draftAsset.name.trim(),
        address: "Address pending",
        phone: "08000000000",
        email: `${newNode.id}@isp.local`,
        plan: draftAsset.plan,
        speed: draftAsset.plan.includes("100") ? "100Mbps" : draftAsset.plan.includes("60") ? "60Mbps" : "40Mbps",
        accountStatus: draftAsset.status,
        paymentStatus: "paid"
      };
      setCustomers((prev) => [...prev, newCustomer]);
    }

    setDraftAsset((prev) => ({ ...prev, name: "" }));
    setMode("pan");
  }

  function deleteNode(nodeId) {
    const target = nodes.find((n) => n.id === nodeId);
    if (!target || target.type === "olt") return;
    setNodes((prev) => prev.filter((n) => n.id !== nodeId));
    setRoutes((prev) => prev.filter((r) => r.sourceId !== nodeId && r.targetId !== nodeId));
    if (target.type === "client") {
      setCustomers((prev) => prev.filter((c) => c.nodeId !== nodeId));
    }
  }

  function editNode(node) {
    if (node.type === "olt") return;
    const name = window.prompt("Update name", node.name);
    if (!name) return;
    const status = window.prompt("Status (active/suspended)", node.status) || node.status;
    setNodes((prev) => prev.map((n) => (n.id === node.id ? { ...n, name: name.trim(), status: status === "suspended" ? "suspended" : "active" } : n)));
    if (node.type === "client") {
      setCustomers((prev) => prev.map((c) => (c.nodeId === node.id ? { ...c, name: name.trim(), accountStatus: status === "suspended" ? "suspended" : "active" } : c)));
    }
  }

  function handleNodeClick(node) {
    if (mode !== "draw-fiber") return;

    if (!drawSourceId) {
      if (node.type !== "olt" && node.type !== "mst") return;
      setDrawSourceId(node.id);
      return;
    }

    const source = nodes.find((n) => n.id === drawSourceId);
    const target = node;
    if (!source || source.id === target.id) return;
    if (!["olt", "mst"].includes(source.type)) return;
    if (!["mst", "client"].includes(target.type)) return;

    const exists = routes.some(
      (r) =>
        (r.sourceId === source.id && r.targetId === target.id) ||
        (r.sourceId === target.id && r.targetId === source.id)
    );
    if (!exists) {
      setRoutes((prev) => [
        ...prev,
        {
          id: nextId("r"),
          sourceId: source.id,
          targetId: target.id,
          status: target.status === "active" ? "active" : "planned",
          label: "Manual Fiber"
        }
      ]);
    }
    setDrawSourceId("");
  }

  const overdueCount = customers.filter((c) => c.paymentStatus === "overdue").length;
  const offlineCount = customers.filter((c) => c.accountStatus !== "active").length;

  return (
    <div className="noc-shell">
      <header className="topbar">
        <div className="brand-mark">FIBRE NOC</div>
        <nav className="topnav">
          {NAV_ITEMS.map((item) => (
            <button
              key={item}
              type="button"
              className={activeNav === item ? "nav-btn active" : "nav-btn"}
              onClick={() => setActiveNav(item)}
            >
              {item}
            </button>
          ))}
        </nav>
        <div className="top-alerts">
          <span className={overdueCount ? "pill danger" : "pill"}>{overdueCount} overdue</span>
          <span className={offlineCount ? "pill warn" : "pill"}>{offlineCount} offline</span>
        </div>
      </header>

      <main className={`main-grid ${isCustomersView ? "customers-view" : ""}`}>
        {isCustomersView ? (
          <section className="customers-panel">
            <CustomersList />
          </section>
        ) : (
          <>
            <aside className="left-panel">
              <section className="panel-block">
                <h3>Map Controls</h3>
                <div className="tool-row">
                  <button className={mode === "add-mst" ? "tool active" : "tool"} onClick={() => setTool("add-mst")}>Add MST</button>
                  <button className={mode === "add-client" ? "tool active" : "tool"} onClick={() => setTool("add-client")}>Add Client</button>
                  <button className={mode === "draw-fiber" ? "tool active" : "tool"} onClick={() => setTool("draw-fiber")}>Draw Fiber</button>
                  <button className={mode === "pan" ? "tool active" : "tool"} onClick={() => setTool("pan")}>Pan</button>
                </div>

                {(mode === "add-mst" || mode === "add-client") && (
                  <div className="draft-grid">
                    <input
                      placeholder={mode === "add-mst" ? "MST name" : "Client name"}
                      value={draftAsset.name}
                      onChange={(e) => setDraftAsset((prev) => ({ ...prev, name: e.target.value }))}
                    />
                    <select value={draftAsset.area} onChange={(e) => setDraftAsset((prev) => ({ ...prev, area: e.target.value }))}>
                      {areaOptions.map((area) => (
                        <option key={area} value={area}>{area}</option>
                      ))}
                    </select>
                    <select value={draftAsset.oltId} onChange={(e) => setDraftAsset((prev) => ({ ...prev, oltId: e.target.value }))}>
                      {oltNodes.map((olt) => (
                        <option key={olt.id} value={olt.id}>{olt.name}</option>
                      ))}
                    </select>
                    {mode === "add-client" && (
                      <select value={draftAsset.plan} onChange={(e) => setDraftAsset((prev) => ({ ...prev, plan: e.target.value }))}>
                        <option>Home 40Mbps</option>
                        <option>Biz 60Mbps</option>
                        <option>Biz 100Mbps</option>
                        <option>Enterprise 200Mbps</option>
                      </select>
                    )}
                  </div>
                )}

                {mode === "draw-fiber" && (
                  <p className="mode-note">
                    Step 1: click source (OLT/MST). Step 2: click destination (MST/Client). {drawSourceId ? `Selected source: ${drawSourceId}` : ""}
                  </p>
                )}
              </section>

              <section className="panel-block">
                <h3>Filters</h3>
                <div className="filter-grid">
                  <label>
                    Area
                    <select value={filters.area} onChange={(e) => setFilters((prev) => ({ ...prev, area: e.target.value }))}>
                      <option value="all">All Areas</option>
                      {areaOptions.map((area) => (
                        <option key={area} value={area}>{area}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    OLT
                    <select value={filters.oltId} onChange={(e) => setFilters((prev) => ({ ...prev, oltId: e.target.value }))}>
                      <option value="all">All OLTs</option>
                      {oltNodes.map((olt) => (
                        <option key={olt.id} value={olt.id}>{olt.name}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Plan Type
                    <select value={filters.plan} onChange={(e) => setFilters((prev) => ({ ...prev, plan: e.target.value }))}>
                      <option value="all">All Plans</option>
                      {planOptions.map((plan) => (
                        <option key={plan} value={plan}>{plan}</option>
                      ))}
                    </select>
                  </label>
                </div>
              </section>
            </aside>

            <section className="map-panel">
              <div className="alert-strip">
                {overdueCount > 0 && <div className="alert danger">Unpaid accounts: {overdueCount}</div>}
                {offlineCount > 0 && <div className="alert warn">Offline/suspended sessions: {offlineCount}</div>}
              </div>

              <MapContainer center={mapCenter} zoom={14} className="noc-map">
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                  url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                />
                <MapClickListener mode={mode} draftAsset={draftAsset} onMapAdd={handleMapAdd} />

                {filteredRoutes.map((route) => {
                  const pts = routePoints(route);
                  if (!pts.length) return null;
                  const isActive = route.status === "active";
                  const color = route.status === "faulty" ? "#ff4d57" : route.status === "planned" ? "#63a5ff" : "#32f3a8";
                  return (
                    <div key={route.id}>
                      {isActive && (
                        <Polyline positions={pts} pathOptions={{ color, weight: 11, opacity: 0.16 }} />
                      )}
                      <Polyline positions={pts} pathOptions={{ color, weight: isActive ? 4 : 3, opacity: isActive ? 0.95 : 0.75 }} />
                    </div>
                  );
                })}

                {filteredNodes.map((node) => {
                  const isSource = drawSourceId === node.id;
                  const radius = node.type === "olt" ? 9 : 7;
                  return (
                    <CircleMarker
                      key={node.id}
                      center={[node.lat, node.lng]}
                      radius={isSource ? radius + 3 : radius}
                      pathOptions={{
                        color: isSource ? "#fff" : nodeColor(node),
                        fillColor: nodeColor(node),
                        fillOpacity: 0.82,
                        weight: isSource ? 2.5 : 1.4
                      }}
                      eventHandlers={{
                        click: () => handleNodeClick(node)
                      }}
                    >
                      <Tooltip direction="top" offset={[0, -6]} opacity={1}>
                        {node.name}
                      </Tooltip>
                      <Popup>
                        <div className="popup">
                          <strong>{node.name}</strong>
                          <p>Type: {node.type.toUpperCase()}</p>
                          <p>Area: {node.area}</p>
                          <p>Status: {node.status}</p>
                          {(node.type === "mst" || node.type === "client") && (
                            <div className="popup-actions">
                              <button onClick={() => editNode(node)}>Edit</button>
                              <button onClick={() => deleteNode(node.id)}>Delete</button>
                            </div>
                          )}
                        </div>
                      </Popup>
                    </CircleMarker>
                  );
                })}
              </MapContainer>
            </section>
          </>
        )}
      </main>

      <footer className="bottom-panel">
        <section className="logs-panel">
          <h3>Live Session Logs</h3>
          <div className="log-list">
            {liveLogs.map((log) => (
              <div key={log} className="log-row">
                {log}
              </div>
            ))}
          </div>
        </section>
      </footer>
    </div>
  );
}
