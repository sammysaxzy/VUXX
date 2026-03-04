import { useEffect, useMemo, useState } from "react";
import GoogleMapCanvas from "./GoogleMapCanvas.jsx";

const HISTORY_MAX_STEP = 12;
const DEFAULT_CENTER = { lat: 6.5244, lng: 3.3792 };

const emptySpliceForm = {
  from_core_id: "",
  to_core_id: "",
  location_asset_id: "",
  engineer_name: "",
  notes: ""
};

const LAYER_PRESETS = [
  {
    id: "all",
    label: "All Layers",
    filters: { backbone: true, distribution: true, activeDrops: true, outages: true }
  },
  {
    id: "network",
    label: "Network Focus",
    filters: { backbone: true, distribution: true, activeDrops: false, outages: true }
  },
  {
    id: "drops",
    label: "Drop Focus",
    filters: { backbone: false, distribution: true, activeDrops: true, outages: true }
  },
  {
    id: "clean",
    label: "Hide Outages",
    filters: { backbone: true, distribution: true, activeDrops: true, outages: false }
  }
];

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function toHistoryCutoff(step) {
  if (!step) return null;
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - step);
  return cutoff;
}

function formatStamp(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString();
}

function formatFeedAge(value) {
  if (!value) return "now";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "now";
  const diffMs = Date.now() - date.getTime();
  const minutes = Math.round(diffMs / 60000);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

function nextCoreStatus(currentStatus) {
  if (currentStatus === "free") return "reserved";
  if (currentStatus === "reserved") return "faulty";
  return "free";
}

export default function MapTab({
  assets,
  cables,
  clients,
  alerts = [],
  logs = [],
  cableCores,
  selectedAsset,
  selectedCable,
  mapObjectDetails,
  cableUsage,
  selectedMstCapacity,
  selectedOltPorts,
  selectedColorFlow,
  selectedClientPath,
  selectedClientAssetIds,
  mapFocusPoint,
  busy,
  onManualMapFocus,
  onSelectAsset,
  onSelectCable,
  onCreateAsset,
  onCreateCable,
  onCreateSplice,
  onCreateClientFromMap,
  onDeleteClientFromMap,
  onUpdateCore,
  onUpdateAssetPosition,
  onAssignOltPort
}) {
  const [spliceForm, setSpliceForm] = useState(emptySpliceForm);
  const [drawModeEnabled, setDrawModeEnabled] = useState(false);
  const [drawPathPoints, setDrawPathPoints] = useState([]);
  const [historyStep, setHistoryStep] = useState(0);
  const [historyPlaying, setHistoryPlaying] = useState(false);
  const [quickFilters, setQuickFilters] = useState(LAYER_PRESETS[0].filters);
  const [layerPresetIndex, setLayerPresetIndex] = useState(0);
  const [criticalMode, setCriticalMode] = useState(false);
  const [panelNotice, setPanelNotice] = useState("");
  const [oltAssignCoreId, setOltAssignCoreId] = useState("");

  const mstAssets = useMemo(() => assets.filter((asset) => asset.asset_type === "mst"), [assets]);
  const defaultOwnerId =
    (selectedAsset?.asset_type === "mst" ? selectedAsset.id : null) || mstAssets[0]?.id || "";
  const historyCutoff = useMemo(() => toHistoryCutoff(historyStep), [historyStep]);
  const historyMode = Boolean(historyCutoff);

  useEffect(() => {
    if (!historyPlaying) return undefined;
    const timer = window.setInterval(() => {
      setHistoryStep((prev) => {
        if (prev <= 0) return HISTORY_MAX_STEP;
        return prev - 1;
      });
    }, 1600);
    return () => window.clearInterval(timer);
  }, [historyPlaying]);

  function notify(message) {
    setPanelNotice(message);
    window.setTimeout(() => {
      setPanelNotice((current) => (current === message ? "" : current));
    }, 2600);
  }

  const mapAssets = useMemo(() => {
    if (!historyCutoff) return assets;
    return assets.filter((asset) => {
      if (!asset?.created_at) return true;
      return new Date(asset.created_at) <= historyCutoff;
    });
  }, [assets, historyCutoff]);

  const mapAssetIdSet = useMemo(() => new Set(mapAssets.map((asset) => asset.id)), [mapAssets]);

  const mapCables = useMemo(() => {
    if (!historyCutoff) return cables;
    return cables.filter((cable) => {
      const createdOk = cable?.created_at ? new Date(cable.created_at) <= historyCutoff : true;
      const endpointsOk = mapAssetIdSet.has(cable.start_asset_id) && mapAssetIdSet.has(cable.end_asset_id);
      return createdOk && endpointsOk;
    });
  }, [cables, historyCutoff, mapAssetIdSet]);

  const visibleMapCables = useMemo(() => {
    return mapCables.filter((cable) => {
      if (!quickFilters.backbone && cable.cable_type === "aerial") return false;
      if (!quickFilters.distribution && cable.cable_type === "underground") return false;
      if (!quickFilters.activeDrops && cable.cable_type === "drop") return false;
      if (!quickFilters.outages && Number(cable.faulty_cores || 0) > 0) return false;
      return true;
    });
  }, [mapCables, quickFilters]);

  const mapClients = useMemo(() => {
    if (!historyCutoff) return clients;
    return clients.filter((client) => {
      const createdOk = client?.created_at ? new Date(client.created_at) <= historyCutoff : true;
      const premiseOk = !client?.premise_asset_id || mapAssetIdSet.has(client.premise_asset_id);
      return createdOk && premiseOk;
    });
  }, [clients, historyCutoff, mapAssetIdSet]);

  const counts = useMemo(() => {
    return {
      mst: mapAssets.filter((asset) => asset.asset_type === "mst").length,
      pole: mapAssets.filter((asset) => asset.asset_type === "pole").length,
      manhole: mapAssets.filter((asset) => asset.asset_type === "manhole").length,
      olt: mapAssets.filter((asset) => asset.asset_type === "olt").length,
      cables: visibleMapCables.length,
      clients: mapClients.length
    };
  }, [mapAssets, mapClients.length, visibleMapCables.length]);

  const feedRows = useMemo(() => {
    const alertRows = (alerts || []).slice(0, 40).map((alert) => ({
      kind: "alert",
      id: `alert-${alert.id}`,
      title: alert.alert_type ? String(alert.alert_type).replaceAll("_", " ") : "System alert",
      text: alert.message || "Alert raised",
      timestamp: alert.created_at,
      severity: alert.severity || "high",
      client_id: alert.client_id || null
    }));

    const logRows = (logs || []).slice(0, 100).map((log) => ({
      kind: "log",
      id: `log-${log.id}`,
      title: log.action_type ? String(log.action_type).replaceAll("_", " ") : "Field update",
      text:
        log?.after_state?.name ||
        log?.metadata?.label ||
        log?.metadata?.notes ||
        `${log.entity_type || "entity"} updated`,
      timestamp: log.created_at,
      severity: log.action_type?.includes("fault") ? "critical" : "info",
      entity_type: log.entity_type || "",
      entity_id: log.entity_id || null
    }));

    return [...alertRows, ...logRows]
      .sort((a, b) => new Date(b.timestamp || 0).getTime() - new Date(a.timestamp || 0).getTime())
      .slice(0, 18);
  }, [alerts, logs]);

  const onlineCount = useMemo(
    () => clients.filter((client) => client.pppoe_status === "online").length,
    [clients]
  );
  const networkStability = clients.length ? (onlineCount / clients.length) * 100 : 100;

  const selectedNodeClients = useMemo(() => mapObjectDetails?.clients || [], [mapObjectDetails]);
  const selectedUsage =
    selectedCable && String(cableUsage?.cable?.id || "") === String(selectedCable.id)
      ? cableUsage
      : null;

  const selectedCoreForOltAssign = cableCores.find((core) => core.id === oltAssignCoreId) || null;

  const coreStats = useMemo(() => {
    const used = cableCores.filter((core) => core.status === "used").length;
    const free = cableCores.filter((core) => core.status === "free").length;
    const reserved = cableCores.filter((core) => core.status === "reserved").length;
    const faulty = cableCores.filter((core) => core.status === "faulty").length;
    return { used, free, reserved, faulty };
  }, [cableCores]);

  function submitSplice(event) {
    event.preventDefault();
    const payload = {
      from_core_id: spliceForm.from_core_id,
      to_core_id: spliceForm.to_core_id,
      location_asset_id: spliceForm.location_asset_id || null,
      engineer_name: spliceForm.engineer_name || null,
      notes: spliceForm.notes || null
    };
    void onCreateSplice(payload);
    setSpliceForm(emptySpliceForm);
  }

  function handleAddDrawPoint(point) {
    setDrawPathPoints((prev) => [...prev, point]);
  }

  function handleUndoDrawPoint() {
    setDrawPathPoints((prev) => prev.slice(0, -1));
  }

  function handleClearDrawPoints() {
    setDrawPathPoints([]);
  }

  function handleMapCreateAsset(payload) {
    if (historyMode) return;
    void onCreateAsset(payload);
  }

  async function handleMapCreateCable(payload) {
    if (historyMode) return false;
    return onCreateCable(payload);
  }

  function handleMoveAssetOnMap(assetId, latitude, longitude) {
    if (historyMode) return;
    if (!assetId) return;
    void onUpdateAssetPosition(assetId, { latitude: Number(latitude), longitude: Number(longitude) });
  }

  function handleDeleteClient(clientId) {
    if (!clientId) return;
    const allow = window.confirm("Delete this client from map and CRM? This will free splitter leg and drop fibre.");
    if (!allow) return;
    void onDeleteClientFromMap(clientId);
  }

  function handleCreateClientAtMstLeg(mstAssetId, legNumber, payload) {
    void onCreateClientFromMap(payload, mstAssetId, legNumber);
  }

  function toggleQuickFilter(key) {
    setQuickFilters((prev) => ({ ...prev, [key]: !prev[key] }));
    notify(`Filter updated: ${key}`);
  }

  function applyLayerPreset(nextIndex) {
    const preset = LAYER_PRESETS[nextIndex];
    setLayerPresetIndex(nextIndex);
    setQuickFilters(preset.filters);
    notify(`Layer preset: ${preset.label}`);
  }

  function handleCycleLayerPreset() {
    const nextIndex = (layerPresetIndex + 1) % LAYER_PRESETS.length;
    applyLayerPreset(nextIndex);
  }

  function getFocusAnchor() {
    if (selectedAsset) {
      return {
        lat: Number(selectedAsset.latitude),
        lng: Number(selectedAsset.longitude),
        zoom: Number(mapFocusPoint?.zoom || 18)
      };
    }
    if (mapFocusPoint) {
      return {
        lat: Number(mapFocusPoint.lat),
        lng: Number(mapFocusPoint.lng),
        zoom: Number(mapFocusPoint.zoom || 16)
      };
    }
    return { ...DEFAULT_CENTER, zoom: 14 };
  }

  function handleZoom(delta) {
    const anchor = getFocusAnchor();
    const zoom = clamp((anchor.zoom || 14) + delta, 4, 22);
    onManualMapFocus(anchor.lat, anchor.lng, zoom);
    notify(`Map zoom set to ${zoom}`);
  }

  function handleLocateSelection() {
    if (!selectedAsset) {
      notify("Select a map object first.");
      return;
    }
    onManualMapFocus(selectedAsset.latitude, selectedAsset.longitude, 19);
    notify(`Centered on ${selectedAsset.name}`);
  }

  function handleLocateGps() {
    if (!navigator.geolocation) {
      notify("Geolocation is not supported on this browser.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        onManualMapFocus(position.coords.latitude, position.coords.longitude, 18);
        notify("Centered on current GPS location.");
      },
      () => {
        notify("Unable to read your GPS location.");
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  }

  function handleCopyCoordinates() {
    const anchor = getFocusAnchor();
    const value = `${anchor.lat.toFixed(6)}, ${anchor.lng.toFixed(6)}`;
    if (!navigator.clipboard?.writeText) {
      notify(`Coordinate: ${value}`);
      return;
    }
    navigator.clipboard
      .writeText(value)
      .then(() => notify("Coordinates copied."))
      .catch(() => notify(`Coordinate: ${value}`));
  }

  function jumpToAssetType(assetType, label) {
    const target = mapAssets.find((asset) => asset.asset_type === assetType);
    if (!target) {
      notify(`No ${label} found yet.`);
      return;
    }
    onSelectAsset?.(target);
    onManualMapFocus(target.latitude, target.longitude, 18);
    notify(`Opened ${target.name}`);
  }

  function handleFeedOpen(entry) {
    if (entry.kind === "alert") {
      const client = clients.find((item) => item.id === entry.client_id);
      if (!client?.premise_asset_id) {
        notify("This alert is not linked to a map point.");
        return;
      }
      const asset = assets.find((item) => item.id === client.premise_asset_id);
      if (!asset) {
        notify("Client map point not found.");
        return;
      }
      onSelectAsset?.(asset);
      onManualMapFocus(asset.latitude, asset.longitude, 19);
      notify(`Opened alert location for ${client.full_name}`);
      return;
    }

    if (entry.entity_type === "infrastructure_asset") {
      const asset = assets.find((item) => item.id === entry.entity_id);
      if (!asset) {
        notify("Asset from feed was not found.");
        return;
      }
      onSelectAsset?.(asset);
      onManualMapFocus(asset.latitude, asset.longitude, 19);
      notify(`Opened ${asset.name}`);
      return;
    }

    if (entry.entity_type === "fibre_cable") {
      const cable = cables.find((item) => item.id === entry.entity_id);
      if (!cable) {
        notify("Cable from feed was not found.");
        return;
      }
      onSelectCable?.(cable);
      notify(`Opened cable ${cable.label || "fibre"}`);
      return;
    }

    notify("This feed item has no direct map jump.");
  }

  function handleCycleCoreStatus(core) {
    if (!core?.id || busy) return;
    const next = nextCoreStatus(core.status);
    if (next === "free") {
      void onUpdateCore(core.id, { status: "free", owner_type: "none", owner_id: null });
      return;
    }
    if (!defaultOwnerId) {
      notify("Select an MST first to reserve/fault cores.");
      return;
    }
    void onUpdateCore(core.id, { status: next, owner_type: "mst", owner_id: defaultOwnerId });
  }

  return (
    <section className="ops-map-layout">
      <aside className="card ops-map-left">
        <header className="ops-left-head">
          <h2>Network Blueprint</h2>
          <button type="button" onClick={handleCycleLayerPreset}>
            {LAYER_PRESETS[layerPresetIndex].label}
          </button>
        </header>

        <div className="ops-left-section">
          <button type="button" className="ops-left-section-head" onClick={() => notify("Infrastructure list ready")}>
            Infrastructure
          </button>
          <div className="ops-left-list">
            <button type="button" onClick={() => jumpToAssetType("mst", "MST box")}>
              <span>MST Boxes</span>
              <strong>{counts.mst}</strong>
            </button>
            <button type="button" onClick={() => jumpToAssetType("pole", "Pole")}>
              <span>Poles &amp; Riser</span>
              <strong>{counts.pole}</strong>
            </button>
            <button type="button" onClick={() => jumpToAssetType("manhole", "Manhole")}>
              <span>Manholes / Vaults</span>
              <strong>{counts.manhole}</strong>
            </button>
            <button type="button" onClick={() => jumpToAssetType("olt", "OLT")}>
              <span>OLT / POP Sites</span>
              <strong>{counts.olt}</strong>
            </button>
            <button type="button" onClick={() => notify(`Visible cables: ${counts.cables}`)}>
              <span>Fiber Cables</span>
              <strong>{counts.cables}</strong>
            </button>
            <button type="button" onClick={() => notify(`Mapped clients: ${counts.clients}`)}>
              <span>Client Connections</span>
              <strong>{counts.clients}</strong>
            </button>
          </div>
        </div>

        <div className="ops-left-section">
          <h3>Quick Filters</h3>
          <button
            type="button"
            className={`ops-filter-btn ${quickFilters.backbone ? "active" : ""}`}
            onClick={() => toggleQuickFilter("backbone")}
          >
            Backbone (Blue)
          </button>
          <button
            type="button"
            className={`ops-filter-btn ${quickFilters.distribution ? "active" : ""}`}
            onClick={() => toggleQuickFilter("distribution")}
          >
            Distribution (Orange)
          </button>
          <button
            type="button"
            className={`ops-filter-btn ${quickFilters.activeDrops ? "active" : ""}`}
            onClick={() => toggleQuickFilter("activeDrops")}
          >
            Active Drops (Green)
          </button>
          <button
            type="button"
            className={`ops-filter-btn ${quickFilters.outages ? "active" : ""}`}
            onClick={() => toggleQuickFilter("outages")}
          >
            Outages / Broken
          </button>
        </div>

        <div className="ops-left-section">
          <h3>Action Panel</h3>
          <div className="draw-controls">
            <button type="button" onClick={() => setCriticalMode((prev) => !prev)}>
              {criticalMode ? "Disable" : "Enable"} Critical Mode
            </button>
            <button type="button" onClick={handleLocateSelection}>
              Locate Selection
            </button>
            <button type="button" onClick={handleCopyCoordinates}>
              Copy Coordinate
            </button>
          </div>
        </div>

        <div className="ops-coordinate-card">
          <small>Coordinate Display</small>
          <strong>LAT: {(Number(selectedAsset?.latitude ?? mapFocusPoint?.lat ?? DEFAULT_CENTER.lat)).toFixed(6)}</strong>
          <strong>LNG: {(Number(selectedAsset?.longitude ?? mapFocusPoint?.lng ?? DEFAULT_CENTER.lng)).toFixed(6)}</strong>
          <span>History: {historyMode ? formatStamp(historyCutoff) : "Current"}</span>
        </div>
      </aside>

      <main className="ops-map-center">
        <article className="card ops-map-stage-card">
          <div className="ops-map-floating-controls">
            <button type="button" onClick={() => handleZoom(1)}>
              +
            </button>
            <button type="button" onClick={() => handleZoom(-1)}>
              -
            </button>
            <button type="button" onClick={handleLocateGps}>
              GPS
            </button>
            <button type="button" onClick={handleCopyCoordinates}>
              Share
            </button>
            <button type="button" onClick={handleCycleLayerPreset}>
              Layers
            </button>
          </div>

          <div className="ops-map-floating-legend">
            <h4>Legend</h4>
            <p>
              <i className="legend-line" /> Trunk / Backbone Cable
            </p>
            <p>
              <i className="legend-line legend-dist" /> Distribution Cable
            </p>
            <p>
              <i className="legend-dot active" /> Splice Closure / MST
            </p>
            <p>
              <i className="legend-dot offline" /> Fault / Outage Path
            </p>
          </div>

          <GoogleMapCanvas
            assets={mapAssets}
            cables={visibleMapCables}
            clients={mapClients}
            cableUsage={cableUsage}
            selectedAssetId={selectedAsset?.id || null}
            selectedCableId={selectedCable?.id || null}
            onSelectAsset={onSelectAsset}
            onSelectCable={onSelectCable}
            focusPoint={mapFocusPoint}
            drawModeEnabled={drawModeEnabled}
            drawPathPoints={drawPathPoints}
            onDrawPointAdd={handleAddDrawPoint}
            onSetDrawModeEnabled={setDrawModeEnabled}
            onUndoDrawPoint={handleUndoDrawPoint}
            onClearDrawPoints={handleClearDrawPoints}
            highlightClientAssetIds={selectedClientAssetIds}
            selectedMstCapacity={selectedMstCapacity}
            selectedOltPorts={selectedOltPorts}
            mapObjectDetails={mapObjectDetails}
            onDeleteClient={handleDeleteClient}
            onCreateClientAtMstLeg={handleCreateClientAtMstLeg}
            onCreateAssetFromMap={handleMapCreateAsset}
            onCreateCableFromMap={handleMapCreateCable}
            onMoveAsset={handleMoveAssetOnMap}
            busy={busy || historyMode}
            onManualFocus={onManualMapFocus}
          />

          <div className="ops-history-strip">
            <div className="ops-history-meta">
              <span>Historical Playback</span>
              <strong>{historyMode ? formatStamp(historyCutoff) : "Current Network"}</strong>
            </div>
            <div className="ops-history-slider-row">
              <input
                type="range"
                min="0"
                max={HISTORY_MAX_STEP}
                step="1"
                value={historyStep}
                onChange={(event) => setHistoryStep(Number(event.target.value))}
              />
              <div className="draw-controls">
                <button type="button" onClick={() => setHistoryPlaying((prev) => !prev)}>
                  {historyPlaying ? "Pause" : "Play"}
                </button>
                <button type="button" onClick={() => setHistoryStep((prev) => clamp(prev + 1, 0, HISTORY_MAX_STEP))}>
                  Older
                </button>
                <button type="button" onClick={() => setHistoryStep((prev) => clamp(prev - 1, 0, HISTORY_MAX_STEP))}>
                  Newer
                </button>
                <button type="button" onClick={() => setHistoryStep(0)} disabled={!historyMode}>
                  Current
                </button>
              </div>
            </div>
          </div>
        </article>

        <article className="card ops-core-card">
          <header className="ops-core-head">
            <h3>Fiber Core &amp; Splicing Matrix</h3>
            <div className="ops-core-stats">
              <span>{coreStats.used} connected</span>
              <span>{coreStats.free} vacant</span>
              <span>{coreStats.faulty} faulty</span>
            </div>
          </header>
          {!selectedCable && <p className="muted">Click a cable line to load core matrix for that cable.</p>}
          {!!selectedCable && <p className="muted">Cable: {selectedCable.label || selectedCable.id}</p>}
          <div className="ops-core-grid">
            {cableCores.map((core) => (
              <button
                key={core.id}
                type="button"
                className={`ops-core-cell status-${core.status}`}
                onClick={() => handleCycleCoreStatus(core)}
                disabled={busy}
              >
                <small>C-{String(core.core_number).padStart(2, "0")}</small>
                <strong>{core.color_name}</strong>
                <span>{core.status}</span>
              </button>
            ))}
          </div>
        </article>
      </main>

      <aside className="card ops-map-right">
        <header className="ops-feed-head">
          <h3>Live Operations Feed</h3>
          <button type="button" onClick={() => notify("Feed synchronized")}>
            Sync
          </button>
        </header>

        <div className="ops-feed-list">
          {feedRows.map((entry) => (
            <article key={entry.id} className={`ops-feed-item severity-${entry.severity}`}>
              <div>
                <strong>{entry.title}</strong>
                <p>{entry.text}</p>
                <small>{formatFeedAge(entry.timestamp)}</small>
              </div>
              <button type="button" onClick={() => handleFeedOpen(entry)}>
                Open
              </button>
            </article>
          ))}
          {!feedRows.length && <p className="muted">No live feed records yet.</p>}
        </div>

        <section className="ops-inspector">
          <h4>Selected Node</h4>
          {!selectedAsset && <p className="muted">Click any node on map to inspect.</p>}
          {!!selectedAsset && (
            <>
              <p>
                <strong>{selectedAsset.name}</strong> ({selectedAsset.asset_type})
              </p>
              <p className="muted">Linked clients: {selectedNodeClients.length}</p>
              {!!selectedColorFlow && (
                <p className="muted">
                  Incoming colors: {selectedColorFlow.incoming?.length || 0} | Outgoing colors:{" "}
                  {selectedColorFlow.outgoing?.length || 0}
                </p>
              )}
            </>
          )}
        </section>

        <section className="ops-inspector">
          <h4>Cable Inspector</h4>
          {!selectedCable && <p className="muted">Click a cable on map to view details.</p>}
          {!!selectedCable && (
            <>
              <p>
                <strong>{selectedCable.label || "Fibre cable"}</strong> ({selectedCable.cable_type})
              </p>
              <p className="muted">
                Total cores: {selectedCable.core_count} | Used: {selectedCable.used_cores || 0} | Free:{" "}
                {selectedCable.free_cores || 0}
              </p>
              {!!selectedUsage?.cores?.length && (
                <div className="map-core-list">
                  {selectedUsage.cores.map((core) => (
                    <span key={core.id} className={`map-core-chip status-${core.status}`}>
                      #{core.core_number} {core.color_name} ({core.status})
                    </span>
                  ))}
                </div>
              )}
            </>
          )}
        </section>

        {!!selectedOltPorts && (
          <section className="ops-inspector">
            <h4>OLT Port Assign</h4>
            <p className="muted">
              OLT: {selectedOltPorts.olt?.name} | Used {selectedOltPorts.summary?.used_ports || 0} /{" "}
              {selectedOltPorts.summary?.total_ports || 0}
            </p>
            <select value={oltAssignCoreId} onChange={(event) => setOltAssignCoreId(event.target.value)}>
              <option value="">Pick core for selected OLT port</option>
              {cableCores.map((core) => (
                <option key={core.id} value={core.id}>
                  {core.color_name} ({core.status})
                </option>
              ))}
            </select>
            <div className="ops-mini-table">
              {(selectedOltPorts.ports || []).slice(0, 6).map((port) => (
                <div key={port.id}>
                  <span>P{port.port_number}</span>
                  <span>{port.status}</span>
                  <button
                    type="button"
                    disabled={!selectedCoreForOltAssign || !selectedCable}
                    onClick={() =>
                      onAssignOltPort(selectedOltPorts.olt.id, port.port_number, {
                        status: "used",
                        cable_id: selectedCable?.id || null,
                        core_id: selectedCoreForOltAssign?.id || null
                      })
                    }
                  >
                    Assign
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="ops-inspector">
          <h4>Splice Record</h4>
          <form onSubmit={submitSplice} className="stack-form">
            <select
              value={spliceForm.from_core_id}
              onChange={(event) => setSpliceForm((prev) => ({ ...prev, from_core_id: event.target.value }))}
            >
              <option value="">From Core</option>
              {cableCores.map((core) => (
                <option key={core.id} value={core.id}>
                  {core.color_name} ({core.status})
                </option>
              ))}
            </select>
            <select
              value={spliceForm.to_core_id}
              onChange={(event) => setSpliceForm((prev) => ({ ...prev, to_core_id: event.target.value }))}
            >
              <option value="">To Core</option>
              {cableCores.map((core) => (
                <option key={core.id} value={core.id}>
                  {core.color_name} ({core.status})
                </option>
              ))}
            </select>
            <select
              value={spliceForm.location_asset_id}
              onChange={(event) => setSpliceForm((prev) => ({ ...prev, location_asset_id: event.target.value }))}
            >
              <option value="">Splice location</option>
              {assets.map((asset) => (
                <option key={asset.id} value={asset.id}>
                  {asset.name}
                </option>
              ))}
            </select>
            <input
              placeholder="Engineer name"
              value={spliceForm.engineer_name}
              onChange={(event) => setSpliceForm((prev) => ({ ...prev, engineer_name: event.target.value }))}
            />
            <input
              placeholder="Splice notes"
              value={spliceForm.notes}
              onChange={(event) => setSpliceForm((prev) => ({ ...prev, notes: event.target.value }))}
            />
            <button type="submit" disabled={busy || historyMode}>
              Save Splice
            </button>
          </form>
        </section>

        <footer className="ops-stability">
          <span>Network Stability</span>
          <strong>{networkStability.toFixed(1)}%</strong>
          <div>
            <i style={{ width: `${networkStability.toFixed(1)}%` }} />
          </div>
          {!!panelNotice && <p className="muted">{panelNotice}</p>}
          {!!selectedClientPath && <p className="muted">Client path loaded for CRM linkage.</p>}
          {!!criticalMode && <p className="muted">Critical Alert Mode enabled.</p>}
        </footer>
      </aside>
    </section>
  );
}
