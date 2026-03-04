import { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import { CircleMarker, MapContainer, Marker, Polyline, Popup, TileLayer, Tooltip, useMap, useMapEvents } from "react-leaflet";
import "leaflet/dist/leaflet.css";

const DEFAULT_CENTER = { lat: 6.5244, lng: 3.3792 };
const DEFAULT_MAPLIBRE_STYLE = import.meta.env.VITE_MAPLIBRE_STYLE_URL || "https://demotiles.maplibre.org/style.json";

const ASSET_COLORS = {
  mst: "#22c55e",
  fat: "#06b6d4",
  fdb: "#38bdf8",
  pole: "#f59e0b",
  manhole: "#f97316",
  olt: "#2563eb",
  splice_closure: "#14b8a6",
  client_premise: "#60a5fa"
};

const CABLE_CORE_OPTIONS = [1, 2, 4, 8, 12, 24, 48];
const ASSET_TOOL_OPTIONS = [
  { type: "mst", icon: "MST", label: "MST Box" },
  { type: "fat", icon: "FAT", label: "FAT" },
  { type: "fdb", icon: "FDB", label: "Cabinet" },
  { type: "splice_closure", icon: "CLS", label: "Closure" },
  { type: "olt", icon: "OLT", label: "OLT" },
  { type: "pole", icon: "POL", label: "Pole" },
  { type: "manhole", icon: "MH", label: "Manhole" }
];
const FIBRE_COLORS = [
  "Blue",
  "Orange",
  "Green",
  "Brown",
  "Slate",
  "White",
  "Red",
  "Black",
  "Yellow",
  "Violet",
  "Rose",
  "Aqua"
];

let mapLibreLoaderPromise;

function resolveCenter(assets) {
  if (!assets.length) return DEFAULT_CENTER;
  return {
    lat: Number(assets[0].latitude),
    lng: Number(assets[0].longitude)
  };
}

function cableStroke(cableType, faultyCores = 0) {
  if (Number(faultyCores || 0) > 0) return "#ef4444";
  if (cableType === "drop") return "#22c55e";
  if (cableType === "underground") return "#f59e0b";
  return "#3b82f6";
}

function cableCoordinates(cable) {
  const points = cable?.geometry?.coordinates || [];
  return points.map(([lng, lat]) => [Number(lat), Number(lng)]);
}

function coreColorName(coreNumber) {
  const index = (coreNumber - 1) % FIBRE_COLORS.length;
  const batch = Math.floor((coreNumber - 1) / FIBRE_COLORS.length) + 1;
  const base = FIBRE_COLORS[index];
  return batch === 1 ? base : `${base} (${batch})`;
}

function cableCorePalette(coreCount) {
  if (!Number.isFinite(Number(coreCount)) || Number(coreCount) <= 0) return "-";
  const total = Number(coreCount);
  const labels = Array.from({ length: total }, (_, i) => coreColorName(i + 1));
  if (labels.length <= 12) return labels.join(", ");
  const first = labels.slice(0, 12).join(", ");
  return `${first} ... +${labels.length - 12} more`;
}

function coreUsageSummary(cable, cableUsage) {
  const total = Number(cable?.core_count || 0);
  const usageMatches = String(cableUsage?.cable?.id || "") === String(cable?.id || "");
  const detailedCores = usageMatches && Array.isArray(cableUsage?.cores) ? cableUsage.cores : null;

  if (detailedCores) {
    const used = detailedCores.filter((core) => core.status === "used");
    const free = detailedCores.filter((core) => core.status === "free");
    const reserved = detailedCores.filter((core) => core.status === "reserved");
    const faulty = detailedCores.filter((core) => core.status === "faulty");
    return {
      total,
      usedCount: used.length,
      freeCount: free.length,
      reservedCount: reserved.length,
      faultyCount: faulty.length,
      usedList: used.map((core) => `${core.color_name} (#${core.core_number})`),
      coreRows: detailedCores.map((core) => ({
        core_number: core.core_number,
        color_name: core.color_name,
        status: core.status
      })),
      detailed: true
    };
  }

  return {
    total,
    usedCount: Number(cable?.used_cores || 0),
    freeCount: Number(cable?.free_cores ?? Math.max(total - Number(cable?.used_cores || 0), 0)),
    reservedCount: Number(cable?.reserved_cores || 0),
    faultyCount: Number(cable?.faulty_cores || 0),
    usedList: [],
    coreRows: [],
    detailed: false
  };
}

function haversineMeters(a, b) {
  const lat1 = Number(a.lat) * (Math.PI / 180);
  const lat2 = Number(b.lat) * (Math.PI / 180);
  const dLat = (Number(b.lat) - Number(a.lat)) * (Math.PI / 180);
  const dLng = (Number(b.lng) - Number(a.lng)) * (Math.PI / 180);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function totalLineMeters(points) {
  if (!Array.isArray(points) || points.length < 2) return 0;
  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    total += haversineMeters(points[i - 1], points[i]);
  }
  return total;
}

function mstSplitterLabel(asset) {
  return asset?.splitter_type || "MST";
}

function mstClientCount(asset) {
  return Number(asset?.used_ports || 0);
}

function mstIcon(asset, selected) {
  const splitter = mstSplitterLabel(asset);
  return L.divIcon({
    className: "mst-divicon-wrap",
    html: `<div class="mst-divicon ${selected ? "selected" : ""}">${splitter}</div>`,
    iconSize: [44, 24],
    iconAnchor: [22, 12]
  });
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function buildGeoJson(
  assets,
  cables,
  selectedAssetId,
  selectedCableId,
  drawPathPoints = [],
  highlightClientAssetIds = []
) {
  const features = [];
  const highlightedClientSet = new Set(highlightClientAssetIds);
  const clientFilterActive = highlightedClientSet.size > 0;

  for (const cable of cables) {
    const points = cable?.geometry?.coordinates || [];
    if (points.length < 2) continue;
    features.push({
      type: "Feature",
      geometry: { type: "LineString", coordinates: points },
      properties: {
        id: cable.id,
        feature_type: "cable",
        cable_type: cable.cable_type,
        core_count: Number(cable.core_count || 0),
        faulty_cores: Number(cable.faulty_cores || 0),
        core_label:
          Number(cable.faulty_cores || 0) > 0
            ? `${Number(cable.core_count || 0)}-core | FAULT`
            : `${Number(cable.core_count || 0)}-core`,
        selected: cable.id === selectedCableId ? 1 : 0
      }
    });
  }

  for (const asset of assets) {
    features.push({
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: [Number(asset.longitude), Number(asset.latitude)]
      },
      properties: {
        id: asset.id,
        feature_type: "asset",
        asset_type: asset.asset_type,
        selected: asset.id === selectedAssetId ? 1 : 0,
        highlighted_client: highlightedClientSet.has(asset.id) ? 1 : 0,
        client_filter_active: clientFilterActive ? 1 : 0,
        splitter_type: mstSplitterLabel(asset),
        used_ports: mstClientCount(asset),
        client_count_label: `${mstClientCount(asset)} clients`
      }
    });
  }

  if (drawPathPoints.length >= 2) {
    features.push({
      type: "Feature",
      geometry: {
        type: "LineString",
        coordinates: drawPathPoints.map((point) => [Number(point.lng), Number(point.lat)])
      },
      properties: {
        id: "draw-preview-line",
        feature_type: "draw_preview_line"
      }
    });
  }

  for (let index = 0; index < drawPathPoints.length; index += 1) {
    const point = drawPathPoints[index];
    features.push({
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: [Number(point.lng), Number(point.lat)]
      },
      properties: {
        id: `draw-preview-point-${index}`,
        feature_type: "draw_preview_point"
      }
    });
  }

  return { type: "FeatureCollection", features };
}

function loadMapLibre() {
  if (window.maplibregl) return Promise.resolve(window.maplibregl);
  if (mapLibreLoaderPromise) return mapLibreLoaderPromise;

  mapLibreLoaderPromise = new Promise((resolve, reject) => {
    const existingCss = document.querySelector("link[data-maplibre='1']");
    if (!existingCss) {
      const css = document.createElement("link");
      css.rel = "stylesheet";
      css.href = "https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css";
      css.dataset.maplibre = "1";
      document.head.appendChild(css);
    }

    const script = document.createElement("script");
    script.src = "https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js";
    script.async = true;
    script.onload = () => resolve(window.maplibregl);
    script.onerror = () => reject(new Error("Failed to load MapLibre from CDN."));
    document.body.appendChild(script);
  });

  return mapLibreLoaderPromise;
}

function LeafletFocusController({ focusPoint }) {
  const map = useMap();

  useEffect(() => {
    if (!focusPoint) return;
    map.flyTo([Number(focusPoint.lat), Number(focusPoint.lng)], focusPoint.zoom || 18, { duration: 0.8 });
  }, [focusPoint, map]);

  return null;
}

function LeafletInteractionController({
  mapAction,
  onDrawPointAdd,
  onMeasurePointAdd,
  onPlaceAssetByPoint,
  onMoveSelectedAssetByPoint
}) {
  useMapEvents({
    click(event) {
      const point = { lat: event.latlng.lat, lng: event.latlng.lng };
      if (mapAction === "draw_cable") {
        onDrawPointAdd?.(point);
        return;
      }
      if (mapAction === "measure") {
        onMeasurePointAdd?.(point);
        return;
      }
      if (mapAction === "place_asset") {
        onPlaceAssetByPoint?.(point);
        return;
      }
      if (mapAction === "move_selected") {
        onMoveSelectedAssetByPoint?.(point);
      }
    }
  });
  return null;
}

function LeafletNetworkMap({
  assets,
  cables,
  clients,
  cableUsage,
  selectedAssetId,
  selectedCableId,
  highlightClientAssetIds,
  selectedMstCapacity,
  selectedOltPorts,
  mapObjectDetails,
  onDeleteClient,
  onCreateClientAtMstLeg,
  busy,
  onSelectAsset,
  onSelectCable,
  focusPoint,
  mapAction,
  measurePoints,
  onMeasurePointAdd,
  onPlaceAssetByPoint,
  onMoveSelectedAssetByPoint,
  onAssetClickForTools,
  drawModeEnabled,
  drawPathPoints,
  onDrawPointAdd
}) {
  const center = useMemo(() => resolveCenter(assets), [assets]);
  const highlightedClientSet = useMemo(() => new Set(highlightClientAssetIds || []), [highlightClientAssetIds]);
  const clientFilterActive = highlightedClientSet.size > 0;
  const clientByPremiseId = useMemo(() => {
    const lookup = new Map();
    (clients || []).forEach((client) => {
      if (client?.premise_asset_id) lookup.set(client.premise_asset_id, client);
    });
    return lookup;
  }, [clients]);
  const [quickCreateTarget, setQuickCreateTarget] = useState(null);
  const [quickClientForm, setQuickClientForm] = useState({
    full_name: "",
    phone: "",
    address: "",
    latitude: "",
    longitude: ""
  });

  function buildDefaultPppoeUsername(name) {
    const stem = String(name || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "")
      .slice(0, 10);
    const suffix = Date.now().toString().slice(-4);
    return `${stem || "client"}${suffix}`;
  }

  function openQuickCreate(asset, legNumber) {
    const isSame = quickCreateTarget?.mstId === asset.id && quickCreateTarget?.leg === legNumber;
    if (isSame) {
      setQuickCreateTarget(null);
      return;
    }
    setQuickCreateTarget({ mstId: asset.id, leg: legNumber });
    setQuickClientForm({
      full_name: "",
      phone: "",
      address: "",
      latitude: Number(asset.latitude).toFixed(6),
      longitude: Number(asset.longitude).toFixed(6)
    });
  }

  function submitQuickCreate(event, asset, legNumber) {
    event.preventDefault();
    const fullName = quickClientForm.full_name.trim();
    const address = quickClientForm.address.trim();
    if (!fullName || !address) return;
    const payload = {
      full_name: fullName,
      phone: quickClientForm.phone.trim() || null,
      address,
      latitude: Number(quickClientForm.latitude),
      longitude: Number(quickClientForm.longitude),
      status: "pending",
      mst_asset_id: asset.id,
      pppoe_username: buildDefaultPppoeUsername(fullName),
      pppoe_password: "Client123!",
      vlan_service_id: null,
      plan_name: "Residential 20M",
      plan_speed_mbps: 20,
      olt_name: "OLT-UNASSIGNED",
      pon_port: "PON-1",
      onu_serial: `ONU-${Date.now().toString().slice(-8)}`,
      rx_power_dbm: null,
      tx_power_dbm: null,
      notes: "Created from map popup"
    };
    onCreateClientAtMstLeg?.(asset.id, legNumber, payload);
    setQuickCreateTarget(null);
    setQuickClientForm({ full_name: "", phone: "", address: "", latitude: "", longitude: "" });
  }
  const selectedNodeClients = useMemo(() => {
    if (!Array.isArray(mapObjectDetails?.clients)) return [];
    return mapObjectDetails.clients;
  }, [mapObjectDetails]);
  const measureDistanceM = useMemo(() => totalLineMeters(measurePoints || []), [measurePoints]);

  return (
    <MapContainer
      center={[center.lat, center.lng]}
      zoom={17}
      scrollWheelZoom
      className="map-stage"
      zoomControl
      preferCanvas
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {cables.map((cable) => {
        const positions = cableCoordinates(cable);
        const usage = coreUsageSummary(cable, cableUsage);
        if (positions.length < 2) return null;
        return (
          <Polyline
            key={cable.id}
            positions={positions}
            pathOptions={{
              color: cableStroke(cable.cable_type, cable.faulty_cores),
              weight: selectedCableId === cable.id ? 6 : 3,
              opacity: selectedCableId === cable.id ? 1 : 0.85,
              dashArray: Number(cable.faulty_cores || 0) > 0 ? "6 6" : undefined
            }}
            eventHandlers={{ click: () => onSelectCable?.(cable) }}
          >
            <Tooltip permanent direction="center" className="cable-core-tooltip">
              {Number(cable.core_count || 0)}-core
            </Tooltip>
            <Popup minWidth={320}>
              <div className="map-popup">
                <h4>{cable.label || "Fibre Cable"}</h4>
                <p>
                  Type: <strong>{cable.cable_type || "-"}</strong> | Designed cores:{" "}
                  <strong>{usage.total}</strong>
                </p>
                <p>
                  Used: <strong>{usage.usedCount}</strong> | Free: <strong>{usage.freeCount}</strong> |
                  Reserved: <strong>{usage.reservedCount}</strong> | Faulty:{" "}
                  <strong>{usage.faultyCount}</strong>
                </p>
                <p>
                  Used cores list:{" "}
                  <strong>{usage.usedList.length ? usage.usedList.join(", ") : "None used yet"}</strong>
                </p>
                {!usage.detailed && (
                  <p className="muted">Tip: click this line once to load exact used core list.</p>
                )}
                <p>
                  Distance: <strong>{Number(cable.distance_m || 0).toFixed(1)} m</strong>
                </p>
                <p>
                  Core colors on this run: <strong>{cableCorePalette(cable.core_count)}</strong>
                </p>
                {!!usage.coreRows.length && (
                  <div className="map-core-list">
                    {usage.coreRows.map((core) => (
                      <span key={`${cable.id}-${core.core_number}`} className={`map-core-chip status-${core.status}`}>
                        #{core.core_number} {core.color_name} ({core.status})
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </Popup>
          </Polyline>
        );
      })}
      {assets.map((asset) => {
        const isSelected = selectedAssetId === asset.id;
        const assetProps = asset?.properties || {};
        if (asset.asset_type === "mst") {
          const legs = isSelected ? selectedMstCapacity?.ports || [] : [];
          const splitter = selectedMstCapacity?.mst?.splitter_type || asset.splitter_type || "1/8";
          const used = selectedMstCapacity?.mst?.used_ports ?? Number(asset.used_ports || 0);
          const total = selectedMstCapacity?.mst?.legs_total ?? asset.total_ports ?? selectedMstCapacity?.mst?.total_ports ?? "-";
          const remaining = selectedMstCapacity?.mst?.legs_remaining ?? asset.free_ports ?? "-";
          return (
            <Marker
              key={asset.id}
              position={[Number(asset.latitude), Number(asset.longitude)]}
              icon={mstIcon(asset, isSelected)}
              eventHandlers={{
                click: () => {
                  if (onAssetClickForTools) {
                    onAssetClickForTools(asset);
                    return;
                  }
                  onSelectAsset?.(asset);
                }
              }}
            >
              <Tooltip permanent direction="top" offset={[0, -16]} className="mst-client-tooltip">
                {mstClientCount(asset)} clients
              </Tooltip>
              <Popup minWidth={330}>
                <div className="map-popup">
                  <h4>{asset.name}</h4>
                  <p>
                    Splitter: <strong>{splitter}</strong> | Used: <strong>{used}</strong> | Remaining: <strong>{remaining}</strong> / {total}
                  </p>
                  {(assetProps.installation_date || assetProps.installer_name) && (
                    <p>
                      Installed: <strong>{assetProps.installation_date || "-"}</strong> by{" "}
                      <strong>{assetProps.installer_name || "-"}</strong>
                    </p>
                  )}
                  {assetProps.mount_type && (
                    <p>
                      Mount: <strong>{assetProps.mount_type}</strong>
                    </p>
                  )}
                  {assetProps.site_notes && (
                    <p>
                      Notes: <strong>{assetProps.site_notes}</strong>
                    </p>
                  )}
                  {!isSelected && <p className="muted">Click this MST once to load live legs and connected clients.</p>}
                  {isSelected && (
                    <div className="map-popup-legs">
                      {!legs.length && <p className="muted">No leg data yet.</p>}
                      {!!legs.length && (
                        <div className="map-leg-grid">
                          {legs.map((port) => {
                            const isCreateOpen =
                              quickCreateTarget?.mstId === asset.id && quickCreateTarget?.leg === port.port_number;
                            return (
                              <article
                                key={port.splitter_port_id}
                                className={`map-leg-card ${port.status === "free" ? "leg-free" : "leg-used"} ${isCreateOpen ? "leg-selected" : ""}`}
                              >
                                <header>
                                  <strong>Leg {port.port_number}</strong>
                                  <span>{port.status}</span>
                                </header>
                                <p>
                                  Client: <strong>{port.client_name || "No client"}</strong>
                                </p>
                                <p>
                                  PPPoE: <strong>{port.pppoe_status || "-"}</strong>
                                </p>
                                <p>
                                  Core: <strong>{port.core_color || "-"}</strong>
                                </p>
                                <div className="draw-controls">
                                  {port.status === "free" ? (
                                    <button type="button" onClick={() => openQuickCreate(asset, port.port_number)}>
                                      {isCreateOpen ? "Close Form" : `Add Client on Leg ${port.port_number}`}
                                    </button>
                                  ) : (
                                    <button
                                      type="button"
                                      disabled={!port.client_id || busy}
                                      onClick={() => onDeleteClient?.(port.client_id)}
                                    >
                                      Delete Client
                                    </button>
                                  )}
                                </div>
                                {port.status === "free" && isCreateOpen && (
                                  <form className="quick-client-form" onSubmit={(event) => submitQuickCreate(event, asset, port.port_number)}>
                                    <input
                                      placeholder="Client full name"
                                      value={quickClientForm.full_name}
                                      onChange={(event) =>
                                        setQuickClientForm((prev) => ({ ...prev, full_name: event.target.value }))
                                      }
                                      required
                                    />
                                    <input
                                      placeholder="Phone (optional)"
                                      value={quickClientForm.phone}
                                      onChange={(event) => setQuickClientForm((prev) => ({ ...prev, phone: event.target.value }))}
                                    />
                                    <input
                                      placeholder="Address"
                                      value={quickClientForm.address}
                                      onChange={(event) =>
                                        setQuickClientForm((prev) => ({ ...prev, address: event.target.value }))
                                      }
                                      required
                                    />
                                    <div className="draw-controls">
                                      <input
                                        placeholder="Latitude"
                                        value={quickClientForm.latitude}
                                        onChange={(event) =>
                                          setQuickClientForm((prev) => ({ ...prev, latitude: event.target.value }))
                                        }
                                        required
                                      />
                                      <input
                                        placeholder="Longitude"
                                        value={quickClientForm.longitude}
                                        onChange={(event) =>
                                          setQuickClientForm((prev) => ({ ...prev, longitude: event.target.value }))
                                        }
                                        required
                                      />
                                    </div>
                                    <div className="draw-controls">
                                      <button type="submit" disabled={busy}>
                                        Save Client on Leg {port.port_number}
                                      </button>
                                    </div>
                                  </form>
                                )}
                              </article>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </Popup>
            </Marker>
          );
        }

        const isClientPremise = asset.asset_type === "client_premise";
        const mappedClient = isClientPremise ? clientByPremiseId.get(asset.id) || null : null;
        const isHighlightedClient = isClientPremise && highlightedClientSet.has(asset.id);
        const isDimmedClient = isClientPremise && clientFilterActive && !isHighlightedClient;
        const selectedClientProfile =
          (isClientPremise && mappedClient) || (isClientPremise && isSelected ? mapObjectDetails?.client || null : null);
        return (
          <CircleMarker
            key={asset.id}
            center={[Number(asset.latitude), Number(asset.longitude)]}
            radius={isSelected ? 8 : isHighlightedClient ? 7 : 6}
            pathOptions={{
              color: isSelected || isHighlightedClient ? "#ffffff" : "#0b1220",
              weight: isSelected || isHighlightedClient ? 2 : 1,
              fillColor: ASSET_COLORS[asset.asset_type] || "#cbd5e1",
              fillOpacity: isDimmedClient ? 0.25 : 1
            }}
            eventHandlers={{
              click: () => {
                if (onAssetClickForTools) {
                  onAssetClickForTools(asset);
                  return;
                }
                onSelectAsset?.(asset);
              }
            }}
          >
            {isHighlightedClient && (
              <Tooltip direction="top" offset={[0, -10]} className="mst-client-tooltip">
                {mappedClient ? `${mappedClient.full_name} • Leg ${mappedClient.port_number || "-"}` : asset.name}
              </Tooltip>
            )}
            {mappedClient && (
              <Tooltip direction="top" offset={[0, -10]} className="client-hover-tooltip">
                {mappedClient.full_name} | {mappedClient.pppoe_status || "unknown"} | Leg {mappedClient.port_number || "-"}
              </Tooltip>
            )}
            <Popup minWidth={320}>
              <div className="map-popup">
                <h4>{mappedClient?.full_name || asset.name}</h4>
                <p>Type: {asset.asset_type}</p>
                {(assetProps.installation_date || assetProps.installer_name) && (
                  <p>
                    Installed: <strong>{assetProps.installation_date || "-"}</strong> by{" "}
                    <strong>{assetProps.installer_name || "-"}</strong>
                  </p>
                )}
                {(assetProps.structure_type || assetProps.height_or_depth || assetProps.condition_status) && (
                  <p>
                    {assetProps.structure_type ? `Structure: ${assetProps.structure_type} | ` : ""}
                    {assetProps.height_or_depth ? `Height/Depth: ${assetProps.height_or_depth} | ` : ""}
                    Condition: <strong>{assetProps.condition_status || "-"}</strong>
                  </p>
                )}
                {assetProps.site_notes && (
                  <p>
                    Notes: <strong>{assetProps.site_notes}</strong>
                  </p>
                )}
                {isClientPremise && !selectedClientProfile && (
                  <p className="muted">Click this client point again to load full client profile.</p>
                )}
                {isClientPremise && !!selectedClientProfile && (
                  <div className="map-popup-legs">
                    <p>
                      Status: <strong>{selectedClientProfile.status || "-"}</strong> | PPPoE:{" "}
                      <strong>{selectedClientProfile.pppoe_status || "-"}</strong>
                    </p>
                    <p>
                      Username: <strong>{selectedClientProfile.pppoe_username || "-"}</strong>
                    </p>
                    <p>
                      Plan: <strong>{selectedClientProfile.plan_name || "-"}</strong> | Port:{" "}
                      <strong>{selectedClientProfile.port_number || "-"}</strong> | Core:{" "}
                      <strong>{selectedClientProfile.core_color || "-"}</strong>
                    </p>
                    <div className="draw-controls">
                      <button
                        type="button"
                        disabled={!selectedClientProfile.id || busy}
                        onClick={() => onDeleteClient?.(selectedClientProfile.id)}
                      >
                        Delete Client
                      </button>
                    </div>
                  </div>
                )}
                {asset.asset_type === "olt" && (
                  <p>
                    Ports used: <strong>{selectedOltPorts?.summary?.used_ports ?? asset.olt_used_ports ?? 0}</strong> | Free:{" "}
                    <strong>{selectedOltPorts?.summary?.free_ports ?? asset.olt_free_ports ?? 0}</strong>
                  </p>
                )}
                {isSelected && !!selectedNodeClients.length && (
                  <div className="map-popup-legs">
                    <p>
                      Linked clients: <strong>{selectedNodeClients.length}</strong>
                    </p>
                    <table>
                      <thead>
                        <tr>
                          <th>Client</th>
                          <th>Leg</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedNodeClients.slice(0, 10).map((client) => (
                          <tr key={client.id}>
                            <td>{client.full_name}</td>
                            <td>{client.port_number || "-"}</td>
                            <td>{client.status || "-"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {isSelected && mapObjectDetails?.client && (
                  <p>
                    PPPoE: <strong>{mapObjectDetails.client.pppoe_username || "-"}</strong> | Plan:{" "}
                    <strong>{mapObjectDetails.client.plan_name || "-"}</strong>
                  </p>
                )}
              </div>
            </Popup>
          </CircleMarker>
        );
      })}
      {drawPathPoints.length >= 2 && (
        <Polyline
          positions={drawPathPoints.map((point) => [Number(point.lat), Number(point.lng)])}
          pathOptions={{ color: "#1fc6e8", weight: 4, opacity: 0.9, dashArray: "8 8" }}
        />
      )}
      {drawPathPoints.map((point, index) => (
        <CircleMarker
          key={`draw-point-${index}`}
          center={[Number(point.lat), Number(point.lng)]}
          radius={4}
          pathOptions={{ color: "#0b1220", weight: 1, fillColor: "#1fc6e8", fillOpacity: 1 }}
        />
      ))}
      {measurePoints?.length >= 2 && (
        <Polyline
          positions={measurePoints.map((point) => [Number(point.lat), Number(point.lng)])}
          pathOptions={{ color: "#f59e0b", weight: 3, opacity: 0.9, dashArray: "6 4" }}
        >
          <Tooltip permanent direction="center" className="cable-core-tooltip">
            {measureDistanceM.toFixed(1)} m
          </Tooltip>
        </Polyline>
      )}
      {(measurePoints || []).map((point, index) => (
        <CircleMarker
          key={`measure-point-${index}`}
          center={[Number(point.lat), Number(point.lng)]}
          radius={4}
          pathOptions={{ color: "#111827", weight: 1, fillColor: "#f59e0b", fillOpacity: 1 }}
        />
      ))}
      <LeafletFocusController focusPoint={focusPoint} />
      <LeafletInteractionController
        mapAction={mapAction}
        onDrawPointAdd={drawModeEnabled ? onDrawPointAdd : null}
        onMeasurePointAdd={onMeasurePointAdd}
        onPlaceAssetByPoint={onPlaceAssetByPoint}
        onMoveSelectedAssetByPoint={onMoveSelectedAssetByPoint}
      />
    </MapContainer>
  );
}

function MapLibreNetworkMap({
  assets,
  cables,
  clients,
  cableUsage,
  selectedAssetId,
  selectedCableId,
  highlightClientAssetIds,
  onSelectAsset,
  onSelectCable,
  focusPoint,
  styleUrl,
  drawModeEnabled,
  drawPathPoints,
  onDrawPointAdd
}) {
  const hostRef = useRef(null);
  const mapRef = useRef(null);
  const popupRef = useRef(null);
  const latestAssetsRef = useRef(assets);
  const latestCablesRef = useRef(cables);
  const latestClientsRef = useRef(clients);
  const latestCableUsageRef = useRef(cableUsage);
  const onSelectAssetRef = useRef(onSelectAsset);
  const onSelectCableRef = useRef(onSelectCable);
  const onDrawPointAddRef = useRef(onDrawPointAdd);
  const drawModeRef = useRef(drawModeEnabled);
  const highlightedClientsRef = useRef(highlightClientAssetIds || []);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const center = useMemo(() => resolveCenter(assets), [assets]);

  useEffect(() => {
    latestAssetsRef.current = assets;
  }, [assets]);

  useEffect(() => {
    latestCablesRef.current = cables;
  }, [cables]);

  useEffect(() => {
    latestClientsRef.current = clients;
  }, [clients]);

  useEffect(() => {
    latestCableUsageRef.current = cableUsage;
  }, [cableUsage]);

  useEffect(() => {
    onSelectAssetRef.current = onSelectAsset;
  }, [onSelectAsset]);

  useEffect(() => {
    onSelectCableRef.current = onSelectCable;
  }, [onSelectCable]);

  useEffect(() => {
    onDrawPointAddRef.current = onDrawPointAdd;
  }, [onDrawPointAdd]);

  useEffect(() => {
    highlightedClientsRef.current = highlightClientAssetIds || [];
  }, [highlightClientAssetIds]);

  useEffect(() => {
    drawModeRef.current = drawModeEnabled;
  }, [drawModeEnabled]);

  useEffect(() => {
    let active = true;

    loadMapLibre()
      .then((maplibregl) => {
        if (!active || !hostRef.current) return;
        const map = new maplibregl.Map({
          container: hostRef.current,
          style: styleUrl,
          center: [center.lng, center.lat],
          zoom: 16
        });
        mapRef.current = map;

        map.addControl(new maplibregl.NavigationControl({ showCompass: true }), "top-right");

        map.on("load", () => {
          map.addSource("network", {
            type: "geojson",
            data: buildGeoJson(
              latestAssetsRef.current,
              latestCablesRef.current,
              selectedAssetId,
              selectedCableId,
              drawPathPoints,
              highlightedClientsRef.current
            )
          });

          map.addLayer({
            id: "cable-lines",
            type: "line",
            source: "network",
            filter: ["==", ["get", "feature_type"], "cable"],
            paint: {
              "line-color": [
                "case",
                [">", ["get", "faulty_cores"], 0],
                "#ef4444",
                [
                  "match",
                  ["get", "cable_type"],
                  "drop",
                  "#67e8f9",
                  "underground",
                  "#22c55e",
                  "#38bdf8",
                ],
              ],
              "line-width": ["case", ["==", ["get", "selected"], 1], 6, 3],
              "line-opacity": 0.9
            }
          });

          map.addLayer({
            id: "cable-core-labels",
            type: "symbol",
            source: "network",
            filter: ["==", ["get", "feature_type"], "cable"],
            layout: {
              "symbol-placement": "line",
              "text-field": ["get", "core_label"],
              "text-size": 11,
              "text-font": ["Open Sans Bold", "Arial Unicode MS Bold"],
              "text-allow-overlap": true
            },
            paint: {
              "text-color": "#dbeafe",
              "text-halo-color": "#06101f",
              "text-halo-width": 1
            }
          });

          map.addLayer({
            id: "asset-points",
            type: "circle",
            source: "network",
            filter: ["==", ["get", "feature_type"], "asset"],
            paint: {
              "circle-radius": [
                "case",
                ["==", ["get", "selected"], 1],
                9,
                [
                  "all",
                  ["==", ["get", "asset_type"], "client_premise"],
                  ["==", ["get", "highlighted_client"], 1],
                ],
                8,
                6,
              ],
              "circle-color": [
                "match",
                ["get", "asset_type"],
                "mst",
                "#22c55e",
                "fat",
                "#06b6d4",
                "fdb",
                "#38bdf8",
                "pole",
                "#f59e0b",
                "manhole",
                "#f97316",
                "olt",
                "#2563eb",
                "splice_closure",
                "#14b8a6",
                "client_premise",
                "#60a5fa",
                "#cbd5e1"
              ],
              "circle-opacity": [
                "case",
                [
                  "all",
                  ["==", ["get", "asset_type"], "client_premise"],
                  ["==", ["get", "client_filter_active"], 1],
                  ["!=", ["get", "highlighted_client"], 1],
                ],
                0.2,
                1,
              ],
              "circle-stroke-width": ["case", ["==", ["get", "selected"], 1], 2, 1],
              "circle-stroke-color": [
                "case",
                ["==", ["get", "selected"], 1],
                "#ffffff",
                ["==", ["get", "highlighted_client"], 1],
                "#ffffff",
                "#0b1220",
              ],
            }
          });

          map.addLayer({
            id: "client-highlight-ring",
            type: "circle",
            source: "network",
            filter: [
              "all",
              ["==", ["get", "feature_type"], "asset"],
              ["==", ["get", "asset_type"], "client_premise"],
              ["==", ["get", "highlighted_client"], 1],
            ],
            paint: {
              "circle-radius": 11,
              "circle-color": "rgba(96,165,250,0.15)",
              "circle-stroke-color": "#dbeafe",
              "circle-stroke-width": 1.4,
            },
          });

          map.addLayer({
            id: "draw-preview-line",
            type: "line",
            source: "network",
            filter: ["==", ["get", "feature_type"], "draw_preview_line"],
            paint: {
              "line-color": "#1fc6e8",
              "line-width": 4,
              "line-opacity": 0.9,
              "line-dasharray": [2, 2]
            }
          });

          map.addLayer({
            id: "draw-preview-points",
            type: "circle",
            source: "network",
            filter: ["==", ["get", "feature_type"], "draw_preview_point"],
            paint: {
              "circle-radius": 4,
              "circle-color": "#1fc6e8",
              "circle-stroke-color": "#0b1220",
              "circle-stroke-width": 1
            }
          });

          map.addLayer({
            id: "mst-box",
            type: "circle",
            source: "network",
            filter: ["all", ["==", ["get", "feature_type"], "asset"], ["==", ["get", "asset_type"], "mst"]],
            paint: {
              "circle-radius": ["case", ["==", ["get", "selected"], 1], 16, 14],
              "circle-color": "#0b1220",
              "circle-stroke-color": "#22c55e",
              "circle-stroke-width": 2
            }
          });

          map.addLayer({
            id: "mst-splitter-text",
            type: "symbol",
            source: "network",
            filter: ["all", ["==", ["get", "feature_type"], "asset"], ["==", ["get", "asset_type"], "mst"]],
            layout: {
              "text-field": ["get", "splitter_type"],
              "text-size": 12,
              "text-allow-overlap": true,
              "text-font": ["Open Sans Bold", "Arial Unicode MS Bold"]
            },
            paint: {
              "text-color": "#22c55e"
            }
          });

          map.addLayer({
            id: "mst-client-count-text",
            type: "symbol",
            source: "network",
            filter: ["all", ["==", ["get", "feature_type"], "asset"], ["==", ["get", "asset_type"], "mst"]],
            layout: {
              "text-field": ["get", "client_count_label"],
              "text-size": 11,
              "text-offset": [0, -2.2],
              "text-allow-overlap": true,
              "text-font": ["Open Sans Regular", "Arial Unicode MS Regular"]
            },
            paint: {
              "text-color": "#dbeafe",
              "text-halo-color": "#06101f",
              "text-halo-width": 1
            }
          });

          const handleAssetClick = (event) => {
            if (drawModeRef.current) return;
            const featureId = event.features?.[0]?.properties?.id;
            const asset = latestAssetsRef.current.find((item) => item.id === featureId);
            if (!asset) return;
            const assetProps = asset.properties || {};
            onSelectAssetRef.current?.(asset);
            if (popupRef.current) popupRef.current.remove();
            const details = [];
            details.push(`<h4>${escapeHtml(asset.name)}</h4>`);
            details.push(`<p>Type: ${escapeHtml(asset.asset_type)}</p>`);
            if (assetProps.installation_date || assetProps.installer_name) {
              details.push(
                `<p>Installed: <strong>${escapeHtml(assetProps.installation_date || "-")}</strong> by <strong>${escapeHtml(
                  assetProps.installer_name || "-"
                )}</strong></p>`
              );
            }
            if (assetProps.mount_type) {
              details.push(`<p>Mount: <strong>${escapeHtml(assetProps.mount_type)}</strong></p>`);
            }
            if (assetProps.structure_type || assetProps.height_or_depth || assetProps.condition_status) {
              details.push(
                `<p>Structure: ${escapeHtml(assetProps.structure_type || "-")} | Height/Depth: ${escapeHtml(
                  assetProps.height_or_depth || "-"
                )} | Condition: <strong>${escapeHtml(assetProps.condition_status || "-")}</strong></p>`
              );
            }
            if (assetProps.site_notes) {
              details.push(`<p>Notes: ${escapeHtml(assetProps.site_notes)}</p>`);
            }
            if (asset.asset_type === "mst") {
              details.push(
                `<p>Splitter: <strong>${escapeHtml(asset.splitter_type || "1/8")}</strong> | Used legs: <strong>${Number(
                  asset.used_ports || 0
                )}</strong> | Free: <strong>${Number(asset.free_ports || 0)}</strong></p>`
              );
              details.push("<p>Open the inspector panel to view leg-by-leg client mapping.</p>");
            }
            if (asset.asset_type === "olt") {
              details.push(
                `<p>Ports used: <strong>${Number(asset.olt_used_ports || 0)}</strong> | Free: <strong>${Number(
                  asset.olt_free_ports || 0
                )}</strong></p>`
              );
            }
            if (asset.asset_type === "client_premise") {
              const client = latestClientsRef.current.find((item) => item.premise_asset_id === asset.id);
              if (client) {
                details.push(`<p>Name: <strong>${escapeHtml(client.full_name)}</strong></p>`);
                details.push(`<p>Status: <strong>${escapeHtml(client.status || "-")}</strong> | PPPoE: <strong>${escapeHtml(client.pppoe_status || "-")}</strong></p>`);
                details.push(`<p>PPPoE User: <strong>${escapeHtml(client.pppoe_username || "-")}</strong></p>`);
                details.push(`<p>Plan: <strong>${escapeHtml(client.plan_name || "-")}</strong> | Leg: <strong>${escapeHtml(client.port_number || "-")}</strong></p>`);
              } else {
                details.push("<p>Client profile loaded in the right panel. Use Leaflet mode for in-map add/delete actions.</p>");
              }
            }
            popupRef.current = new maplibregl.Popup({ closeButton: true, closeOnClick: true })
              .setLngLat([Number(asset.longitude), Number(asset.latitude)])
              .setHTML(`<div class="maplibre-asset-popup">${details.join("")}</div>`)
              .addTo(map);
          };
          map.on("click", "asset-points", handleAssetClick);
          map.on("click", "mst-box", handleAssetClick);
          map.on("click", "mst-splitter-text", handleAssetClick);
          map.on("click", "mst-client-count-text", handleAssetClick);

          map.on("click", "cable-lines", async (event) => {
            if (drawModeRef.current) return;
            const featureId = event.features?.[0]?.properties?.id;
            const cable = latestCablesRef.current.find((item) => item.id === featureId);
            if (!cable) return;
            let loadedUsage = null;
            try {
              loadedUsage = await onSelectCableRef.current?.(cable);
            } catch {
              loadedUsage = null;
            }
            const usage = coreUsageSummary(cable, loadedUsage || latestCableUsageRef.current);
            if (popupRef.current) popupRef.current.remove();
            const details = [];
            details.push(`<h4>${escapeHtml(cable.label || "Fibre Cable")}</h4>`);
            details.push(
              `<p>Type: <strong>${escapeHtml(cable.cable_type || "-")}</strong> | Total cores: <strong>${usage.total}</strong></p>`
            );
            details.push(
              `<p>Used: <strong>${usage.usedCount}</strong> | Free: <strong>${usage.freeCount}</strong> | Reserved: <strong>${usage.reservedCount}</strong> | Faulty: <strong>${usage.faultyCount}</strong></p>`
            );
            details.push(
              `<p>Used cores list: <strong>${
                usage.usedList.length ? escapeHtml(usage.usedList.join(", ")) : "None used yet"
              }</strong></p>`
            );
            if (usage.coreRows.length) {
              const chips = usage.coreRows
                .map(
                  (core) =>
                    `<span class="map-core-chip status-${escapeHtml(core.status)}">#${core.core_number} ${escapeHtml(
                      core.color_name
                    )} (${escapeHtml(core.status)})</span>`
                )
                .join("");
              details.push(`<div class="map-core-list">${chips}</div>`);
            }
            if (!usage.detailed) {
              details.push("<p>Tip: click this line once to load exact used core list.</p>");
            }
            details.push(`<p>Distance: <strong>${Number(cable.distance_m || 0).toFixed(1)} m</strong></p>`);
            popupRef.current = new maplibregl.Popup({ closeButton: true, closeOnClick: true })
              .setLngLat(event.lngLat)
              .setHTML(`<div class="maplibre-asset-popup">${details.join("")}</div>`)
              .addTo(map);
          });

          map.on("click", (event) => {
            if (!drawModeRef.current) return;
            onDrawPointAddRef.current?.({ lat: event.lngLat.lat, lng: event.lngLat.lng });
          });

          map.on("mouseenter", "asset-points", () => {
            map.getCanvas().style.cursor = "pointer";
          });
          map.on("mouseleave", "asset-points", () => {
            map.getCanvas().style.cursor = "";
          });
          map.on("mouseenter", "mst-box", () => {
            map.getCanvas().style.cursor = "pointer";
          });
          map.on("mouseleave", "mst-box", () => {
            map.getCanvas().style.cursor = "";
          });
          map.on("mouseenter", "mst-splitter-text", () => {
            map.getCanvas().style.cursor = "pointer";
          });
          map.on("mouseleave", "mst-splitter-text", () => {
            map.getCanvas().style.cursor = "";
          });
          map.on("mouseenter", "mst-client-count-text", () => {
            map.getCanvas().style.cursor = "pointer";
          });
          map.on("mouseleave", "mst-client-count-text", () => {
            map.getCanvas().style.cursor = "";
          });
          map.on("mouseenter", "cable-lines", () => {
            map.getCanvas().style.cursor = "pointer";
          });
          map.on("mouseleave", "cable-lines", () => {
            map.getCanvas().style.cursor = "";
          });

          setReady(true);
        });
      })
      .catch((err) => {
        setError(err.message);
      });

    return () => {
      active = false;
      if (popupRef.current) {
        popupRef.current.remove();
        popupRef.current = null;
      }
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [center.lat, center.lng, styleUrl]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const source = map.getSource("network");
    if (!source) return;
    source.setData(
      buildGeoJson(assets, cables, selectedAssetId, selectedCableId, drawPathPoints, highlightClientAssetIds)
    );
  }, [assets, cables, selectedAssetId, selectedCableId, drawPathPoints, highlightClientAssetIds, ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !focusPoint) return;
    map.flyTo({
      center: [Number(focusPoint.lng), Number(focusPoint.lat)],
      zoom: focusPoint.zoom || 18,
      essential: true
    });
  }, [focusPoint]);

  return (
    <>
      <div className="map-stage" ref={hostRef} />
      {error && <p className="map-warning">{error}</p>}
      {!error && !ready && <p className="map-warning">Loading MapLibre map...</p>}
    </>
  );
}

export default function GoogleMapCanvas({
  assets,
  cables,
  clients = [],
  cableUsage = null,
  selectedAssetId,
  selectedCableId,
  highlightClientAssetIds = [],
  selectedMstCapacity,
  selectedOltPorts,
  mapObjectDetails,
  onDeleteClient,
  onCreateClientAtMstLeg,
  onCreateAssetFromMap,
  onCreateCableFromMap,
  onMoveAsset,
  busy = false,
  onManualFocus,
  onSelectAsset,
  onSelectCable,
  focusPoint,
  toolboxEnabled = true,
  drawModeEnabled = false,
  drawPathPoints = [],
  onDrawPointAdd,
  onSetDrawModeEnabled,
  onUndoDrawPoint,
  onClearDrawPoints
}) {
  const [engine, setEngine] = useState("leaflet");
  const [mapLibreStyle, setMapLibreStyle] = useState(DEFAULT_MAPLIBRE_STYLE);
  const [mapAction, setMapAction] = useState("select");
  const [assetSearch, setAssetSearch] = useState("");
  const [manualLat, setManualLat] = useState("");
  const [manualLng, setManualLng] = useState("");
  const [toolMessage, setToolMessage] = useState("");
  const [measurePoints, setMeasurePoints] = useState([]);
  const [moveLat, setMoveLat] = useState("");
  const [moveLng, setMoveLng] = useState("");
  const [assetDraft, setAssetDraft] = useState({
    asset_type: "mst",
    name: "",
    splitter_type: "1/8",
    olt_port_count: "16",
    mst_code: "",
    latitude: "",
    longitude: ""
  });
  const [cableDraft, setCableDraft] = useState({
    label: "",
    cable_type: "aerial",
    core_count: "12",
    start_asset_id: "",
    end_asset_id: ""
  });
  const selectedAsset = useMemo(
    () => assets.find((asset) => asset.id === selectedAssetId) || null,
    [assets, selectedAssetId]
  );
  const selectedCable = useMemo(
    () => cables.find((cable) => String(cable.id) === String(selectedCableId)) || null,
    [cables, selectedCableId]
  );
  const selectedCableUsage = useMemo(
    () => (selectedCable ? coreUsageSummary(selectedCable, cableUsage) : null),
    [selectedCable, cableUsage]
  );
  const measureDistanceM = useMemo(() => totalLineMeters(measurePoints), [measurePoints]);

  const searchResults = useMemo(() => {
    const term = assetSearch.trim().toLowerCase();
    if (!term) return [];
    return assets
      .filter((asset) => {
        const raw = `${asset.name} ${asset.asset_type} ${asset.id}`.toLowerCase();
        return raw.includes(term);
      })
      .slice(0, 8);
  }, [assets, assetSearch]);

  const selectedCableName = useMemo(() => {
    if (!cableDraft.start_asset_id && !cableDraft.end_asset_id) return "";
    const startName = assets.find((item) => item.id === cableDraft.start_asset_id)?.name || "Start";
    const endName = assets.find((item) => item.id === cableDraft.end_asset_id)?.name || "End";
    return `${startName} -> ${endName}`;
  }, [assets, cableDraft.start_asset_id, cableDraft.end_asset_id]);

  useEffect(() => {
    if (!selectedAsset) {
      setMoveLat("");
      setMoveLng("");
      return;
    }
    setMoveLat(Number(selectedAsset.latitude).toFixed(6));
    setMoveLng(Number(selectedAsset.longitude).toFixed(6));
  }, [selectedAsset]);

  function flashToolMessage(message) {
    setToolMessage(message);
    window.setTimeout(() => {
      setToolMessage((current) => (current === message ? "" : current));
    }, 3000);
  }

  function disableCableDrawMode() {
    onSetDrawModeEnabled?.(false);
  }

  function activateMapAction(action) {
    if (!toolboxEnabled) return;
    if (engine !== "leaflet" && action !== "select") {
      setEngine("leaflet");
      flashToolMessage("Switched to Leaflet for edit tools.");
    }
    const leavingDrawCable = mapAction === "draw_cable" && action !== "draw_cable";
    if (leavingDrawCable) {
      onClearDrawPoints?.();
      setCableDraft((prev) => ({ ...prev, start_asset_id: "", end_asset_id: "" }));
    }
    setMapAction(action);
    if (action !== "draw_cable") {
      disableCableDrawMode();
    } else {
      onClearDrawPoints?.();
      setCableDraft((prev) => ({ ...prev, start_asset_id: "", end_asset_id: "" }));
      onSetDrawModeEnabled?.(true);
      flashToolMessage("New cable run started. Pick start and end assets on map.");
    }
  }

  function handleSearchSelect(asset) {
    setAssetSearch(asset.name);
    onSelectAsset?.(asset);
  }

  function handleManualGo() {
    onManualFocus?.(manualLat, manualLng, 19);
  }

  function buildDefaultAssetName(assetType) {
    return `${String(assetType || "asset").toUpperCase()}-${Date.now().toString().slice(-4)}`;
  }

  function createAssetAt(latitude, longitude) {
    if (!onCreateAssetFromMap) return;
    if (!Number.isFinite(Number(latitude)) || !Number.isFinite(Number(longitude))) {
      flashToolMessage("Enter valid coordinates for asset placement.");
      return;
    }
    const payload = {
      asset_type: assetDraft.asset_type,
      name: assetDraft.name.trim() || buildDefaultAssetName(assetDraft.asset_type),
      latitude: Number(latitude),
      longitude: Number(longitude),
      properties: { created_from: "in_map_toolbox" }
    };
    if (assetDraft.asset_type === "mst") {
      payload.splitter_type = assetDraft.splitter_type;
      if (assetDraft.mst_code.trim()) payload.mst_code = assetDraft.mst_code.trim();
    }
    if (assetDraft.asset_type === "olt") {
      payload.olt_port_count = Number(assetDraft.olt_port_count || 16);
    }
    onCreateAssetFromMap(payload);
    flashToolMessage(`${payload.name} placed on map`);
  }

  function handlePlaceAssetByPoint(point) {
    if (!toolboxEnabled) return;
    if (mapAction !== "place_asset" || busy) return;
    createAssetAt(point.lat, point.lng);
  }

  function handlePlaceAssetByCoordinate() {
    createAssetAt(assetDraft.latitude, assetDraft.longitude);
  }

  function handleAssetToolClick(asset) {
    if (!toolboxEnabled) {
      onSelectAsset?.(asset);
      return;
    }
    if (mapAction === "draw_cable") {
      setCableDraft((prev) => {
        if (!prev.start_asset_id) {
          flashToolMessage(`Cable start set: ${asset.name}`);
          return { ...prev, start_asset_id: asset.id };
        }
        if (!prev.end_asset_id) {
          if (prev.start_asset_id === asset.id) {
            flashToolMessage("Pick a different end asset.");
            return prev;
          }
          flashToolMessage(`Cable end set: ${asset.name}`);
          return { ...prev, end_asset_id: asset.id };
        }
        flashToolMessage(`Cable end updated: ${asset.name}`);
        return { ...prev, end_asset_id: asset.id };
      });
    }
    onSelectAsset?.(asset);
  }

  async function handleSaveCableFromMap() {
    if (!onCreateCableFromMap) return;
    if (!cableDraft.start_asset_id || !cableDraft.end_asset_id) {
      flashToolMessage("Pick start and end assets from the map.");
      return;
    }
    if (cableDraft.start_asset_id === cableDraft.end_asset_id) {
      flashToolMessage("Start and end assets cannot be the same.");
      return;
    }
    const payload = {
      label: cableDraft.label.trim() || `Fibre-${Date.now().toString().slice(-4)}`,
      cable_type: cableDraft.cable_type,
      core_count: Number(cableDraft.core_count),
      start_asset_id: cableDraft.start_asset_id,
      end_asset_id: cableDraft.end_asset_id
    };
    if (drawPathPoints.length >= 2) {
      payload.path_coordinates = drawPathPoints.map((point) => [Number(point.lng), Number(point.lat)]);
    }
    const saved = await onCreateCableFromMap(payload);
    if (!saved) {
      flashToolMessage("Cable save failed. Confirm start/end and try again.");
      return;
    }
    setCableDraft((prev) => ({ ...prev, label: "", start_asset_id: "", end_asset_id: "" }));
    onClearDrawPoints?.();
    disableCableDrawMode();
    setMapAction("select");
    flashToolMessage("Fibre cable saved from map");
  }

  function handleMeasurePointAdd(point) {
    if (!toolboxEnabled) return;
    if (mapAction !== "measure") return;
    setMeasurePoints((prev) => [...prev, point]);
  }

  function handleUndoMeasurePoint() {
    setMeasurePoints((prev) => prev.slice(0, -1));
  }

  function handleClearMeasurePoints() {
    setMeasurePoints([]);
  }

  function handleMoveSelectedAssetByPoint(point) {
    if (!toolboxEnabled) return;
    if (mapAction !== "move_selected" || !selectedAsset || busy) return;
    onMoveAsset?.(selectedAsset.id, point.lat, point.lng);
    setMoveLat(Number(point.lat).toFixed(6));
    setMoveLng(Number(point.lng).toFixed(6));
    setMapAction("select");
    flashToolMessage(`${selectedAsset.name} moved`);
  }

  function handleMoveSelectedByCoordinate() {
    if (!selectedAsset) {
      flashToolMessage("Select an asset first.");
      return;
    }
    if (!Number.isFinite(Number(moveLat)) || !Number.isFinite(Number(moveLng))) {
      flashToolMessage("Enter valid coordinates for move.");
      return;
    }
    onMoveAsset?.(selectedAsset.id, Number(moveLat), Number(moveLng));
    setMapAction("select");
    flashToolMessage(`${selectedAsset.name} moved by coordinate`);
  }

  return (
    <section className="map-shell">
      <div className="map-stage-wrap">
        {engine === "leaflet" ? (
          <LeafletNetworkMap
            assets={assets}
            cables={cables}
            clients={clients}
            cableUsage={cableUsage}
            selectedAssetId={selectedAssetId}
            selectedCableId={selectedCableId}
            highlightClientAssetIds={highlightClientAssetIds}
            selectedMstCapacity={selectedMstCapacity}
            selectedOltPorts={selectedOltPorts}
            mapObjectDetails={mapObjectDetails}
            onDeleteClient={onDeleteClient}
            onCreateClientAtMstLeg={onCreateClientAtMstLeg}
            busy={busy}
            onSelectAsset={onSelectAsset}
            onSelectCable={onSelectCable}
            onAssetClickForTools={toolboxEnabled ? handleAssetToolClick : null}
            focusPoint={focusPoint}
            mapAction={toolboxEnabled ? mapAction : "select"}
            measurePoints={toolboxEnabled ? measurePoints : []}
            onMeasurePointAdd={toolboxEnabled ? handleMeasurePointAdd : null}
            onPlaceAssetByPoint={toolboxEnabled ? handlePlaceAssetByPoint : null}
            onMoveSelectedAssetByPoint={toolboxEnabled ? handleMoveSelectedAssetByPoint : null}
            drawModeEnabled={drawModeEnabled}
            drawPathPoints={drawPathPoints}
            onDrawPointAdd={onDrawPointAdd}
          />
        ) : (
          <MapLibreNetworkMap
            assets={assets}
            cables={cables}
            clients={clients}
            cableUsage={cableUsage}
            selectedAssetId={selectedAssetId}
            selectedCableId={selectedCableId}
            highlightClientAssetIds={highlightClientAssetIds}
            onSelectAsset={onSelectAsset}
            onSelectCable={onSelectCable}
            focusPoint={focusPoint}
            styleUrl={mapLibreStyle}
            drawModeEnabled={drawModeEnabled}
            drawPathPoints={drawPathPoints}
            onDrawPointAdd={onDrawPointAdd}
          />
        )}

        {toolboxEnabled && <div className="map-overlay map-overlay-left">
          <div className="map-overlay-card">
            <div className="map-tool-row">
              <button type="button" className={mapAction === "select" ? "active" : ""} onClick={() => activateMapAction("select")}>
                Select
              </button>
              <button type="button" className={mapAction === "place_asset" ? "active" : ""} onClick={() => activateMapAction("place_asset")}>
                Add Asset
              </button>
              <button type="button" className={mapAction === "draw_cable" ? "active" : ""} onClick={() => activateMapAction("draw_cable")}>
                Draw Cable
              </button>
              <button type="button" className={mapAction === "measure" ? "active" : ""} onClick={() => activateMapAction("measure")}>
                Measure
              </button>
              <button
                type="button"
                className={mapAction === "move_selected" ? "active" : ""}
                onClick={() => activateMapAction("move_selected")}
                disabled={!selectedAsset}
              >
                Move Selected
              </button>
            </div>

            {mapAction === "place_asset" && (
              <div className="map-tool-stack">
                <label>Asset tool</label>
                <div className="map-asset-tools-grid">
                  {ASSET_TOOL_OPTIONS.map((tool) => (
                    <button
                      key={tool.type}
                      type="button"
                      className={assetDraft.asset_type === tool.type ? "active" : ""}
                      onClick={() => setAssetDraft((prev) => ({ ...prev, asset_type: tool.type }))}
                    >
                      <strong>{tool.icon}</strong>
                      <small>{tool.label}</small>
                    </button>
                  ))}
                </div>
                <input
                  value={assetDraft.name}
                  onChange={(event) => setAssetDraft((prev) => ({ ...prev, name: event.target.value }))}
                  placeholder="Asset name (optional)"
                />
                {assetDraft.asset_type === "mst" && (
                  <>
                    <select
                      value={assetDraft.splitter_type}
                      onChange={(event) => setAssetDraft((prev) => ({ ...prev, splitter_type: event.target.value }))}
                    >
                      <option value="1/2">1/2 Splitter</option>
                      <option value="1/4">1/4 Splitter</option>
                      <option value="1/8">1/8 Splitter</option>
                      <option value="1/16">1/16 Splitter</option>
                    </select>
                    <input
                      value={assetDraft.mst_code}
                      onChange={(event) => setAssetDraft((prev) => ({ ...prev, mst_code: event.target.value }))}
                      placeholder="MST code (optional)"
                    />
                  </>
                )}
                {assetDraft.asset_type === "olt" && (
                  <input
                    value={assetDraft.olt_port_count}
                    onChange={(event) => setAssetDraft((prev) => ({ ...prev, olt_port_count: event.target.value }))}
                    placeholder="OLT port count"
                  />
                )}
                <p className="muted">Click any point on map to place selected asset tool.</p>
                <div className="draw-controls">
                  <input
                    value={assetDraft.latitude}
                    onChange={(event) => setAssetDraft((prev) => ({ ...prev, latitude: event.target.value }))}
                    placeholder="Lat"
                  />
                  <input
                    value={assetDraft.longitude}
                    onChange={(event) => setAssetDraft((prev) => ({ ...prev, longitude: event.target.value }))}
                    placeholder="Lng"
                  />
                  <button type="button" onClick={handlePlaceAssetByCoordinate} disabled={busy}>
                    Place by Coord
                  </button>
                </div>
              </div>
            )}

            {mapAction === "draw_cable" && (
              <div className="map-tool-stack">
                <input
                  value={cableDraft.label}
                  onChange={(event) => setCableDraft((prev) => ({ ...prev, label: event.target.value }))}
                  placeholder="Cable label (optional)"
                />
                <select
                  value={cableDraft.cable_type}
                  onChange={(event) => setCableDraft((prev) => ({ ...prev, cable_type: event.target.value }))}
                >
                  <option value="aerial">Aerial</option>
                  <option value="underground">Underground</option>
                </select>
                <select
                  value={cableDraft.core_count}
                  onChange={(event) => setCableDraft((prev) => ({ ...prev, core_count: event.target.value }))}
                >
                  {CABLE_CORE_OPTIONS.map((core) => (
                    <option key={core} value={core}>
                      {core}-core
                    </option>
                  ))}
                </select>
                <p className="muted">
                  Pick start and end by clicking map assets.
                  <br />
                  Path points: <strong>{drawPathPoints.length}</strong> (click map between points to shape route)
                </p>
                <div className="draw-controls">
                  <select
                    value={cableDraft.start_asset_id}
                    onChange={(event) => setCableDraft((prev) => ({ ...prev, start_asset_id: event.target.value }))}
                  >
                    <option value="">Start Asset</option>
                    {assets.map((asset) => (
                      <option key={asset.id} value={asset.id}>
                        {asset.name}
                      </option>
                    ))}
                  </select>
                  <select
                    value={cableDraft.end_asset_id}
                    onChange={(event) => setCableDraft((prev) => ({ ...prev, end_asset_id: event.target.value }))}
                  >
                    <option value="">End Asset</option>
                    {assets.map((asset) => (
                      <option key={asset.id} value={asset.id}>
                        {asset.name}
                      </option>
                    ))}
                  </select>
                </div>
                {!!selectedAsset && (
                  <div className="draw-controls">
                    <button
                      type="button"
                      onClick={() => setCableDraft((prev) => ({ ...prev, start_asset_id: selectedAsset.id }))}
                    >
                      Use Selected as Start
                    </button>
                    <button
                      type="button"
                      onClick={() => setCableDraft((prev) => ({ ...prev, end_asset_id: selectedAsset.id }))}
                    >
                      Use Selected as End
                    </button>
                  </div>
                )}
                {!!selectedCableName && <p className="muted">Selected path: {selectedCableName}</p>}
                <div className="draw-controls">
                  <button type="button" onClick={onUndoDrawPoint} disabled={!drawPathPoints.length}>
                    Undo Point
                  </button>
                  <button type="button" onClick={onClearDrawPoints} disabled={!drawPathPoints.length}>
                    Clear Path
                  </button>
                </div>
                <button
                  type="button"
                  onClick={handleSaveCableFromMap}
                  disabled={
                    busy ||
                    !cableDraft.start_asset_id ||
                    !cableDraft.end_asset_id ||
                    cableDraft.start_asset_id === cableDraft.end_asset_id
                  }
                >
                  Save Fibre Run
                </button>
              </div>
            )}

            {mapAction === "measure" && (
              <div className="map-tool-stack">
                <p className="muted">
                  Click map to measure route distance.
                  <br />
                  Distance: <strong>{measureDistanceM.toFixed(1)} m</strong>
                </p>
                <div className="draw-controls">
                  <button type="button" onClick={handleUndoMeasurePoint} disabled={!measurePoints.length}>
                    Undo
                  </button>
                  <button type="button" onClick={handleClearMeasurePoints} disabled={!measurePoints.length}>
                    Clear
                  </button>
                </div>
              </div>
            )}

            {mapAction === "move_selected" && (
              <div className="map-tool-stack">
                <p className="muted">
                  Selected: <strong>{selectedAsset?.name || "-"}</strong>
                  <br />
                  Click new location on map, or move by coordinates below.
                </p>
                <div className="draw-controls">
                  <input value={moveLat} onChange={(event) => setMoveLat(event.target.value)} placeholder="Lat" />
                  <input value={moveLng} onChange={(event) => setMoveLng(event.target.value)} placeholder="Lng" />
                  <button type="button" onClick={handleMoveSelectedByCoordinate} disabled={!selectedAsset || busy}>
                    Move by Coord
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>}

        {toolboxEnabled && <div className="map-overlay map-overlay-right">
          <div className="map-overlay-card">
            <div className="draw-controls">
              <button type="button" className={engine === "leaflet" ? "active" : ""} onClick={() => setEngine("leaflet")}>
                Leaflet
              </button>
              <button
                type="button"
                className={engine === "maplibre" ? "active" : ""}
                onClick={() => {
                  setEngine("maplibre");
                  activateMapAction("select");
                }}
              >
                MapLibre
              </button>
            </div>
            {engine === "maplibre" && (
              <input
                value={mapLibreStyle}
                onChange={(event) => setMapLibreStyle(event.target.value)}
                placeholder="MapLibre style URL"
              />
            )}
            <input
              value={assetSearch}
              onChange={(event) => setAssetSearch(event.target.value)}
              placeholder="Search OLT, MST, Client, ID..."
            />
            {!!searchResults.length && (
              <div className="map-search-results">
                {searchResults.map((asset) => (
                  <button key={asset.id} type="button" onClick={() => handleSearchSelect(asset)}>
                    {asset.name} ({asset.asset_type})
                  </button>
                ))}
              </div>
            )}
            <div className="draw-controls">
              <input value={manualLat} onChange={(event) => setManualLat(event.target.value)} placeholder="Lat" />
              <input value={manualLng} onChange={(event) => setManualLng(event.target.value)} placeholder="Lng" />
              <button type="button" onClick={handleManualGo}>
                Go
              </button>
            </div>
            {!!selectedCable && (
              <div className="map-tool-stack">
                <label>Clicked Cable</label>
                <p className="muted">
                  {selectedCable.label || "Fibre Cable"} | {selectedCable.cable_type || "-"}
                </p>
                <p className="muted">
                  Total cores: <strong>{selectedCableUsage?.total ?? Number(selectedCable.core_count || 0)}</strong> | Used:{" "}
                  <strong>{selectedCableUsage?.usedCount ?? Number(selectedCable.used_cores || 0)}</strong> | Free:{" "}
                  <strong>
                    {selectedCableUsage?.freeCount ??
                      Number(selectedCable.free_cores ?? Math.max(Number(selectedCable.core_count || 0) - Number(selectedCable.used_cores || 0), 0))}
                  </strong>
                </p>
                <p className="muted">
                  Used cores in this cable:{" "}
                  <strong>
                    {selectedCableUsage?.usedList?.length ? selectedCableUsage.usedList.join(", ") : "None used yet"}
                  </strong>
                </p>
                <p className="muted">
                  Distance: <strong>{Number(selectedCable.distance_m || 0).toFixed(1)} m</strong>
                </p>
                {!selectedCableUsage?.detailed && <p className="muted">Loading exact per-core status...</p>}
                {!!selectedCableUsage?.coreRows?.length && (
                  <div className="map-core-list">
                    {selectedCableUsage.coreRows.map((core) => (
                      <span key={`${selectedCable.id}-${core.core_number}`} className={`map-core-chip status-${core.status}`}>
                        #{core.core_number} {core.color_name} ({core.status})
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>}
      </div>

      {toolboxEnabled && (toolMessage || drawModeEnabled) && (
        <p className="map-warning">
          {toolMessage}
          {drawModeEnabled ? " Draw mode ON: click map to add cable route points." : ""}
        </p>
      )}
      <p className="map-warning">
        Mode: {engine === "leaflet" ? "Leaflet + OpenStreetMap" : "MapLibre GL vector map"}.
        {" "}Click any cable line to view core count, used cores, and remaining cores.
        {" "}Fault-highlight: cables with faulty cores appear in red.
      </p>
    </section>
  );
}
